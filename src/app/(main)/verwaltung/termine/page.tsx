
'use client';

import React, { useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, doc, query, where, Timestamp, setDoc, getDocs, writeBatch } from 'firebase/firestore';
import type { Appointment, AppointmentException, Location, Group, MemberProfile, AppointmentResponse, AppointmentType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format as formatDate, addDays, addWeeks, addMonths, differenceInMilliseconds, startOfDay, isBefore, getYear, getMonth, set, subDays, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { de } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { Loader2, ListTodo, ThumbsUp, ThumbsDown, HelpCircle, Users, MapPin, CalendarClock, CalendarX2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';


type UnrolledAppointment = Appointment & {
  instanceDate: Date;
  virtualId: string;
  originalId: string;
  isCancelled: boolean;
  isException: boolean;
};

export default function TermineUebersichtPage() {
  const router = useRouter();
  const { user, isUserLoading, isAdmin } = useUser();
  const firestore = useFirestore();

  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('all');
  
  const memberRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);
  const userTeamIds = useMemo(() => memberProfile?.teams || [], [memberProfile]);
  
  const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);
  
  const exceptionsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentExceptions') : null), [firestore]);
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);

  const locationsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'locations') : null), [firestore]);
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsRef);
  const locationsMap = useMemo(() => new Map(locations?.map(l => [l.id, l])), [locations]);
  
  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);
  const teamsMap = useMemo(() => new Map(groups?.filter(g => g.type === 'team').map(t => [t.id, t.name])), [groups]);
  
  const appointmentTypesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentTypes') : null), [firestore]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(appointmentTypesRef);
  
  const userTeamsForFilter = useMemo(() => {
    if (!userTeamIds || !teamsMap) return [];
    return userTeamIds.map(id => ({ id, name: teamsMap.get(id) || 'Unbekanntes Team' })).sort((a,b) => a.name.localeCompare(b.name));
  }, [userTeamIds, teamsMap]);

  const allMembersQuery = useMemoFirebase(() => {
    if (!firestore || !isAdmin) return null; // NUR Admins laden alle Mitglieder
    return collection(firestore, 'members');
  }, [firestore, isAdmin]);
  const { data: allMembers, isLoading: isLoadingMembers } = useCollection<MemberProfile>(allMembersQuery);

  const allResponsesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'appointmentResponses');
  }, [firestore]);
  const { data: allResponses, isLoading: isLoadingResponses } = useCollection<AppointmentResponse>(allResponsesQuery);


  const unrolledAppointments = useMemo(() => {
    if (!appointments || !exceptions || !memberProfile) return [];
    
    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions.forEach(ex => {
      if (ex.originalDate) {
        const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
        exceptionsMap.set(key, ex);
      }
    });

    const allEvents: UnrolledAppointment[] = [];
    const today = startOfDay(new Date());
    const userTeamIdsSet = new Set(userTeamIds);

    appointments.forEach(app => {
      if (!app.startDate) return;

      const isVisible = app.visibility.type === 'all' || (app.visibility.teamIds && app.visibility.teamIds.some(teamId => userTeamIdsSet.has(teamId)));
      if (!isVisible) return;
      
      const recurrenceEndDate = app.recurrenceEndDate ? app.recurrenceEndDate.toDate() : null;
      const appStartDate = app.startDate.toDate();

      if (app.recurrence === 'none' || !app.recurrence || !recurrenceEndDate) {
        if (isBefore(appStartDate, today)) return;

        const originalDateStartOfDayISO = startOfDay(appStartDate).toISOString();
        const exception = exceptionsMap.get(`${app.id}-${originalDateStartOfDayISO}`);
        
        let finalData: Appointment = { ...app };
        let isException = false;
        if (exception?.status === 'modified' && exception.modifiedData) {
          const modData = exception.modifiedData;
          finalData = { ...app, ...modData, startDate: modData.startDate || app.startDate, endDate: modData.endDate === undefined ? app.endDate : (modData.endDate || undefined), id: app.id };
          isException = true;
        }
        
        allEvents.push({ ...finalData, instanceDate: finalData.startDate.toDate(), originalId: app.id, virtualId: app.id, isCancelled: exception?.status === 'cancelled', isException });

      } else {
        let currentDate = appStartDate;
        const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), currentDate) : 0;
        let iter = 0;
        const MAX_ITERATIONS = 500;

        while (currentDate <= recurrenceEndDate && iter < MAX_ITERATIONS) {
          if (currentDate >= today) {
            const currentDateStartOfDayISO = startOfDay(currentDate).toISOString();
            const instanceException = exceptionsMap.get(`${app.id}-${currentDateStartOfDayISO}`);

            if (instanceException?.status !== 'cancelled') {
                let isException = false;
                let instanceData: Appointment = { ...app };
                let instanceStartDate = currentDate;
                let instanceEndDate: Date | undefined = duration > 0 ? new Date(currentDate.getTime() + duration) : undefined;
                
                if (instanceException?.status === 'modified' && instanceException.modifiedData) {
                    isException = true;
                    const modData = instanceException.modifiedData;
                    instanceData = { ...instanceData, ...modData };
                    instanceStartDate = modData.startDate?.toDate() ?? instanceStartDate;
                    instanceEndDate = modData.endDate?.toDate() ?? instanceEndDate;
                }

                allEvents.push({
                  ...instanceData,
                  id: `${app.id}-${currentDate.toISOString()}`, virtualId: `${app.id}-${currentDateStartOfDayISO}`, originalId: app.id,
                  instanceDate: instanceStartDate, startDate: Timestamp.fromDate(instanceStartDate), endDate: instanceEndDate ? Timestamp.fromDate(instanceEndDate) : undefined,
                  isCancelled: instanceException?.status === 'cancelled', isException,
                });
            } else {
                 allEvents.push({
                  ...app,
                  id: `${app.id}-${currentDate.toISOString()}`, virtualId: `${app.id}-${currentDateStartOfDayISO}`, originalId: app.id,
                  instanceDate: currentDate,
                  isCancelled: true, isException: false,
                });
            }
          }
          
          iter++;
          switch (app.recurrence) {
            case 'daily': currentDate = addDays(currentDate, 1); break;
            case 'weekly': currentDate = addWeeks(currentDate, 1); break;
            case 'bi-weekly': currentDate = addWeeks(currentDate, 2); break;
            case 'monthly':
                const nextMonth = addMonths(currentDate, 1);
                currentDate = set(nextMonth, { date: Math.min(appStartDate.getDate(), new Date(getYear(nextMonth), getMonth(nextMonth) + 1, 0).getDate()) });
                break;
            default: iter = MAX_ITERATIONS; break;
          }
        }
      }
    });
    return allEvents.sort((a,b) => a.instanceDate.getTime() - b.instanceDate.getTime());
  }, [appointments, exceptions, userTeamIds, memberProfile]);

  const filteredAppointments = useMemo(() => {
    return unrolledAppointments.filter(app => {
      const teamMatch = selectedTeamFilter === 'all' || app.visibility.teamIds.includes(selectedTeamFilter) || app.visibility.type === 'all';
      return teamMatch;
    });
  }, [unrolledAppointments, selectedTeamFilter]);
  
  const handleResponse = async (appointment: UnrolledAppointment, status: 'zugesagt' | 'abgesagt' | 'unsicher') => {
      if (!firestore || !user) return;
      const dateString = formatDate(appointment.instanceDate, 'yyyy-MM-dd');
      const responseId = `${appointment.originalId}_${user.uid}_${dateString}`;
      const responseDocRef = doc(firestore, 'appointmentResponses', responseId);

      const responseData: AppointmentResponse = {
          id: responseId,
          appointmentId: appointment.originalId,
          userId: user.uid,
          date: dateString,
          status,
          timestamp: Timestamp.now(),
      };
      
      try {
        await setDoc(responseDocRef, responseData, { merge: true });
      } catch (e: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `appointmentResponses/${responseId}`,
            operation: 'write',
            requestResourceData: responseData
        }));
      }
  };

  const isLoading = isUserLoading || isLoadingAppointments || isLoadingExceptions || isLoadingLocations || isLoadingMember || isLoadingGroups || isLoadingResponses || isLoadingTypes || (isAdmin && isLoadingMembers);
  
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
           <ListTodo className="h-8 w-8 text-primary" /> Deine Termine
        </h1>
        <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter} disabled={userTeamsForFilter.length === 0}>
            <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="Nach Mannschaft filtern..." />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Alle meine Mannschaften</SelectItem>
                {userTeamsForFilter.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
            </SelectContent>
        </Select>
      </div>

       {isLoading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
        : filteredAppointments.length > 0 ? (
          <Card>
            <CardContent className="p-0">
               <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Art</TableHead>
                            <TableHead>Datum</TableHead>
                            <TableHead>Zeit</TableHead>
                            <TableHead>Details</TableHead>
                            <TableHead>Rückmeldung bis</TableHead>
                            <TableHead className="text-right">Aktion</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAppointments.map(app => {
                            const userStatus = allResponses?.find(r => r.id.startsWith(app.originalId) && r.id.includes(user?.uid || '___') && r.date === formatDate(app.instanceDate, 'yyyy-MM-dd'))?.status;
                            const location = app.locationId ? locationsMap.get(app.locationId) : null;
                            const originalAppointment = appointments?.find(a => a.id === app.originalId);
                            const typeName = appointmentTypes?.find(t => t.id === app.appointmentTypeId)?.name;
                            let rsvpDate: Date | null = null;
                            if (originalAppointment?.rsvpDeadline) {
                                const [days, time] = originalAppointment.rsvpDeadline.split(':');
                                const [hours, minutes] = time.split(';').map(Number);
                                const deadlineBaseDate = subDays(app.instanceDate, Number(days));
                                rsvpDate = setMilliseconds(setSeconds(setMinutes(setHours(deadlineBaseDate, hours), minutes), 0), 0);
                            }

                            return (
                                <TableRow key={app.virtualId} className={cn(app.isCancelled && 'bg-red-50/50 text-muted-foreground line-through dark:bg-red-900/20')}>
                                    <TableCell>
                                      <p className="font-medium">{typeName}</p>
                                      {app.title !== typeName && <p className="text-xs text-muted-foreground">({app.title})</p>}
                                    </TableCell>
                                    <TableCell>{formatDate(app.instanceDate, 'eeee, dd.MM.yy', { locale: de })}</TableCell>
                                    <TableCell>
                                        {app.isAllDay ? 'Ganztägig' : (
                                            <>
                                            {formatDate(app.instanceDate, 'HH:mm')}
                                            {app.endDate && !app.isAllDay && ` - ${formatDate(app.endDate.toDate(), 'HH:mm')}`} Uhr
                                            </>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {location && <p><span className="font-semibold">Ort:</span> {location.name}</p>}
                                        {app.meetingPoint && <p><span className="font-semibold">Treffpunkt:</span> {app.meetingPoint}</p>}
                                        {app.meetingTime && <p><span className="font-semibold">Treffzeit:</span> {app.meetingTime}</p>}
                                    </TableCell>
                                    <TableCell>
                                        {rsvpDate ? formatDate(rsvpDate, 'dd.MM.yy, HH:mm', { locale: de }) + ' Uhr' : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                       <div className="flex items-center justify-end gap-2">
                                        {!app.isCancelled ? (
                                            <>
                                                <Button size="sm" variant={userStatus === 'zugesagt' ? 'default' : 'outline'} onClick={() => handleResponse(app, 'zugesagt')}><ThumbsUp className="h-4 w-4"/></Button>
                                                <Button size="sm" variant={userStatus === 'unsicher' ? 'secondary' : 'outline'} onClick={() => handleResponse(app, 'unsicher')}><HelpCircle className="h-4 w-4"/></Button>
                                                <Button size="sm" variant={userStatus === 'abgesagt' ? 'destructive' : 'outline'} onClick={() => handleResponse(app, 'abgesagt')}><ThumbsDown className="h-4 w-4"/></Button>
                                                <ParticipantListDialog appointment={app} allMembers={allMembers} allResponses={allResponses} />
                                            </>
                                        ) : <p className="text-destructive font-semibold mr-4">Abgesagt</p>}
                                       </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
               </div>
            </CardContent>
          </Card>
        ) : (<div className="text-center py-10 text-muted-foreground">Keine bevorstehenden Termine gefunden.</div>)
      }
    </div>
  );
}


interface ParticipantListDialogProps {
  appointment: UnrolledAppointment;
  allMembers: MemberProfile[] | null;
  allResponses: AppointmentResponse[] | null;
}

const ParticipantListDialog: React.FC<ParticipantListDialogProps> = ({ appointment, allMembers, allResponses }) => {

  const { accepted, rejected, unsure, totalCount } = useMemo(() => {
    if (!allMembers || !allResponses) return { accepted: [], rejected: [], unsure: [], totalCount: 0};
    
    const relevantMemberIds = new Set<string>();
    if (appointment.visibility.type === 'all') {
      allMembers.forEach(m => relevantMemberIds.add(m.userId));
    } else {
      appointment.visibility.teamIds.forEach(teamId => {
        allMembers.forEach(member => {
          if (member.teams?.includes(teamId)) relevantMemberIds.add(member.userId);
        });
      });
    }

    const dateString = formatDate(appointment.instanceDate, 'yyyy-MM-dd');
    const responsesForInstance = allResponses?.filter(r => r.appointmentId === appointment.originalId && r.date === dateString) || [];
    
    const accepted = responsesForInstance.filter(r => r.status === 'zugesagt');
    const rejected = responsesForInstance.filter(r => r.status === 'abgesagt');
    const unsure = responsesForInstance.filter(r => r.status === 'unsicher');

    return { accepted, rejected, unsure, totalCount: relevantMemberIds.size };
  }, [appointment, allMembers, allResponses]);

  const membersMap = useMemo(() => new Map(allMembers?.map(m => [m.userId, m])), [allMembers]);
  const respondedCount = accepted.length + rejected.length + unsure.length;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
            <Users className="h-4 w-4 mr-2" />
            {respondedCount} / {totalCount}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
            <DialogTitle>Teilnehmerliste für "{appointment.title}"</DialogTitle>
            <DialogDescription>{formatDate(appointment.instanceDate, "eeee, dd. MMMM yyyy 'um' HH:mm 'Uhr'", { locale: de })}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-4">
              <div><h3 className="font-semibold text-green-600 mb-2">Zusagen ({accepted.length})</h3><ul className="list-disc pl-5 text-sm">{accepted.map(r => (<li key={r.userId}>{membersMap.get(r.userId)?.firstName} {membersMap.get(r.userId)?.lastName}</li>))}</ul></div>
              <div><h3 className="font-semibold text-yellow-600 mb-2">Unsicher ({unsure.length})</h3><ul className="list-disc pl-5 text-sm">{unsure.map(r => (<li key={r.userId}>{membersMap.get(r.userId)?.firstName} {membersMap.get(r.userId)?.lastName}</li>))}</ul></div>
              <div><h3 className="font-semibold text-destructive mb-2">Absagen ({rejected.length})</h3><ul className="list-disc pl-5 text-sm">{rejected.map(r => (<li key={r.userId}>{membersMap.get(r.userId)?.firstName} {membersMap.get(r.userId)?.lastName}{r.reason && <span className="text-muted-foreground italic"> - "{r.reason}"</span>}</li>))}</ul></div>
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

    
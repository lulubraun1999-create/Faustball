
'use client';

import React, { useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, doc, query, where, Timestamp, setDoc, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import type { Appointment, AppointmentException, Location, Group, MemberProfile, AppointmentResponse, AppointmentType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format as formatDate, addDays, addWeeks, addMonths, differenceInMilliseconds, startOfDay, isBefore, getYear, getMonth, set, subDays, setHours, setMinutes, setSeconds, setMilliseconds, startOfMonth, endOfMonth, parse as parseDate } from 'date-fns';
import { de } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { Loader2, ListTodo, ThumbsUp, ThumbsDown, HelpCircle, Users, MapPin, ClipboardCopy, CalendarIcon, BarChartHorizontal } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell, Legend } from "recharts";
import { ChartContainer, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from '@/components/ui/chart';


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
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  
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
  const appointmentTypesMap = useMemo(() => new Map(appointmentTypes?.map(t => [t.id, t.name])), [appointmentTypes]);
  
  const userTeamsForFilter = useMemo(() => {
    if (!userTeamIds || !teamsMap) return [];
    return userTeamIds.map(id => ({ id, name: teamsMap.get(id) || 'Unbekanntes Team' })).sort((a,b) => a.name.localeCompare(b.name));
  }, [userTeamIds, teamsMap]);

  const allMembersQuery = useMemoFirebase(() => (firestore && isAdmin ? collection(firestore, 'members') : null), [firestore, isAdmin]);
  const { data: allMembers, isLoading: isLoadingMembers } = useCollection<MemberProfile>(allMembersQuery);

  const responsesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    if (isAdmin) {
      return collection(firestore, 'appointmentResponses');
    }
    // Only fetch the user's own responses if not an admin.
    return query(collection(firestore, 'appointmentResponses'), where('userId', '==', user.uid));
  }, [firestore, user, isAdmin]);
  const { data: allResponses, isLoading: isLoadingResponses } = useCollection<AppointmentResponse>(responsesQuery);
  const userResponses = useMemo(() => {
    if (!allResponses || !user) return [];
    return allResponses.filter(r => r.userId === user.uid);
  }, [allResponses, user])


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
      const typeMatch = selectedTypeFilter === 'all' || app.appointmentTypeId === selectedTypeFilter;
      const teamMatch = selectedTeamFilter === 'all' || app.visibility.teamIds.includes(selectedTeamFilter) || app.visibility.type === 'all';
      return typeMatch && teamMatch;
    });
  }, [unrolledAppointments, selectedTeamFilter, selectedTypeFilter]);
  
  const groupedAppointments = useMemo(() => {
    return filteredAppointments.reduce((acc, app) => {
      const monthYear = formatDate(app.instanceDate, 'MMMM yyyy', { locale: de });
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(app);
      return acc;
    }, {} as Record<string, UnrolledAppointment[]>);
  }, [filteredAppointments]);


  const handleResponse = async (appointment: UnrolledAppointment, status: 'zugesagt' | 'abgesagt' | 'unsicher') => {
      if (!firestore || !user) return;
      
      const dateString = formatDate(appointment.instanceDate, 'yyyy-MM-dd');
      const responseId = `${appointment.originalId}_${user.uid}_${dateString}`;
      const responseDocRef = doc(firestore, 'appointmentResponses', responseId);

      const currentUserResponse = userResponses?.find(r => r.id === responseId);

      if (currentUserResponse?.status === status) {
          try {
              await deleteDoc(responseDocRef);
          } catch(e: any) {
               errorEmitter.emit('permission-error', new FirestorePermissionError({
                  path: `appointmentResponses/${responseId}`,
                  operation: 'delete'
              }));
          }
          return;
      }
      
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <StatisticsDialog 
              user={user} 
              appointments={unrolledAppointments} 
              responses={allResponses} 
              appointmentTypesMap={appointmentTypesMap} 
            />
            <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter} disabled={userTeamsForFilter.length === 0}>
                <SelectTrigger className="w-full sm:w-auto min-w-[180px]">
                    <SelectValue placeholder="Nach Mannschaft filtern..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Alle meine Mannschaften</SelectItem>
                    {userTeamsForFilter.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                </SelectContent>
            </Select>
            <Select value={selectedTypeFilter} onValueChange={setSelectedTypeFilter} disabled={!appointmentTypes}>
                <SelectTrigger className="w-full sm:w-auto min-w-[180px]">
                    <SelectValue placeholder="Nach Terminart filtern..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Alle Terminarten</SelectItem>
                    {appointmentTypes?.map(type => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
      </div>

       {isLoading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
        : Object.keys(groupedAppointments).length > 0 ? (
          <Accordion type="multiple" defaultValue={Object.keys(groupedAppointments)} className="w-full space-y-4">
              {Object.entries(groupedAppointments).map(([monthYear, appointmentsInMonth]) => (
                  <AccordionItem value={monthYear} key={monthYear} className="border-b-0">
                      <AccordionTrigger className="text-xl font-semibold py-3 px-4 bg-muted/50 rounded-t-lg hover:no-underline">{monthYear} ({appointmentsInMonth.length})</AccordionTrigger>
                      <AccordionContent className="border border-t-0 rounded-b-lg p-0">
                          <div className="overflow-x-auto">
                              <Table>
                                  <TableHeader>
                                      <TableRow>
                                          <TableHead>Art</TableHead>
                                          <TableHead>Datum</TableHead>
                                          <TableHead>Zeit</TableHead>
                                          <TableHead>Ort</TableHead>
                                          <TableHead>Treffpunkt</TableHead>
                                          <TableHead>Treffzeit</TableHead>
                                          <TableHead>Rückmeldung bis</TableHead>
                                          <TableHead className="text-right">Aktion</TableHead>
                                      </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                      {appointmentsInMonth.map(app => {
                                          const userStatus = userResponses?.find(r => r.id.startsWith(app.originalId) && r.id.includes(user?.uid || '___') && r.date === formatDate(app.instanceDate, 'yyyy-MM-dd'))?.status;
                                          const location = app.locationId ? locationsMap.get(app.locationId) : null;
                                          const originalAppointment = appointments?.find(a => a.id === app.originalId);
                                          const typeName = appointmentTypesMap.get(app.appointmentTypeId);
                                          let rsvpDate: Date | null = null;
                                          if (originalAppointment?.rsvpDeadline) {
                                              const deadlineParts = originalAppointment.rsvpDeadline.split(':');
                                              if (deadlineParts.length === 2) {
                                                  const [days, time] = deadlineParts;
                                                  const [hours, minutes] = time.split(';').map(Number);
                                                  const deadlineBaseDate = subDays(app.instanceDate, Number(days));
                                                  rsvpDate = setMilliseconds(setSeconds(setMinutes(setHours(deadlineBaseDate, hours), minutes), 0), 0);
                                              }
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
                                                      {location ? (
                                                          <LocationPopover location={location} />
                                                      ) : '-'}
                                                  </TableCell>
                                                  <TableCell>{app.meetingPoint || '-'}</TableCell>
                                                  <TableCell>{app.meetingTime || '-'}</TableCell>
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
                      </AccordionContent>
                  </AccordionItem>
              ))}
          </Accordion>
        ) : (<div className="text-center py-10 text-muted-foreground">Keine bevorstehenden Termine für die aktuelle Auswahl gefunden.</div>)
      }
    </div>
  );
}

const LocationPopover: React.FC<{location: Location}> = ({ location }) => {
    const { toast } = useToast();
    const copyAddress = () => {
        if(location.address) {
            navigator.clipboard.writeText(location.address);
            toast({
                title: "Adresse kopiert",
                description: "Die Adresse wurde in die Zwischenablage kopiert."
            })
        }
    }
    
    if(!location.address) {
        return <>{location.name}</>
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="link" className="p-0 h-auto font-normal text-foreground">
                    {location.name}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 text-sm">
                <div className="space-y-2">
                    <h4 className="font-medium leading-none">Adresse</h4>
                    <p className="text-muted-foreground">{location.address}</p>
                    <Button onClick={copyAddress} size="sm" className="w-full">
                        <ClipboardCopy className="mr-2 h-4 w-4" /> Adresse kopieren
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
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

interface StatisticsDialogProps {
  user: { uid: string } | null;
  appointments: UnrolledAppointment[];
  responses: AppointmentResponse[] | null;
  appointmentTypesMap: Map<string, string>;
}

const StatisticsDialog: React.FC<StatisticsDialogProps> = ({ user, appointments, responses, appointmentTypesMap }) => {
  const { userStats, yearlyTotals } = useMemo(() => {
    if (!user || !responses || appointments.length === 0) return { userStats: {}, yearlyTotals: null };

    const now = new Date();
    const oneYearAgo = startOfMonth(addMonths(now, -11));

    const stats: Record<string, Record<string, { zugesagt: number; abgesagt: number; unsicher: number; total: number; offen: number; }>> = {};
    const yearSummary = { zugesagt: 0, abgesagt: 0, unsicher: 0, offen: 0, total: 0 };

    const userResponsesMap = new Map(responses.filter(r => r.userId === user.uid).map(r => [`${r.appointmentId}-${r.date}`, r.status]));

    const relevantAppointments = appointments.filter(app => {
        const appDate = app.instanceDate;
        return appDate >= oneYearAgo && appDate <= endOfMonth(now);
    });

    for (const app of relevantAppointments) {
        const appDate = app.instanceDate;
        const isCurrentMonth = getYear(appDate) === getYear(now) && getMonth(appDate) === getMonth(now);
        
        if (!isCurrentMonth && isBefore(now, appDate)) {
            continue;
        }

        const monthYear = formatDate(appDate, 'MMMM yyyy', { locale: de });
        const typeName = appointmentTypesMap.get(app.appointmentTypeId) || 'Unbekannt';

        if (!stats[monthYear]) stats[monthYear] = {};
        if (!stats[monthYear][typeName]) stats[monthYear][typeName] = { zugesagt: 0, abgesagt: 0, unsicher: 0, total: 0, offen: 0 };
        
        stats[monthYear][typeName].total++;
        yearSummary.total++;
        
        const responseStatus = userResponsesMap.get(`${app.originalId}-${formatDate(appDate, 'yyyy-MM-dd')}`);
        
        if (responseStatus) {
            if (responseStatus === 'zugesagt') {
              stats[monthYear][typeName].zugesagt++;
              yearSummary.zugesagt++;
            }
            else if (responseStatus === 'abgesagt') {
              stats[monthYear][typeName].abgesagt++;
              yearSummary.abgesagt++;
            }
            else if (responseStatus === 'unsicher') {
              stats[monthYear][typeName].unsicher++;
              yearSummary.unsicher++;
            }
        } else {
            stats[monthYear][typeName].offen++;
            yearSummary.offen++;
        }
    }
    
    const sortedStats = Object.fromEntries(
        Object.entries(stats).sort(([a], [b]) => {
            const dateA = parseDate(a, 'MMMM yyyy', new Date(), { locale: de });
            const dateB = parseDate(b, 'MMMM yyyy', new Date(), { locale: de });
            return dateB.getTime() - dateA.getTime();
        })
    );

    return { userStats: sortedStats, yearlyTotals: yearSummary };
  }, [user, appointments, responses, appointmentTypesMap]);
  
  const renderYearlyChart = yearlyTotals && yearlyTotals.total > 0;
  
  const chartConfig = {
    anwesend: { label: 'Anwesend', color: 'hsl(var(--chart-1))' },
    abwesend: { label: 'Abwesend', color: 'hsl(var(--destructive))' },
    unsicher: { label: 'Unsicher', color: 'hsl(var(--chart-3))' },
    offen: { label: 'Offen', color: 'hsl(var(--muted-foreground))' },
  } satisfies ChartConfig

  return (
    <Dialog>
        <DialogTrigger asChild>
            <Button variant="outline"><BarChartHorizontal className="mr-2 h-4 w-4" />Deine Statistik</Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl">
            <DialogHeader>
                <DialogTitle>Deine Anwesenheitsstatistik</DialogTitle>
                <DialogDescription>Übersicht deiner Teilnahmen der letzten 12 Monate.</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] p-1">
                <div className="space-y-6 p-4">
                  {Object.keys(userStats).length > 0 ? (
                      <>
                        <Accordion type="multiple" defaultValue={Object.keys(userStats)} className="w-full space-y-4">
                          {Object.entries(userStats).map(([month, typeStats]) => (
                              <AccordionItem value={month} key={month} className="border-b-0">
                                  <AccordionTrigger className="text-lg font-semibold py-3 px-4 bg-muted/50 rounded-t-lg hover:no-underline">{month}</AccordionTrigger>
                                  <AccordionContent className="border border-t-0 rounded-b-lg p-2">
                                      <div className="space-y-4 p-2">
                                      {Object.entries(typeStats).sort(([a], [b]) => a.localeCompare(b)).map(([typeName, counts]) => {
                                          const { zugesagt, abgesagt, unsicher, offen, total } = counts;
                                          
                                          const chartData = [
                                            { name: 'anwesend', value: zugesagt, fill: 'var(--color-anwesend)' },
                                            { name: 'abwesend', value: abgesagt, fill: 'var(--color-abwesend)' },
                                            { name: 'unsicher', value: unsicher, fill: 'var(--color-unsicher)' },
                                            { name: 'offen', value: offen, fill: 'var(--color-offen)' },
                                          ].filter(item => item.value > 0);

                                          return (
                                              <Card key={typeName} className="overflow-hidden">
                                                  <CardHeader className="p-4 bg-muted/50">
                                                      <CardTitle className="text-base">{typeName} (Gesamt: {total})</CardTitle>
                                                  </CardHeader>
                                                  <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                                      <div className="grid grid-cols-2 gap-2 text-center">
                                                          <div className="rounded-md bg-green-50 p-2 dark:bg-green-900/30">
                                                              <div className="text-2xl font-bold text-green-700 dark:text-green-400">{zugesagt}</div>
                                                              <div className="text-xs text-green-600 dark:text-green-400/80">Anwesend ({(total > 0 ? (zugesagt/total)*100 : 0).toFixed(0)}%)</div>
                                                          </div>
                                                          <div className="rounded-md bg-red-50 p-2 dark:bg-red-900/30">
                                                              <div className="text-2xl font-bold text-red-700 dark:text-red-400">{abgesagt}</div>
                                                              <div className="text-xs text-red-600 dark:text-red-400/80">Abwesend ({(total > 0 ? (abgesagt/total)*100 : 0).toFixed(0)}%)</div>
                                                          </div>
                                                          <div className="rounded-md bg-yellow-50 p-2 dark:bg-yellow-900/30">
                                                              <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{unsicher}</div>
                                                              <div className="text-xs text-yellow-600 dark:text-yellow-400/80">Unsicher ({(total > 0 ? (unsicher/total)*100 : 0).toFixed(0)}%)</div>
                                                          </div>
                                                          <div className="rounded-md bg-slate-100 p-2 dark:bg-slate-800/50">
                                                              <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">{offen}</div>
                                                              <div className="text-xs text-slate-500 dark:text-slate-400/80">Offen ({(total > 0 ? (offen/total)*100 : 0).toFixed(0)}%)</div>
                                                          </div>
                                                      </div>
                                                      <div className="h-40 w-full">
                                                        {chartData.length > 0 ? (
                                                          <ChartContainer config={chartConfig} className="min-h-[150px]">
                                                              <PieChart>
                                                                  <Tooltip content={<ChartTooltipContent hideLabel />} />
                                                                  <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} />
                                                                  <ChartLegend content={<ChartLegendContent />} />
                                                              </PieChart>
                                                          </ChartContainer>
                                                        ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Keine Daten</div>}
                                                      </div>
                                                  </CardContent>
                                              </Card>
                                          );
                                      })}
                                      </div>
                                  </AccordionContent>
                              </AccordionItem>
                          ))}
                        </Accordion>
                        {renderYearlyChart && yearlyTotals && (
                          <Card className="mt-6 border-primary/50">
                             <CardHeader className="p-4 bg-muted/50">
                                <CardTitle className="text-base">Jahresbilanz (Letzte 12 Monate)</CardTitle>
                             </CardHeader>
                              <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                <div className="grid grid-cols-2 gap-2 text-center">
                                    <div className="rounded-md bg-green-50 p-2 dark:bg-green-900/30"><div className="text-2xl font-bold text-green-700 dark:text-green-400">{yearlyTotals.zugesagt}</div><div className="text-xs text-green-600 dark:text-green-400/80">Anwesend ({(yearlyTotals.total > 0 ? (yearlyTotals.zugesagt / yearlyTotals.total) * 100 : 0).toFixed(0)}%)</div></div>
                                    <div className="rounded-md bg-red-50 p-2 dark:bg-red-900/30"><div className="text-2xl font-bold text-red-700 dark:text-red-400">{yearlyTotals.abgesagt}</div><div className="text-xs text-red-600 dark:text-red-400/80">Abwesend ({(yearlyTotals.total > 0 ? (yearlyTotals.abgesagt / yearlyTotals.total) * 100 : 0).toFixed(0)}%)</div></div>
                                    <div className="rounded-md bg-yellow-50 p-2 dark:bg-yellow-900/30"><div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{yearlyTotals.unsicher}</div><div className="text-xs text-yellow-600 dark:text-yellow-400/80">Unsicher ({(yearlyTotals.total > 0 ? (yearlyTotals.unsicher / yearlyTotals.total) * 100 : 0).toFixed(0)}%)</div></div>
                                    <div className="rounded-md bg-slate-100 p-2 dark:bg-slate-800/50"><div className="text-2xl font-bold text-slate-600 dark:text-slate-400">{yearlyTotals.offen}</div><div className="text-xs text-slate-500 dark:text-slate-400/80">Offen ({(yearlyTotals.total > 0 ? (yearlyTotals.offen / yearlyTotals.total) * 100 : 0).toFixed(0)}%)</div></div>
                                </div>
                                <div className="h-40 w-full">
                                  <ChartContainer config={chartConfig} className="min-h-[150px]">
                                      <PieChart>
                                          <Tooltip content={<ChartTooltipContent hideLabel />} />
                                          <Pie data={[
                                              { name: 'anwesend', value: yearlyTotals.zugesagt, fill: 'var(--color-anwesend)' },
                                              { name: 'abwesend', value: yearlyTotals.abgesagt, fill: 'var(--color-abwesend)' },
                                              { name: 'unsicher', value: yearlyTotals.unsicher, fill: 'var(--color-unsicher)' },
                                              { name: 'offen', value: yearlyTotals.offen, fill: 'var(--color-offen)' },
                                          ].filter(item => item.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} />
                                          <ChartLegend content={<ChartLegendContent />} />
                                      </PieChart>
                                  </ChartContainer>
                                </div>
                             </CardContent>
                          </Card>
                        )}
                      </>
                  ) : <p className="text-center text-muted-foreground py-10">Keine vergangenen Termine mit Rückmeldungen gefunden.</p>}
                </div>
            </ScrollArea>
        </DialogContent>
    </Dialog>
  );
};
    


    

    

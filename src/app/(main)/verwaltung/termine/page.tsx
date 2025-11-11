
'use client';

import React, { useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, doc, query, where, Timestamp, setDoc } from 'firebase/firestore';
import type { Appointment, AppointmentException, Location, Group, MemberProfile, AppointmentResponse } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { format as formatDate, addDays, addWeeks, addMonths, differenceInMilliseconds, startOfDay, isBefore, getYear, getMonth, set } from 'date-fns';
import { de } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { Loader2, ListTodo, ThumbsUp, ThumbsDown, HelpCircle, Users, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


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
  
  const userTeamsForFilter = useMemo(() => {
    if (!userTeamIds || !teamsMap) return [];
    return userTeamIds.map(id => ({ id, name: teamsMap.get(id) || 'Unbekanntes Team' })).sort((a,b) => a.name.localeCompare(b.name));
  }, [userTeamIds, teamsMap]);

  const userResponsesQuery = useMemoFirebase(() => {
      if (!firestore || !user) return null;
      return query(collection(firestore, 'appointmentResponses'), where('userId', '==', user.uid));
  }, [firestore, user]);
  const { data: userResponses, isLoading: isLoadingResponses } = useCollection<AppointmentResponse>(userResponsesQuery);
  const userResponsesMap = useMemo(() => {
    return new Map(userResponses?.map(r => [`${r.appointmentId}-${r.date}`, r.status]));
  }, [userResponses]);


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
        
        if (exception?.status !== 'cancelled') {
            allEvents.push({ ...finalData, instanceDate: finalData.startDate.toDate(), originalId: app.id, virtualId: app.id, isCancelled: false, isException });
        }

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
                isCancelled: false, isException,
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

  const groupedAppointments = useMemo(() => {
    return filteredAppointments.reduce((acc, app) => {
      const monthYear = formatDate(app.instanceDate, 'MMMM yyyy', { locale: de });
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(app);
      return acc;
    }, {} as Record<string, UnrolledAppointment[]>);
  }, [filteredAppointments]);
  
  const handleResponse = async (appointment: UnrolledAppointment, status: 'zugesagt' | 'abgesagt') => {
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

  const isLoading = isUserLoading || isLoadingAppointments || isLoadingExceptions || isLoadingLocations || isLoadingMember || isLoadingGroups || isLoadingResponses;
  const defaultOpenMonth = Object.keys(groupedAppointments)[0];
  
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
        : Object.keys(groupedAppointments).length > 0 ? (
          <Accordion type="multiple" defaultValue={defaultOpenMonth ? [defaultOpenMonth] : []} className="w-full space-y-4">
              {Object.entries(groupedAppointments).map(([monthYear, appointmentsInMonth]) => (
                  <AccordionItem value={monthYear} key={monthYear} className="border-b-0">
                      <AccordionTrigger className="text-xl font-semibold py-3 px-4 bg-muted/50 rounded-t-lg hover:no-underline">{monthYear} ({appointmentsInMonth.length})</AccordionTrigger>
                      <AccordionContent className="border border-t-0 rounded-b-lg p-0">
                          <div className="divide-y">
                              {appointmentsInMonth.map(app => {
                                  const dateKey = `${app.originalId}-${formatDate(app.instanceDate, 'yyyy-MM-dd')}`;
                                  const userStatus = userResponsesMap.get(dateKey);
                                  const location = app.locationId ? locationsMap.get(app.locationId) : null;
                                  
                                  return (
                                    <div key={app.virtualId} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                      <div className="flex-1 space-y-1">
                                        <p className="font-semibold">{app.title}</p>
                                        <p className="text-sm text-muted-foreground">{formatDate(app.instanceDate, 'eeee, dd.MM.yyyy', {locale: de})} - {app.isAllDay ? 'Ganztägig' : formatDate(app.instanceDate, 'HH:mm \'Uhr\'')}</p>
                                        {location && (
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="link" className="p-0 h-auto font-normal text-sm text-muted-foreground"><MapPin className="h-4 w-4 mr-1" /> {location.name}</Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-64 text-sm">
                                                    {location.name}{location.address && `, ${location.address}`}
                                                </PopoverContent>
                                            </Popover>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Button size="sm" variant={userStatus === 'zugesagt' ? 'default' : 'outline'} onClick={() => handleResponse(app, 'zugesagt')} className="gap-2">
                                            <ThumbsUp className="h-4 w-4"/> Zusagen
                                        </Button>
                                        <Button size="sm" variant={userStatus === 'abgesagt' ? 'destructive' : 'outline'} onClick={() => handleResponse(app, 'abgesagt')} className="gap-2">
                                            <ThumbsDown className="h-4 w-4"/> Absagen
                                        </Button>
                                      </div>
                                    </div>
                                  );
                              })}
                          </div>
                      </AccordionContent>
                  </AccordionItem>
              ))}
          </Accordion>
        ) : (<div className="text-center py-10 text-muted-foreground">Keine bevorstehenden Termine gefunden.</div>)
      }
    </div>
  );
}

    
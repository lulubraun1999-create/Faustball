'use client';

import React, { useMemo, useState } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc, Timestamp } from 'firebase/firestore';
import type { Appointment, AppointmentException, Location, Group, MemberProfile, AppointmentType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar, dateFnsLocalizer, Event } from 'react-big-calendar';
import { format, getDay, parse, startOfWeek, addDays, addWeeks, addMonths, differenceInMilliseconds, startOfDay, isBefore, getYear, getMonth, set } from 'date-fns';
import { de } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useRouter } from 'next/navigation';
import { Loader2, Calendar as CalendarIcon, Download, Filter as FilterIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createEvents, type EventAttributes } from 'ics';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

// date-fns Localizer
const locales = { 'de-DE': de };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), // Woche startet am Montag
  getDay,
  locales,
});

interface CalendarEvent extends Event {
  resource: UnrolledAppointment;
}

type UnrolledAppointment = Appointment & {
  virtualId: string;
  originalId: string;
  originalDateISO?: string;
  isException?: boolean;
  isCancelled?: boolean;
  instanceDate: Date;
};

const messages = {
  allDay: 'Ganztägig',
  previous: '<',
  next: '>',
  today: 'Heute',
  month: 'Monat',
  week: 'Woche',
  day: 'Tag',
  agenda: 'Agenda',
  date: 'Datum',
  time: 'Uhrzeit',
  event: 'Termin',
  noEventsInRange: 'Keine Termine in diesem Zeitraum.',
  showMore: (total: number) => `+ ${total} weitere`,
};

export default function KalenderPage() {
  const router = useRouter();
  const { user, isUserLoading: isUserLoadingAuth, isAdmin } = useUser();
  const firestore = useFirestore();

  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  const memberRef = useMemoFirebase(() => (firestore && user ? doc(firestore, 'members', user.uid) : null), [firestore, user]);
  const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);
  const userTeamIds = useMemo(() => memberProfile?.teams || [], [memberProfile]);

  const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);
  
  const exceptionsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentExceptions') : null), [firestore]);
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);
  
  const appointmentTypesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentTypes') : null), [firestore]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(appointmentTypesRef);
  const appointmentTypesMap = useMemo(() => new Map(appointmentTypes?.map(t => [t.id, t.name])), [appointmentTypes]);

  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);
  const teamsMap = useMemo(() => new Map(allGroups?.filter(g => g.type === 'team').map(t => [t.id, t.name])), [allGroups]);
  
  const userTeamsForFilter = useMemo(() => {
    if (!userTeamIds || !teamsMap) return [];
    return userTeamIds.map(id => ({ id, name: teamsMap.get(id) || 'Unbekanntes Team' })).sort((a,b) => a.name.localeCompare(b.name));
  }, [userTeamIds, teamsMap]);

  // Set initial filter state once teams are loaded
  React.useEffect(() => {
    if (userTeamsForFilter.length > 0 && selectedTeams.size === 0) {
      setSelectedTeams(new Set(userTeamsForFilter.map(t => t.id)));
    }
  }, [userTeamsForFilter, selectedTeams.size]);
  

  const unrolledAppointments = useMemo(() => {
    if (!appointments || isLoadingExceptions || !memberProfile) return [];
    
    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions?.forEach(ex => {
      if (ex.originalDate) {
        const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
        exceptionsMap.set(key, ex);
      }
    });

    const allEvents: UnrolledAppointment[] = [];
    const now = new Date();
    const userTeamIdsSet = new Set(userTeamIds);

    appointments.forEach(app => {
      if (!app.startDate) return;

      const isVisibleForUser = app.visibility.type === 'all' || (app.visibility.teamIds && app.visibility.teamIds.some(teamId => userTeamIdsSet.has(teamId)));
      if (!isVisibleForUser) return;
      
      const recurrenceEndDate = app.recurrenceEndDate ? app.recurrenceEndDate.toDate() : null;
      const appStartDate = app.startDate.toDate();
      
      const MAX_VIEW_RANGE = addMonths(now, 6);
      const MIN_VIEW_RANGE = addMonths(now, -3);

      if (app.recurrence === 'none' || !app.recurrence || !recurrenceEndDate) {
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
        
        const effectiveRecurrenceEnd = recurrenceEndDate > MAX_VIEW_RANGE ? MAX_VIEW_RANGE : recurrenceEndDate;
        
        while (currentDate <= effectiveRecurrenceEnd && iter < MAX_ITERATIONS) {
          if (currentDate >= MIN_VIEW_RANGE) {
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
              originalDateISO: currentDateStartOfDayISO, instanceDate: instanceStartDate, startDate: Timestamp.fromDate(instanceStartDate), endDate: instanceEndDate ? Timestamp.fromDate(instanceEndDate) : undefined,
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
                const daysInNextMonth = new Date(getYear(nextMonth), getMonth(nextMonth) + 1, 0).getDate();
                const targetDate = Math.min(appStartDate.getDate(), daysInNextMonth);
                currentDate = set(nextMonth, { date: targetDate });
                break;
            default: iter = MAX_ITERATIONS; break;
          }
        }
      }
    });
    return allEvents;
  }, [appointments, exceptions, isLoadingExceptions, userTeamIds, memberProfile]);

  const filteredAppointments = useMemo(() => {
    return unrolledAppointments.filter(app => {
        if (app.isCancelled) return false;
        
        const teamsMatch = selectedTeams.size === 0 || (app.visibility.type === 'all' || app.visibility.teamIds.some(teamId => selectedTeams.has(teamId)));
        const typeMatch = selectedTypes.size === 0 || selectedTypes.has(app.appointmentTypeId);
        
        return teamsMatch && typeMatch;
    });
}, [unrolledAppointments, selectedTeams, selectedTypes]);


  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return filteredAppointments.map(app => ({
        title: app.isAllDay ? app.title : `${format(app.instanceDate, 'HH:mm')} ${app.title}`,
        start: app.instanceDate,
        end: app.endDate ? app.endDate.toDate() : app.instanceDate,
        allDay: app.isAllDay,
        resource: app,
    }));
  }, [filteredAppointments]);


  const handleTeamFilterChange = (teamId: string, checked: boolean) => {
    setSelectedTeams(prev => {
      const newSet = new Set(prev);
      if (checked) newSet.add(teamId);
      else newSet.delete(teamId);
      return newSet;
    });
  };

  const handleTypeFilterChange = (typeId: string, checked: boolean) => {
    setSelectedTypes(prev => {
      const newSet = new Set(prev);
      if (checked) newSet.add(typeId);
      else newSet.delete(typeId);
      return newSet;
    });
  };

  const handleDownloadCalendar = () => {
    const icsEvents: EventAttributes[] = filteredAppointments.map(app => {
        const start = app.instanceDate;
        const startDateArray = [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()] as [number, number, number, number, number];
        
        let event: EventAttributes = {
            title: app.title,
            start: startDateArray,
            description: app.description || ''
        };

        if (app.isAllDay) {
            event.start = [start.getFullYear(), start.getMonth() + 1, start.getDate()];
            event.end = [start.getFullYear(), start.getMonth() + 1, start.getDate() + 1];
        } else if (app.endDate) {
            const end = app.endDate.toDate();
            const durationMinutes = (end.getTime() - start.getTime()) / 60000;
            event.duration = { minutes: durationMinutes };
        } else {
            event.duration = { hours: 1 };
        }

        return event;
    });

    createEvents(icsEvents, (error, value) => {
        if (error) {
            console.error(error);
            return;
        }
        const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'faustball_kalender.ics';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
  }

  const isLoading = isUserLoadingAuth || isLoadingMember || isLoadingAppointments || isLoadingExceptions || isLoadingGroups || isLoadingTypes;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  const eventStyleGetter = (event: CalendarEvent) => {
    const typeName = appointmentTypesMap.get(event.resource.appointmentTypeId)?.toLowerCase() || '';
    let style: React.CSSProperties = {
      backgroundColor: 'var(--secondary)',
      color: 'var(--secondary-foreground)',
      borderRadius: '4px',
      border: 'none',
      display: 'block',
      opacity: 1,
    };
    if (typeName.includes('spieltag')) {
      style.backgroundColor = 'hsl(var(--primary))';
      style.color = 'hsl(var(--primary-foreground))';
    } else if (typeName.includes('training')) {
      style.backgroundColor = 'hsl(var(--accent))';
      style.color = 'hsl(var(--accent-foreground))';
    }
    return { style };
  };

  return (
    <div className="container mx-auto grid grid-cols-1 md:grid-cols-4 gap-6 p-4 sm:p-6 lg:p-8">
        <aside className="md:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FilterIcon className="h-5 w-5" /> Filter
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h3 className="font-semibold mb-2">Mannschaften</h3>
                        <div className="space-y-2">
                            {userTeamsForFilter.map(team => (
                                <div key={team.id} className="flex items-center space-x-2">
                                    <Checkbox id={`team-${team.id}`} checked={selectedTeams.has(team.id)} onCheckedChange={(checked) => handleTeamFilterChange(team.id, !!checked)} />
                                    <Label htmlFor={`team-${team.id}`}>{team.name}</Label>
                                </div>
                            ))}
                        </div>
                    </div>
                     <div>
                        <h3 className="font-semibold mb-2">Terminarten</h3>
                        <div className="space-y-2">
                            {(appointmentTypes || []).map(type => (
                                <div key={type.id} className="flex items-center space-x-2">
                                    <Checkbox id={`type-${type.id}`} checked={selectedTypes.has(type.id)} onCheckedChange={(checked) => handleTypeFilterChange(type.id, !!checked)} />
                                    <Label htmlFor={`type-${type.id}`}>{type.name}</Label>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </aside>

        <main className="md:col-span-3">
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-3">
                            <CalendarIcon className="h-6 w-6" /> Kalender
                        </CardTitle>
                        <CardDescription className="mt-2">
                            Hier werden alle wichtigen Termine, Spiele und Trainingseinheiten angezeigt.
                        </CardDescription>
                    </div>
                    <Button variant="outline" onClick={handleDownloadCalendar}>
                        <Download className="mr-2 h-4 w-4"/> Kalender herunterladen
                    </Button>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                <div className="h-[80vh]">
                    <Calendar
                        localizer={localizer}
                        events={calendarEvents}
                        startAccessor="start"
                        endAccessor="end"
                        messages={messages}
                        culture="de-DE"
                        style={{ height: '100%' }}
                        eventPropGetter={eventStyleGetter}
                        onSelectEvent={(event: CalendarEvent) => {
                            router.push('/verwaltung/termine');
                        }}
                    />
                </div>
                </CardContent>
            </Card>
        </main>
    </div>
  );
}

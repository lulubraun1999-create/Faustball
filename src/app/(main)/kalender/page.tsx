
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc, query, where, Timestamp } from 'firebase/firestore';
import type { Appointment, AppointmentException, Location, Group, MemberProfile, AppointmentType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, dateFnsLocalizer, Views, type Event as CalendarEvent, type ToolbarProps, type View } from 'react-big-calendar';
import { format, getDay, parse, startOfWeek, addDays, addWeeks, addMonths, differenceInMilliseconds, startOfDay, isBefore, getYear, getMonth, set } from 'date-fns';
import { de } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download, Info, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import * as ics from 'ics';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { saveAs } from 'file-saver';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import Link from 'next/link';


// date-fns Localizer
const locales = { 'de-DE': de };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const formats = {
    weekdayFormat: (date: Date, culture: any, localizer: any) => localizer.format(date, 'EE', culture),
};


// Custom Toolbar
const CustomToolbar = (props: ToolbarProps) => {
    const { onNavigate, label, onView, view } = props;

    return (
        <div className="rbc-toolbar">
            <div className="rbc-btn-group">
                <Button variant="outline" onClick={() => onNavigate('TODAY')}>Heute</Button>
                <Button variant="outline" onClick={() => onNavigate('PREV')}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => onNavigate('NEXT')}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
            <span className="rbc-toolbar-label">{label}</span>
            <div className="rbc-btn-group">
                <Button variant={view === 'month' ? 'default' : 'outline'} onClick={() => onView('month')}>Monat</Button>
                <Button variant={view === 'week' ? 'default' : 'outline'} onClick={() => onView('week')}>Woche</Button>
                <Button variant={view === 'day' ? 'default' : 'outline'} onClick={() => onView('day')}>Tag</Button>
                <Button variant={view === 'agenda' ? 'default' : 'outline'} onClick={() => onView('agenda')}>Agenda</Button>
            </div>
        </div>
    );
};


type UnrolledAppointment = Appointment & {
  instanceDate: Date;
  virtualId: string;
  originalId: string;
  isCancelled: boolean;
  isException: boolean;
};

interface CustomCalendarEvent extends CalendarEvent {
    resource: UnrolledAppointment;
    className?: string;
}


export default function KalenderSeite() {
  const { user, isUserLoading, isAdmin } = useUser();
  const firestore = useFirestore();

  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [eventDetails, setEventDetails] = useState<CustomCalendarEvent | null>(null);
  
  // State for calendar view and date
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  // Data fetching
  const memberRef = useMemoFirebase(() => (firestore && user ? doc(firestore, 'members', user.uid) : null), [firestore, user]);
  const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);
  
  const userTeamIds = useMemo(() => memberProfile?.teams || [], [memberProfile]);
  
  useEffect(() => {
    if (userTeamIds.length > 0) {
      setSelectedTeams(userTeamIds);
    }
  }, [userTeamIds]);

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

  useEffect(() => {
    if (appointmentTypes) {
      setSelectedTypes(appointmentTypes.map(t => t.id));
    }
  }, [appointmentTypes]);

  // Derived data
  const teamsForFilter = useMemo(() => {
      if (!userTeamIds || !groups) return [];
      const userTeamIdsSet = new Set(userTeamIds);
      return groups.filter(g => g.type === 'team' && userTeamIdsSet.has(g.id))
                      .sort((a,b) => a.name.localeCompare(b.name));
  }, [userTeamIds, groups]);

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
    const userTeamIdsSet = new Set(userTeamIds);

    appointments.forEach(app => {
      if (!app.startDate) return;

      const isVisible = app.visibility.type === 'all' || (app.visibility.teamIds && app.visibility.teamIds.some(teamId => userTeamIdsSet.has(teamId)));
      if (!isVisible) return;
      
      const recurrenceEndDate = app.recurrenceEndDate ? app.recurrenceEndDate.toDate() : null;
      const appStartDate = app.startDate.toDate();

      if (app.recurrence === 'none' || !app.recurrence || !recurrenceEndDate) {
        const originalDateStartOfDayISO = startOfDay(appStartDate).toISOString();
        const exception = exceptionsMap.get(`${app.id}-${originalDateStartOfDayISO}`);
        
        if (exception?.status === 'cancelled') return;

        let finalData: Appointment = { ...app };
        let isException = false;
        if (exception?.status === 'modified' && exception.modifiedData) {
          const modData = exception.modifiedData;
          finalData = { ...app, ...modData, startDate: modData.startDate || app.startDate, endDate: modData.endDate === undefined ? app.endDate : (modData.endDate || undefined), id: app.id };
          isException = true;
        }
        
        allEvents.push({ ...finalData, instanceDate: finalData.startDate.toDate(), originalId: app.id, virtualId: app.id, isCancelled: false, isException });

      } else {
        let currentDate = appStartDate;
        const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), currentDate) : 0;
        let iter = 0;
        const MAX_ITERATIONS = 500;

        while (currentDate <= recurrenceEndDate && iter < MAX_ITERATIONS) {
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
    return allEvents;
  }, [appointments, exceptions, userTeamIds, memberProfile]);

  const filteredEvents: CustomCalendarEvent[] = useMemo(() => {
    const selectedTeamsSet = new Set(selectedTeams);
    const selectedTypesSet = new Set(selectedTypes);
    
    return unrolledAppointments
      .filter(app => {
        const typeMatch = selectedTypesSet.has(app.appointmentTypeId);
        const teamMatch = app.visibility.type === 'all' || app.visibility.teamIds.some(teamId => selectedTeamsSet.has(teamId));
        return typeMatch && teamMatch;
      })
      .map(app => {
          const start = app.instanceDate;
          const end = (app.endDate && !app.isAllDay) ? app.endDate.toDate() : start;
          const appType = appointmentTypes?.find(t => t.id === app.appointmentTypeId);
          const isSpieltag = appType?.name.toLowerCase() === 'spieltag';
          
          let title = app.title;
          if (isSpieltag && app.visibility.type === 'specificTeams' && app.visibility.teamIds.length > 0) {
              const teamNames = app.visibility.teamIds.map(id => teamsMap.get(id)).filter(Boolean).join(', ');
              if (teamNames) {
                  title = `${title} (${teamNames})`;
              }
          }

          return {
              title: title,
              start,
              end,
              allDay: app.isAllDay,
              resource: app,
              className: isSpieltag ? 'rbc-event-primary' : 'rbc-event-secondary'
          };
      });
  }, [unrolledAppointments, selectedTeams, selectedTypes, appointmentTypes, teamsMap]);

  const handleDownloadIcs = () => {
    const icsEvents = filteredEvents.map(event => {
      if (!event.start || !event.end) return null;
      const startArray: ics.DateArray = [event.start.getFullYear(), event.start.getMonth() + 1, event.start.getDate(), event.start.getHours(), event.start.getMinutes()];
      const endArray: ics.DateArray = [event.end.getFullYear(), event.end.getMonth() + 1, event.end.getDate(), event.end.getHours(), event.end.getMinutes()];
      const location = event.resource.locationId ? locationsMap.get(event.resource.locationId) : null;
  
      return {
        title: typeof event.title === 'string' ? event.title : 'Termin',
        start: startArray,
        end: endArray,
        description: event.resource.description,
        location: location?.name,
      };
    }).filter((e): e is ics.EventAttributes => e !== null);
  
    if (icsEvents.length === 0) {
      console.error("No valid events to create ICS file.");
      return;
    }
  
    const { error, value } = ics.createEvents(icsEvents);
    if (error) {
      console.error(error);
      return;
    }
    if (value) {
      const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' });
      saveAs(blob, 'faustball-kalender.ics');
    }
  };

  const isLoading = isUserLoading || isLoadingAppointments || isLoadingExceptions || isLoadingLocations || isLoadingMember || isLoadingGroups || isLoadingTypes;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      {isLoading ? (
        <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : userTeamIds.length === 0 ? (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-3">
                    <CalendarIcon className="h-8 w-8 text-primary" />
                    <span className="text-2xl font-headline">Kalender</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <Info className="h-10 w-10 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">Du bist derzeit keinem Team zugewiesen. Bitte kontaktiere einen Administrator.</p>
            </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="space-y-6 sticky top-20">
                <Card>
                    <CardHeader><CardTitle>Filter</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="font-semibold">Mannschaften</Label>
                            <div className="mt-2 space-y-1">
                                {teamsForFilter.map(team => (
                                    <div key={team.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`team-${team.id}`}
                                            checked={selectedTeams.includes(team.id)}
                                            onCheckedChange={checked => {
                                                setSelectedTeams(prev => checked ? [...prev, team.id] : prev.filter(id => id !== team.id));
                                            }}
                                        />
                                        <Label htmlFor={`team-${team.id}`}>{team.name}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <Label className="font-semibold">Terminarten</Label>
                            <div className="mt-2 space-y-1">
                                {appointmentTypes?.map(type => (
                                    <div key={type.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`type-${type.id}`}
                                            checked={selectedTypes.includes(type.id)}
                                            onCheckedChange={checked => {
                                                setSelectedTypes(prev => checked ? [...prev, type.id] : prev.filter(id => id !== type.id));
                                            }}
                                        />
                                        <Label htmlFor={`type-${type.id}`}>{type.name}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Button onClick={handleDownloadIcs} className="w-full">
                    <Download className="mr-2 h-4 w-4" /> Kalender herunterladen
                </Button>
            </div>
          </div>
          <div className="lg:col-span-3">
            <Card>
              <CardContent className="p-2 md:p-4">
                <Calendar
                    localizer={localizer}
                    events={filteredEvents}
                    startAccessor="start"
                    endAccessor="end"
                    culture='de-DE'
                    views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                    view={view}
                    onView={setView}
                    date={date}
                    onNavigate={setDate}
                    messages={{
                      allDay: 'Ganztägig', previous: 'Zurück', next: 'Weiter', today: 'Heute', month: 'Monat', week: 'Woche', day: 'Tag', agenda: 'Agenda', date: 'Datum', time: 'Uhrzeit', event: 'Termin', noEventsInRange: 'Keine Termine in diesem Zeitraum.', showMore: total => `+ ${total} weitere`,
                    }}
                    formats={formats}
                    onSelectEvent={(event) => setEventDetails(event as CustomCalendarEvent)}
                    eventPropGetter={(event) => ({ className: (event as CustomCalendarEvent).className })}
                    components={{ toolbar: CustomToolbar }}
                    style={{ height: '75vh' }}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {eventDetails && (
        <Dialog open={!!eventDetails} onOpenChange={() => setEventDetails(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{eventDetails.title}</DialogTitle>
              <DialogDescription>
                {eventDetails.start && format(eventDetails.start, "eeee, dd. MMMM yyyy", { locale: de })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4 text-sm">
                <p><strong>Zeit:</strong> {eventDetails.allDay ? 'Ganztägig' : `${eventDetails.start && format(eventDetails.start, "HH:mm", { locale: de })} - ${eventDetails.end && format(eventDetails.end, "HH:mm", { locale: de })} Uhr`}</p>
                {eventDetails.resource.locationId && locationsMap.has(eventDetails.resource.locationId) && (
                    <p><strong>Ort:</strong> {locationsMap.get(eventDetails.resource.locationId)!.name}</p>
                )}
                {eventDetails.resource.meetingPoint && <p><strong>Treffpunkt:</strong> {eventDetails.resource.meetingPoint}</p>}
                {eventDetails.resource.meetingTime && <p><strong>Treffzeit:</strong> {eventDetails.resource.meetingTime}</p>}
                {eventDetails.resource.description && <p><strong>Details:</strong> {eventDetails.resource.description}</p>}
            </div>
            <DialogFooter className="sm:justify-between">
                <DialogClose asChild>
                  <Button variant="outline">Schließen</Button>
                </DialogClose>
                {isAdmin && (
                  <Button asChild>
                      <Link href="/verwaltung/termine">
                          <Edit className="mr-2 h-4 w-4" /> Zum Termin
                      </Link>
                  </Button>
                )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
'use client';

import React, { useState, useMemo, useEffect, useCallback, FC } from 'react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import { collection, doc, Timestamp, getDocs, query, where } from 'firebase/firestore';
import type {
  Appointment,
  AppointmentException,
  AppointmentType,
  Group,
  Location,
  MemberProfile,
} from '@/lib/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Calendar,
  dateFnsLocalizer,
  Views,
  type Event,
  type ToolbarProps,
} from 'react-big-calendar';
import {
  format,
  getDay,
  parse,
  startOfWeek,
  addDays,
  addWeeks,
  addMonths,
  differenceInMilliseconds,
  startOfDay,
  isBefore,
  getYear,
  getMonth,
  set as setDate,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Download,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Users,
  ClipboardCopy,
} from 'lucide-react';
import { createEvents, type EventAttributes } from 'ics';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { saveAs } from 'file-saver';


// date-fns Localizer
const locales = {
  de: de,
};
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const formats = {
    weekdayFormat: (date: Date, culture: any, localizer: any) =>
      localizer.format(date, 'EE', culture), // e.g., "Mo"
};

// Custom Toolbar
const CustomToolbar: FC<ToolbarProps> = ({ label, onNavigate }) => {
  return (
    <div className="rbc-toolbar">
      <div className="rbc-btn-group">
        <Button variant="ghost" size="icon" onClick={() => onNavigate('PREV')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onNavigate('NEXT')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <span className="rbc-toolbar-label">{label}</span>
      <div className="rbc-btn-group"></div>
    </div>
  );
};


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

// Main Component
export default function KalenderPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const memberRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: memberProfile, isLoading: isLoadingMember } =
    useDoc<MemberProfile>(memberRef);

  const userTeamIds = useMemo(() => memberProfile?.teams || [], [memberProfile]);

  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  const appointmentsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'appointments') : null),
    [firestore]
  );
  const { data: appointments, isLoading: isLoadingAppointments } =
    useCollection<Appointment>(appointmentsRef);
  const exceptionsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'appointmentExceptions') : null),
    [firestore]
  );
  const { data: exceptions, isLoading: isLoadingExceptions } =
    useCollection<AppointmentException>(exceptionsRef);
  const locationsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'locations') : null),
    [firestore]
  );
  const { data: locationsData, isLoading: isLoadingLocations } =
    useCollection<Location>(locationsRef);
  const locationsMap = useMemo(
    () => new Map(locationsData?.map((l) => [l.id, l])),
    [locationsData]
  );
  const appointmentTypesRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'appointmentTypes') : null),
    [firestore]
  );
  const { data: appointmentTypes, isLoading: isLoadingTypes } =
    useCollection<AppointmentType>(appointmentTypesRef);
  const groupsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'groups') : null),
    [firestore]
  );
  const { data: groups, isLoading: isLoadingGroups } =
    useCollection<Group>(groupsRef);
    
  const teamsMap = useMemo(
    () => new Map(groups?.filter((g) => g.type === 'team').map((t) => [t.id, t.name])),
    [groups]
  );
    
  // Set initial filter state once data is loaded
  useEffect(() => {
    if (userTeamIds.length > 0 && selectedTeams.size === 0) {
      setSelectedTeams(new Set(userTeamIds));
    }
  }, [userTeamIds, selectedTeams.size]);

  useEffect(() => {
    if (appointmentTypes && selectedTypes.size === 0) {
      setSelectedTypes(new Set(appointmentTypes.map((t) => t.id)));
    }
  }, [appointmentTypes, selectedTypes.size]);

  const handleTeamFilterChange = (teamId: string, checked: boolean) => {
    setSelectedTeams((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(teamId);
      } else {
        newSet.delete(teamId);
      }
      return newSet;
    });
  };
  const handleTypeFilterChange = (typeId: string, checked: boolean) => {
    setSelectedTypes((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(typeId);
      } else {
        newSet.delete(typeId);
      }
      return newSet;
    });
  };
  
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
        const MAX_ITERATIONS = 1000; // Safety break for long recurrences

        while (currentDate <= recurrenceEndDate && iter < MAX_ITERATIONS) {
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
            
          iter++;
          switch (app.recurrence) {
            case 'daily': currentDate = addDays(currentDate, 1); break;
            case 'weekly': currentDate = addWeeks(currentDate, 1); break;
            case 'bi-weekly': currentDate = addWeeks(currentDate, 2); break;
            case 'monthly':
                const nextMonth = addMonths(currentDate, 1);
                currentDate = setDate(nextMonth, { date: Math.min(appStartDate.getDate(), new Date(getYear(nextMonth), getMonth(nextMonth) + 1, 0).getDate()) });
                break;
            default: iter = MAX_ITERATIONS; break;
          }
        }
      }
    });
    return allEvents;
  }, [appointments, exceptions, userTeamIds, memberProfile]);

  const filteredEvents: CalendarEvent[] = useMemo(() => {
    return unrolledAppointments
      .filter((app) => {
          if (app.isCancelled) return false;
          const teamMatch = app.visibility.type === 'all' || app.visibility.teamIds.some(id => selectedTeams.has(id));
          const typeMatch = selectedTypes.has(app.appointmentTypeId);
          return teamMatch && typeMatch;
      })
      .map((app) => {
        const spieltagTypeId = appointmentTypes?.find(t => t.name.toLowerCase() === 'spieltag')?.id;
        const isSpieltag = app.appointmentTypeId === spieltagTypeId;
        const start = app.instanceDate;
        const end = app.isAllDay ? addDays(start, 1) : (app.endDate ? app.endDate.toDate() : start);

        return {
          title: app.title,
          start,
          end,
          allDay: app.isAllDay,
          resource: { ...app, isSpieltag },
        };
      });
  }, [unrolledAppointments, selectedTeams, selectedTypes, appointmentTypes]);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
      const isSpieltag = event.resource.isSpieltag;
      const style = {
        backgroundColor: isSpieltag ? 'hsl(var(--primary))' : 'hsl(var(--accent))',
        color: isSpieltag ? 'hsl(var(--primary-foreground))' : 'hsl(var(--accent-foreground))',
        borderRadius: '4px',
        border: 'none',
        opacity: 0.9,
      };
      return { style };
    }, []);

  const downloadCalendar = () => {
    const icsEvents: EventAttributes[] = filteredEvents.map(event => {
        const start = event.start!;
        const end = event.end!;
        const location = event.resource.locationId ? locationsMap.get(event.resource.locationId) : null;
        
        return {
            title: event.title,
            start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
            end: [end.getFullYear(), end.getMonth() + 1, end.getDate(), end.getHours(), end.getMinutes()],
            description: event.resource.description,
            location: location ? `${location.name}, ${location.address}` : undefined,
        };
    });

    createEvents(icsEvents, (error, value) => {
        if (error) {
            console.error(error);
            return;
        }
        const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' });
        saveAs(blob, 'faustball-kalender.ics');
    });
  };

  const isLoading =
    isUserLoading ||
    isLoadingMember ||
    isLoadingAppointments ||
    isLoadingExceptions ||
    isLoadingLocations ||
    isLoadingGroups ||
    isLoadingTypes;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto grid grid-cols-1 gap-6 p-4 sm:p-6 lg:p-8 xl:grid-cols-4">
      {/* Filter Sidebar */}
      <aside className="xl:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>Filter</CardTitle>
            <CardDescription>Passe den Kalender an</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold">Mannschaften</h3>
              <div className="space-y-2">
                {userTeamIds.map((teamId) => {
                  const teamName = teamsMap.get(teamId);
                  return (
                    <div key={teamId} className="flex items-center space-x-2">
                      <Checkbox
                        id={`team-${teamId}`}
                        checked={selectedTeams.has(teamId)}
                        onCheckedChange={(checked) => handleTeamFilterChange(teamId, !!checked)}
                      />
                      <Label htmlFor={`team-${teamId}`}>{teamName || teamId}</Label>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="mb-2 font-semibold">Terminarten</h3>
              <div className="space-y-2">
                {appointmentTypes?.map((type) => (
                  <div key={type.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`type-${type.id}`}
                      checked={selectedTypes.has(type.id)}
                      onCheckedChange={(checked) => handleTypeFilterChange(type.id, !!checked)}
                    />
                    <Label htmlFor={`type-${type.id}`}>{type.name}</Label>
                  </div>
                ))}
              </div>
            </div>
            <Button onClick={downloadCalendar} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Kalender herunterladen
            </Button>
          </CardContent>
        </Card>
      </aside>

      {/* Calendar View */}
      <main className="xl:col-span-3">
        <Card>
          <CardContent className="p-2 md:p-4 h-[80vh]">
            <Calendar
                localizer={localizer}
                events={filteredEvents}
                startAccessor="start"
                endAccessor="end"
                culture="de"
                messages={{
                    allDay: 'Ganztägig',
                    previous: 'Zurück',
                    next: 'Weiter',
                    today: 'Heute',
                    month: 'Monat',
                    week: 'Woche',
                    day: 'Tag',
                    agenda: 'Agenda',
                    date: 'Datum',
                    time: 'Uhrzeit',
                    event: 'Termin',
                    noEventsInRange: 'Keine Termine in diesem Zeitraum.',
                    showMore: total => `+ ${total} weitere`,
                }}
                eventPropGetter={eventStyleGetter}
                onSelectEvent={(event) => setSelectedEvent(event)}
                components={{ toolbar: CustomToolbar }}
                formats={formats}
            />
          </CardContent>
        </Card>
      </main>
      
        {selectedEvent && (
            <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{selectedEvent.title}</DialogTitle>
                        <DialogDescription>
                            {format(selectedEvent.start!, "eeee, dd. MMMM yyyy", { locale: de })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-2">
                            <strong>Zeit:</strong> 
                            {selectedEvent.allDay ? 'Ganztägig' : `${format(selectedEvent.start!, 'HH:mm')} - ${format(selectedEvent.end!, 'HH:mm')} Uhr`}
                        </div>
                         {selectedEvent.resource.locationId && locationsMap.has(selectedEvent.resource.locationId) && (
                            <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground"/>
                                <span>{locationsMap.get(selectedEvent.resource.locationId)?.name}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground"/>
                            <span>{selectedEvent.resource.visibility.type === 'all' ? 'Alle Teams' : selectedEvent.resource.visibility.teamIds.map(id => teamsMap.get(id)).join(', ')}</span>
                        </div>
                        {selectedEvent.resource.description && <p>{selectedEvent.resource.description}</p>}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">Schließen</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}
    </div>
  );
}

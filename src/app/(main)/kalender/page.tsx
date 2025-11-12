'use client';

import React, { useState, useMemo, useEffect, FC } from 'react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import { collection, doc, Timestamp } from 'firebase/firestore';
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
import { Calendar, dateFnsLocalizer, Views, type View, type ToolbarProps } from 'react-big-calendar';
import {
  format,
  addDays,
  addWeeks,
  addMonths,
  differenceInMilliseconds,
  startOfDay,
  isBefore,
  getYear,
  getMonth,
  set as setDate,
  getDay,
  parse,
  startOfWeek,
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Loader2,
  Download,
  MapPin,
  Users,
  ClipboardCopy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import * as ics from 'ics';
import { saveAs } from 'file-saver';

// --- (Typen und Kalender-Setup) ---
const locales = { 'de-DE': de };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
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
  showMore: (total: number) => `+ ${total} weitere`,
};

const formats = {
    weekdayFormat: (date: Date, culture: any, localizer: any) => localizer.format(date, 'EE', culture),
};

const CustomToolbar: React.FC<ToolbarProps> = ({ label, onNavigate }) => {
    return (
        <div className="rbc-toolbar">
            <span className="rbc-btn-group">
                <Button variant="ghost" size="icon" onClick={() => onNavigate('PREV')} aria-label={messages.previous}>
                    <ChevronLeft className="h-5 w-5" />
                </Button>
            </span>
            <span className="rbc-toolbar-label">{label}</span>
            <span className="rbc-btn-group">
                <Button variant="ghost" size="icon" onClick={() => onNavigate('NEXT')} aria-label={messages.next}>
                    <ChevronRight className="h-5 w-5" />
                </Button>
            </span>
        </div>
    );
};


// Main Component
export default function KalenderPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const [selectedEvent, setSelectedEvent] = useState<UnrolledAppointment | null>(null);

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
    const today = startOfDay(new Date());
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
        const MAX_ITERATIONS = 1000;

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
    return allEvents.sort((a,b) => a.instanceDate.getTime() - b.instanceDate.getTime());
  }, [appointments, exceptions, userTeamIds, memberProfile]);

  const filteredAppointments = useMemo(() => {
    return unrolledAppointments
      .filter((app) => {
          if (app.isCancelled) return false;
          const teamMatch = app.visibility.type === 'all' || app.visibility.teamIds.some(id => selectedTeams.has(id));
          const typeMatch = selectedTypes.has(app.appointmentTypeId);
          return teamMatch && typeMatch;
      });
  }, [unrolledAppointments, selectedTeams, selectedTypes]);

  const calendarEvents = useMemo((): CalendarEvent[] => {
    return filteredAppointments.map(app => {
      const start = app.instanceDate;
      const end = app.isAllDay ? addDays(start, 1) : (app.endDate ? app.endDate.toDate() : start);
      return {
        title: app.title,
        start,
        end,
        allDay: !!app.isAllDay,
        resource: app,
      };
    });
  }, [filteredAppointments]);


  const downloadCalendar = () => {
    const icsEvents: ics.EventAttributes[] = filteredAppointments.map(app => {
        const start = app.instanceDate;
        const end = app.endDate?.toDate();
        const duration = end ? { minutes: (end.getTime() - start.getTime()) / 60000 } : { hours: 1 };
        
        return {
            title: app.title,
            start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
            duration,
            location: app.locationId ? locationsMap.get(app.locationId)?.name : undefined,
            description: app.description,
        };
    });

    ics.createEvents(icsEvents, (error, value) => {
        if (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Fehler beim Erstellen der Kalenderdatei.' });
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

  const eventStyleGetter = (event: CalendarEvent) => {
    let className = 'rbc-event-custom';
    const spieltagTypeId = appointmentTypes?.find(t => t.name.toLowerCase().includes('spieltag'))?.id;
    if (event.resource.appointmentTypeId === spieltagTypeId) {
        className += ' rbc-event-primary';
    } else {
        className += ' rbc-event-secondary';
    }
    return { className };
  };

  return (
    <div className="container mx-auto grid grid-cols-1 gap-6 p-4 sm:p-6 lg:p-8 xl:grid-cols-4">
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

      <main className="xl:col-span-3">
          <Card>
            <CardContent className="p-2 md:p-4 h-[80vh]">
                 <Calendar
                    localizer={localizer}
                    events={calendarEvents}
                    startAccessor="start"
                    endAccessor="end"
                    messages={messages}
                    culture="de-DE"
                    formats={formats}
                    style={{ height: '100%' }}
                    onSelectEvent={(event) => setSelectedEvent(event.resource)}
                    eventPropGetter={eventStyleGetter}
                    components={{
                        toolbar: CustomToolbar
                    }}
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
                          {format(selectedEvent.instanceDate, "eeee, dd. MMMM yyyy", { locale: de })}
                      </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                      <div className="flex items-center gap-2">
                          <strong>Zeit:</strong> 
                          {selectedEvent.isAllDay ? 'Ganztägig' : `${format(selectedEvent.instanceDate, 'HH:mm')} ${selectedEvent.endDate ? `- ${format(selectedEvent.endDate.toDate(), 'HH:mm')}` : ''} Uhr`}
                      </div>
                       {selectedEvent.locationId && locationsMap.has(selectedEvent.locationId) && (
                          <LocationPopover location={locationsMap.get(selectedEvent.locationId)!} />
                      )}
                      <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground"/>
                          <span>{selectedEvent.visibility.type === 'all' ? 'Alle Teams' : selectedEvent.visibility.teamIds.map(id => teamsMap.get(id)).join(', ')}</span>
                      </div>
                      {selectedEvent.description && <p>{selectedEvent.description}</p>}
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

const LocationPopover: FC<{ location: Location }> = ({ location }) => {
    const { toast } = useToast();
    const copyAddress = () => {
        if (location.address) {
            navigator.clipboard.writeText(location.address);
            toast({ title: "Adresse kopiert" });
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="link" className="p-0 h-auto font-normal text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{location.name}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 text-sm">
                <div className="space-y-2">
                    <h4 className="font-medium leading-none">Adresse</h4>
                    <p className="text-muted-foreground">{location.address || 'Keine Adresse hinterlegt.'}</p>
                    {location.address && (
                        <Button onClick={copyAddress} size="sm" className="w-full mt-2">
                            <ClipboardCopy className="mr-2 h-4 w-4" /> Adresse kopieren
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};
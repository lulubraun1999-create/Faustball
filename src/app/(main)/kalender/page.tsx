'use client';

import React, { useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc, query, where, Timestamp } from 'firebase/firestore';
import type { Appointment, AppointmentException, Location, Group, MemberProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, dateFnsLocalizer, Event } from 'react-big-calendar';
import { format, getDay, parse, startOfWeek, addDays, addWeeks, addMonths, differenceInMilliseconds, startOfDay, isEqual } from 'date-fns';
import { de } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useRouter } from 'next/navigation';
import { Loader2, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

// date-fns Localizer
const locales = {
  'de-DE': de,
};
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), // Woche startet am Montag
  getDay,
  locales,
});

// Typ für die Kalender-Events
interface CalendarEvent extends Event {
  resource: UnrolledAppointment; // Das volle, entfaltete Terminobjekt
}

// Typ für entfaltete Termine
type UnrolledAppointment = Appointment & {
  virtualId: string;
  originalId: string;
  originalDateISO?: string;
  isException?: boolean;
  isCancelled?: boolean;
};

// Kalender-Nachrichten auf Deutsch
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

export default function KalenderPage() {
  const router = useRouter();
  const { user, isUserLoading: isUserLoadingAuth, isAdmin } = useUser();
  const firestore = useFirestore();

  const memberRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);
  const userTeamIds = useMemo(() => memberProfile?.teams || [], [memberProfile]);

  // --- Datenabfragen ---
  const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);
  
  const exceptionsRef = useMemoFirebase(
      () => (firestore && isAdmin ? collection(firestore, 'appointmentExceptions') : null), // Nur Admins
      [firestore, isAdmin]
  );
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);

  const locationsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'locations') : null), [firestore]);
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsRef);
  const locationsMap = useMemo(() => new Map(locations?.map(l => [l.id, l.name])), [locations]);


  const unrolledAppointments = useMemo(() => {
    if (!appointments || (isAdmin && isLoadingExceptions)) return [];
    
    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions?.forEach(ex => {
      if (ex.originalDate) {
        const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
        exceptionsMap.set(key, ex);
      }
    });

    const allEvents: UnrolledAppointment[] = [];
    const now = new Date();

    appointments.forEach(app => {
      if (!app.startDate) return;

      const isVisible = app.visibility.type === 'all' || (app.visibility.teamIds && app.visibility.teamIds.some(teamId => userTeamIds.includes(teamId)));
      if (!isVisible) return;

      const originalDateStartOfDay = startOfDay(app.startDate.toDate());
      const originalDateStartOfDayISO = originalDateStartOfDay.toISOString();
      const key = `${app.id}-${originalDateStartOfDayISO}`;
      const exception = exceptionsMap.get(key);
      const isCancelled = exception?.status === 'cancelled';

      if (app.recurrence === 'none') {
        if (!isCancelled) {
            const modifiedApp = exception?.status === 'modified' ? { ...app, ...(exception.modifiedData || {}), isException: true } : app;
            allEvents.push({ ...modifiedApp, originalId: app.id, virtualId: app.id, isCancelled: false, originalDateISO: originalDateStartOfDayISO });
        }
      } else {
        let currentDate = app.startDate.toDate();
        const recurrenceEndDate = app.recurrenceEndDate ? addDays(app.recurrenceEndDate.toDate(), 1) : addDays(now, 365);
        const recurrenceStartDate = addMonths(now, -3);
        
        const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), app.startDate.toDate()) : 0;
        let iter = 0;
        const MAX_ITERATIONS = 1000;

        while (currentDate < recurrenceEndDate && iter < MAX_ITERATIONS) {
          const currentDateStartOfDay = startOfDay(currentDate);
          
          if (currentDateStartOfDay >= recurrenceStartDate) {
              const currentDateStartOfDayISO = currentDateStartOfDay.toISOString();
              const instanceKey = `${app.id}-${currentDateStartOfDayISO}`;
              const instanceException = exceptionsMap.get(instanceKey);
              const instanceIsCancelled = instanceException?.status === 'cancelled';

              if (!instanceIsCancelled) {
                  const newStartDate = Timestamp.fromDate(currentDate);
                  // *** KORREKTUR: Stelle sicher, dass endDate undefined ist, wenn es nicht existiert ***
                  const newEndDate = app.endDate ? Timestamp.fromMillis(currentDate.getTime() + duration) : undefined;
                  
                  let instanceData: UnrolledAppointment = {
                    ...app,
                    id: `${app.id}-${currentDate.toISOString()}`,
                    virtualId: instanceKey,
                    originalId: app.id,
                    originalDateISO: currentDateStartOfDayISO,
                    startDate: newStartDate,
                    endDate: newEndDate, // Hier wird der korrigierte Wert verwendet
                    isCancelled: false,
                  };

                  if (instanceException?.status === 'modified' && instanceException.modifiedData) {
                      // *** KORREKTUR: modifiedData korrekt zusammenführen ***
                      instanceData = { 
                          ...instanceData, 
                          ...instanceException.modifiedData, 
                          isException: true 
                      };
                  }
                  allEvents.push(instanceData);
              }
          }

          switch (app.recurrence) {
            case 'daily': currentDate = addDays(currentDate, 1); break;
            case 'weekly': currentDate = addWeeks(currentDate, 1); break;
            case 'bi-weekly': currentDate = addWeeks(currentDate, 2); break;
            case 'monthly': currentDate = addMonths(currentDate, 1); break;
            default: currentDate = addDays(recurrenceEndDate, 1); break;
          }
          iter++;
        }
      }
    });
    return allEvents;
  }, [appointments, exceptions, isLoadingExceptions, userTeamIds, isAdmin]);


  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return unrolledAppointments.map(app => {
      const start = app.startDate.toDate();
      const end = app.isAllDay ? start : (app.endDate ? app.endDate.toDate() : start);

      return {
        title: app.title,
        start: start,
        end: end,
        allDay: app.isAllDay,
        resource: app,
      };
    });
  }, [unrolledAppointments]);

  const isLoading = isUserLoadingAuth || isLoadingMember || isLoadingAppointments || (isAdmin && isLoadingExceptions) || isLoadingLocations;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Event-Styling
  const eventStyleGetter = (event: CalendarEvent) => {
    const style: React.CSSProperties = { // Expliziter Typ
      backgroundColor: 'var(--primary)',
      borderRadius: '4px',
      opacity: 1,
      color: 'var(--primary-foreground)',
      border: '0px',
      display: 'block',
    };
    if (event.resource.isException) {
      style.backgroundColor = 'var(--secondary)';
      style.color = 'var(--secondary-foreground)';
    }
    return {
      style: style,
    };
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-3">
                <CalendarDays className="h-6 w-6" /> Dein Kalender
            </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          <div className="h-[75vh]">
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              messages={messages}
              culture="de-DE"
              style={{ height: '100%' }}
              eventPropGetter={eventStyleGetter}
              onSelectEvent={(event: CalendarEvent) => { // Expliziter Typ
                // Optional: Zeige Details beim Klick
                // alert(event.title);
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
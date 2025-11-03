'use client';

import React, { useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc, query, where, Timestamp } from 'firebase/firestore';
import type { Appointment, AppointmentException, Location, Group, MemberProfile } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, dateFnsLocalizer, Event } from 'react-big-calendar';
import { format, getDay, parse, startOfWeek, addDays, addWeeks, addMonths, differenceInMilliseconds, startOfDay, isEqual } from 'date-fns';
import { de } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
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
  // *** 'isAdmin' und 'isUserLoading' von useUser holen ***
  const { user, isUserLoading: isUserLoadingAuth, isAdmin } = useUser();
  const firestore = useFirestore();

  // Lade das Profil des aktuellen Benutzers, um seine Teams zu bekommen
  const memberRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);
  const userTeamIds = useMemo(() => memberProfile?.teams || [], [memberProfile]);

  // --- Datenabfragen ---
  // 1. Alle Termine
  const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);
  
  // 2. Alle Ausnahmen (NUR FÜR ADMINS)
  // *** KORREKTUR: Lade Ausnahmen NUR, wenn der Benutzer Admin ist ***
  const exceptionsRef = useMemoFirebase(
      () => (firestore && isAdmin ? collection(firestore, 'appointmentExceptions') : null),
      [firestore, isAdmin]
  );
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);

  // 3. Orte (für Tooltips)
  const locationsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'locations') : null), [firestore]);
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsRef);
  const locationsMap = useMemo(() => new Map(locations?.map(l => [l.id, l.name])), [locations]);


  // Logik zum Entfalten der Termine (Angepasst für Kalender, zeigt *alle* Termine, nicht nur zukünftige)
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

      // Filterung nach Sichtbarkeit
      const isVisible = app.visibility.type === 'all' || (app.visibility.teamIds && app.visibility.teamIds.some(teamId => userTeamIds.includes(teamId)));
      if (!isVisible) return;

      const originalDateStartOfDay = startOfDay(app.startDate.toDate());
      const originalDateStartOfDayISO = originalDateStartOfDay.toISOString();
      const key = `${app.id}-${originalDateStartOfDayISO}`;
      const exception = exceptionsMap.get(key);
      const isCancelled = exception?.status === 'cancelled';

      if (app.recurrence === 'none') {
        if (!isCancelled) { // Abgesagte Einmaltermine nicht anzeigen
            const modifiedApp = exception?.status === 'modified' ? { ...app, ...(exception.modifiedData || {}), isException: true } : app;
            allEvents.push({ ...modifiedApp, originalId: app.id, virtualId: app.id, isCancelled: false, originalDateISO: originalDateStartOfDayISO });
        }
      } else {
        let currentDate = app.startDate.toDate();
        // Zeige Termine bis zu 1 Jahr in die Zukunft und 3 Monate in die Vergangenheit
        const recurrenceEndDate = app.recurrenceEndDate ? addDays(app.recurrenceEndDate.toDate(), 1) : addDays(now, 365);
        const recurrenceStartDate = addMonths(now, -3); // Startpunkt für die Anzeige
        
        const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), app.startDate.toDate()) : 0;
        let iter = 0;
        const MAX_ITERATIONS = 1000; // Mehr Iterationen für Kalender

        while (currentDate < recurrenceEndDate && iter < MAX_ITERATIONS) {
          const currentDateStartOfDay = startOfDay(currentDate);
          
          // Nur anzeigen, wenn im relevanten Zeitfenster
          if (currentDateStartOfDay >= recurrenceStartDate) {
              const currentDateStartOfDayISO = currentDateStartOfDay.toISOString();
              const instanceKey = `${app.id}-${currentDateStartOfDayISO}`;
              const instanceException = exceptionsMap.get(instanceKey);
              const instanceIsCancelled = instanceException?.status === 'cancelled';

              if (!instanceIsCancelled) {
                  const newStartDate = Timestamp.fromDate(currentDate);
                  const newEndDate = app.endDate ? Timestamp.fromMillis(currentDate.getTime() + duration) : undefined;
                  
                  let instanceData: UnrolledAppointment = {
                    ...app,
                    id: `${app.id}-${currentDate.toISOString()}`,
                    virtualId: instanceKey,
                    originalId: app.id,
                    originalDateISO: currentDateStartOfDayISO,
                    startDate: newStartDate,
                    endDate: newEndDate,
                    isCancelled: false,
                  };

                  if (instanceException?.status === 'modified' && instanceException.modifiedData) {
                      instanceData = { ...instanceData, ...instanceException.modifiedData, isException: true };
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
  // *** ENDE ANGEPASSTE LOGIK ***


  // Konvertiere zu Kalender-Events
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return unrolledAppointments.map(app => {
      const start = app.startDate.toDate();
      // Wenn endDate fehlt oder 'isAllDay' wahr ist, setze Ende auf Start (wichtig für ganztägige Events)
      const end = app.isAllDay ? start : (app.endDate ? app.endDate.toDate() : start);

      return {
        title: app.title,
        start: start,
        end: end,
        allDay: app.isAllDay,
        resource: app, // Originaldaten anhängen
      };
    });
  }, [unrolledAppointments]);

  // Ladezustand
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
    const style = {
      backgroundColor: 'var(--primary)',
      borderRadius: '4px',
      opacity: 1,
      color: 'var(--primary-foreground)',
      border: '0px',
      display: 'block',
    };
    // Unterscheide geänderte Termine
    if (event.resource.isException) {
      style.backgroundColor = 'var(--secondary)'; // Andere Farbe für geänderte Termine
      style.color = 'var(--secondary-foreground)';
    }
    return {
      style: style,
    };
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="h-[75vh]"> {/* Feste Höhe für den Kalender-Container */}
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              messages={messages}
              culture="de-DE"
              style={{ height: '100%' }}
              eventPropGetter={eventStyleGetter}
              // Optional: Klick auf Event (z.B. um Details anzuzeigen)
              // onSelectEvent={(event) => alert(event.title)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
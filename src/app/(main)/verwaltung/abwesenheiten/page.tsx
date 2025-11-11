'use client';

import React, { useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc, query, where, Timestamp } from 'firebase/firestore';
import type { Appointment, AppointmentException, Location, Group, MemberProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar, dateFnsLocalizer, Event } from 'react-big-calendar';
import { format, getDay, parse, startOfWeek, addDays, addWeeks, addMonths, differenceInMilliseconds, startOfDay, isEqual } from 'date-fns';
import { de } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useRouter } from 'next/navigation';
import { Loader2, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- (Typen und Kalender-Setup) ---
const locales = { 'de-DE': de };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
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

function AdminAbwesenheitenPageContent() {
  const router = useRouter();
  const { user, isAdmin } = useUser();
  const firestore = useFirestore();

  const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);
  
  const exceptionsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentExceptions') : null), [firestore]);
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);

  // Logik zum Entfalten der Termine (Admin-Sicht: zeigt *nur* abgesagte)
  const cancelledAppointments = useMemo(() => {
    if (!appointments || !exceptions) return [];
    
    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions.forEach(ex => {
      if (ex.originalDate && ex.status === 'cancelled') {
        const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
        exceptionsMap.set(key, ex);
      }
    });

    const cancelledEvents: UnrolledAppointment[] = [];
    const now = new Date();

    appointments.forEach(app => {
      if (!app.startDate) return;

      const originalDateStartOfDay = startOfDay(app.startDate.toDate());
      const originalDateStartOfDayISO = originalDateStartOfDay.toISOString();
      const key = `${app.id}-${originalDateStartOfDayISO}`;
      
      if (exceptionsMap.has(key)) {
           cancelledEvents.push({ ...app, originalId: app.id, virtualId: app.id, isCancelled: true, originalDateISO: originalDateStartOfDayISO });
      }

      if (app.recurrence !== 'none') {
        let currentDate = app.startDate.toDate();
        const recurrenceEndDate = app.recurrenceEndDate ? addDays(app.recurrenceEndDate.toDate(), 1) : addDays(now, 365);
        
        let iter = 0;
        const MAX_ITERATIONS = 1000;

        while (currentDate < recurrenceEndDate && iter < MAX_ITERATIONS) {
          const currentDateStartOfDay = startOfDay(currentDate);
          const currentDateStartOfDayISO = currentDateStartOfDay.toISOString();
          const instanceKey = `${app.id}-${currentDateStartOfDayISO}`;
          
          if (exceptionsMap.has(instanceKey)) {
              const newStartDate = Timestamp.fromDate(currentDate);
              const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), app.startDate.toDate()) : 0;
              const newEndDate = app.endDate ? Timestamp.fromMillis(currentDate.getTime() + duration) : undefined;
              
              cancelledEvents.push({
                ...app,
                id: `${app.id}-${currentDate.toISOString()}`,
                virtualId: instanceKey,
                originalId: app.id,
                originalDateISO: currentDateStartOfDayISO,
                startDate: newStartDate,
                endDate: newEndDate,
                isCancelled: true,
              });
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
    return cancelledEvents.sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis());
  }, [appointments, exceptions]);

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return cancelledAppointments.map(app => {
      const start = app.startDate.toDate();
      const end = app.isAllDay ? start : (app.endDate ? app.endDate.toDate() : start);
      return {
        title: `${app.title} (Abgesagt)`,
        start: start,
        end: end,
        allDay: app.isAllDay,
        resource: app,
      };
    });
  }, [cancelledAppointments]);

  const isLoading = isLoadingAppointments || isLoadingExceptions;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Event-Styling (alle rot)
  const eventStyleGetter = (event: CalendarEvent) => { // Expliziter Typ
    return {
      style: {
        backgroundColor: 'var(--destructive)',
        borderRadius: '4px',
        opacity: 0.8,
        color: 'var(--destructive-foreground)',
        border: '0px',
        display: 'block',
      } as React.CSSProperties, // Typ-Assertion
    };
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
             <ListTodo className="h-6 w-6" /> Abgesagte Termine
          </CardTitle>
          <CardDescription>
            Dies ist eine Übersicht aller einzeln abgesagten Termine.
          </CardDescription>
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
                router.push('/verwaltung/termine-bearbeiten');
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// *** Admin-Wrapper ***
export default function AdminAbwesenheitenPage() {
    const { isAdmin, isUserLoading } = useUser();
    
    if (isUserLoading) { 
        return ( <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> ); 
    }
    if (!isAdmin) { 
        return ( <div className="container mx-auto p-4 sm:p-6 lg:p-8"><Card className="border-destructive/50"><CardHeader><CardTitle className="flex items-center gap-3 text-destructive"><ListTodo className="h-8 w-8" /><span className="text-2xl font-headline">Zugriff verweigert</span></CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Sie verfügen nicht über die erforderlichen Berechtigungen, um auf diesen Bereich zuzugreifen.</p></CardContent></Card></div> ); 
    }
    return <AdminAbwesenheitenPageContent />;
}
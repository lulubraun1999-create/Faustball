
'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  useDoc,
} from '@/firebase';
import {
  collection,
  query,
  where,
  doc,
  Timestamp,
} from 'firebase/firestore';
import {
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
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Calendar as CalendarIcon,
  Filter,
  Download,
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  addMonths,
  subMonths,
  addDays,
  addWeeks,
  addHours
} from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import * as ics from 'ics';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import Link from 'next/link';

type UnrolledAppointment = Appointment & {
  virtualId: string;
  originalId: string;
  instanceDate: Date;
  isException?: boolean;
  isCancelled?: boolean;
};

export default function KalenderPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const memberProfileRef = useMemoFirebase(
    () => (user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: memberProfile, isLoading: isLoadingMember } =
    useDoc<MemberProfile>(memberProfileRef);

  const userTeamIds = useMemo(() => memberProfile?.teams || [], [memberProfile]);

  useEffect(() => {
    if (userTeamIds.length > 0 && selectedTeams.length === 0) {
      setSelectedTeams(userTeamIds);
    }
  }, [userTeamIds, selectedTeams.length]);

  const appointmentsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'appointments') : null),
    [firestore]
  );
  const { data: appointments, isLoading: isLoadingAppointments } =
    useCollection<Appointment>(appointmentsRef);

  const appointmentIds = useMemo(
    () => appointments?.map((app) => app.id) || [],
    [appointments]
  );

  const exceptionsRef = useMemoFirebase(
    () =>
      firestore && appointmentIds.length > 0
        ? query(
            collection(firestore, 'appointmentExceptions'),
            where('originalAppointmentId', 'in', appointmentIds)
          )
        : null,
    [firestore, appointmentIds]
  );
  const { data: exceptions, isLoading: isLoadingExceptions } =
    useCollection<AppointmentException>(exceptionsRef);

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
  const { data: allGroups, isLoading: isLoadingGroups } =
    useCollection<Group>(groupsRef);

  const locationsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'locations') : null),
    [firestore]
  );
  const { data: locations, isLoading: isLoadingLocations } =
    useCollection<Location>(locationsRef);

  const isLoading =
    isUserLoading ||
    isLoadingMember ||
    isLoadingAppointments ||
    isLoadingExceptions ||
    isLoadingTypes ||
    isLoadingGroups ||
    isLoadingLocations;

  const { userTeams, typesMap, locationsMap } = useMemo(() => {
    const teams =
      allGroups?.filter(
        (g) => g.type === 'team' && userTeamIds.includes(g.id)
      ) || [];
    const typesMap = new Map(appointmentTypes?.map((t) => [t.id, t.name]));
    const locs = new Map(locations?.map((l) => [l.id, l]));
    return { userTeams: teams, typesMap, locationsMap: locs };
  }, [allGroups, userTeamIds, appointmentTypes, locations]);

  const unrolledAppointments = useMemo(() => {
    if (!appointments || !exceptions) return [];
    const events: UnrolledAppointment[] = [];
    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions.forEach((ex) => {
      const key = `${ex.originalAppointmentId}-${format(
        ex.originalDate.toDate(),
        'yyyy-MM-dd'
      )}`;
      exceptionsMap.set(key, ex);
    });

    appointments.forEach((app) => {
      const isVisible =
        app.visibility.type === 'all' ||
        app.visibility.teamIds.some((teamId) => userTeamIds.includes(teamId));

      if (!isVisible || !app.startDate) return;

      const unroll = (currentDate: Date) => {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const instanceId = `${app.id}_${dateStr}`;
        const exception = exceptionsMap.get(`${app.id}_${format(currentDate, 'yyyy-MM-dd')}`);

        let instance: UnrolledAppointment = {
          ...app,
          instanceDate: currentDate,
          originalId: app.id,
          virtualId: instanceId,
          isCancelled: exception?.status === 'cancelled',
        };

        if (exception?.status === 'modified' && exception.modifiedData) {
          const modData = exception.modifiedData;
          instance = {
            ...instance,
            ...modData,
            startDate: modData.startDate || instance.startDate,
            isException: true,
          };
        }
        events.push(instance);
      };

      if (!app.recurrence || app.recurrence === 'none') {
        unroll(app.startDate.toDate());
      } else {
        let current = app.startDate.toDate();
        const end = app.recurrenceEndDate
          ? app.recurrenceEndDate.toDate()
          : addMonths(new Date(), 12);
        while (current <= end) {
          unroll(current);
          switch (app.recurrence) {
            case 'daily': current = addDays(current, 1); break;
            case 'weekly': current = addWeeks(current, 1); break;
            case 'bi-weekly': current = addWeeks(current, 2); break;
            case 'monthly': current = addMonths(current, 1); break;
            default: current = addMonths(end, 1); break;
          }
        }
      }
    });
    return events;
  }, [appointments, exceptions, userTeamIds]);
  
  const filteredAppointments = useMemo(() => {
      return unrolledAppointments.filter(app => {
          const typeMatch = selectedTypes.length === 0 || selectedTypes.includes(app.appointmentTypeId);
          const teamMatch = selectedTeams.length === 0 || app.visibility.type === 'all' || app.visibility.teamIds.some(id => selectedTeams.includes(id));
          return typeMatch && teamMatch && !app.isCancelled;
      })
  }, [unrolledAppointments, selectedTeams, selectedTypes]);

  const handleDownloadIcs = useCallback(() => {
    const events: ics.EventAttributes[] = filteredAppointments.map((app) => {
      const startDateTime = app.instanceDate;
      const endDateTime = app.endDate ? app.endDate.toDate() : addHours(startDateTime, 1);
      const location = app.locationId ? locationsMap.get(app.locationId) : null;
      
      const event: ics.EventAttributes = {
        title: app.title,
        start: [startDateTime.getFullYear(), startDateTime.getMonth() + 1, startDateTime.getDate(), startDateTime.getHours(), startDateTime.getMinutes()],
        end: [endDateTime.getFullYear(), endDateTime.getMonth() + 1, endDateTime.getDate(), endDateTime.getHours(), endDateTime.getMinutes()],
        description: app.description || '',
        location: location ? `${location.name}, ${location.address || ''}` : '',
      };
      return event;
    });

    ics.createEvents(events, (error, value) => {
      if (error) {
        console.error(error);
        return;
      }
      const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'faustball-kalender.ics';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }, [filteredAppointments, locationsMap]);
  
  const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start, end });

  const Header = () => (
    <div className="flex items-center justify-between py-2 px-1">
      <Button
        variant="outline"
        onClick={() => setCurrentDate(subMonths(currentDate, 1))}
      >
        {'<'}
      </Button>
      <h2 className="text-xl font-bold">
        {format(currentDate, 'MMMM yyyy', { locale: de })}
      </h2>
      <Button
        variant="outline"
        onClick={() => setCurrentDate(addMonths(currentDate, 1))}
      >
        {'>'}
      </Button>
    </div>
  );

  const DayLabels = () => (
    <div className="grid grid-cols-7 text-center text-sm font-medium text-muted-foreground">
      {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
        <div key={day} className="py-2">{day}</div>
      ))}
    </div>
  );

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
  }

  return (
    <TooltipProvider>
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Filter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Mannschaften</h3>
                <div className="space-y-2">
                  {userTeams.map(team => (
                    <div key={team.id} className="flex items-center space-x-2">
                      <Checkbox id={`team-${team.id}`} checked={selectedTeams.includes(team.id)} onCheckedChange={checked => {
                        setSelectedTeams(prev => checked ? [...prev, team.id] : prev.filter(id => id !== team.id))
                      }}/>
                      <Label htmlFor={`team-${team.id}`}>{team.name}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Terminarten</h3>
                 <div className="space-y-2">
                  {appointmentTypes?.map(type => (
                    <div key={type.id} className="flex items-center space-x-2">
                      <Checkbox id={`type-${type.id}`} checked={selectedTypes.includes(type.id)} onCheckedChange={checked => {
                        setSelectedTypes(prev => checked ? [...prev, type.id] : prev.filter(id => id !== type.id))
                      }}/>
                      <Label htmlFor={`type-${type.id}`}>{type.name}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <CalendarIcon className="h-8 w-8 text-primary" />
                      <span className="text-2xl font-headline">Kalender</span>
                  </div>
                   <Button onClick={handleDownloadIcs} variant="outline">
                    <Download className="mr-2 h-4 w-4" /> Kalender herunterladen
                  </Button>
              </CardTitle>
                 <CardDescription>
                  Hier werden alle wichtigen Termine, Spiele und Trainingseinheiten angezeigt.
                </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Header />
                <DayLabels />
                <div className="grid grid-cols-7">
                  {days.map((day) => {
                    const appointmentsOnDay = filteredAppointments.filter(app => isSameDay(app.instanceDate, day));
                    return (
                    <div
                      key={day.toString()}
                      className={cn(
                        "h-36 border-t border-r p-2 flex flex-col overflow-hidden",
                        !isSameMonth(day, currentDate) && "bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <span className={cn("font-semibold", isSameDay(day, new Date()) && "text-primary font-bold")}>{format(day, 'd')}</span>
                      <div className="mt-1 flex-grow overflow-y-auto space-y-1">
                        {appointmentsOnDay.map(app => (
                           <Tooltip key={app.virtualId}>
                           <TooltipTrigger asChild>
                             <div className="p-1 rounded-md bg-primary/10 text-primary text-xs truncate cursor-pointer hover:bg-primary/20">
                               <span>{app.isAllDay ? '' : format(app.instanceDate, 'HH:mm')}</span> {app.title}
                             </div>
                           </TooltipTrigger>
                           <TooltipContent className="w-64">
                             <p className="font-bold">{app.title}</p>
                             <p className="text-sm text-muted-foreground">{typesMap.get(app.appointmentTypeId)}</p>
                             <p className="text-sm mt-1">{format(app.instanceDate, 'dd.MM.yyyy HH:mm')} Uhr</p>
                             {app.locationId && <p className="text-sm">{locationsMap.get(app.locationId)?.name}</p>}
                             <Button asChild size="sm" className="mt-3 w-full">
                               <Link href={`/verwaltung/termine#${app.virtualId}`}>
                                 Details & Rückmeldung
                               </Link>
                             </Button>
                           </TooltipContent>
                         </Tooltip>
                        ))}
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}


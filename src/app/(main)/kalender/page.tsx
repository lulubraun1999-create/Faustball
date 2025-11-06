
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
  addHours,
  startOfDay,
  differenceInMilliseconds,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import * as ics from 'ics';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import Link from 'next/link';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

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
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const { user, isAdmin, isUserLoading } = useUser();
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

  const allAppointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(allAppointmentsRef);

  const exceptionsRef = useMemoFirebase(() => (firestore && isAdmin ? collection(firestore, 'appointmentExceptions') : null), [firestore, isAdmin]);
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);

  const appointmentTypesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentTypes') : null), [firestore]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(appointmentTypesRef);

  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const locationsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'locations') : null), [firestore]);
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsRef);

  const isLoading =
    isUserLoading ||
    isLoadingMember ||
    isLoadingAppointments ||
    isLoadingExceptions ||
    isLoadingTypes ||
    isLoadingGroups ||
    isLoadingLocations;

  const { teamsForFilter, typesMap, locationsMap, teamsMap } = useMemo(() => {
    const userTeams = allGroups?.filter(g => g.type === 'team' && userTeamIds.includes(g.id)) || [];
    const typesMap = new Map(appointmentTypes?.map((t) => [t.id, t.name]));
    const locs = new Map(locations?.map((l) => [l.id, l]));
    const teamMap = new Map(allGroups?.filter(g => g.type === 'team').map(t => [t.id, t.name]));
    return { teamsForFilter: userTeams, typesMap, locationsMap: locs, teamsMap: teamMap };
  }, [allGroups, appointmentTypes, locations, userTeamIds]);

  const unrolledAppointments = useMemo(() => {
    if (!appointments) return [];
    const events: UnrolledAppointment[] = [];
    const exceptionsMap = new Map<string, AppointmentException>();
    
    exceptions?.forEach((ex) => {
        if (ex.originalDate) {
            const key = `${ex.originalAppointmentId}-${format(ex.originalDate.toDate(), 'yyyy-MM-dd')}`;
            exceptionsMap.set(key, ex);
        }
    });

    appointments.forEach((app) => {
      if (!app.startDate) return;

      if (!app.recurrence || app.recurrence === 'none') {
        const instanceDate = app.startDate.toDate();
        const exceptionKey = `${app.id}-${format(instanceDate, 'yyyy-MM-dd')}`;
        const exception = exceptionsMap.get(exceptionKey);
        
        let instance: UnrolledAppointment = {
          ...app,
          instanceDate,
          originalId: app.id,
          virtualId: app.id,
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
      } else {
        let current = startOfDay(app.startDate.toDate());
        // **FIX:** Safely handle recurrenceEndDate
        const end = app.recurrenceEndDate ? app.recurrenceEndDate.toDate() : addMonths(new Date(), 12);
        
        const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), app.startDate.toDate()) : 0;
        
        while (current <= end) {
            const exceptionKey = `${app.id}-${format(current, 'yyyy-MM-dd')}`;
            const exception = exceptionsMap.get(exceptionKey);

            if (exception?.status !== 'cancelled') {
                const instanceStartDate = new Date(current);
                const appStartDate = app.startDate.toDate();
                instanceStartDate.setHours(appStartDate.getHours(), appStartDate.getMinutes());

                let instance: UnrolledAppointment = {
                    ...app,
                    instanceDate: instanceStartDate,
                    originalId: app.id,
                    virtualId: `${app.id}_${format(current, 'yyyy-MM-dd')}`,
                    startDate: Timestamp.fromDate(instanceStartDate),
                    endDate: app.endDate ? Timestamp.fromMillis(instanceStartDate.getTime() + duration) : undefined,
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
            }

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
  }, [appointments, exceptions]);
  
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
        size="icon"
        className="h-8 w-8"
        onClick={() => setCurrentDate(subMonths(currentDate, 1))}
      >
        {'<'}
      </Button>
      <h2 className="text-lg sm:text-xl font-bold">
        {format(currentDate, 'MMMM yyyy', { locale: de })}
      </h2>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => setCurrentDate(addMonths(currentDate, 1))}
      >
        {'>'}
      </Button>
    </div>
  );

  const DayLabels = () => (
    <div className="grid grid-cols-7 text-center text-xs sm:text-sm font-medium text-muted-foreground">
      {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
        <div key={day} className="py-2">{day}</div>
      ))}
    </div>
  );

  const FilterControls = () => (
    <div className="space-y-6">
        <div>
        <h3 className="font-semibold mb-2">Mannschaften</h3>
        <div className="space-y-2">
            {teamsForFilter.map(team => (
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
    </div>
  );

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-10 w-10 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto p-2 sm:p-4 lg:p-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:hidden flex justify-between items-center col-span-1">
            <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <SheetTrigger asChild>
                    <Button variant="outline"><Filter className="mr-2 h-4 w-4"/> Filter</Button>
                </SheetTrigger>
                <SheetContent side="left">
                     <Card className="border-0 shadow-none">
                        <CardHeader>
                            <CardTitle>Filter</CardTitle>
                        </CardHeader>
                        <CardContent>
                           <FilterControls />
                        </CardContent>
                    </Card>
                </SheetContent>
            </Sheet>
            <Button onClick={handleDownloadIcs} variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" /> Exportieren
            </Button>
        </div>
        
        <aside className="hidden md:block md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> Filter</CardTitle>
            </CardHeader>
            <CardContent>
                <FilterControls />
            </CardContent>
          </Card>
        </aside>

        <main className="md:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                      <CalendarIcon className="h-8 w-8 text-primary" />
                      <span className="text-2xl font-headline">Kalender</span>
                  </div>
                  <div className="hidden md:block">
                    <Button onClick={handleDownloadIcs} variant="outline">
                        <Download className="mr-2 h-4 w-4" /> Kalender herunterladen
                    </Button>
                  </div>
              </div>
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
                        "h-24 sm:h-36 border-t border-r p-1 sm:p-2 flex flex-col overflow-hidden",
                        !isSameMonth(day, currentDate) && "bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <span className={cn("text-xs sm:text-base font-semibold", isSameDay(day, new Date()) && "text-primary font-bold")}>{format(day, 'd')}</span>
                      <div className="mt-1 flex-grow overflow-y-auto space-y-1">
                        {appointmentsOnDay.map(app => (
                          <Popover key={app.virtualId}>
                            <PopoverTrigger asChild>
                              <div className="p-1 rounded-md bg-primary/10 text-primary text-xs truncate cursor-pointer hover:bg-primary/20">
                                <span>{app.isAllDay ? '' : format(app.instanceDate, 'HH:mm')}</span> {app.title}
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-64">
                              <p className="font-bold">{app.title}</p>
                              <p className="text-sm text-muted-foreground">{typesMap.get(app.appointmentTypeId)}</p>
                              {app.visibility.type === 'specificTeams' && (
                                <p className="text-sm text-muted-foreground">
                                  {app.visibility.teamIds.map(id => teamsMap.get(id)).join(', ')}
                                </p>
                              )}
                              <p className="text-sm mt-1">{format(app.instanceDate, 'dd.MM.yyyy HH:mm')} Uhr</p>
                              {app.locationId && <p className="text-sm">{locationsMap.get(app.locationId)?.name}</p>}
                              {app.meetingPoint && <p className="text-sm mt-1">Treffpunkt: {app.meetingPoint}</p>}
                              {app.meetingTime && <p className="text-sm">Treffzeit: {app.meetingTime}</p>}
                              <Button asChild size="sm" className="mt-3 w-full">
                                <Link href={`/verwaltung/termine#${app.virtualId}`}>
                                  Details & Rückmeldung
                                </Link>
                              </Button>
                            </PopoverContent>
                          </Popover>
                        ))}
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}



    
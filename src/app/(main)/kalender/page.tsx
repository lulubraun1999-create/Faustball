
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
  isBefore,
  set,
  getMonth,
  getYear,
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

  const allAppointmentsRef = useMemoFirebase(() => (firestore && user ? collection(firestore, 'appointments') : null), [firestore, user]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(allAppointmentsRef);

  const exceptionsRef = useMemoFirebase(() => (firestore && user ? collection(firestore, 'appointmentExceptions') : null), [firestore, user]);
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);

  const appointmentTypesRef = useMemoFirebase(() => (firestore && user ? collection(firestore, 'appointmentTypes') : null), [firestore, user]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(appointmentTypesRef);

  const groupsRef = useMemoFirebase(() => (firestore && user ? collection(firestore, 'groups') : null), [firestore, user]);
  const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const locationsRef = useMemoFirebase(() => (firestore && user ? collection(firestore, 'locations') : null), [firestore, user]);
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
    const userTeamIdsSet = new Set(userTeamIds);
    const teamsForFilter = allGroups?.filter(g => g.type === 'team' && userTeamIdsSet.has(g.id)) || [];
    const typesMap = new Map(appointmentTypes?.map((t) => [t.id, t.name]));
    const locs = new Map(locations?.map((l) => [l.id, l]));
    const teamMap = new Map(allGroups?.filter(g => g.type === 'team').map(t => [t.id, t.name]));
    return { teamsForFilter, typesMap, locationsMap: locs, teamsMap: teamMap };
  }, [allGroups, appointmentTypes, locations, userTeamIds]);

  const unrolledAppointments = useMemo(() => {
    if (!appointments || isLoadingExceptions) return [];
    
    const events: UnrolledAppointment[] = [];
    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions?.forEach(ex => {
        if (ex.originalDate && ex.originalDate instanceof Timestamp) {
            const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
            exceptionsMap.set(key, ex);
        }
    });

    appointments.forEach(app => {
      if (!app.startDate || !(app.startDate instanceof Timestamp)) return;

      const recurrenceEndDate = app.recurrenceEndDate instanceof Timestamp ? app.recurrenceEndDate.toDate() : null;
      const appStartDate = app.startDate.toDate();

      if (app.recurrence === 'none' || !app.recurrence || !recurrenceEndDate) {
        const originalDateStartOfDayISO = startOfDay(appStartDate).toISOString();
        const exception = exceptionsMap.get(`${app.id}-${originalDateStartOfDayISO}`);
        
        let finalData: Appointment = { ...app };
        let isException = false;
        if (exception?.status === 'modified' && exception.modifiedData) {
            const modData = exception.modifiedData;
            finalData = { ...app, ...modData, startDate: modData.startDate || app.startDate, endDate: modData.endDate === undefined ? undefined : (modData.endDate || undefined), id: app.id };
            isException = true;
        }
        
        events.push({
          ...finalData,
          instanceDate: finalData.startDate.toDate(),
          originalId: app.id,
          virtualId: app.id,
          isCancelled: exception?.status === 'cancelled',
          isException,
        });

      } else {
        let currentDate = appStartDate;
        const duration = app.endDate instanceof Timestamp ? differenceInMilliseconds(app.endDate.toDate(), currentDate) : 0;
        let iter = 0;
        const MAX_ITERATIONS = 500; // Sicherheits-Check

        const startMonth = getMonth(currentDate);
        const startDayOfMonth = currentDate.getDate();
        const startDayOfWeek = currentDate.getDay();

        while (currentDate <= recurrenceEndDate && iter < MAX_ITERATIONS) {
            const currentDateStartOfDayISO = startOfDay(currentDate).toISOString();
            const instanceException = exceptionsMap.get(`${app.id}-${currentDateStartOfDayISO}`);

            if (instanceException?.status !== 'cancelled') {
                let isException = false;
                let instanceData = { ...app };
                let instanceStartDate = currentDate;
                let instanceEndDate: Date | undefined = duration > 0 ? new Date(currentDate.getTime() + duration) : undefined;

                if (instanceException?.status === 'modified' && instanceException.modifiedData) {
                    isException = true;
                    const modData = instanceException.modifiedData;
                    instanceData = { ...instanceData, ...modData };
                    instanceStartDate = modData?.startDate?.toDate() ?? instanceStartDate;
                    instanceEndDate = modData?.endDate?.toDate() ?? instanceEndDate;
                }
                
                events.push({
                    ...instanceData,
                    id: `${app.id}-${currentDate.toISOString()}`,
                    virtualId: `${app.id}-${currentDateStartOfDayISO}`,
                    originalId: app.id,
                    instanceDate: instanceStartDate,
                    startDate: Timestamp.fromDate(instanceStartDate),
                    endDate: instanceEndDate ? Timestamp.fromDate(instanceEndDate) : undefined,
                    isCancelled: false,
                    isException,
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
                const targetDate = Math.min(startDayOfMonth, daysInNextMonth);
                currentDate = set(nextMonth, { date: targetDate });
                break;
            default: iter = MAX_ITERATIONS; break;
          }
        }
      }
    });
    return events;
  }, [appointments, exceptions, isLoadingExceptions]);
  
  const filteredAppointments = useMemo(() => {
      const userTeamIdsSet = new Set(userTeamIds);
      return unrolledAppointments.filter(app => {
          const typeMatch = selectedTypes.length === 0 || selectedTypes.includes(app.appointmentTypeId);
          
          let teamMatch = false;
          if (selectedTeams.length === 0) { // If no team filter, show based on user's teams or 'all'
              teamMatch = app.visibility.type === 'all' || app.visibility.teamIds.some(id => userTeamIdsSet.has(id));
          } else { // If team filter is active, show based on filter
              teamMatch = app.visibility.type === 'all' || app.visibility.teamIds.some(id => selectedTeams.includes(id));
          }

          return typeMatch && teamMatch && !app.isCancelled;
      })
  }, [unrolledAppointments, selectedTeams, selectedTypes, userTeamIds]);

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
  
  const startCal = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const endCal = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: startCal, end: endCal });

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

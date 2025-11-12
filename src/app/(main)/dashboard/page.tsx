
'use client';

import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { CalendarDays, Newspaper, BarChart3, Users, Loader2, Trophy } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, Timestamp, limit, orderBy, doc } from 'firebase/firestore';
import type { Appointment, NewsArticle, Poll, MemberProfile, Group, AppointmentException, AppointmentType } from '@/lib/types';
import Link from 'next/link';
import { format, addDays, addWeeks, addMonths, differenceInMilliseconds, startOfDay, isBefore, getMonth, getYear, set } from 'date-fns';
import { de } from 'date-fns/locale';

type UnrolledAppointment = Appointment & {
  virtualId: string;
  originalId: string;
  originalDateISO: string;
  isException: boolean;
  isCancelled: boolean;
  instanceDate: Date; // The actual date of this specific instance
};


export default function DashboardPage() {
    const { user, isUserLoading, isAdmin } = useUser();
    const firestore = useFirestore();

    const memberRef = useMemoFirebase(
        () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
        [firestore, user]
    );
    const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);

    // --- Vereinfachte Datenabfragen ---
    const appointmentsRef = useMemoFirebase(() => (firestore && user ? collection(firestore, 'appointments') : null), [firestore, user]);
    const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);

    const exceptionsRef = useMemoFirebase(
      () => (firestore && user ? collection(firestore, 'appointmentExceptions') : null),
      [firestore, user]
    );
    const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);

    const latestNewsQuery = useMemoFirebase(
        () => (firestore && user ? query(collection(firestore, 'news'), orderBy('createdAt', 'desc'), limit(3)) : null),
        [firestore, user]
    );
    const { data: latestNews, isLoading: isLoadingNews } = useCollection<NewsArticle>(latestNewsQuery);

    const allPollsRef = useMemoFirebase(() => (firestore && user ? collection(firestore, 'polls') : null), [firestore, user]);
    const { data: allPolls, isLoading: isLoadingPolls } = useCollection<Poll>(allPollsRef);

    const allGroupsRef = useMemoFirebase(() => (firestore && user ? collection(firestore, 'groups') : null), [firestore, user]);
    const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(allGroupsRef);
    
    const appointmentTypesRef = useMemoFirebase(() => (firestore && user ? collection(firestore, 'appointmentTypes') : null), [firestore, user]);
    const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(appointmentTypesRef);
    
    // --- Datenverarbeitung ---
    
    const currentPolls = useMemo(() => {
        if (!allPolls) return [];
        const now = new Date();
        const activePolls = allPolls.filter(poll => poll.createdAt && poll.endDate && poll.endDate.toDate() >= now);
        return activePolls.sort((a, b) => {
            const timeA = a.endDate instanceof Timestamp ? a.endDate.toMillis() : 0;
            const timeB = b.endDate instanceof Timestamp ? b.endDate.toMillis() : 0;
            return timeA - timeB;
        }).slice(0, 3);
    }, [allPolls]);

    const myTeams = useMemo(() => {
        if (!allGroups || !memberProfile?.teams) return [];
        const userTeamIdsSet = new Set(memberProfile.teams);
        return allGroups.filter(g => g.type === 'team' && userTeamIdsSet.has(g.id));
    }, [allGroups, memberProfile]);

    const teamsMap = useMemo(() => new Map(allGroups?.filter(g => g.type === 'team').map(t => [t.id, t.name])), [allGroups]);

    const { nextMatchDay, nextAppointments } = useMemo(() => {
        if (!appointments || !appointmentTypes || !memberProfile || isLoadingExceptions) return { nextMatchDay: null, nextAppointments: [] };
        
        const spieltagTypeId = appointmentTypes.find(t => t.name.toLowerCase() === 'spieltag')?.id;
        const userTeamIds = new Set(memberProfile.teams || []);
        
        const exceptionsMap = new Map<string, AppointmentException>();
        exceptions?.forEach(ex => {
            if (ex.originalDate && ex.originalDate instanceof Timestamp) {
                const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
                exceptionsMap.set(key, ex);
            }
        });
  
        const allEvents: UnrolledAppointment[] = [];
        const today = startOfDay(new Date());
  
        appointments.forEach(app => {
            if (!app.startDate || !(app.startDate instanceof Timestamp)) return;

            const isVisibleToUser = (event: Appointment) => {
                if (event.visibility.type === 'all') return true;
                return event.visibility.teamIds.some(teamId => userTeamIds.has(teamId));
            };
  
            if (!isVisibleToUser(app)) return;

            const recurrenceEndDate = app.recurrenceEndDate instanceof Timestamp ? app.recurrenceEndDate.toDate() : null;
            const appStartDate = app.startDate.toDate();

            if (app.recurrence === 'none' || !app.recurrence || !recurrenceEndDate) {
                if (isBefore(appStartDate, today)) return;
  
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
  
                allEvents.push({
                    ...finalData,
                    instanceDate: finalData.startDate.toDate(),
                    originalId: app.id,
                    virtualId: app.id,
                    isCancelled: false,
                    isException,
                    originalDateISO: originalDateStartOfDayISO,
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
                  if (currentDate >= today) {
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
                          
                           allEvents.push({
                              ...instanceData,
                              id: `${app.id}-${currentDate.toISOString()}`,
                              virtualId: `${app.id}-${currentDateStartOfDayISO}`,
                              originalId: app.id,
                              originalDateISO: currentDateStartOfDayISO,
                              instanceDate: instanceStartDate,
                              startDate: Timestamp.fromDate(instanceStartDate),
                              endDate: instanceEndDate ? Timestamp.fromDate(instanceEndDate) : undefined,
                              isCancelled: false,
                              isException,
                          });
                      }
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
        
        const sortedEvents = allEvents.sort((a, b) => a.instanceDate.getTime() - b.instanceDate.getTime());
        
        const matchDays = sortedEvents.filter(e => e.appointmentTypeId === spieltagTypeId);
        const otherAppointments = sortedEvents.filter(e => e.appointmentTypeId !== spieltagTypeId);
  
        return {
            nextMatchDay: matchDays[0] || null,
            nextAppointments: otherAppointments.slice(0, 3),
        };
        
      }, [appointments, exceptions, appointmentTypes, memberProfile, isLoadingExceptions]);

    const isLoading = isUserLoading || isLoadingMember || isLoadingAppointments || isLoadingExceptions || isLoadingNews || isLoadingPolls || isLoadingGroups || isLoadingTypes;

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="container mx-auto grid grid-cols-1 gap-6 p-4 sm:p-6 lg:p-8">
            <Card className="col-span-1 border-primary/50 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-primary" /> Nächster Spieltag
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {nextMatchDay ? (
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="space-y-1">
                                <p className="text-2xl font-bold">{nextMatchDay.title}</p>
                                {nextMatchDay.visibility.type === 'specificTeams' && (
                                    <p className="text-sm font-medium text-primary">
                                        {nextMatchDay.visibility.teamIds.map(id => teamsMap.get(id)).join(', ')}
                                    </p>
                                )}
                                <p className="text-muted-foreground text-lg">
                                    {format(nextMatchDay.instanceDate, 'eeee, dd. MMMM yyyy', { locale: de })}
                                </p>
                                <p className="text-muted-foreground">
                                    {nextMatchDay.isAllDay ? 'Ganztägig' : format(nextMatchDay.instanceDate, 'HH:mm \'Uhr\'', { locale: de })}
                                </p>
                            </div>
                             <Button variant="outline" asChild>
                                <Link href="/kalender">Zum Kalender</Link>
                            </Button>
                        </div>
                    ) : (
                        <p className="text-center text-sm text-muted-foreground py-4">Kein bevorstehender Spieltag für deine Teams.</p>
                    )}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-lg font-medium flex items-center gap-2">
                            <CalendarDays className="h-5 w-5 text-primary" /> Nächste Termine
                        </CardTitle>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/verwaltung/termine">Alle anzeigen</Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {nextAppointments && nextAppointments.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Datum</TableHead>
                                        <TableHead>Uhrzeit</TableHead>
                                        <TableHead>Titel</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {nextAppointments.map((app) => (
                                        <TableRow key={app.virtualId}>
                                            <TableCell>
                                                {format(app.instanceDate, 'eee, dd.MM.yy', { locale: de })}
                                            </TableCell>
                                            <TableCell>
                                                {app.isAllDay ? 'Ganztags' : format(app.instanceDate, 'HH:mm', { locale: de })}
                                            </TableCell>
                                            <TableCell className="font-medium">{app.title}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="text-center text-sm text-muted-foreground py-4">Keine weiteren Termine.</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-lg font-medium flex items-center gap-2">
                            <Newspaper className="h-5 w-5 text-primary" /> Neueste Nachrichten
                        </CardTitle>
                         <Button variant="outline" size="sm" asChild>
                             <Link href="/verwaltung/news">Alle anzeigen</Link>
                         </Button>
                    </CardHeader>
                    <CardContent>
                        {latestNews && latestNews.length > 0 ? (
                            <ul className="space-y-3">
                                {latestNews.map((news) => (
                                    <li key={news.id} className="text-sm font-medium hover:underline">
                                        <Link href={`/verwaltung/news/${news.id}`}>
                                            {news.title}
                                        </Link>
                                         <p className="text-xs text-muted-foreground">
                                             {news.createdAt && format(news.createdAt.toDate(), 'dd.MM.yyyy', { locale: de })}
                                         </p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-center text-sm text-muted-foreground py-4">Keine aktuellen Nachrichten.</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-lg font-medium flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-primary" /> Aktuelle Umfragen
                        </CardTitle>
                        <Button variant="outline" size="sm" asChild>
                             <Link href="/verwaltung/umfragen">Alle anzeigen</Link>
                         </Button>
                    </CardHeader>
                    <CardContent>
                        {currentPolls && currentPolls.length > 0 ? (
                             <ul className="space-y-3">
                                {currentPolls.map((poll) => (
                                    <li key={poll.id} className="text-sm font-medium hover:underline">
                                        <Link href={`/verwaltung/umfragen`}>
                                            {poll.title}
                                        </Link>
                                         <p className="text-xs text-muted-foreground">
                                             Endet am: {poll.endDate && format(poll.endDate.toDate(), 'dd.MM.yyyy', { locale: de })}
                                         </p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-center text-sm text-muted-foreground py-4">Keine aktiven Umfragen.</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-lg font-medium flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" /> Meine Teams
                        </CardTitle>
                         <Button variant="outline" size="sm" asChild>
                             <Link href="/verwaltung/gruppen">Alle anzeigen</Link>
                         </Button>
                    </CardHeader>
                    <CardContent>
                         {myTeams.length > 0 ? (
                            <ul className="space-y-2">
                                {myTeams.map((team) => (
                                    <li key={team.id} className="text-sm font-medium">
                                        {team.name}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                             <p className="text-center text-sm text-muted-foreground py-4">Du bist keinem Team zugewiesen.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

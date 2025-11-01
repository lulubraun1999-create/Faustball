
'use client';

import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { CalendarDays, Newspaper, BarChart3, Users, Loader2 } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, Timestamp, limit, orderBy, doc } from 'firebase/firestore';
import type { Appointment, NewsArticle, Poll, MemberProfile, Group, AppointmentException } from '@/lib/types';
import Link from 'next/link';
import { format, addDays, addWeeks, addMonths, differenceInMilliseconds, startOfDay, isEqual } from 'date-fns';
import { de } from 'date-fns/locale';

// *** NEU: Typ für entfaltete Termine ***
type UnrolledAppointment = Appointment & {
  virtualId: string; // Eindeutige ID für React Key (originalId + ISO-Datum)
  originalId: string; // Die ID der ursprünglichen Terminserie
  originalDateISO?: string; // Das Datum dieser Instanz als ISO String
  isException?: boolean; // Ist dieser angezeigte Termin eine Ausnahme?
  isCancelled?: boolean; // Ist dieser Termin abgesagt?
};

export default function DashboardPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    // Lade das Profil des aktuellen Benutzers, um seine Teams zu bekommen
    const memberRef = useMemoFirebase(
        () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
        [firestore, user]
    );
    const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);
    const userTeamIds = useMemo(() => memberProfile?.teams || [], [memberProfile]);

    // --- Angepasste Datenabfragen ---

    // 1. Alle Termine (für Entfaltung)
    const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
    const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);

    // 2. Alle Ausnahmen (für Entfaltung)
    const exceptionsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentExceptions') : null), [firestore]);
    const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);

    // 3. Neueste Nachrichten (öffentlich)
    const latestNewsQuery = useMemoFirebase(
        () => (firestore && user ? query(
            collection(firestore, 'news'),
            orderBy('createdAt', 'desc'),
            limit(3)
        ) : null),
        [firestore, user]
    );
    const { data: latestNews, isLoading: isLoadingNews } = useCollection<NewsArticle>(latestNewsQuery);

    // 4. Aktuelle Umfragen (nur die sichtbaren)
    const nowTimestamp = Timestamp.now();
    //    - Query 1: Umfragen für 'all'
    const currentPollsAllQuery = useMemoFirebase(
        () => (firestore && user ? query(
            collection(firestore, 'polls'),
            where('visibility.type', '==', 'all'),
            where('endDate', '>=', nowTimestamp),
            orderBy('endDate', 'asc'),
            limit(3)
        ) : null),
        [firestore, user]
    );
    //    - Query 2: Umfragen für die eigenen Teams
    const currentPollsTeamsQuery = useMemoFirebase(
        () => (firestore && user && userTeamIds.length > 0 ? query(
            collection(firestore, 'polls'),
            // where('visibility.type', '==', 'specificTeams'), // This is implicit with teamIds filter
            where('visibility.teamIds', 'array-contains-any', userTeamIds),
            where('endDate', '>=', nowTimestamp),
            orderBy('endDate', 'asc'),
            limit(3)
        ) : null),
        [firestore, user, userTeamIds]
    );
    const { data: pollsAll, isLoading: isLoadingPollsAll } = useCollection<Poll>(currentPollsAllQuery);
    const { data: pollsTeams, isLoading: isLoadingPollsTeams } = useCollection<Poll>(currentPollsTeamsQuery);

    // 5. Eigene Teams (basierend auf dem Member-Profil)
    const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
    const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);
    
    
    // --- Datenverarbeitung ---
    
    // Kombiniere und sortiere Umfragen
    const currentPolls = useMemo(() => {
        const combined = [...(pollsAll || []), ...(pollsTeams || [])];
        const uniquePolls = Array.from(new Map(combined.map(poll => [poll.id, poll])).values());
        return uniquePolls.sort((a, b) => a.endDate.toMillis() - b.endDate.toMillis()).slice(0, 3);
    }, [pollsAll, pollsTeams]);

    // Finde die Namen der eigenen Teams
    const myTeams = useMemo(() => {
        if (!allGroups || !memberProfile?.teams) return [];
        const userTeamIdsSet = new Set(memberProfile.teams);
        return allGroups.filter(g => g.type === 'team' && userTeamIdsSet.has(g.id));
    }, [allGroups, memberProfile]);

    // Logik zum Entfalten der Termine
    const unrolledAppointments = useMemo(() => {
        if (!appointments || (isLoadingExceptions && user?.uid)) return []; // Warte auf BEIDE Sammlungen (nur wenn Admin)
        
        const exceptionsMap = new Map<string, AppointmentException>();
        // Nur Admins sehen Ausnahmen, normale User sehen sie nicht (Regel-bedingt)
        exceptions?.forEach(ex => {
            if (ex.originalDate) {
                const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
                exceptionsMap.set(key, ex);
            }
        });

        const allEvents: UnrolledAppointment[] = [];
        const now = startOfDay(new Date()); // Heute

        appointments.forEach(app => {
            if (!app.startDate) return;

            // Prüfe Sichtbarkeit der Serie
            const isVisible = app.visibility.type === 'all' || (app.visibility.teamIds && app.visibility.teamIds.some(teamId => userTeamIds.includes(teamId)));
            if (!isVisible) return; // Überspringe Termine, die nicht sichtbar sind

            const originalDateStartOfDay = startOfDay(app.startDate.toDate());
            const originalDateStartOfDayISO = originalDateStartOfDay.toISOString();
            const key = `${app.id}-${originalDateStartOfDayISO}`;
            const exception = exceptionsMap.get(key);
            const isCancelled = exception?.status === 'cancelled';

            if (app.recurrence === 'none') {
                const modifiedApp = exception?.status === 'modified' ? { ...app, ...(exception.modifiedData || {}), isException: true } : app;
                if (originalDateStartOfDay >= now && !isCancelled) { // Nur zukünftige Einmaltermine
                    allEvents.push({ ...modifiedApp, originalId: app.id, virtualId: app.id, isCancelled, originalDateISO: originalDateStartOfDayISO });
                }
            } else {
                let currentDate = app.startDate.toDate();
                const recurrenceEndDate = app.recurrenceEndDate ? addDays(app.recurrenceEndDate.toDate(), 1) : addDays(now, 365);
                const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), app.startDate.toDate()) : 0;
                let iter = 0;
                const MAX_ITERATIONS = 500;

                while (currentDate < recurrenceEndDate && iter < MAX_ITERATIONS) {
                    const currentDateStartOfDay = startOfDay(currentDate);
                    const currentDateStartOfDayISO = currentDateStartOfDay.toISOString();
                    const instanceKey = `${app.id}-${currentDateStartOfDayISO}`;
                    const instanceException = exceptionsMap.get(instanceKey);
                    const instanceIsCancelled = instanceException?.status === 'cancelled';

                    if (currentDateStartOfDay >= now && !instanceIsCancelled) { // Nur zukünftige, nicht abgesagte
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
                            isCancelled: instanceIsCancelled,
                        };

                        if (instanceException?.status === 'modified' && instanceException.modifiedData) {
                            instanceData = { ...instanceData, ...instanceException.modifiedData, isException: true };
                        }
                        
                        allEvents.push(instanceData);
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
        
        return allEvents.sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis()).slice(0, 5);
        
    }, [appointments, exceptions, isLoadingExceptions, userTeamIds]);


    const isLoading = isUserLoading || isLoadingMember || isLoadingAppointments || isLoadingExceptions || isLoadingNews || isLoadingPollsAll || isLoadingPollsTeams || isLoadingGroups;

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="container mx-auto grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-2 lg:p-8 xl:grid-cols-3">
            {/* Nächste Termine */}
            <Card className="xl:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-primary" /> Nächste Termine
                    </CardTitle>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/kalender">Alle anzeigen</Link>
                    </Button>
                </CardHeader>
                <CardContent>
                    {unrolledAppointments && unrolledAppointments.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Datum</TableHead>
                                    <TableHead>Uhrzeit</TableHead>
                                    <TableHead>Titel</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {unrolledAppointments.map((app) => (
                                    <TableRow key={app.virtualId}>
                                        <TableCell>
                                            {format(app.startDate.toDate(), 'eee, dd.MM.yy', { locale: de })}
                                        </TableCell>
                                        <TableCell>
                                            {app.isAllDay ? 'Ganztags' : format(app.startDate.toDate(), 'HH:mm', { locale: de })}
                                        </TableCell>
                                        <TableCell className="font-medium">{app.title}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-center text-sm text-muted-foreground py-4">Keine bevorstehenden Termine.</p>
                    )}
                </CardContent>
            </Card>

            {/* Neueste Nachrichten */}
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
                                         {format(news.createdAt.toDate(), 'dd.MM.yyyy', { locale: de })}
                                     </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-sm text-muted-foreground py-4">Keine aktuellen Nachrichten.</p>
                    )}
                </CardContent>
            </Card>

            {/* Aktuelle Umfragen */}
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
                                    <Link href={`/verwaltung/umfragen`}> {/* Link zur Übersichtsseite */}
                                        {poll.title}
                                    </Link>
                                     <p className="text-xs text-muted-foreground">
                                         Endet am: {format(poll.endDate.toDate(), 'dd.MM.yyyy', { locale: de })}
                                     </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-center text-sm text-muted-foreground py-4">Keine aktiven Umfragen.</p>
                    )}
                </CardContent>
            </Card>

            {/* Meine Teams */}
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
    );
}

    
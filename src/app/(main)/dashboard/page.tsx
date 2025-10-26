
'use client';

import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
import { CalendarDays, Newspaper, BarChart3, Users, Loader2 } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, Timestamp, limit, orderBy, doc } from 'firebase/firestore';
import type { Appointment, NewsArticle, Poll, MemberProfile, Group } from '@/lib/types';
import Link from 'next/link';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export default function DashboardPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const memberRef = useMemoFirebase(
        () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
        [firestore, user]
    );
    const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);
    
    // --- Angepasste Datenabfragen ---
    
    // Nächste Termine: Holt alle Termine (öffentlich + Team-spezifisch) und filtert clientseitig
    const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
    const { data: allAppointments, isLoading: isLoadingApp } = useCollection<Appointment>(appointmentsRef);
    
    const nextAppointments = useMemo(() => {
        if (!allAppointments || !memberProfile) return [];
        const userTeams = new Set(memberProfile.teams || []);
        return allAppointments
            .filter(app => app.startDate && app.startDate.toDate() >= new Date()) // Nur zukünftige
            .filter(app => {
                if (app.visibility.type === 'all') return true;
                if (app.visibility.teamIds) {
                    return app.visibility.teamIds.some(teamId => userTeams.has(teamId));
                }
                return false;
            })
            .sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis())
            .slice(0, 5);
    }, [allAppointments, memberProfile]);

    // Neueste Nachrichten (öffentlich)
    const latestNewsQuery = useMemoFirebase(
        () => (firestore ? query(
            collection(firestore, 'news'),
            orderBy('createdAt', 'desc'),
            limit(3)
        ) : null),
        [firestore]
    );
    const { data: latestNews, isLoading: isLoadingNews } = useCollection<NewsArticle>(latestNewsQuery);

    // Aktuelle Umfragen: Holt alle Umfragen und filtert clientseitig
    const pollsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'polls') : null), [firestore]);
    const { data: allPolls, isLoading: isLoadingPolls } = useCollection<Poll>(pollsRef);

    const currentPolls = useMemo(() => {
        if (!allPolls || !memberProfile) return [];
        const userTeams = new Set(memberProfile.teams || []);
        return allPolls
            .filter(poll => poll.endDate && poll.endDate.toDate() >= new Date()) // Nur aktive
            .filter(poll => {
                if (poll.visibility.type === 'all') return true;
                if (poll.visibility.teamIds) {
                    return poll.visibility.teamIds.some(teamId => userTeams.has(teamId));
                }
                return false;
            })
            .sort((a, b) => a.endDate.toMillis() - b.endDate.toMillis())
            .slice(0, 3);
    }, [allPolls, memberProfile]);


    // Eigene Teams (basierend auf dem Member-Profil)
    const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
    const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);
    
    const myTeams = useMemo(() => {
        if (!allGroups || !memberProfile?.teams) return [];
        const userTeamIdsSet = new Set(memberProfile.teams);
        return allGroups.filter(g => g.type === 'team' && userTeamIdsSet.has(g.id));
    }, [allGroups, memberProfile]);

    const isLoading = isUserLoading || isLoadingMember || isLoadingApp || isLoadingNews || isLoadingPolls || isLoadingGroups;

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="container mx-auto grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-3">
            <div className="lg:col-span-3 xl:col-span-2">
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
                                        <TableRow key={app.id}>
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
            </div>
            
            <div className="lg:col-span-1">
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
            </div>

            <div className="lg:col-span-1">
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
                                        <Link href={`/verwaltung/umfragen?pollId=${poll.id}`}>
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
            </div>

            <div className="lg:col-span-1">
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

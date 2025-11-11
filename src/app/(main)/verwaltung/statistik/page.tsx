
'use client';

import { useState, useMemo, FC, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, Timestamp, doc } from 'firebase/firestore';
import type { Appointment, AppointmentException, AppointmentResponse, Group, MemberProfile, AppointmentType } from '@/lib/types';
import { Loader2, BarChart, Users, Percent } from 'lucide-react';
import { startOfDay, addDays, addWeeks, addMonths, differenceInMilliseconds, isBefore, getYear, getMonth, set, subDays, startOfYear, endOfYear, endOfMonth, startOfMonth, format, parse } from 'date-fns';
import { de } from 'date-fns/locale';

type UnrolledAppointment = Appointment & {
  instanceDate: Date;
  virtualId: string;
  originalId: string;
  isCancelled: boolean;
  isException: boolean;
};

type MemberStats = {
  member: MemberProfile;
  attended: number;
  missed: number;
  unsure: number;
  open: number;
  total: number;
  rate: number;
};

// Main page component
export default function AdminStatistikPage() {
  const { isAdmin, isUserLoading } = useUser();

  if (isUserLoading) {
    return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Card className="border-destructive/50">
          <CardHeader><CardTitle className="text-destructive">Zugriff verweigert</CardTitle></CardHeader>
          <CardContent><p>Sie haben keine Berechtigung, auf diese Seite zuzugreifen.</p></CardContent>
        </Card>
      </div>
    );
  }
  return <StatistikContent />;
}

// Main content component
function StatistikContent() {
  const firestore = useFirestore();
  const { user } = useUser();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [selectedAppointmentType, setSelectedAppointmentType] = useState<string>('all');


  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);
  
  const allMembersRef = useMemoFirebase(() => (firestore ? collection(firestore, 'members') : null), [firestore]);
  const { data: allMembers, isLoading: isLoadingMembers } = useCollection<MemberProfile>(allMembersRef);

  const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);

  const exceptionsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentExceptions') : null), [firestore]);
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);
  
  const responsesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentResponses') : null), [firestore]);
  const { data: allResponses, isLoading: isLoadingResponses } = useCollection<AppointmentResponse>(responsesRef);
  
  const appointmentTypesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentTypes') : null), [firestore]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(appointmentTypesRef);
  
  const memberProfileRef = useMemoFirebase(() => (user ? doc(firestore, 'members', user.uid) : null), [firestore, user]);
  const { data: memberProfile, isLoading: isLoadingMemberProfile } = useDoc<MemberProfile>(memberProfileRef);
  
  const adminTeams = useMemo(() => {
    if (!allGroups || !memberProfile?.teams) return [];
    const userTeamIds = new Set(memberProfile.teams);
    return allGroups.filter(g => g.type === 'team' && userTeamIds.has(g.id))
                      .sort((a,b) => a.name.localeCompare(b.name));
  }, [allGroups, memberProfile]);

  const monthOptions = useMemo(() => {
      const options = [];
      let date = new Date();
      for (let i = 0; i < 12; i++) {
          options.push({
              value: format(date, 'yyyy-MM'),
              label: format(date, 'MMMM yyyy', { locale: de })
          });
          date = addMonths(date, -1);
      }
      return options;
  }, []);

  useEffect(() => {
    if (!selectedTeamId && adminTeams.length > 0) {
      setSelectedTeamId(adminTeams[0].id);
    }
  }, [adminTeams, selectedTeamId]);

  const { memberStats, teamTotalStats } = useMemo(() => {
    if (!selectedTeamId || !allMembers || !appointments || !allResponses || !exceptions || !selectedMonth) {
      return { memberStats: [], teamTotalStats: null };
    }

    const teamMembers = allMembers.filter(m => m.teams?.includes(selectedTeamId));
    if (teamMembers.length === 0) return { memberStats: [], teamTotalStats: null };

    const unrolledApps = unrollAppointments(appointments, exceptions);

    const targetMonth = parse(selectedMonth, 'yyyy-MM', new Date());
    const monthStart = startOfMonth(targetMonth);
    const monthEnd = endOfMonth(targetMonth);

    const relevantAppointments = unrolledApps.filter(app => {
      const appDate = app.instanceDate;
      const isVisibleToTeam = app.visibility.type === 'all' || app.visibility.teamIds.includes(selectedTeamId);
      const isInMonth = appDate >= monthStart && appDate <= monthEnd;
      const typeMatch = selectedAppointmentType === 'all' || app.appointmentTypeId === selectedAppointmentType;

      return isVisibleToTeam && isInMonth && typeMatch && !app.isCancelled;
    });

    const responsesMap = new Map<string, 'zugesagt' | 'abgesagt' | 'unsicher'>();
    allResponses.forEach(r => {
      responsesMap.set(`${r.userId}-${r.appointmentId}-${r.date}`, r.status);
    });

    const stats: MemberStats[] = teamMembers.map(member => {
      const memberStat = { attended: 0, missed: 0, unsure: 0, open: 0, total: 0 };
      
      relevantAppointments.forEach(app => {
        memberStat.total++;
        const response = responsesMap.get(`${member.userId}-${app.originalId}-${app.instanceDate.toISOString().split('T')[0]}`);
        if (response === 'zugesagt') memberStat.attended++;
        else if (response === 'abgesagt') memberStat.missed++;
        else if (response === 'unsicher') memberStat.unsure++;
        else memberStat.open++;
      });

      return {
        member,
        ...memberStat,
        rate: memberStat.total > 0 ? (memberStat.attended / memberStat.total) * 100 : 0
      };
    }).sort((a,b) => a.member.lastName.localeCompare(b.member.lastName));
    
    const teamTotals = stats.reduce((acc, curr) => {
        acc.attended += curr.attended;
        acc.missed += curr.missed;
        acc.unsure += curr.unsure;
        acc.open += curr.open;
        acc.total += curr.total;
        return acc;
    }, { attended: 0, missed: 0, unsure: 0, open: 0, total: 0 });

    const teamRate = teamTotals.attended > 0 ? (teamTotals.attended / teamTotals.total) * 100 : 0;
    const teamTotalStats = { ...teamTotals, rate: teamRate };

    return { memberStats: stats, teamTotalStats: teamTotalStats };
  }, [selectedTeamId, allMembers, appointments, allResponses, exceptions, selectedMonth, selectedAppointmentType]);

  const isLoading = isLoadingGroups || isLoadingMembers || isLoadingAppointments || isLoadingExceptions || isLoadingResponses || isLoadingTypes || isLoadingMemberProfile;
  const teamName = allGroups?.find(t => t.id === selectedTeamId)?.name || '...';
  
  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <BarChart className="h-8 w-8 text-primary" />
          <span className="font-headline">Admin: Statistik</span>
        </h1>
        <div className="flex gap-2">
            <Select value={selectedTeamId ?? ''} onValueChange={setSelectedTeamId} disabled={adminTeams.length === 0}>
                <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue placeholder="Mannschaft auswählen..." />
                </SelectTrigger>
                <SelectContent>
                    {adminTeams.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
                </SelectContent>
            </Select>
             <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {monthOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={selectedAppointmentType} onValueChange={setSelectedAppointmentType}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Alle Arten</SelectItem>
                    {appointmentTypes?.map(type => (
                        <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : !selectedTeamId || adminTeams.length === 0 ? (
          <Card><CardHeader><CardTitle>Keine Mannschaft ausgewählt</CardTitle></CardHeader><CardContent><p>Bitte wählen Sie eine Ihrer Mannschaften aus, um die Statistik anzuzeigen.</p></CardContent></Card>
      ) : (
        <div className="space-y-6">
            {teamTotalStats && (
                <Card>
                    <CardHeader>
                        <CardTitle>Gesamtstatistik: {teamName}</CardTitle>
                        <CardDescription>Beteiligungsrate der gesamten Mannschaft im ausgewählten Zeitraum.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
                       <StatCard title="Anwesend" value={teamTotalStats.attended} total={teamTotalStats.total} color="bg-green-500" />
                       <StatCard title="Abwesend" value={teamTotalStats.missed} total={teamTotalStats.total} color="bg-red-500" />
                       <StatCard title="Unsicher" value={teamTotalStats.unsure} total={teamTotalStats.total} color="bg-yellow-500" />
                       <StatCard title="Offen" value={teamTotalStats.open} total={teamTotalStats.total} color="bg-gray-400" />
                       <div className="md:col-span-1 col-span-2 flex flex-col items-center justify-center rounded-lg bg-muted p-4">
                            <div className="text-4xl font-bold">{teamTotalStats.rate.toFixed(1)}%</div>
                            <div className="text-sm text-muted-foreground">Anwesenheit</div>
                       </div>
                    </CardContent>
                </Card>
            )}

            <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Einzelstatistiken</CardTitle>
                <CardDescription>Detailansicht der Beteiligung pro Mitglied.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-center">Anwesend</TableHead>
                        <TableHead className="text-center">Abwesend</TableHead>
                        <TableHead className="text-center">Unsicher</TableHead>
                        <TableHead className="text-center">Offen</TableHead>
                        <TableHead className="text-right w-[200px]">Anwesenheitsquote</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {memberStats.length > 0 ? (
                        memberStats.map(stat => (
                            <TableRow key={stat.member.userId}>
                            <TableCell className="font-medium">{stat.member.firstName} {stat.member.lastName}</TableCell>
                            <TableCell className="text-center">{stat.attended} / {stat.total}</TableCell>
                            <TableCell className="text-center">{stat.missed} / {stat.total}</TableCell>
                            <TableCell className="text-center">{stat.unsure} / {stat.total}</TableCell>
                            <TableCell className="text-center">{stat.open} / {stat.total}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                <span className="w-12 text-sm font-semibold">{stat.rate.toFixed(1)}%</span>
                                <Progress value={stat.rate} className="h-2 w-24" />
                                </div>
                            </TableCell>
                            </TableRow>
                        ))
                        ) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                            Keine Mitglieder in dieser Mannschaft gefunden.
                            </TableCell>
                        </TableRow>
                        )}
                    </TableBody>
                    </Table>
                </div>
            </CardContent>
            </Card>
        </div>
      )}
    </div>
  );
}

// Helper component for stat cards
interface StatCardProps {
    title: string;
    value: number;
    total: number;
    color: string;
}
const StatCard: FC<StatCardProps> = ({ title, value, total, color }) => {
    const percentage = total > 0 ? (value / total) * 100 : 0;
    return (
        <div className="rounded-lg border bg-card text-card-foreground p-4">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
                <span className="text-sm font-bold">{value} / {total}</span>
            </div>
            <div className="flex items-center gap-2">
                <div className={`h-2.5 flex-grow rounded-full bg-muted overflow-hidden`}>
                   <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }}></div>
                </div>
                <span className="text-xs font-semibold">{percentage.toFixed(0)}%</span>
            </div>
        </div>
    );
};


// Helper function to unroll recurring appointments
function unrollAppointments(appointments: Appointment[], exceptions: AppointmentException[]): UnrolledAppointment[] {
    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions.forEach(ex => {
      if (ex.originalDate instanceof Timestamp) {
        const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
        exceptionsMap.set(key, ex);
      }
    });

    const allEvents: UnrolledAppointment[] = [];
    
    appointments.forEach(app => {
      if (!(app.startDate instanceof Timestamp)) return;
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
        const MAX_ITERATIONS = 1000;
        for (let i = 0; currentDate <= recurrenceEndDate && i < MAX_ITERATIONS; i++) {
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
          
          switch (app.recurrence) {
            case 'daily': currentDate = addDays(currentDate, 1); break;
            case 'weekly': currentDate = addWeeks(currentDate, 1); break;
            case 'bi-weekly': currentDate = addWeeks(currentDate, 2); break;
            case 'monthly':
                const nextMonth = addMonths(currentDate, 1);
                currentDate = set(nextMonth, { date: Math.min(appStartDate.getDate(), new Date(getYear(nextMonth), getMonth(nextMonth) + 1, 0).getDate()) });
                break;
            default: i = MAX_ITERATIONS; break;
          }
        }
      }
    });
    return allEvents;
}

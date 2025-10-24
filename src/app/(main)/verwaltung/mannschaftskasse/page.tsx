
'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  useUser,
  useDoc
} from '@/firebase';
import {
  collection,
  query,
  where,
  Timestamp,
  doc
} from 'firebase/firestore';
import {
  Loader2,
  PiggyBank,
  BookMarked,
  Coins,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Penalty, TreasuryTransaction, MemberProfile, Group } from '@/lib/types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export default function VerwaltungMannschaftskassePage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const memberRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);

  const allGroupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(allGroupsRef);

  const userTeams = useMemo(() => {
    if (!memberProfile || !allGroups) return [];
    const userTeamIds = memberProfile.teams || [];
    return allGroups.filter(g => g.type === 'team' && userTeamIds.includes(g.id))
                      .sort((a, b) => a.name.localeCompare(b.name));
  }, [memberProfile, allGroups]);

   const allMembersRef = useMemoFirebase(() => (firestore ? collection(firestore, 'members') : null), [firestore]);
   const { data: allMembers, isLoading: isLoadingAllMembers } = useCollection<MemberProfile>(allMembersRef);
   const membersMap = useMemo(() => {
       if (!allMembers) return new Map<string, MemberProfile>();
       return new Map(allMembers.map(m => [m.userId, m]));
   }, [allMembers]);


  const penaltiesRef = useMemoFirebase(() => (firestore && selectedTeamId ? query(collection(firestore, 'penalties'), where('teamId', '==', selectedTeamId)) : null), [firestore, selectedTeamId]);
  const { data: penalties, isLoading: isLoadingPenalties } = useCollection<Penalty>(penaltiesRef);

  const transactionsRef = useMemoFirebase(() => (firestore && selectedTeamId ? query(collection(firestore, 'treasury'), where('teamId', '==', selectedTeamId)) : null), [firestore, selectedTeamId]);
  const { data: transactions, isLoading: isLoadingTransactions } = useCollection<TreasuryTransaction>(transactionsRef);


  const totalBalance = useMemo(() => {
    return transactions?.reduce((acc, tx) => {
      if (tx.type === 'income') {
        return acc + tx.amount;
      } else if (tx.type === 'expense') {
        return acc + tx.amount;
      } else if (tx.type === 'penalty' && tx.status === 'paid') {
        return acc + Math.abs(tx.amount);
      }
      return acc;
    }, 0) || 0;
  }, [transactions]);

   useEffect(() => {
       if (!selectedTeamId && userTeams.length > 0) {
           setSelectedTeamId(userTeams[0].id);
       }
   }, [userTeams, selectedTeamId]);

   useEffect(() => {
       if (!selectedTeamId && userTeams.length > 0) {
           setSelectedTeamId(userTeams[0].id);
       }
       if (selectedTeamId && userTeams.length > 0 && !userTeams.some(t => t.id === selectedTeamId)) {
           setSelectedTeamId(userTeams[0].id);
       } else if (selectedTeamId && userTeams.length === 0) {
           setSelectedTeamId(null);
       }
   }, [userTeams, selectedTeamId]);


  const isLoadingInitial = isUserLoading || isLoadingGroups || isLoadingMember || isLoadingAllMembers;
  const isLoadingTeamData = selectedTeamId && (isLoadingPenalties || isLoadingTransactions);

    if (isLoadingInitial) {
        return (
            <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    if (!isLoadingInitial && userTeams.length === 0) {
         return (
             <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                 <Card>
                     <CardHeader>
                         <CardTitle className="flex items-center gap-3">
                             <PiggyBank className="h-8 w-8 text-primary" />
                             <span className="text-2xl font-headline">Mannschaftskasse</span>
                         </CardTitle>
                     </CardHeader>
                     <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                         <Info className="h-10 w-10 text-muted-foreground" />
                         <p className="mt-4 text-muted-foreground">Du bist derzeit keinem Team zugewiesen.</p>
                     </CardContent>
                 </Card>
             </div>
         );
    }


  return (
    <div className="container mx-auto space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <PiggyBank className="h-8 w-8 text-primary" />
          <span className="font-headline">Mannschaftskasse</span>
        </h1>
        <Select
            value={selectedTeamId ?? ''}
            onValueChange={setSelectedTeamId}
            disabled={userTeams.length === 0}
        >
          <SelectTrigger className="w-full sm:w-[280px]">
            <SelectValue placeholder="Mannschaft auswählen..." />
          </SelectTrigger>
          <SelectContent>
            {userTeams.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!selectedTeamId ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
            <PiggyBank className="h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Keine Mannschaft ausgewählt</h2>
            <p className="mt-2 text-muted-foreground">Bitte wähle eine deiner Mannschaften aus.</p>
        </Card>
      ) : isLoadingTeamData ? (
         <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                  <div>
                      <CardTitle className="flex items-center gap-2"><Coins className="h-6 w-6" /> Kassenübersicht</CardTitle>
                      <CardDescription>Aktueller Saldo:
                          <span className={cn("font-bold", totalBalance >= 0 ? "text-green-600" : "text-red-600")}>
                              {totalBalance.toFixed(2)} €
                          </span>
                      </CardDescription>
                  </div>
              </CardHeader>
              <CardContent>
                 <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Datum</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Beschreibung</TableHead>
                            <TableHead>Betrag</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions && transactions.length > 0 ? (
                           [...transactions].sort((a,b) => (b.date as Timestamp).toMillis() - (a.date as Timestamp).toMillis()).map(tx => {
                            const memberName = tx.memberId ? `${membersMap.get(tx.memberId)?.firstName ?? ''} ${membersMap.get(tx.memberId)?.lastName ?? ''}`.trim() : '-';
                            return (
                            <TableRow key={tx.id}>
                                <TableCell>{tx.date ? format((tx.date as Timestamp).toDate(), 'dd.MM.yy', { locale: de }) : 'Datum fehlt'}</TableCell>
                                <TableCell>{memberName}</TableCell>
                                <TableCell className="font-medium">{tx.description}</TableCell>
                                <TableCell className={cn(
                                    tx.amount >= 0 ? "text-green-600" : "text-red-600"
                                    )}>
                                  {tx.amount.toFixed(2)} €
                                </TableCell>
                                <TableCell>
                                    {(tx.type === 'penalty' || tx.status === 'unpaid') ? (
                                        <span className={cn(
                                            "px-2 py-1 rounded-full text-xs font-medium",
                                            tx.status === 'paid' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                                        )}>
                                            {tx.status === 'paid' ? 'Bezahlt' : 'Offen'}
                                        </span>
                                    ) : '-'}
                                </TableCell>
                            </TableRow>
                           )})
                        ) : (
                            <TableRow><TableCell colSpan={5} className="text-center h-24">Keine Transaktionen gefunden.</TableCell></TableRow>
                        )}
                    </TableBody>
                  </Table>
                  </div>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BookMarked className="h-6 w-6" /> Strafenkatalog</CardTitle>
                <CardDescription>Aktueller Strafenkatalog für diese Mannschaft.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Beschreibung</TableHead><TableHead>Betrag</TableHead></TableRow></TableHeader>
                  <TableBody>
                     {penalties && penalties.length > 0 ? (
                        penalties.map(p => (
                            <TableRow key={p.id}>
                                <TableCell>{p.description}</TableCell>
                                <TableCell>{p.amount.toFixed(2)} €</TableCell>
                            </TableRow>
                        ))
                     ) : (
                        <TableRow><TableCell colSpan={2} className="text-center h-24">Keine Strafen im Katalog.</TableCell></TableRow>
                     )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

    
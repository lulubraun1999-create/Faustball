
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  const { user, isAdmin, isUserLoading } = useUser();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const allGroupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(allGroupsRef);

  // KORRIGIERT: Diese Abfrage nur ausführen, wenn der User Admin ist.
  const allMembersRef = useMemoFirebase(() => (firestore && isAdmin ? collection(firestore, 'members') : null), [firestore, isAdmin]);
  const { data: allMembers, isLoading: isLoadingAllMembers } = useCollection<MemberProfile>(allMembersRef);

  const penaltiesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'penalties') : null), [firestore]);
  const { data: allPenalties, isLoading: isLoadingPenalties } = useCollection<Penalty>(penaltiesRef);

  const memberRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: memberProfile, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);

  // KORREKTUR: Die Abfrage für Transaktionen wird jetzt auf die Teams des Benutzers beschränkt, wenn dieser kein Admin ist.
  const transactionsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    const baseQuery = collection(firestore, 'treasury');
    if (isAdmin) {
      return baseQuery; // Admins können alles sehen
    }
    // Für normale Benutzer: Nur Transaktionen der eigenen Teams laden.
    // Wichtig: Eine `whereIn`-Abfrage mit einem leeren Array ist ungültig.
    const userTeamIds = memberProfile?.teams;
    if (userTeamIds && userTeamIds.length > 0) {
      return query(baseQuery, where('teamId', 'in', userTeamIds));
    }
    return null; // Kein Team -> keine Transaktionen abfragen
  }, [firestore, user, isAdmin, memberProfile?.teams]);

  const { data: allTransactions, isLoading: isLoadingTransactions } = useCollection<TreasuryTransaction>(transactionsQuery);


  const userTeams = useMemo(() => {
    if (!memberProfile || !allGroups) return [];
    const userTeamIds = memberProfile.teams || [];
    return allGroups.filter(g => g.type === 'team' && userTeamIds.includes(g.id))
                      .sort((a, b) => a.name.localeCompare(b.name));
  }, [memberProfile, allGroups]);

   const membersMap = useMemo(() => {
       // Admins see all names, users see only their own name if needed.
       const map = new Map<string, MemberProfile>();
       if (isAdmin && allMembers) {
           allMembers.forEach(m => map.set(m.userId, m));
       } else if (memberProfile) {
           // For non-admins, at least their own profile is available.
           map.set(memberProfile.userId, memberProfile);
       }
       return map;
   }, [allMembers, memberProfile, isAdmin]);

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
   
  const { penalties, transactions, totalBalance } = useMemo(() => {
    if (!selectedTeamId) return { penalties: [], transactions: [], totalBalance: 0 };
    const teamPenalties = allPenalties?.filter(p => p.teamId === selectedTeamId) || [];
    const teamTransactions = allTransactions?.filter(t => t.teamId === selectedTeamId) || [];
    
    // KORREKTE SALDO-BERECHNUNG
    const balance = teamTransactions.reduce((acc, tx) => {
      if (tx.type === 'income') return acc + tx.amount;
      if (tx.type === 'expense') return acc - tx.amount; // ABZIEHEN
      if (tx.type === 'penalty' && tx.status === 'paid') return acc + tx.amount; // NUR BEZAHLTE STRAFEN HINZUFÜGEN
      return acc;
    }, 0);

    return { penalties: teamPenalties, transactions: teamTransactions, totalBalance: balance };
  }, [selectedTeamId, allPenalties, allTransactions]);

  const isLoadingInitial = isUserLoading || isLoadingGroups || isLoadingMember || (isAdmin && isLoadingAllMembers) || isLoadingPenalties || isLoadingTransactions;

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
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-3 xl:col-span-2">
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
                 <TooltipProvider>
                  <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Beschreibung</TableHead>
                            <TableHead className="hidden sm:table-cell">Datum</TableHead>
                            <TableHead className="hidden md:table-cell">Name</TableHead>
                            <TableHead>Betrag</TableHead>
                            <TableHead className="hidden sm:table-cell">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions && transactions.length > 0 ? (
                           [...transactions].sort((a,b) => (b.date as Timestamp).toMillis() - (a.date as Timestamp).toMillis()).map(tx => {
                            const memberName = tx.memberId ? `${membersMap.get(tx.memberId)?.firstName ?? ''} ${membersMap.get(tx.memberId)?.lastName ?? ''}`.trim() : '-';
                            const isExpense = tx.type === 'expense';
                            
                            return (
                            <TableRow key={tx.id}>
                                <TableCell className="font-medium max-w-[150px] truncate">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="cursor-default">{tx.description}</span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{tx.description}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">{tx.date ? format((tx.date as Timestamp).toDate(), 'dd.MM.yy', { locale: de }) : 'Datum fehlt'}</TableCell>
                                <TableCell className="hidden md:table-cell">{memberName || '-'}</TableCell>
                                <TableCell className={cn(isExpense ? "text-red-600" : "text-green-600")}>
                                  {isExpense ? '-' : '+'}
                                  {tx.amount.toFixed(2)} €
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                    {(tx.type === 'penalty') ? (
                                        <span className={cn(
                                            "px-2 py-1 rounded-full text-xs font-medium",
                                            tx.status === 'paid' ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
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
                  </TooltipProvider>
                  </div>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6 lg:col-span-3 xl:col-span-1">
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

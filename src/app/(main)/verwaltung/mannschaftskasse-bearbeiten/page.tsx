'use client';

import { useState, useMemo, FC } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
  useUser,
  useDoc // useDoc importieren
} from '@/firebase';
import {
  collection,
  query,
  where,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import {
  Edit,
  Loader2,
  Plus,
  Trash2,
  PiggyBank,
  BookMarked,
  Coins,
  Info // Info importieren
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Penalty, TreasuryTransaction, MemberProfile, Group } from '@/lib/types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useEffect } from 'react'; // useEffect importieren

// Zod Schemas (bleiben unverändert)
const penaltySchema = z.object({
  description: z.string().min(1, 'Beschreibung ist erforderlich.'),
  amount: z.coerce.number().positive('Betrag muss eine positive Zahl sein.'),
});

const transactionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('income'),
    description: z.string().min(1, 'Beschreibung ist erforderlich.'),
    amount: z.coerce.number().positive('Betrag muss positiv sein.'),
    memberId: z.string().optional(),
    penaltyId: z.string().optional(),
  }),
  z.object({
    type: z.literal('expense'),
    description: z.string().min(1, 'Beschreibung ist erforderlich.'),
    amount: z.coerce.number().positive('Betrag muss positiv sein.'),
    memberId: z.string().optional(),
    penaltyId: z.string().optional(),
  }),
  z.object({
    type: z.literal('penalty'),
    description: z.string().optional(),
    amount: z.coerce.number().optional(),
    memberId: z.string().min(1, 'Mitglied ist erforderlich.'),
    penaltyId: z.string().min(1, 'Strafenart ist erforderlich.'),
  }),
]);


type PenaltyFormValues = z.infer<typeof penaltySchema>;
type TransactionFormValues = z.infer<typeof transactionSchema>;

export default function AdminKassePage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, isAdmin, isUserLoading } = useUser(); // user holen

  // *** BEGINN DER ÄNDERUNG: Eigenes Member-Profil holen ***
  const currentUserMemberRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserMemberProfile, isLoading: isLoadingCurrentUserMember } = useDoc<MemberProfile>(currentUserMemberRef);
  // *** ENDE DER ÄNDERUNG ***

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isTxDialogOpen, setIsTxDialogOpen] = useState(false);

  // Data fetching
  const membersRef = useMemoFirebase(() => (firestore && isAdmin ? collection(firestore, 'members') : null), [firestore, isAdmin]);
  const { data: members, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);
  const membersMap = useMemo(() => {
      if (!members) return new Map<string, MemberProfile>();
      return new Map(members.map(m => [m.userId, m]));
  }, [members]);

  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]); // Alle Gruppen holen für Namen
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  // *** BEGINN DER ÄNDERUNG: Teams für Dropdown basierend auf eigenem Profil filtern ***
  const teamsForDropdown = useMemo(() => {
    if (!groups || !currentUserMemberProfile?.teams) return [];
    const userTeamIds = currentUserMemberProfile.teams;
    return groups.filter(g => g.type === 'team' && userTeamIds.includes(g.id))
                      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, currentUserMemberProfile]);
  // *** ENDE DER ÄNDERUNG ***

  // Firestore Abfragen basierend auf selectedTeamId
  const penaltiesRef = useMemoFirebase(() => (firestore && selectedTeamId && isAdmin ? query(collection(firestore, 'penalties'), where('teamId', '==', selectedTeamId)) : null), [firestore, selectedTeamId, isAdmin]);
  const { data: penalties, isLoading: isLoadingPenalties } = useCollection<Penalty>(penaltiesRef);

  const transactionsRef = useMemoFirebase(() => (firestore && selectedTeamId && isAdmin ? query(collection(firestore, 'treasury'), where('teamId', '==', selectedTeamId)) : null), [firestore, selectedTeamId, isAdmin]);
  const { data: transactions, isLoading: isLoadingTransactions } = useCollection<TreasuryTransaction>(transactionsRef);

  const membersOfSelectedTeam = useMemo(() => { // Brauchen wir weiterhin für den Transaktionsdialog
    if (!members || !selectedTeamId) return [];
    return members.filter(m => m.teams?.includes(selectedTeamId));
  }, [members, selectedTeamId]);

  // Saldo-Berechnung (bleibt gleich)
  const totalBalance = useMemo(() => {
    return transactions?.reduce((acc, tx) => {
      if (tx.type === 'income') return acc + tx.amount;
      else if (tx.type === 'expense') return acc + tx.amount;
      else if (tx.type === 'penalty' && tx.status === 'paid') return acc + Math.abs(tx.amount);
      return acc;
    }, 0) || 0;
  }, [transactions]);

  // Forms (bleiben gleich)
  const penaltyForm = useForm<PenaltyFormValues>({ resolver: zodResolver(penaltySchema), defaultValues: { description: '', amount: 0 } });
  const transactionForm = useForm<TransactionFormValues>({ resolver: zodResolver(transactionSchema), defaultValues: { type: 'income', description: '', amount: 0 } });
  const watchTxType = transactionForm.watch('type');

  // *** BEGINN DER ÄNDERUNG: Automatische Auswahl des ersten eigenen Teams ***
  useEffect(() => {
      if (!selectedTeamId && teamsForDropdown.length > 0) {
          setSelectedTeamId(teamsForDropdown[0].id);
      }
      // Wenn das aktuell ausgewählte Team nicht mehr zu den userTeams gehört (sollte nicht passieren, aber sicher ist sicher)
      if (selectedTeamId && teamsForDropdown.length > 0 && !teamsForDropdown.some(t => t.id === selectedTeamId)) {
          setSelectedTeamId(teamsForDropdown[0].id);
      } else if (selectedTeamId && teamsForDropdown.length === 0) {
           setSelectedTeamId(null); // Falls Admin aus allen Teams entfernt wird
      }
  }, [teamsForDropdown, selectedTeamId]);
  // *** ENDE DER ÄNDERUNG ***

  // Handler-Funktionen (onAddPenalty, onDeletePenalty, onAddTransaction, etc. bleiben unverändert)
    // Penalty Catalog Logic
  const onAddPenalty = async (data: PenaltyFormValues) => {
    if (!firestore || !selectedTeamId) return;
    const penaltyCollectionRef = collection(firestore, 'penalties');
    const penaltyData = { ...data, teamId: selectedTeamId };
    addDoc(penaltyCollectionRef, penaltyData).then(() => {
      toast({ title: 'Strafe hinzugefügt' });
      penaltyForm.reset();
    }).catch(e => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'penalties', operation: 'create', requestResourceData: penaltyData })));
  };

  const onDeletePenalty = (id: string) => {
    if (!firestore) return;
    deleteDoc(doc(firestore, 'penalties', id)).then(() => {
      toast({ title: 'Strafe gelöscht' });
    }).catch(e => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `penalties/${id}`, operation: 'delete' })));
  };

  // Transaction Logic
  const onAddTransaction = async (data: TransactionFormValues) => {
    if (!firestore || !selectedTeamId) return;

    let finalAmount = 0;
    let finalDescription = data.description ?? '';
    let finalStatus: 'paid' | 'unpaid' = 'paid';
    let finalMemberId = data.memberId;

    if (data.type === 'penalty') {
      const penalty = penalties?.find(p => p.id === data.penaltyId);
      const member = membersOfSelectedTeam.find(m => m.userId === data.memberId);
      if (!penalty || !member) {
         toast({ variant: 'destructive', title: 'Fehler', description: 'Ausgewählte Strafe oder Mitglied nicht gefunden.' });
         return;
      }
      finalAmount = -penalty.amount;
      finalDescription = `${member.firstName} ${member.lastName}: ${penalty.description}`;
      finalStatus = 'unpaid';
      finalMemberId = data.memberId;

    } else if (data.type === 'expense') {
      finalAmount = -(data.amount ?? 0);
      finalMemberId = undefined;
    } else { // income
        finalAmount = data.amount ?? 0;
        finalMemberId = undefined;
    }

     if (isNaN(finalAmount)) {
        toast({ variant: 'destructive', title: 'Fehler', description: 'Ungültiger Betrag.' });
        return;
    }

    const treasuryCollectionRef = collection(firestore, 'treasury');
    const txData = {
      teamId: selectedTeamId,
      description: finalDescription,
      amount: finalAmount,
      date: serverTimestamp(),
      type: data.type,
      memberId: finalMemberId,
      status: finalStatus,
    };

    addDoc(treasuryCollectionRef, txData).then(() => {
      toast({ title: 'Transaktion hinzugefügt' });
      setIsTxDialogOpen(false);
      transactionForm.reset({type: 'income', description: '', amount: 0, memberId: undefined, penaltyId: undefined });
    }).catch(e => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'treasury', operation: 'create', requestResourceData: txData })));
  };

  const onUpdateTransactionStatus = (id: string, status: 'paid' | 'unpaid') => {
    if (!firestore) return;
    const docRef = doc(firestore, 'treasury', id);
    updateDoc(docRef, { status }).then(() => {
      toast({ title: `Status auf '${status}' geändert.` });
    }).catch(e => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: { status } })));
  };

  const onDeleteTransaction = (id: string) => {
    if (!firestore) return;
    deleteDoc(doc(firestore, 'treasury', id)).then(() => {
      toast({ title: 'Transaktion gelöscht' });
    }).catch(e => errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `treasury/${id}`, operation: 'delete' })));
  };

  // Ladezustände
  const isLoadingInitial = isUserLoading || isLoadingGroups || isLoadingCurrentUserMember || isLoadingMembers; // isLoadingMembers hinzugefügt (für membersMap)
  const isLoadingTeamData = selectedTeamId && (isLoadingPenalties || isLoadingTransactions);

  // Render Logic
    if (isLoadingInitial) {
        return ( <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> );
    }

    if (!isAdmin) {
       return ( <div className="container mx-auto p-4 sm:p-6 lg:p-8"><Card className="border-destructive/50"><CardHeader><CardTitle className="flex items-center gap-3 text-destructive"><PiggyBank className="h-8 w-8" /><span className="text-2xl font-headline">Zugriff verweigert</span></CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Sie verfügen nicht über die erforderlichen Berechtigungen...</p></CardContent></Card></div> );
    }

    // *** BEGINN DER ÄNDERUNG: Meldung, wenn Admin in keinem Team ist ***
    if (!isLoadingInitial && teamsForDropdown.length === 0) {
         return (
             <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                 <Card>
                     <CardHeader>
                         <CardTitle className="flex items-center gap-3">
                             <Edit className="h-8 w-8 text-primary" />
                             <span className="text-2xl font-headline">Admin: Kasse bearbeiten</span>
                         </CardTitle>
                     </CardHeader>
                     <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                         <Info className="h-10 w-10 text-muted-foreground" />
                         <p className="mt-4 text-muted-foreground">Sie sind derzeit keinem Team zugewiesen. Bitten Sie einen anderen Admin, Sie hinzuzufügen, oder weisen Sie sich selbst Teams unter "Mitglieder bearbeiten" zu.</p>
                     </CardContent>
                 </Card>
             </div>
         );
    }
    // *** ENDE DER ÄNDERUNG ***

  return (
    <div className="container mx-auto space-y-8 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Edit className="h-8 w-8 text-primary" />
          <span className="font-headline">Admin: Kasse bearbeiten</span>
        </h1>
        {/* *** BEGINN DER ÄNDERUNG: Dropdown verwendet gefilterte Liste *** */}
        <Select value={selectedTeamId ?? ''} onValueChange={setSelectedTeamId} disabled={teamsForDropdown.length === 0}>
          <SelectTrigger className="w-full sm:w-[280px]">
            <SelectValue placeholder="Mannschaft auswählen..." />
          </SelectTrigger>
          <SelectContent>
            {teamsForDropdown.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {/* *** ENDE DER ÄNDERUNG *** */}
      </div>

      {/* Restlicher Code bleibt größtenteils gleich, zeigt aber nur Daten für selectedTeamId an */}
      {!selectedTeamId ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
            <PiggyBank className="h-12 w-12 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">Keine Mannschaft ausgewählt</h2>
            <p className="mt-2 text-muted-foreground">Bitte wählen Sie eine Ihrer Mannschaften aus.</p>
        </Card>
      ) : isLoadingTeamData ? (
         <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Transactions */}
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                      <CardTitle className="flex items-center gap-2"><Coins className="h-6 w-6" /> Mannschaftskasse</CardTitle>
                      <CardDescription>Aktueller Saldo:
                          <span className={cn("font-bold", totalBalance >= 0 ? "text-green-600" : "text-red-600")}>
                              {totalBalance.toFixed(2)} €
                          </span>
                      </CardDescription>
                  </div>
                  <Dialog open={isTxDialogOpen} onOpenChange={setIsTxDialogOpen}>
                      <DialogTrigger asChild>
                          <Button><Plus className="mr-2 h-4 w-4" />Transaktion</Button>
                      </DialogTrigger>
                       <DialogContent>
                          <DialogHeader>
                              <DialogTitle>Neue Transaktion hinzufügen</DialogTitle>
                          </DialogHeader>
                          <Form {...transactionForm}>
                              <form onSubmit={transactionForm.handleSubmit(onAddTransaction)} className="space-y-4">
                                  <FormField control={transactionForm.control} name="type" render={({ field }) => ( <FormItem> <FormLabel>Typ</FormLabel> <Select onValueChange={field.onChange} defaultValue={field.value}> <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl> <SelectContent> <SelectItem value="income">Einnahme</SelectItem> <SelectItem value="expense">Ausgabe</SelectItem> <SelectItem value="penalty">Strafe</SelectItem> </SelectContent> </Select> </FormItem> )}/>
                                  {watchTxType === 'penalty' ? ( <> <FormField control={transactionForm.control} name="memberId" render={({ field }) => ( <FormItem> <FormLabel>Mitglied</FormLabel> <Select onValueChange={field.onChange} value={field.value ?? ''}> <FormControl><SelectTrigger><SelectValue placeholder="Mitglied auswählen..."/></SelectTrigger></FormControl> <SelectContent> {membersOfSelectedTeam.map(m => <SelectItem key={m.userId} value={m.userId}>{m.firstName} {m.lastName}</SelectItem>)} </SelectContent> </Select> <FormMessage /> </FormItem> )}/> <FormField control={transactionForm.control} name="penaltyId" render={({ field }) => ( <FormItem> <FormLabel>Strafenart</FormLabel> <Select onValueChange={field.onChange} value={field.value ?? ''}> <FormControl><SelectTrigger><SelectValue placeholder="Strafe auswählen..."/></SelectTrigger></FormControl> <SelectContent> {penalties?.map(p => <SelectItem key={p.id} value={p.id}>{p.description} ({p.amount.toFixed(2)} €)</SelectItem>)} </SelectContent> </Select> <FormMessage /> </FormItem> )}/> </> ) : ( <> <FormField control={transactionForm.control} name="description" render={({ field }) => ( <FormItem> <FormLabel>Beschreibung</FormLabel> <FormControl><Input placeholder="z.B. Getränkeverkauf" {...field} /></FormControl> <FormMessage /> </FormItem> )}/> <FormField control={transactionForm.control} name="amount" render={({ field }) => ( <FormItem> <FormLabel>Betrag (€)</FormLabel> <FormControl><Input type="number" step="0.01" {...field} onChange={event => field.onChange(event.target.value === '' ? '' : +event.target.value)} /></FormControl> <FormMessage /> </FormItem> )}/> </> )}
                                  <DialogFooter> <Button type="button" variant="ghost" onClick={() => setIsTxDialogOpen(false)}>Abbrechen</Button> <Button type="submit" disabled={transactionForm.formState.isSubmitting}> {transactionForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Speichern </Button> </DialogFooter>
                              </form>
                          </Form>
                      </DialogContent>
                  </Dialog>
              </CardHeader>
              <CardContent>
                 <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Name</TableHead><TableHead>Beschreibung</TableHead><TableHead>Betrag</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aktion</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {isLoadingTransactions ? ( <TableRow><TableCell colSpan={6} className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow> ) : transactions && transactions.length > 0 ? (
                           [...transactions].sort((a,b) => (b.date as Timestamp).toMillis() - (a.date as Timestamp).toMillis()).map(tx => {
                            const memberName = tx.memberId ? `${membersMap.get(tx.memberId)?.firstName ?? ''} ${membersMap.get(tx.memberId)?.lastName ?? ''}`.trim() : '-';
                            return (
                            <TableRow key={tx.id}>
                                <TableCell>{tx.date ? format((tx.date as Timestamp).toDate(), 'dd.MM.yy', { locale: de }) : 'Datum fehlt'}</TableCell>
                                <TableCell>{memberName}</TableCell>
                                <TableCell className="font-medium">{tx.description}</TableCell>
                                <TableCell className={cn(tx.amount >= 0 ? "text-green-600" : "text-red-600")}>{tx.amount.toFixed(2)} €</TableCell>
                                <TableCell>{(tx.type === 'penalty' || tx.status === 'unpaid') ? (<Button size="sm" variant={tx.status === 'paid' ? 'secondary' : 'destructive'} onClick={() => onUpdateTransactionStatus(tx.id, tx.status === 'unpaid' ? 'paid' : 'unpaid')}>{tx.status === 'paid' ? 'Bezahlt' : 'Offen'}</Button>) : '-'}</TableCell>
                                <TableCell className="text-right"><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Transaktion löschen?</AlertDialogTitle><AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={() => onDeleteTransaction(tx.id)}>Löschen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></TableCell>
                            </TableRow>
                           )})
                        ) : ( <TableRow><TableCell colSpan={6} className="text-center h-24">Keine Transaktionen gefunden.</TableCell></TableRow> )}
                    </TableBody>
                  </Table>
                  </div>
              </CardContent>
            </Card>
          </div>
          {/* Penalty Catalog */}
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><BookMarked className="h-6 w-6" /> Strafenkatalog</CardTitle><CardDescription>Verwalte die Strafen für diese Mannschaft.</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Beschreibung</TableHead><TableHead>Betrag</TableHead><TableHead className="text-right">Aktion</TableHead></TableRow></TableHeader>
                  <TableBody>
                     {isLoadingPenalties ? ( <TableRow><TableCell colSpan={3} className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow> ) : penalties && penalties.length > 0 ? (
                        penalties.map(p => (
                            <TableRow key={p.id}>
                                <TableCell>{p.description}</TableCell><TableCell>{p.amount.toFixed(2)} €</TableCell>
                                <TableCell className="text-right"><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Strafe löschen?</AlertDialogTitle><AlertDialogDescription>Möchten Sie "{p.description}" wirklich aus dem Katalog entfernen?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={() => onDeletePenalty(p.id)}>Löschen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></TableCell>
                            </TableRow> ))
                     ) : ( <TableRow><TableCell colSpan={3} className="text-center h-24">Keine Strafen im Katalog.</TableCell></TableRow> )}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter>
                 <Form {...penaltyForm}><form onSubmit={penaltyForm.handleSubmit(onAddPenalty)} className="flex w-full items-start gap-2"><div className="grid flex-grow gap-2"><FormField control={penaltyForm.control} name="description" render={({ field }) => ( <FormItem><FormControl><Input placeholder="Neue Strafbeschreibung" {...field}/></FormControl><FormMessage/></FormItem> )}/> <FormField control={penaltyForm.control} name="amount" render={({ field }) => ( <FormItem><FormControl><Input type="number" step="0.5" placeholder="Betrag in €" {...field} onChange={event => field.onChange(event.target.value === '' ? '' : +event.target.value)} /></FormControl><FormMessage/></FormItem> )}/></div><Button type="submit" disabled={penaltyForm.formState.isSubmitting}>{penaltyForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4" />}</Button></form></Form>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
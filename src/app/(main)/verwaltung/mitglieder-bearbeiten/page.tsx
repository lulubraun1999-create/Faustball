
'use client';

import {
  useFirestore,
  errorEmitter,
  FirestorePermissionError,
  useUser,
  initializeFirebase, // Beibehalten für Cloud Functions
  useCollection,
  useMemoFirebase,
  useDoc
} from '@/firebase';
import { doc, writeBatch, collection } from 'firebase/firestore'; // Nur Firestore-spezifische Funktionen hier
import { getFunctions, httpsCallable } from 'firebase/functions'; // *** Korrigierter Import ***
import type { MemberProfile, Group, UserProfile } from '@/lib/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Edit, Users, Shield, Trash2, Users2, Filter, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

// Typ für kombinierte Daten
type CombinedMemberProfile = UserProfile & Partial<Omit<MemberProfile, 'userId' | 'firstName' | 'lastName' | 'email'>>;

export default function AdminMitgliederPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, forceRefresh, isAdmin, isUserLoading } = useUser();

  // Filter States
  const [selectedTeamFilterOption, setSelectedTeamFilterOption] = useState<string>('all'); // 'all', 'myTeams', 'noTeam' or a teamId
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all'); // 'all', 'admin', 'user'
  const [searchTerm, setSearchTerm] = useState<string>(''); // Zustand für Suchbegriff

  // Eigenes Member-Profil holen
  const currentUserMemberRef = useMemoFirebase(
      () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
      [firestore, user]
  );
  const { data: currentUserMemberProfile, isLoading: isLoadingCurrentUserMember } = useDoc<MemberProfile>(currentUserMemberRef);


  // Daten holen
  const usersRef = useMemoFirebase(() => (firestore && isAdmin ? collection(firestore, 'users') : null), [firestore, isAdmin]);
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersRef);
  const membersRef = useMemoFirebase(() => (firestore && isAdmin ? collection(firestore, 'members') : null), [firestore, isAdmin]);
  const { data: members, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);
  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const isLoading = isUserLoading || isLoadingUsers || isLoadingMembers || isLoadingGroups || isLoadingCurrentUserMember;

  const [updatingStates, setUpdatingStates] = useState<Record<string, boolean>>({});
  const [memberToEdit, setMemberToEdit] = useState<(CombinedMemberProfile) | null>(null);
  const [newRole, setNewRole] = useState<'user' | 'admin' | null>(null);

  // Kombinierte Daten
  const combinedData = useMemo(() => {
    if (!users || !members) return [];
    const memberMap = new Map(members.map(m => [m.userId, m]));
    return users.map(user => ({
      ...user,
      ...(memberMap.get(user.id) || { teams: [] }), // Default teams to empty array
    })) as CombinedMemberProfile[];
  }, [users, members]);

  // Teams Map und Filterliste
  const { teamsMap, groupedTeams, teamsForFilterDropdown } = useMemo(() => {
      const allGroups = groups || [];
      const map = new Map<string, string>();
      const classes = allGroups.filter(g => g.type === 'class').sort((a, b) => a.name.localeCompare(b.name));
      const teams = allGroups.filter(g => g.type === 'team');
      const teamsForFilter: Group[] = [];

      teams.forEach(team => {
          map.set(team.id, team.name);
          teamsForFilter.push(team);
      });

      teamsForFilter.sort((a, b) => a.name.localeCompare(b.name));

      const grouped = classes.map(c => ({
          ...c,
          teams: teams.filter(t => t.parentId === c.id).sort((a, b) => a.name.localeCompare(b.name)),
      })).filter(c => c.teams.length > 0);

      return { teamsMap: map, groupedTeams: grouped, teamsForFilterDropdown: teamsForFilter };
  }, [groups]);


  // Gefilterte und sortierte Mitgliederliste
  const filteredAndSortedMembers = useMemo(() => {
    if (!combinedData || !currentUserMemberProfile) return [];

    const currentUserTeamIds = new Set(currentUserMemberProfile?.teams || []);
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    let filtered = [...combinedData];

    // 1. Suche
    if (lowerCaseSearchTerm) {
        filtered = filtered.filter(member =>
            (member.firstName?.toLowerCase() || '').includes(lowerCaseSearchTerm) ||
            (member.lastName?.toLowerCase() || '').includes(lowerCaseSearchTerm) ||
            (member.email?.toLowerCase() || '').includes(lowerCaseSearchTerm)
        );
    }

    // 2. Rollenfilter
    if (selectedRoleFilter !== 'all') {
      filtered = filtered.filter(member => member.role === selectedRoleFilter);
    }

    // 3. Teamfilter
    if (selectedTeamFilterOption === 'myTeams') {
      filtered = filtered.filter(member => {
        const memberTeams = member.teams || [];
        // Schließt das eigene Profil immer ein, auch wenn es in keinem Team ist
        return member.id === currentUserMemberProfile.userId || memberTeams.some(teamId => currentUserTeamIds.has(teamId));
      });
    } else if (selectedTeamFilterOption === 'noTeam') {
      filtered = filtered.filter(member => !member.teams || member.teams.length === 0);
    } else if (selectedTeamFilterOption !== 'all') {
      // Filter für eine spezifische Mannschaft
      filtered = filtered.filter(member => member.teams?.includes(selectedTeamFilterOption));
    }


    // 4. Sortieren
    return filtered.sort((a, b) => {
      if (a.id === currentUserMemberProfile.userId) return -1;
      if (b.id === currentUserMemberProfile.userId) return 1;
      const lastNameA = a.lastName || '';
      const lastNameB = b.lastName || '';
      if (lastNameA.localeCompare(lastNameB) !== 0) return lastNameA.localeCompare(lastNameB);
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
  }, [combinedData, selectedRoleFilter, selectedTeamFilterOption, searchTerm, currentUserMemberProfile]);


  // --- Event Handlers (unverändert) ---
    const handleTeamsChange = async (member: CombinedMemberProfile, teamId: string, isChecked: boolean) => {
        if (!firestore || !member || !member.id) return;
        const userId = member.id;
        const currentMemberData = members?.find(m => m.userId === userId);
        setUpdatingStates(prev => ({ ...prev, [`teams-${userId}`]: true }));
        const currentTeams = currentMemberData?.teams || [];
        const newTeams = isChecked ? [...currentTeams, teamId] : currentTeams.filter(id => id !== teamId);
        const memberDocRef = doc(firestore, 'members', userId);
        const groupMemberDocRef = doc(firestore, 'groups', teamId, 'members', userId);
        const batch = writeBatch(firestore);
        batch.set(memberDocRef, { teams: newTeams }, { merge: true });
        if (isChecked) {
        const groupMemberData = {
            userId,
            firstName: member.firstName,
            lastName: member.lastName,
            position: currentMemberData?.position || [],
            role: member.role || 'user',
        };
        batch.set(groupMemberDocRef, groupMemberData);
        } else {
        batch.delete(groupMemberDocRef);
        }
        try {
        await batch.commit();
        toast({ title: 'Mannschaften aktualisiert', description: 'Die Mannschaftszugehörigkeit wurde geändert.' });
        } catch (error) {
        const permissionError = new FirestorePermissionError({
            path: memberDocRef.path, operation: 'update', requestResourceData: { teams: newTeams },
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({ variant: 'destructive', title: 'Fehler', description: 'Mannschaften konnten nicht aktualisiert werden.' });
        } finally {
        setUpdatingStates(prev => ({ ...prev, [`teams-${userId}`]: false }));
        }
    };
    const handleRoleChange = async () => {
        if (!memberToEdit || !newRole || !firestore) return;
        const userId = memberToEdit.id;
        const currentRole = memberToEdit.role;
        setUpdatingStates(prev => ({ ...prev, [`role-${userId}`]: true }));
        try {
        const { firebaseApp } = initializeFirebase();
        const functions = getFunctions(firebaseApp);
        if (newRole === 'admin' && currentRole !== 'admin') {
            const setAdminRole = httpsCallable(functions, 'setAdminRole');
            await setAdminRole({ uid: userId });
        } else if (newRole === 'user' && currentRole === 'admin') {
            const revokeAdminRole = httpsCallable(functions, 'revokeAdminRole');
            await revokeAdminRole({ uid: userId });
        }
        if (forceRefresh && (newRole !== currentRole)) {
            await forceRefresh();
        }
        toast({
            title: 'Rolle aktualisiert',
            description: `Die Rolle von ${memberToEdit.firstName} ${memberToEdit.lastName} wurde zu ${newRole === 'admin' ? 'Trainer' : 'Spieler'} geändert.`,
        });
        } catch (error: any) {
        console.error("Fehler beim Ändern der Rolle:", error);
        toast({ variant: 'destructive', title: 'Fehler', description: error.message || 'Die Rolle konnte nicht geändert werden.' });
        } finally {
        setUpdatingStates(prev => ({ ...prev, [`role-${userId}`]: false }));
        setMemberToEdit(null);
        setNewRole(null);
        }
    };
    const handleDeleteMember = async (member: CombinedMemberProfile) => {
        if(!firestore || !member.id) return;
        const userId = member.id;
        const { firstName, lastName } = member;
        setUpdatingStates(prev => ({ ...prev, [`delete-${userId}`]: true }));
        try {
            const batch = writeBatch(firestore);
            const memberDocRef = doc(firestore, 'members', userId);
            const userDocRef = doc(firestore, 'users', userId);
            batch.delete(memberDocRef);
            batch.delete(userDocRef);
            const currentMemberData = members?.find(m => m.userId === userId);
            if (currentMemberData?.teams) {
                currentMemberData.teams.forEach(teamId => {
                    const groupMemberDocRef = doc(firestore, 'groups', teamId, 'members', userId);
                    batch.delete(groupMemberDocRef);
                });
            }
            await batch.commit();
            toast({
                title: 'Mitglied-Dokumente gelöscht',
                description: `Die Firestore-Daten für ${firstName} ${lastName} wurden entfernt. Das Firebase Auth Benutzerkonto muss separat gelöscht werden.`,
            });
        } catch (error: any) {
            console.error("Fehler beim Löschen des Mitglieds:", error);
            const permissionError = new FirestorePermissionError({
            path: `members/${userId}`, operation: 'delete',
            });
            errorEmitter.emit('permission-error', permissionError);
            toast({ variant: 'destructive', title: 'Fehler', description: 'Das Mitglied konnte nicht gelöscht werden.' });
        } finally {
            setUpdatingStates(prev => ({ ...prev, [`delete-${userId}`]: false }));
        }
    }

  const getTeamNames = (teamIds?: string[]): string[] => {
    if (!teamIds || teamIds.length === 0) return [];
    return teamIds.map(id => teamsMap.get(id) || id).sort();
  };

  // --- Render Logic ---
    if (isLoading) {
        return ( <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> );
    }
    if (!isAdmin) {
       return ( <div className="container mx-auto p-4 sm:p-6 lg:p-8"><Card className="border-destructive/50"><CardHeader><CardTitle className="flex items-center gap-3 text-destructive"><Users2 className="h-8 w-8" /><span className="text-2xl font-headline">Zugriff verweigert</span></CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Sie verfügen nicht über die erforderlichen Berechtigungen...</p></CardContent></Card></div> );
    }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-3">
              <Edit className="h-8 w-8 text-primary" />
              <span className="text-2xl font-headline">Admin: Mitglieder bearbeiten</span>
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
               <div className="relative w-full sm:w-auto">
                 <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                 <Input type="search" placeholder="Suche Name/Email..." className="pl-8 w-full sm:w-[200px]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
               </div>
               <Select value={selectedTeamFilterOption} onValueChange={setSelectedTeamFilterOption}>
                 <SelectTrigger className="w-full sm:w-auto"><SelectValue placeholder="Nach Mannschaft filtern..." /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">Alle Mitglieder</SelectItem>
                   <SelectItem value="myTeams">Meine Mannschaften</SelectItem>
                   <SelectItem value="noTeam">Ohne Mannschaft</SelectItem>
                   <Separator className="my-1"/>
                   {teamsForFilterDropdown.map(team => (
                     <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               <Select value={selectedRoleFilter} onValueChange={setSelectedRoleFilter}>
                 <SelectTrigger className="w-full sm:w-auto"><SelectValue placeholder="Nach Rolle filtern..." /></SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">Alle Rollen</SelectItem>
                   <SelectItem value="admin">Trainer</SelectItem>
                   <SelectItem value="user">Spieler</SelectItem>
                 </SelectContent>
               </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nachname</TableHead>
                    <TableHead className="hidden sm:table-cell">Vorname</TableHead>
                    <TableHead className="hidden md:table-cell">Rolle</TableHead>
                    <TableHead className="hidden lg:table-cell">Mannschaften</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedMembers && filteredAndSortedMembers.length > 0 ? (
                    filteredAndSortedMembers.map((member) => {
                       const memberTeams = getTeamNames(member.teams);
                       const currentMemberData = members?.find(m => m.userId === member.id);
                       return (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.lastName || '-'}</TableCell>
                        <TableCell className="hidden sm:table-cell">{member.firstName || '-'}</TableCell>
                        <TableCell className="hidden md:table-cell capitalize">{member.role === 'admin' ? 'Trainer' : 'Spieler'}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {memberTeams.length > 0 ? ( <Popover><PopoverTrigger asChild><Button variant="link" className="p-0 h-auto font-normal text-foreground text-left">{memberTeams[0]}{memberTeams.length > 1 && `... (+${memberTeams.length - 1})`}</Button></PopoverTrigger>{memberTeams.length > 1 && ( <PopoverContent className="w-auto p-2"><ul className="space-y-1 list-disc list-inside text-sm">{memberTeams.map(team => <li key={team}>{team}</li>)}</ul></PopoverContent> )}</Popover> ) : ('-')}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">{member.email || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0">
                            <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" disabled={updatingStates[`teams-${member.id}`]}>{updatingStates[`teams-${member.id}`] ? <Loader2 className="h-4 w-4 animate-spin"/> : <Users className="h-4 w-4" />}<span className="sr-only">Mannschaften zuweisen</span></Button></PopoverTrigger><PopoverContent className="w-64 p-0"><ScrollArea className="h-72"><div className="p-4">{groupedTeams.length > 0 ? groupedTeams.map(group => (<div key={group.id} className="mb-4"><h4 className="font-semibold text-sm mb-2 border-b pb-1">{group.name}</h4><div className="flex flex-col space-y-2">{group.teams.map(team => (<div key={team.id} className="flex items-center space-x-2"><Checkbox id={`team-${member.id}-${team.id}`} checked={member.teams?.includes(team.id)} onCheckedChange={(checked) => { handleTeamsChange(member, team.id, !!checked); }} /><label htmlFor={`team-${member.id}-${team.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{team.name}</label></div>))}</div></div>)) : <p className="p-4 text-center text-sm text-muted-foreground">Keine Mannschaften erstellt.</p>}</div></ScrollArea></PopoverContent></Popover>
                            <Dialog open={memberToEdit?.id === member.id} onOpenChange={(isOpen) => { if (!isOpen) { setMemberToEdit(null); setNewRole(null); }}}><DialogTrigger asChild><Button variant="ghost" size="icon" onClick={() => { setMemberToEdit(member); setNewRole(member.role as 'user' | 'admin'); }} disabled={updatingStates[`role-${member.id}`]}>{updatingStates[`role-${member.id}`] ? <Loader2 className="h-4 w-4 animate-spin"/> : <Shield className="h-4 w-4" />}<span className="sr-only">Rolle ändern</span></Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Rolle ändern für {member.firstName} {member.lastName}</DialogTitle><DialogDescription>Ein "Trainer" hat Administratorrechte. Ein "Spieler" ist ein normaler Benutzer.</DialogDescription></DialogHeader><div className="py-4"><RadioGroup value={newRole ?? undefined} onValueChange={(value: 'user' | 'admin') => setNewRole(value)}><div className="flex items-center space-x-2"><RadioGroupItem value="user" id={`role-${member.id}-user`} /><Label htmlFor={`role-${member.id}-user`}>Spieler</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="admin" id={`role-${member.id}-admin`} /><Label htmlFor={`role-${member.id}-admin`}>Trainer</Label></div></RadioGroup></div><DialogFooter><DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose><Button onClick={handleRoleChange} disabled={!newRole || newRole === member.role || updatingStates[`role-${member.id}`]}>{updatingStates[`role-${member.id}`] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Speichern</Button></DialogFooter></DialogContent></Dialog>
                            <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={updatingStates[`delete-${member.id}`]}>{updatingStates[`delete-${member.id}`] ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive" />}<span className="sr-only">Mitglied löschen</span></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Sind Sie absolut sicher?</AlertDialogTitle><AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden. Dadurch werden die Profildaten für {member.firstName} {member.lastName} dauerhaft gelöscht. Das Firebase Auth Benutzerkonto muss separat gelöscht werden, falls gewünscht.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteMember(member)} className="bg-destructive hover:bg-destructive/90">Löschen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                       )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center"> 
                        Keine Mitglieder entsprechen den aktuellen Filtern.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}

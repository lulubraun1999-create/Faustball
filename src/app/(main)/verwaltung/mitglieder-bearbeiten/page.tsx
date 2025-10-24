
'use client';

import {
  useFirestore,
  errorEmitter,
  FirestorePermissionError,
  useUser,
  initializeFirebase,
} from '@/firebase';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { MemberProfile } from '@/lib/types';
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
import { Loader2, Edit, Users, Shield, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AdminGuard, useAdminData } from '@/components/admin-guard';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

function AdminMitgliederPageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, forceRefresh } = useUser();
  
  // Daten kommen jetzt vom useAdminData Hook, der durch AdminGuard bereitgestellt wird.
  const { members, groups, isLoading } = useAdminData();

  const [updatingStates, setUpdatingStates] = useState<Record<string, boolean>>({});
  const [memberToEdit, setMemberToEdit] = useState<(MemberProfile & { role?: 'user' | 'admin' }) | null>(null);
  const [newRole, setNewRole] = useState<'user' | 'admin' | null>(null);

  const sortedMembers = useMemo(() => {
    if (!members) return [];
    return [...members].sort((a, b) => {
        const lastNameA = a.lastName || '';
        const lastNameB = b.lastName || '';
        if (lastNameA.localeCompare(lastNameB) !== 0) {
            return lastNameA.localeCompare(lastNameB);
        }
        return (a.firstName || '').localeCompare(b.firstName || '');
    });
  }, [members]);

  const { classes, teams, groupedTeams } = useMemo(() => {
    const allGroups = groups || [];
    const classes = allGroups.filter(g => g.type === 'class').sort((a, b) => a.name.localeCompare(b.name));
    const teams = allGroups.filter(g => g.type === 'team');

    const grouped = classes.map(c => ({
        ...c,
        teams: teams.filter(t => t.parentId === c.id).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter(c => c.teams.length > 0);

    return { classes, teams, groupedTeams: grouped };
  }, [groups]);

  const handleTeamsChange = async (userId: string, newTeams: string[]) => {
    if (!firestore) return;
    setUpdatingStates(prev => ({ ...prev, [`teams-${userId}`]: true }));
    const memberDocRef = doc(firestore, 'members', userId);
    try {
      await setDoc(memberDocRef, { teams: newTeams }, { merge: true });
      toast({ title: 'Mannschaften aktualisiert', description: 'Die Mannschaftszugehörigkeit wurde geändert.' });
    } catch (error) {
       const permissionError = new FirestorePermissionError({
          path: memberDocRef.path,
          operation: 'update',
          requestResourceData: { teams: newTeams },
        });
        errorEmitter.emit('permission-error', permissionError);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Mannschaften konnten nicht aktualisiert werden.' });
    } finally {
       setUpdatingStates(prev => ({ ...prev, [`teams-${userId}`]: false }));
    }
  };

  const handleRoleChange = async () => {
    if (!memberToEdit || !newRole || !firestore) return;
  
    const { userId, firstName, lastName, role: currentRole } = memberToEdit;
  
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
      } else {
        // Fallback for cases where claims might fail, but we can still try to set the DB role
        const memberDocRef = doc(firestore, 'members', userId);
        const userDocRef = doc(firestore, 'users', userId);
        const batch = writeBatch(firestore);
        batch.set(memberDocRef, { role: newRole }, { merge: true });
        batch.set(userDocRef, { role: newRole }, { merge: true });
        await batch.commit();
      }
      
      if (forceRefresh && (newRole !== currentRole)) {
        // Force refresh only if the role actually changed to update claims
        await forceRefresh();
      }
  
      toast({
        title: 'Rolle aktualisiert',
        description: `Die Rolle von ${firstName} ${lastName} wurde zu ${newRole === 'admin' ? 'Trainer' : 'Spieler'} geändert.`,
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

  const handleDeleteMember = async (member: MemberProfile) => {
    if(!firestore) return;
    const { userId, firstName, lastName } = member;
    setUpdatingStates(prev => ({ ...prev, [`delete-${userId}`]: true }));

    try {
        const batch = writeBatch(firestore);
        const memberDocRef = doc(firestore, 'members', userId);
        const userDocRef = doc(firestore, 'users', userId);

        batch.delete(memberDocRef);
        batch.delete(userDocRef);

        await batch.commit();
        
        // This Firebase Function call would be needed if you want to delete the auth user
        // const functions = getFunctions(initializeFirebase().firebaseApp);
        // const deleteAuthUser = httpsCallable(functions, 'deleteAuthUser');
        // await deleteAuthUser({ uid: userId });

        toast({
            title: 'Mitglied-Dokumente gelöscht',
            description: `Die Profildaten für ${firstName} ${lastName} wurden entfernt. Das Benutzerkonto existiert weiterhin.`,
        });
    } catch (error: any) {
         console.error("Fehler beim Löschen des Mitglieds:", error);
        const permissionError = new FirestorePermissionError({
          path: `members/${userId}`,
          operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({ variant: 'destructive', title: 'Fehler', description: 'Das Mitglied konnte nicht gelöscht werden.' });
    } finally {
        setUpdatingStates(prev => ({ ...prev, [`delete-${userId}`]: false }));
    }
  }


  const getTeamNamesForDisplay = (teamIds?: string[]): string[] => {
    if (!teamIds || teamIds.length === 0) return [];
    return teamIds.map(id => teams.find(t => t.id === id)?.name || id)
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Edit className="h-8 w-8 text-primary" />
            <span className="text-2xl font-headline">Admin: Mitglieder bearbeiten</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mannschaft</TableHead>
                    <TableHead>Nachname</TableHead>
                    <TableHead>Vorname</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Geschlecht</TableHead>
                    <TableHead>Geburtstag</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Wohnort</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.length > 0 ? (
                    sortedMembers.map((member) => {
                       const memberTeams = getTeamNamesForDisplay(member.teams);
                       return (
                      <TableRow key={member.userId}>
                        <TableCell>
                          {memberTeams.length > 0 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="link" className="p-0 h-auto font-normal text-foreground">
                                   {memberTeams[0]}
                                   {memberTeams.length > 1 && `... (+${memberTeams.length - 1})`}
                                </Button>
                              </PopoverTrigger>
                               {memberTeams.length > 1 && (
                                <PopoverContent className="w-auto p-2">
                                  <ul className="space-y-1 list-disc list-inside">
                                    {memberTeams.map(team => <li key={team}>{team}</li>)}
                                  </ul>
                                </PopoverContent>
                               )}
                            </Popover>
                          ) : (
                            'N/A'
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{member.lastName}</TableCell>
                        <TableCell>{member.firstName}</TableCell>
                        <TableCell className="capitalize">{member.role === 'admin' ? 'Trainer' : 'Spieler'}</TableCell>
                        <TableCell>{member.position?.join(', ') || 'N/A'}</TableCell>
                        <TableCell>{member.gender || 'N/A'}</TableCell>
                        <TableCell>{member.birthday ? new Date(member.birthday).toLocaleDateString('de-DE') : 'N/A'}</TableCell>
                        <TableCell>{member.email}</TableCell>
                        <TableCell>{member.phone || 'N/A'}</TableCell>
                        <TableCell>{member.location || 'N/A'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" disabled={updatingStates[`teams-${member.userId}`]}>
                                        {updatingStates[`teams-${member.userId}`] ? <Loader2 className="h-4 w-4 animate-spin"/> : <Users className="h-4 w-4" />}
                                        <span className="sr-only">Mannschaften zuweisen</span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-0">
                                   <ScrollArea className="h-72">
                                     <div className="p-4">
                                       {groupedTeams.length > 0 ? groupedTeams.map(group => (
                                            <div key={group.id} className="mb-4">
                                                <h4 className="font-semibold text-sm mb-2 border-b pb-1">{group.name}</h4>
                                                <div className="flex flex-col space-y-2">
                                                    {group.teams.map(team => (
                                                        <div key={team.id} className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id={`team-${member.userId}-${team.id}`}
                                                                checked={member.teams?.includes(team.id)}
                                                                onCheckedChange={(checked) => {
                                                                    const currentTeams = member.teams || [];
                                                                    const newTeams = checked
                                                                        ? [...currentTeams, team.id]
                                                                        : currentTeams.filter(id => id !== team.id);
                                                                    handleTeamsChange(member.userId, newTeams);
                                                                }}
                                                            />
                                                            <label htmlFor={`team-${member.userId}-${team.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                                                {team.name}
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                       )) : <p className="p-4 text-center text-sm text-muted-foreground">Keine Mannschaften erstellt.</p>}
                                     </div>
                                   </ScrollArea>
                                </PopoverContent>
                            </Popover>

                             <Dialog open={memberToEdit?.userId === member.userId} onOpenChange={(isOpen) => { if (!isOpen) { setMemberToEdit(null); setNewRole(null); }}}>
                                <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => { setMemberToEdit(member); setNewRole(member.role as 'user' | 'admin'); }} disabled={updatingStates[`role-${member.userId}`]}>
                                         {updatingStates[`role-${member.userId}`] ? <Loader2 className="h-4 w-4 animate-spin"/> : <Shield className="h-4 w-4" />}
                                        <span className="sr-only">Rolle ändern</span>
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Rolle ändern für {member.firstName} {member.lastName}</DialogTitle>
                                        <DialogDescription>
                                            Ein "Trainer" hat Administratorrechte. Ein "Spieler" ist ein normaler Benutzer.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4">
                                       <RadioGroup defaultValue={member.role} onValueChange={(value: 'user' | 'admin') => setNewRole(value)}>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="user" id={`role-${member.userId}-user`} />
                                                <Label htmlFor={`role-${member.userId}-user`}>Spieler</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="admin" id={`role-${member.userId}-admin`} />
                                                <Label htmlFor={`role-${member.userId}-admin`}>Trainer</Label>
                                            </div>
                                        </RadioGroup>
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
                                        <Button onClick={handleRoleChange} disabled={!newRole || newRole === member.role || updatingStates[`role-${member.userId}`]}>
                                            {updatingStates[`role-${member.userId}`] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Speichern
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                             </Dialog>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" disabled={updatingStates[`delete-${member.userId}`]}>
                                        {updatingStates[`delete-${member.userId}`] ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 text-destructive" />}
                                        <span className="sr-only">Mitglied löschen</span>
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Sind Sie absolut sicher?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Diese Aktion kann nicht rückgängig gemacht werden. Dadurch werden die Profildaten für {member.firstName} {member.lastName} dauerhaft gelöscht. Das Benutzerkonto existiert weiterhin und der Benutzer muss ggf. separat gelöscht werden.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={() => handleDeleteMember(member)}
                                            className="bg-destructive hover:bg-destructive/90"
                                        >
                                            Löschen
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                       )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={11} className="h-24 text-center">
                        Keine Mitglieder gefunden.
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

export default function AdminMitgliederPage() {
  return (
    <AdminGuard>
      <AdminMitgliederPageContent />
    </AdminGuard>
  );
}


'use client';

import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
  useUser,
} from '@/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import type { MemberProfile, UserProfile, Group } from '@/lib/types';
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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Edit, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AdminGuard } from '@/components/admin-guard';
import { useToast } from '@/hooks/use-toast';


function AdminMitgliederPageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { isAdmin } = useUser();
  const [updatingStates, setUpdatingStates] = useState<Record<string, boolean>>({});

  const membersRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'members') : null),
    [firestore]
  );
    const usersRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'users') : null),
    [firestore]
  );
  const groupsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'groups') : null),
    [firestore]
  );

  const { data: membersData, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);
  const { data: usersData, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersRef);
  const { data: groupsData, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const combinedData = useMemo(() => {
    if (!membersData || !usersData) return [];
    
    const usersMap = new Map(usersData.map(user => [user.id, user]));
    
    return membersData.map(member => ({
      ...member,
      role: usersMap.get(member.userId)?.role || 'user',
    }));
  }, [membersData, usersData]);

  const sortedMembers = useMemo(() => {
    if (!combinedData) return [];
    return [...combinedData].sort((a, b) => {
      const lastNameA = a.lastName || '';
      const lastNameB = b.lastName || '';
      if (lastNameA.localeCompare(lastNameB) !== 0) {
        return lastNameA.localeCompare(lastNameB);
      }
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
  }, [combinedData]);

  const teams = useMemo(() => groupsData?.filter(g => g.type === 'team') || [], [groupsData]);

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

  const getTeamNamesForEdit = (teamIds?: string[]) => {
    if (!teamIds || teamIds.length === 0) return 'Mannschaft auswählen';
    if (!teams) return 'Laden...';
    return teamIds
      .map(id => teams.find(t => t.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

    const getTeamNamesForDisplay = (teamIds?: string[]) => {
    if (!teamIds || teamIds.length === 0) return 'N/A';
     if (!teams) return 'Laden...';
    return teamIds.map(id => teams.find(t => t.id === id)?.name || id).join(', ');
  };


  const isLoading = isLoadingMembers || isLoadingGroups || isLoadingUsers;

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
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mannschaft</TableHead>
                    <TableHead>Vorname</TableHead>
                    <TableHead>Nachname</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Geschlecht</TableHead>
                    <TableHead>Geburtstag</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Wohnort</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.length > 0 ? (
                    sortedMembers.map((member) => (
                      <TableRow key={member.userId}>
                        <TableCell>{getTeamNamesForDisplay(member.teams)}</TableCell>
                        <TableCell>{member.firstName || 'N/A'}</TableCell>
                        <TableCell>{member.lastName || 'N/A'}</TableCell>
                        <TableCell>{member.position?.join(', ') || 'N/A'}</TableCell>
                        <TableCell className="capitalize">{member.role}</TableCell>
                        <TableCell>{member.gender || 'N/A'}</TableCell>
                        <TableCell>{member.birthday ? new Date(member.birthday).toLocaleDateString('de-DE') : 'N/A'}</TableCell>
                        <TableCell>{member.email || 'N/A'}</TableCell>
                        <TableCell>{member.phone || 'N/A'}</TableCell>
                        <TableCell>{member.location || 'N/A'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                             {updatingStates[`teams-${member.userId}`] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-[200px] justify-between"
                                    disabled={!firestore || !isAdmin}
                                >
                                    <span className="truncate">
                                    {getTeamNamesForEdit(member.teams)}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0">
                                   {teams.map(team => (
                                        <div key={team.id} className="flex items-center space-x-2 p-2">
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
                                            <label
                                                htmlFor={`team-${member.userId}-${team.id}`}
                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                >
                                                {team.name}
                                            </label>
                                        </div>
                                   ))}
                                   {teams.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Keine Mannschaften.</p>}
                                </PopoverContent>
                            </Popover>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
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
          )}
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

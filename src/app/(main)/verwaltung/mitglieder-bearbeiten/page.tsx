
'use client';

import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
  useUser,
} from '@/firebase';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

type MemberWithRoleAndTeams = UserProfile &
  Partial<Omit<MemberProfile, 'userId'>> & {
    userId: string;
    teams?: string[];
  };

function AdminMitgliederPageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { isAdmin } = useUser();
  const [updatingStates, setUpdatingStates] = useState<Record<string, boolean>>({});

  const usersRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'users') : null),
    [firestore, isAdmin]
  );
  const membersRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'members') : null),
    [firestore, isAdmin]
  );
  const groupsRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'groups') : null),
    [firestore, isAdmin]
  );

  const { data: usersData, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersRef);
  const { data: membersData, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);
  const { data: groupsData, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const teams = useMemo(() => groupsData?.filter(g => g.type === 'team') || [], [groupsData]);

  const combinedData = useMemo(() => {
    if (!usersData || !membersData) return [];

    const memberMap = new Map(membersData.map(m => [m.userId, m]));

    const combined: MemberWithRoleAndTeams[] = usersData.map(user => {
      const memberProfile = memberMap.get(user.id);
      return {
        ...user,
        ...memberProfile,
        userId: user.id,
        teams: memberProfile?.teams || [],
      };
    });

    return combined.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
  }, [usersData, membersData]);

  const handleRoleChange = async (userId: string, newRole: 'user' | 'admin') => {
    if (!firestore) return;
    setUpdatingStates(prev => ({ ...prev, [`role-${userId}`]: true }));
    const userDocRef = doc(firestore, 'users', userId);
    try {
      await updateDoc(userDocRef, { role: newRole });
      toast({ title: 'Rolle aktualisiert', description: 'Die Benutzerrolle wurde erfolgreich geändert.' });
    } catch (error) {
       const permissionError = new FirestorePermissionError({
          path: userDocRef.path,
          operation: 'update',
          requestResourceData: { role: newRole },
        });
        errorEmitter.emit('permission-error', permissionError);
      toast({ variant: 'destructive', title: 'Fehler', description: 'Die Rolle konnte nicht geändert werden.' });
    } finally {
      setUpdatingStates(prev => ({ ...prev, [`role-${userId}`]: false }));
    }
  };

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

  const getTeamNames = (teamIds: string[]) => {
    if (!teamIds || teamIds.length === 0) return 'Keine';
    return teamIds
      .map(id => teams.find(t => t.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };


  const isLoading = isLoadingUsers || isLoadingMembers || isLoadingGroups;

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
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Mannschaften</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {combinedData.length > 0 ? (
                    combinedData.map((profile) => (
                      <TableRow key={profile.userId}>
                        <TableCell className="font-medium">{`${profile.firstName || ''} ${profile.lastName || ''}`}</TableCell>
                        <TableCell>{profile.email || 'N/A'}</TableCell>
                        <TableCell>
                           <div className="flex items-center gap-2">
                            {updatingStates[`role-${profile.userId}`] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Select
                                value={profile.role}
                                onValueChange={(value: 'user' | 'admin') => handleRoleChange(profile.userId, value)}
                                >
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue placeholder="Rolle wählen" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">User</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                                </Select>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                             {updatingStates[`teams-${profile.userId}`] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-[200px] justify-between"
                                >
                                    <span className="truncate">
                                    {getTeamNames(profile.teams || [])}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[200px] p-0">
                                   {teams.map(team => (
                                        <div key={team.id} className="flex items-center space-x-2 p-2">
                                            <Checkbox
                                                id={`team-${profile.userId}-${team.id}`}
                                                checked={profile.teams?.includes(team.id)}
                                                onCheckedChange={(checked) => {
                                                    const currentTeams = profile.teams || [];
                                                    const newTeams = checked
                                                        ? [...currentTeams, team.id]
                                                        : currentTeams.filter(id => id !== team.id);
                                                    handleTeamsChange(profile.userId, newTeams);
                                                }}
                                            />
                                            <label
                                                htmlFor={`team-${profile.userId}-${team.id}`}
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
                      <TableCell colSpan={4} className="h-24 text-center">
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

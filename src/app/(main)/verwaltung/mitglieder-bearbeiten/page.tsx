
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
import type { MemberProfile, Group } from '@/lib/types';
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
    () => (firestore && isAdmin ? collection(firestore, 'members') : null),
    [firestore, isAdmin]
  );
  const groupsRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'groups') : null),
    [firestore, isAdmin]
  );

  const { data: membersData, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);
  const { data: groupsData, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const teams = useMemo(() => groupsData?.filter(g => g.type === 'team') || [], [groupsData]);

  const sortedMembers = useMemo(() => {
    if (!membersData) return [];
    return [...membersData].sort((a, b) => 
          (a.lastName || '').localeCompare(b.lastName || ''))
      .sort((a, b) =>
          (a.firstName || '').localeCompare(b.firstName || ''));
  }, [membersData]);


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


  const isLoading = isLoadingMembers || isLoadingGroups;

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
                    <TableHead>Mannschaften</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.length > 0 ? (
                    sortedMembers.map((member) => (
                      <TableRow key={member.userId}>
                        <TableCell className="font-medium">{`${member.firstName || ''} ${member.lastName || ''}`}</TableCell>
                        <TableCell>{member.email || 'N/A'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
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
                                    {getTeamNames(member.teams || [])}
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
                      <TableCell colSpan={3} className="h-24 text-center">
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

'use client';

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
import { Loader2, Users2, Filter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import type { MemberProfile, Group, UserProfile } from '@/lib/types';

type CombinedMemberProfile = UserProfile & Partial<Omit<MemberProfile, 'userId' | 'firstName' | 'lastName' | 'email'>>;

export default function VerwaltungMitgliederPage() {
  const { user, isAdmin, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('all');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');

  // Eigenes Member-Profil holen
  const currentUserMemberRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserMemberProfile, isLoading: isLoadingCurrentUserMember } = useDoc<MemberProfile>(currentUserMemberRef);


  const usersRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'users') : null),
    [firestore, isAdmin]
  );
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersRef);

  const membersRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'members') : null),
    [firestore, isAdmin]
  );
  const { data: members, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);

  const groupsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'groups') : null),
    [firestore]
  );
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const isLoading = isUserLoading || isLoadingUsers || isLoadingMembers || isLoadingGroups || isLoadingCurrentUserMember;

  const combinedData = useMemo(() => {
    if (!users || !members) return [];
    const memberMap = new Map(members.map(m => [m.userId, m]));
    return users.map(user => ({
      ...user,
      ...(memberMap.get(user.id) || {}),
    })) as CombinedMemberProfile[];
  }, [users, members]);

  // Teams für Filter-Dropdown und Anzeige
  const { teamsMap, teamsForFilterDropdown } = useMemo(() => {
    const map = new Map<string, string>();
    const teamsForFilter: Group[] = [];
    const userTeamIds = currentUserMemberProfile?.teams || [];

    if (groups) {
      groups.filter(g => g.type === 'team').forEach(team => {
          map.set(team.id, team.name);
          if (userTeamIds.includes(team.id)) {
              teamsForFilter.push(team);
          }
      });
    }
    teamsForFilter.sort((a, b) => a.name.localeCompare(b.name));
    return { teamsMap: map, teamsForFilterDropdown: teamsForFilter };
  }, [groups, currentUserMemberProfile]);


  // Gefilterte und sortierte Mitgliederliste
  const filteredAndSortedMembers = useMemo(() => {
    if (!combinedData || !currentUserMemberProfile) return [];

    const currentUserTeamIds = new Set(currentUserMemberProfile?.teams || []);

    // Vorfiltern nach gemeinsamen Teams
    let preFiltered = combinedData.filter(member => {
        // *** BEGINN DER ÄNDERUNG: Eigenes Profil NICHT mehr ausschließen ***
        // if (member.id === currentUserMemberProfile.userId) return false; // DIESE ZEILE ENTFERNT/AUSKOMMENTIERT
        // *** ENDE DER ÄNDERUNG ***
        const memberTeams = member.teams || [];
        return memberTeams.some(teamId => currentUserTeamIds.has(teamId));
    });

    let filtered = [...preFiltered];

    // Filtern nach Rolle
    if (selectedRoleFilter !== 'all') {
      filtered = filtered.filter(member => member.role === selectedRoleFilter);
    }

    // Filtern nach Mannschaft
    if (selectedTeamFilter !== 'all') {
      filtered = filtered.filter(member => member.teams?.includes(selectedTeamFilter));
    }

    // Sortieren
    return filtered.sort((a, b) => {
      // Dich selbst immer zuerst anzeigen (optional)
      if (a.id === currentUserMemberProfile.userId) return -1;
      if (b.id === currentUserMemberProfile.userId) return 1;

      // Dann nach Nachname, dann Vorname sortieren
      const lastNameA = a.lastName || '';
      const lastNameB = b.lastName || '';
      if (lastNameA.localeCompare(lastNameB) !== 0) {
        return lastNameA.localeCompare(lastNameB);
      }
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
  }, [combinedData, selectedRoleFilter, selectedTeamFilter, currentUserMemberProfile]);


  const getTeamNames = (teamIds?: string[]): string[] => {
    if (!teamIds || teamIds.length === 0) return [];
    return teamIds.map(id => teamsMap.get(id) || id).sort();
  };

  // --- Render Logic ---

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
     return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-destructive">
                <Users2 className="h-8 w-8" />
                <span className="text-2xl font-headline">Zugriff verweigert</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Sie verfügen nicht über die erforderlichen Berechtigungen, um auf
                diesen Bereich zuzugreifen.
              </p>
            </CardContent>
          </Card>
        </div>
      );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-3">
              <Users2 className="h-8 w-8 text-primary" />
              <span className="text-2xl font-headline">Verwaltung: Mitglieder</span>
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
               <Filter className="h-4 w-4 text-muted-foreground sm:hidden" />
               <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter}>
                 <SelectTrigger className="w-full sm:w-[180px]">
                   <SelectValue placeholder="Nach Mannschaft filtern..." />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">Alle meine Mannschaften</SelectItem>
                   {teamsForFilterDropdown.map(team => (
                     <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               <Select value={selectedRoleFilter} onValueChange={setSelectedRoleFilter}>
                 <SelectTrigger className="w-full sm:w-[150px]">
                   <SelectValue placeholder="Nach Rolle filtern..." />
                 </SelectTrigger>
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
                    <TableHead>Mannschaft</TableHead>
                    <TableHead>Vorname</TableHead>
                    <TableHead>Nachname</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Geschlecht</TableHead>
                    <TableHead>Geburtstag</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Wohnort</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedMembers.length > 0 ? (
                    filteredAndSortedMembers.map((member) => {
                      const memberTeams = getTeamNames(member.teams);
                      return (
                      <TableRow key={member.id}>
                        <TableCell>
                          {memberTeams.length > 0 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="link" className="p-0 h-auto font-normal text-foreground text-left">
                                   {memberTeams[0]}
                                   {memberTeams.length > 1 && `... (+${memberTeams.length - 1})`}
                                </Button>
                              </PopoverTrigger>
                               {memberTeams.length > 1 && (
                                <PopoverContent className="w-auto p-2">
                                  <ul className="space-y-1 list-disc list-inside text-sm">
                                    {memberTeams.map(team => <li key={team}>{team}</li>)}
                                  </ul>
                                </PopoverContent>
                               )}
                            </Popover>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{member.firstName || '-'}</TableCell>
                        <TableCell>{member.lastName || '-'}</TableCell>
                        <TableCell className="capitalize">{member.role === 'admin' ? 'Trainer' : 'Spieler'}</TableCell>
                        <TableCell>{member.position?.join(', ') || '-'}</TableCell>
                        <TableCell>{member.gender || '-'}</TableCell>
                        <TableCell>{member.birthday ? new Date(member.birthday).toLocaleDateString('de-DE') : '-'}</TableCell>
                        <TableCell>{member.email || '-'}</TableCell>
                        <TableCell>{member.phone || '-'}</TableCell>
                        <TableCell>{member.location || '-'}</TableCell>
                      </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                        Keine Mannschaftskollegen entsprechen den aktuellen Filtern gefunden.
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
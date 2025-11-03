
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
import { Loader2, Users2, Search, MapPin } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useFirestore, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import type { MemberProfile, Group, UserProfile } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Tooltip, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type CombinedMemberProfile = UserProfile & Partial<Omit<MemberProfile, 'userId' | 'firstName' | 'lastName' | 'email'>>;

export default function VerwaltungMitgliederPage() {
  const { user, isAdmin, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('all');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Admins fetch all users, non-admins don't need to (and can't)
  const usersRef = useMemoFirebase(() => (firestore && isAdmin ? collection(firestore, 'users') : null), [firestore, isAdmin]);
  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersRef);

  const membersRef = useMemoFirebase(() => (firestore ? collection(firestore, 'members') : null), [firestore]);
  const { data: members, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);
  
  const memberProfileRef = useMemoFirebase(
    () => (user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: memberProfile, isLoading: isMemberProfileLoading } =
    useDoc<MemberProfile>(memberProfileRef);

  const isLoading = isUserLoading || (isAdmin && isLoadingUsers) || isLoadingMembers || isMemberProfileLoading;

  const combinedData = useMemo(() => {
      if (!members) return [];
      
      // For admins, combine users and members data for a complete picture
      if (isAdmin && users) {
          const memberMap = new Map(members.map(m => [m.userId, m]));
          return users.map(userProfile => ({
              ...userProfile,
              ...(memberMap.get(userProfile.id) || {}),
          })) as CombinedMemberProfile[];
      }
      
      // For non-admins, the 'members' collection is the source of truth
      return members as CombinedMemberProfile[];

  }, [users, members, isAdmin]);

  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const { teamsMap, teamsForFilterDropdown } = useMemo(() => {
    const map = new Map<string, string>();
    if (!groups) return { teamsMap: map, teamsForFilterDropdown: [] };
  
    const allTeams = groups.filter(g => g.type === 'team');
    allTeams.forEach(team => map.set(team.id, team.name));
  
    // For ALL users (including admins), filter dropdown to only their teams on this page.
    if (memberProfile?.teams) {
        const userTeamIds = new Set(memberProfile.teams);
        const userTeams = allTeams.filter(team => userTeamIds.has(team.id));
        userTeams.sort((a,b) => a.name.localeCompare(b.name));
        return { teamsMap: map, teamsForFilterDropdown: userTeams }
    }
    
    // Fallback for users with no teams
    return { teamsMap: map, teamsForFilterDropdown: [] };
  }, [groups, memberProfile]);

  const filteredAndSortedMembers = useMemo(() => {
    if (!combinedData) return [];
    
    let displayableMembers = combinedData;

    // If the user is not an admin, restrict the list to teammates
    if (!isAdmin && memberProfile) {
        const currentUserTeamIds = new Set(memberProfile.teams || []);
        if (currentUserTeamIds.size > 0) {
            displayableMembers = combinedData.filter(member => {
                const memberTeamIds = member.teams || [];
                // Include the member themselves and anyone who shares at least one team
                return member.id === user?.uid || memberTeamIds.some(teamId => currentUserTeamIds.has(teamId));
            });
        } else {
             // If the user is in no teams, they only see themselves
             displayableMembers = combinedData.filter(member => member.id === user?.uid);
        }
    }

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    let filtered = [...displayableMembers];

    if (lowerCaseSearchTerm) {
      filtered = filtered.filter(member => 
        (member.firstName?.toLowerCase() || '').includes(lowerCaseSearchTerm) ||
        (member.lastName?.toLowerCase() || '').includes(lowerCaseSearchTerm) ||
        (member.email?.toLowerCase() || '').includes(lowerCaseSearchTerm)
      );
    }

    if (selectedRoleFilter !== 'all') {
      filtered = filtered.filter(member => member.role === selectedRoleFilter);
    }

    if (selectedTeamFilter !== 'all') {
      filtered = filtered.filter(member => member.teams?.includes(selectedTeamFilter));
    }

    return filtered.sort((a, b) => {
      const lastNameA = a.lastName || '';
      const lastNameB = b.lastName || '';
      if (lastNameA.localeCompare(lastNameB) !== 0) {
        return lastNameA.localeCompare(lastNameB);
      }
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
  }, [combinedData, selectedRoleFilter, selectedTeamFilter, searchTerm, isAdmin, memberProfile, user]);

  const getTeamNames = (teamIds?: string[]): string[] => {
    if (!teamIds || teamIds.length === 0) return [];
    return teamIds.map(id => teamsMap.get(id) || id).sort();
  };

  if (isLoading || isLoadingGroups) {
    return (
      <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
              <span className="text-2xl font-headline">Mitglieder</span>
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
               <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="search" 
                    placeholder="Suche..." 
                    className="pl-8 w-full sm:w-[180px]"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
               </div>
               <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter}>
                 <SelectTrigger className="w-full sm:w-auto">
                   <SelectValue placeholder="Nach Mannschaft filtern..." />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">Alle Mannschaften</SelectItem>
                   {teamsForFilterDropdown.map(team => (
                     <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
               <Select value={selectedRoleFilter} onValueChange={setSelectedRoleFilter}>
                 <SelectTrigger className="w-full sm:w-auto">
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
                    <TableHead>Nachname</TableHead>
                    <TableHead>Vorname</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Mannschaften</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Geburtstag</TableHead>
                    <TableHead>Wohnort</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedMembers.length > 0 ? (
                    filteredAndSortedMembers.map((member) => {
                      const memberTeams = getTeamNames(member.teams);
                      return (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.lastName || '-'}</TableCell>
                        <TableCell>{member.firstName || '-'}</TableCell>
                        <TableCell className="capitalize">{member.role === 'admin' ? 'Trainer' : 'Spieler'}</TableCell>
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
                        <TableCell>{member.email || '-'}</TableCell>
                        <TableCell>{member.phone || '-'}</TableCell>
                        <TableCell>
                            {member.birthday ? format(new Date(member.birthday), 'dd.MM.yyyy', { locale: de }) : '-'}
                        </TableCell>
                        <TableCell>{member.location || '-'}</TableCell>
                      </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        Keine Mitglieder entsprechen den aktuellen Filtern gefunden.
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

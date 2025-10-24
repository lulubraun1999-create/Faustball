
'use client';

import { AdminGuard } from '@/components/admin-guard';
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
import { Loader2, Users2 } from 'lucide-react';
import { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { MemberProfile, Group } from '@/lib/types';


function VerwaltungMitgliederPageContent() {
  const { isAdmin } = useUser();
  const firestore = useFirestore();

  const membersRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'members') : null),
    [firestore, isAdmin]
  );
  const { data: members, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);

  const groupsRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'groups') : null),
    [firestore, isAdmin]
  );
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);


  const isLoading = isLoadingMembers || isLoadingGroups;

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

  const teamsMap = useMemo(() => {
    if (!groups) return new Map();
    return new Map(groups.filter(g => g.type === 'team').map(team => [team.id, team.name]));
  }, [groups]);

  const getTeamNames = (teamIds?: string[]): string[] => {
    if (!teamIds || teamIds.length === 0) return [];
    return teamIds.map(id => teamsMap.get(id) || id);
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
            <Users2 className="h-8 w-8 text-primary" />
            <span className="text-2xl font-headline">Verwaltung: Mitglieder</span>
          </CardTitle>
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
                  {sortedMembers.length > 0 ? (
                    sortedMembers.map((member) => {
                      const memberTeams = getTeamNames(member.teams);
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
                        <TableCell>{member.firstName || 'N/A'}</TableCell>
                        <TableCell>{member.lastName || 'N/A'}</TableCell>
                        <TableCell className="capitalize">{member.role === 'admin' ? 'Trainer' : 'Spieler'}</TableCell>
                        <TableCell>{member.position?.join(', ') || 'N/A'}</TableCell>
                        <TableCell>{member.gender || 'N/A'}</TableCell>
                        <TableCell>{member.birthday ? new Date(member.birthday).toLocaleDateString('de-DE') : 'N/A'}</TableCell>
                        <TableCell>{member.email || 'N/A'}</TableCell>
                        <TableCell>{member.phone || 'N/A'}</TableCell>
                        <TableCell>{member.location || 'N/A'}</TableCell>
                      </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center">
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

export default function VerwaltungMitgliederPage() {
    return (
        <AdminGuard>
            <VerwaltungMitgliederPageContent />
        </AdminGuard>
    )
}

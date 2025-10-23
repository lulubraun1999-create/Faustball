
'use client';

import {
  useFirestore,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { collection } from 'firebase/firestore';
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
import { Loader2, Users2 } from 'lucide-react';
import { useMemo } from 'react';

export default function VerwaltungMitgliederPage() {
  const firestore = useFirestore();

  const membersRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'members') : null),
    [firestore]
  );
  const groupsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'groups') : null),
    [firestore]
  );

  const { data: membersData, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);
  const { data: groupsData, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const sortedMembers = useMemo(() => {
    if (!membersData) return [];
    
    return [...membersData].sort((a, b) => {
      const lastNameA = a.lastName || '';
      const lastNameB = b.lastName || '';
      if (lastNameA.localeCompare(lastNameB) !== 0) {
        return lastNameA.localeCompare(lastNameB);
      }
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
  }, [membersData]);

  const teamsMap = useMemo(() => {
    if (!groupsData) return new Map();
    return new Map(groupsData.filter(g => g.type === 'team').map(team => [team.id, team.name]));
  }, [groupsData]);

  const getTeamNames = (teamIds?: string[]) => {
    if (!teamIds || teamIds.length === 0) return 'N/A';
    return teamIds.map(id => teamsMap.get(id) || id).join(', ');
  };


  const isLoading = isLoadingMembers || isLoadingGroups;

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
                    sortedMembers.map((member) => (
                      <TableRow key={member.userId}>
                        <TableCell>{getTeamNames(member.teams)}</TableCell>
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
                    ))
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

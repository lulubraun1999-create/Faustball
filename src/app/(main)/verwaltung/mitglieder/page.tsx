
'use client';

import {
  useFirestore,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { collection } from 'firebase/firestore';
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
import { Loader2, Users2 } from 'lucide-react';
import { useMemo } from 'react';

export default function VerwaltungMitgliederPage() {
  const firestore = useFirestore();

  const membersRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'members') : null),
    [firestore]
  );

  const { data: membersData, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);

  const sortedMembers = useMemo(() => {
    return membersData
      ? [...membersData].sort((a, b) => 
          (a.lastName || '').localeCompare(b.lastName || ''))
      : [];
  }, [membersData]);


  const isLoading = isLoadingMembers;

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
                    <TableHead>Name</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Geburtstag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.length > 0 ? (
                    sortedMembers.map((member) => (
                      <TableRow key={member.userId}>
                        <TableCell className="font-medium">{`${member.firstName || ''} ${member.lastName || ''}`}</TableCell>
                        <TableCell>{member.position?.join(', ') || 'N/A'}</TableCell>
                        <TableCell>{member.birthday ? new Date(member.birthday).toLocaleDateString('de-DE') : 'N/A'}</TableCell>
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

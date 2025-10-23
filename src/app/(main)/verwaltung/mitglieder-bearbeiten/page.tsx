
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
import { Loader2, Edit } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { AdminGuard } from '@/components/admin-guard';

function AdminMitgliederPageContent() {
  const firestore = useFirestore();

  const membersRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'members') : null),
    [firestore]
  );

  const { data: membersData, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);

  const sortedMembers = useMemo(() => {
    if (!membersData) return [];
    // Ensure all properties are strings before comparing
    return [...membersData].sort((a, b) => {
        const lastNameA = a.lastName || '';
        const lastNameB = b.lastName || '';
        return lastNameA.localeCompare(lastNameB);
    });
  }, [membersData]);


  const isLoading = isLoadingMembers;

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
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
             <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>E-Mail</TableHead>
                        <TableHead>Geschlecht</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Geburtstag</TableHead>
                        <TableHead>Telefonnummer</TableHead>
                        <TableHead>Wohnort</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedMembers.length > 0 ? (
                        sortedMembers.map((profile) => (
                            <TableRow key={profile.userId}>
                            <TableCell className="font-medium">{`${profile.firstName || ''} ${profile.lastName || ''}`}</TableCell>
                            <TableCell>{profile.email || 'N/A'}</TableCell>
                            <TableCell>{profile.gender || 'N/A'}</TableCell>
                            <TableCell>{profile.position?.join(', ') || 'N/A'}</TableCell>
                            <TableCell>
                                {profile.birthday ? new Date(profile.birthday).toLocaleDateString('de-DE') : 'N/A'}
                            </TableCell>
                            <TableCell>{profile.phone || 'N/A'}</TableCell>
                            <TableCell>{profile.location || 'N/A'}</TableCell>
                            </TableRow>
                        ))
                        ) : (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
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

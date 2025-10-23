
'use client';

import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
} from '@/firebase';
import { collection } from 'firebase/firestore';
import type { UserProfile, MemberProfile, FullUserProfile } from '@/lib/types';
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
  const { isAdmin } = useUser();

  const usersRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'users') : null),
    [firestore, isAdmin]
  );
  const membersRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'members') : null),
    [firestore, isAdmin]
  );

  const { data: users, isLoading: isLoadingUsers } = useCollection<UserProfile>(usersRef);
  const { data: members, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);

  const fullUserProfiles = useMemo<FullUserProfile[]>(() => {
    if (!users) return [];

    const membersMap = new Map(members?.map((member) => [member.userId, member]));

    return users.map((user) => {
      const memberData = membersMap.get(user.id) || {};
      return {
        ...user,
        ...memberData,
      };
    }).sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
  }, [users, members]);


  const isLoading = isLoadingUsers || isLoadingMembers;

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
                        <TableHead>Geschlecht</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Rolle</TableHead>
                        <TableHead>Geburtstag</TableHead>
                        <TableHead>E-Mail</TableHead>
                        <TableHead>Telefonnummer</TableHead>
                        <TableHead>Wohnort</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {fullUserProfiles.length > 0 ? (
                        fullUserProfiles.map((profile) => (
                            <TableRow key={profile.id}>
                            <TableCell className="font-medium">{`${profile.firstName || ''} ${profile.lastName || ''}`}</TableCell>
                            <TableCell>{profile.gender || 'N/A'}</TableCell>
                            <TableCell>{profile.position?.join(', ') || 'N/A'}</TableCell>
                            <TableCell>
                                {profile.role === 'admin' ? (
                                    <Badge>Admin</Badge>
                                ) : (
                                    'User'
                                )}
                            </TableCell>
                            <TableCell>
                                {profile.birthday ? new Date(profile.birthday).toLocaleDateString('de-DE') : 'N/A'}
                            </TableCell>
                            <TableCell>{profile.email || 'N/A'}</TableCell>
                            <TableCell>{profile.phone || 'N/A'}</TableCell>
                            <TableCell>{profile.location || 'N/A'}</TableCell>
                            </TableRow>
                        ))
                        ) : (
                        <TableRow>
                            <TableCell colSpan={8} className="h-24 text-center">
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

'use client';

import { createContext, useContext } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldAlert } from 'lucide-react';
import type { MemberProfile, Group } from '@/lib/types';
import { collection } from 'firebase/firestore';

// 1. Context für die Admin-Daten erstellen
interface AdminDataContextType {
  members: MemberProfile[];
  groups: Group[];
  isLoading: boolean;
}

const AdminDataContext = createContext<AdminDataContextType | null>(null);

// 2. Hook für den Zugriff auf die Admin-Daten
export const useAdminData = () => {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error('useAdminData must be used within an AdminDataProvider');
  }
  return context;
};


// 3. AdminDataProvider, der die Daten nur für Admins lädt
function AdminDataProvider({ children }: { children: React.ReactNode }) {
    const firestore = useFirestore();
    const { isAdmin } = useUser();

    // Lade Mitglieder und Gruppen nur, wenn der Benutzer Admin ist
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

    const isLoading = isLoadingMembers || isLoadingGroups;
    const members = membersData || [];
    const groups = groupsData || [];

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }
    
    return (
        <AdminDataContext.Provider value={{ members, groups, isLoading }}>
            {children}
        </AdminDataContext.Provider>
    );
}


// 4. AdminGuard, der den Provider nur rendert, wenn der Benutzer Admin ist
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isUserLoading, isAdmin, userProfile } = useUser();

  if (isUserLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAuthorized = isAdmin || userProfile?.role === 'admin';

  if (!isAuthorized) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-destructive">
              <ShieldAlert className="h-8 w-8" />
              <span className="text-2xl font-headline">Zugriff verweigert</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Sie verfügen nicht über die erforderlichen Berechtigungen, um auf diesen Bereich zuzugreifen. Bitte wenden Sie sich an einen Administrator, wenn Sie glauben, dass dies ein Fehler ist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AdminDataProvider>{children}</AdminDataProvider>;
}

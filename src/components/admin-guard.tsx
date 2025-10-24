
'use client';

import { ReactNode, createContext, useContext, useMemo } from 'react';
import { useUser, useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, ShieldAlert } from 'lucide-react';
import { collection } from 'firebase/firestore';
import type { Group, MemberProfile } from '@/lib/types';

// 1. Define the context for admin-specific data
interface AdminDataContextType {
  members: MemberProfile[] | null;
  groups: Group[] | null;
  isLoading: boolean;
}

const AdminDataContext = createContext<AdminDataContextType | undefined>(
  undefined
);

// 2. Create a provider that fetches data ONLY when the user is an admin
function AdminDataProvider({ children, isAdmin }: { children: ReactNode, isAdmin: boolean }) {
  const firestore = useFirestore();

  // IMPORTANT: The queries are now conditional on the `isAdmin` prop.
  // If `isAdmin` is false, the ref remains null, and no query is ever sent.
  const membersRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'members') : null),
    [firestore, isAdmin]
  );
  const groupsRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'groups') : null),
    [firestore, isAdmin]
  );

  const { data: members, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const contextValue = useMemo(
    () => ({
      members,
      groups,
      isLoading: isLoadingMembers || isLoadingGroups,
    }),
    [members, groups, isLoadingMembers, isLoadingGroups]
  );

  return (
    <AdminDataContext.Provider value={contextValue}>
      {children}
    </AdminDataContext.Provider>
  );
}

// 3. Create a simple hook to access the admin data
export function useAdminData() {
  const context = useContext(AdminDataContext);
  if (context === undefined) {
    throw new Error('useAdminData must be used within AdminGuard');
  }
  return context;
}

// 4. Update AdminGuard to wrap children with the new provider
export function AdminGuard({ children }: { children: ReactNode }) {
  const { isUserLoading, isAdmin } = useUser();

  if (isUserLoading) {
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
              <ShieldAlert className="h-8 w-8" />
              <span className="text-2xl font-headline">Zugriff verweigert</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Sie verfügen nicht über die erforderlichen Berechtigungen, um auf
              diesen Bereich zuzugreifen. Bitte wenden Sie sich an einen
              Administrator, wenn Sie glauben, dass dies ein Fehler ist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If the user IS an admin, render the provider which will now safely fetch data
  return <AdminDataProvider isAdmin={true}>{children}</AdminDataProvider>;
}

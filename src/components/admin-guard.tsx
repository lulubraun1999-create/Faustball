
'use client';

import { ReactNode, createContext, useContext, useMemo } from 'react';
import {
  useUser,
  useCollection,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, ShieldAlert } from 'lucide-react';
import { collection } from 'firebase/firestore';
import type { MemberProfile, Group } from '@/lib/types';

// 1. Define the context for Admin Data
interface AdminDataContextType {
  members: MemberProfile[] | null;
  groups: Group[] | null;
  isLoading: boolean;
}

const AdminDataContext = createContext<AdminDataContextType | undefined>(
  undefined
);

// 2. Create a hook to consume the context
export const useAdminData = () => {
  const context = useContext(AdminDataContext);
  if (!context) {
    throw new Error('useAdminData must be used within an AdminDataProvider');
  }
  return context;
};

// 3. Create a component that fetches data only if the user is an admin
function AdminDataProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  // We can safely use isAdmin here because AdminGuard ensures this component only renders for admins.
  const { isAdmin } = useUser();

  // CRITICAL FIX: The query is ONLY created if firestore is available AND the user is an admin.
  // If not, it remains null, and useCollection will not execute a query.
  const membersRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'members') : null),
    [firestore, isAdmin]
  );
  const groupsRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'groups') : null),
    [firestore, isAdmin]
  );

  const { data: members, isLoading: isLoadingMembers } =
    useCollection<MemberProfile>(membersRef);
  const { data: groups, isLoading: isLoadingGroups } =
    useCollection<Group>(groupsRef);

  // The overall loading state depends on whether the queries are active.
  const isLoading = (isAdmin && (isLoadingMembers || isLoadingGroups));

  const value = useMemo(
    () => ({
      members,
      groups,
      isLoading,
    }),
    [members, groups, isLoading]
  );

  return (
    <AdminDataContext.Provider value={value}>
      {isLoading ? (
        <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        children
      )}
    </AdminDataContext.Provider>
  );
}


// 4. Update AdminGuard to use the new provider
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

  // Only if the user is verified as an admin, render the provider which fetches the data.
  return <AdminDataProvider>{children}</AdminDataProvider>;
}

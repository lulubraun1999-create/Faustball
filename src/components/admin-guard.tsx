
'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
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
  isLoadingMembers: boolean;
  isLoadingGroups: boolean;
}

const AdminDataContext = createContext<AdminDataContextType | undefined>(undefined);

// 2. Create the internal Data Provider component
interface AdminDataProviderProps {
  children: ReactNode;
}

function AdminDataProvider({ children }: AdminDataProviderProps) {
  const firestore = useFirestore();

  // Hooks are now safe because this component is only rendered when isAdmin is true.
  const membersRef = useMemoFirebase(() => (firestore ? collection(firestore, 'members') : null), [firestore]);
  const { data: members, isLoading: isLoadingMembers } = useCollection<MemberProfile>(membersRef);

  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const value = useMemo(() => ({
    members,
    groups,
    isLoadingMembers,
    isLoadingGroups,
  }), [members, groups, isLoadingMembers, isLoadingGroups]);

  return (
    <AdminDataContext.Provider value={value}>
      {children}
    </AdminDataContext.Provider>
  );
}


// 3. Create the public hook to access the data
export function useAdminData(): AdminDataContextType {
  const context = useContext(AdminDataContext);
  if (context === undefined) {
    throw new Error('useAdminData must be used within an AdminGuard');
  }
  return context;
}


// 4. Update the AdminGuard to use the provider correctly
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

  // If the user IS an admin, render the provider.
  // The provider itself will then safely fetch the data.
  return (
    <AdminDataProvider>
        {children}
    </AdminDataProvider>
  );
}

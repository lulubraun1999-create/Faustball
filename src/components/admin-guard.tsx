'use client';

import { ReactNode } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldAlert } from 'lucide-react';

export function AdminGuard({ children }: { children: React.ReactNode }) {
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
              Sie verfügen nicht über die erforderlichen Berechtigungen, um auf diesen Bereich zuzugreifen. Bitte wenden Sie sich an einen Administrator, wenn Sie glauben, dass dies ein Fehler ist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return <>{children}</>;
}

// Dummy export to prevent breaking changes in other files for now.
// Will be removed once all components are updated.
export const useAdminData = () => ({
    members: [],
    groups: [],
    isLoading: true,
});

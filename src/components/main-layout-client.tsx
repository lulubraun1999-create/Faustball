"use client";

import { useUser, useFirestore, useMemoFirebase, useDoc } from "@/firebase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { MemberProfile } from "@/lib/types";

export function MainLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();
  const router = useRouter();
  
  const memberRef = useMemoFirebase(() => {
     if (!authUser) return null;
     // This part is problematic, we'll simplify and rely on registration to create the doc.
     return null; 
  }, [authUser]);

  // isMemberLoading is no longer a concern here as we simplify the logic.
  // const { isLoading: isMemberLoading } = useDoc<MemberProfile>(memberRef);


  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!authUser) {
      router.replace("/login");
      return;
    }
    
    // The complex consistency check has been removed.
    // The registration flow is now the single source of truth for creating user/member documents.

  }, [authUser, isAuthLoading, router]);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!authUser) {
      // This case is handled by the redirect, but as a fallback, show a loader
      // to prevent flashing content before the redirect happens.
       return (
          <div className="flex h-screen w-full items-center justify-center bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
       );
  }

  return <main className="flex-1">{children}</main>;
}
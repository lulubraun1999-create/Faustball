
"use client";

import { useUser, useFirestore, useMemoFirebase, useDoc } from "@/firebase";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { MemberProfile } from "@/lib/types";
import { doc } from "firebase/firestore";

export function MainLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();
  const router = useRouter();
  const firestore = useFirestore();

  // We only need to check if the user is authenticated.
  // Other data loading should happen within the pages themselves.
  useEffect(() => {
    if (isAuthLoading) {
      return; // Wait until authentication state is resolved
    }

    if (!authUser) {
      router.replace("/login"); // If not logged in, redirect
    }
  }, [authUser, isAuthLoading, router]);

  // While auth is loading, show a full-screen loader.
  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // If user is not authenticated, show loader while redirecting.
  if (!authUser) {
       return (
          <div className="flex h-screen w-full items-center justify-center bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
       );
  }

  // If authenticated, render the children pages.
  return <main className="flex-1">{children}</main>;
}

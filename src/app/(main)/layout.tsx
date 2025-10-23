
"use client";

import { useUser, useFirestore, errorEmitter, FirestorePermissionError } from "@/firebase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MainHeader } from "@/components/main-header";
import { Loader2 } from "lucide-react";
import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import type { UserProfile, MemberProfile } from "@/lib/types";

export default function MainAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();
  const router = useRouter();
  const firestore = useFirestore();
  const [isCheckingFirstLogin, setIsCheckingFirstLogin] = useState(true);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!authUser) {
      router.replace("/login");
      return;
    }

    if (!firestore) {
      setIsCheckingFirstLogin(false);
      return;
    }

    const ensureProfileConsistency = async () => {
      const userDocRef = doc(firestore, "users", authUser.uid);
      const memberDocRef = doc(firestore, "members", authUser.uid);
      
      try {
        const userDocSnap = await getDoc(userDocRef);
        const memberDocSnap = await getDoc(memberDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as UserProfile;
          const batch = writeBatch(firestore);
          let writeNeeded = false;

          // Self-healing: Create member doc if it doesn't exist
          if (!memberDocSnap.exists()) {
            const newMemberData: MemberProfile = {
              userId: authUser.uid,
              firstName: userData.firstName,
              lastName: userData.lastName,
              email: userData.email,
              teams: [],
            };
            batch.set(memberDocRef, newMemberData);
            writeNeeded = true;
          }

          // Handle first login flag
          if (userData.firstLoginComplete === false) {
            batch.update(userDocRef, { firstLoginComplete: true });
            writeNeeded = true;
          }

          if (writeNeeded) {
            await batch.commit();
            // No navigation needed here anymore, just fix the data.
          }
        }
      } catch (error) {
        console.error("Error ensuring profile consistency:", error);
      } finally {
        setIsCheckingFirstLogin(false);
      }
    };

    ensureProfileConsistency();

  }, [authUser, isAuthLoading, router, firestore]);

  const isLoading = isAuthLoading || isCheckingFirstLogin;

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <MainHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}

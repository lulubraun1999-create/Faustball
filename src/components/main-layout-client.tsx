
"use client";

import { useUser, useFirestore, useMemoFirebase, useDoc } from "@/firebase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { MemberProfile } from "@/lib/types";

export function MainLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();
  const router = useRouter();
  const firestore = useFirestore();
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(true);

  const memberDocRef = useMemoFirebase(() => {
     if (!firestore || !authUser) return null;
     return doc(firestore, 'members', authUser.uid);
  }, [firestore, authUser]);
  const { isLoading: isMemberLoading } = useDoc<MemberProfile>(memberDocRef);


  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!authUser) {
      router.replace("/login");
      return;
    }

    if (!firestore) {
      setIsCheckingConsistency(false);
      return;
    }

    const ensureProfileConsistency = async () => {
      // No user, no work to do.
      if (!authUser || !authUser.email) {
          setIsCheckingConsistency(false);
          return;
      }

      const memberDocRef = doc(firestore, "members", authUser.uid);

      try {
        const memberDocSnap = await getDoc(memberDocRef);

        // If the member document doesn't exist, create it.
        // This can happen for users created before the 'members' collection was standard.
        if (!memberDocSnap.exists()) {
          console.log("Member document missing for user. Creating it now.", authUser.uid);
          // We might not have firstName/lastName here if the user object is not fresh.
          // The registration process guarantees this data, but this is a fallback.
          const displayName = authUser.displayName || "New User";
          const [firstName, ...lastNameParts] = displayName.split(' ');
          const lastName = lastNameParts.join(' ');

          const newMemberData: MemberProfile = {
            userId: authUser.uid,
            email: authUser.email,
            firstName: firstName,
            lastName: lastName || '', // Ensure lastName is not undefined
            role: 'user', // Default to 'user'
            teams: [],
            phone: '',
            location: '',
            position: [],
            birthday: '',
            gender: undefined,
          };
          // Use setDoc instead of a batch since it's a single operation
          await setDoc(memberDocRef, newMemberData);
        }
      } catch (error) {
        console.error("Error ensuring profile consistency:", error);
      } finally {
        setIsCheckingConsistency(false);
      }
    };

    ensureProfileConsistency();

  }, [authUser, isAuthLoading, router, firestore]);

  const isLoading = isAuthLoading || isCheckingConsistency || (authUser != null && isMemberLoading);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <main className="flex-1">{children}</main>;
}

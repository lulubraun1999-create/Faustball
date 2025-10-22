
"use client";

import { useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MainHeader } from "@/components/main-header";
import { Loader2 } from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { UserProfile } from "@/lib/types";

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

    const checkFirstLogin = async () => {
      const userDocRef = doc(firestore, "users", authUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data() as UserProfile;
        if (userData.firstLoginComplete === false) {
          // It's the first login, redirect to profile edit
          await setDoc(userDocRef, { firstLoginComplete: true }, { merge: true });
          router.replace("/profile/edit");
        } else {
          // Not the first login, allow access to dashboard
          setIsCheckingFirstLogin(false);
        }
      } else {
        // User document doesn't exist, something is wrong, but for now let's just proceed
        setIsCheckingFirstLogin(false);
      }
    };

    checkFirstLogin();

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

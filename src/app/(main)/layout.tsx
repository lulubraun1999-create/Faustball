
"use client";

import { useUser, useFirestore } from "@/firebase";
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
    // Wait until authentication is resolved
    if (isAuthLoading) {
      return;
    }

    // If no user is logged in, redirect to login page
    if (!authUser) {
      router.replace("/login");
      return;
    }

    // If firestore is not ready, don't do anything yet.
    if (!firestore) {
      // It might be temporarily unavailable, but we shouldn't get stuck.
      // If we can't check, we'll assume it's not the first login for now.
      setIsCheckingFirstLogin(false);
      return;
    }

    // Function to check the first login status
    const checkFirstLogin = async () => {
      try {
        const userDocRef = doc(firestore, "users", authUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as UserProfile;
          // Check if the flag is explicitly false
          if (userData.firstLoginComplete === false) {
            // This is the first login. Update the flag and redirect.
            await setDoc(userDocRef, { firstLoginComplete: true }, { merge: true });
            router.replace("/dashboard");
            // The component will unmount or re-run, so we don't need to set loading to false here.
          } else {
            // The flag is true or undefined, so it's not the first login.
            setIsCheckingFirstLogin(false);
          }
        } else {
          // User document doesn't exist. This might be a race condition during registration.
          // For safety, we'll allow access and not get stuck.
          setIsCheckingFirstLogin(false);
        }
      } catch (error) {
        console.error("Error checking first login:", error);
        // In case of an error, we don't want to block the user.
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

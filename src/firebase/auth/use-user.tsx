
'use client';

import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCallback, useMemo } from 'react';
import type { User } from 'firebase/auth';
import type { UserProfile } from '@/lib/types';
import { doc, getFirestore } from 'firebase/firestore';


export interface AdminAwareUserHookResult {
  user: User | null; 
  userProfile: UserProfile | null;
  isUserLoading: boolean;
  isAdmin: boolean;
  forceRefresh: () => Promise<void>;
}

/**
 * Hook for accessing the authenticated user, their profile, and admin status.
 * The admin status is now derived from the Firestore document for reliability.
 */
export const useUser = (): AdminAwareUserHookResult => {
  const { user, isUserLoading: isAuthLoading, firebaseApp } = useFirebase();

  // Memoize Firestore instance to prevent re-renders
  const firestore = useMemo(() => firebaseApp ? getFirestore(firebaseApp) : null, [firebaseApp]);

  // Create a stable reference to the user's document
  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  
  // Fetch the user's profile document in real-time
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  // The isAdmin flag is now reliably sourced from the real-time user profile data.
  const isAdmin = !!userProfile?.role && userProfile.role === 'admin';

  // Function to force a refresh of the user's auth token. This will also trigger the onIdTokenChanged
  // listener in the provider, which can be used to refresh other state if needed.
  const forceRefresh = useCallback(async () => {
    if (user) {
      await user.getIdToken(true);
    }
  }, [user]);

  const isUserReallyLoading = isAuthLoading || (user != null && isProfileLoading);

  return { 
    user, 
    userProfile, 
    isUserLoading: isUserReallyLoading, 
    isAdmin, 
    forceRefresh 
  };
};


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

// Augment the User type to include our custom claims if they exist
interface UserWithClaims extends User {
  customClaims?: {
    admin?: boolean;
  };
}

/**
 * Hook for accessing the authenticated user, their profile, and admin status.
 * The admin status is now derived from the custom token claim for reliability.
 */
export const useUser = (): AdminAwareUserHookResult => {
  const { user, isUserLoading: isAuthLoading, firebaseApp, forceRefresh: refreshAuthToken } = useFirebase();
  const typedUser = user as UserWithClaims | null;

  // Memoize Firestore instance to prevent re-renders
  const firestore = useMemo(() => firebaseApp ? getFirestore(firebaseApp) : null, [firebaseApp]);

  // Create a stable reference to the user's document
  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);
  
  // Fetch the user's profile document in real-time
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>(userDocRef);

  // The isAdmin flag is now reliably sourced from the real-time auth token claims.
  const isAdmin = !!typedUser?.customClaims?.admin;

  // Function to force a refresh of the user's auth token. This will also trigger the onIdTokenChanged
  // listener in the provider, which can be used to refresh other state if needed.
  const forceRefresh = useCallback(async () => {
    if (refreshAuthToken) {
      await refreshAuthToken();
    }
  }, [refreshAuthToken]);

  // The final loading state is true if auth is loading OR if we have a user but are still waiting for their profile.
  const isUserLoading = isAuthLoading || (user != null && isProfileLoading);

  return { 
    user, 
    userProfile, 
    isUserLoading, 
    isAdmin, 
    forceRefresh 
  };
};

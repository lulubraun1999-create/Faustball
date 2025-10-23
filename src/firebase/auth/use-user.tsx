'use client';

import { useFirebase } from '../provider';
import { useCallback } from 'react';

export interface AdminAwareUserHookResult {
  user: ReturnType<typeof useFirebase>['user'];
  isUserLoading: boolean;
  isAdmin: boolean;
  forceRefresh: () => Promise<void>;
}

/**
 * Hook specifically for accessing the authenticated user's state,
 * including a boolean for admin status based on custom claims.
 */
export const useUser = (): AdminAwareUserHookResult => {
  const { user, isUserLoading } = useFirebase();

  // The admin claim is now reliably populated by the FirebaseProvider's onIdTokenChanged listener.
  const isAdmin = !!user?.customClaims?.admin;

  const forceRefresh = useCallback(async () => {
    // Calling getIdToken(true) forces a token refresh.
    // The onIdTokenChanged listener in FirebaseProvider will automatically pick up the new token and claims.
    if (user) {
      await user.getIdToken(true);
    }
  }, [user]);

  return { user, isUserLoading, isAdmin, forceRefresh };
};

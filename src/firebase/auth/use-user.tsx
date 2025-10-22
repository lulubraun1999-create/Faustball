'use client';

import { useFirebaseContext } from '../provider';

/**
 * Hook specifically for accessing the authenticated user's state.
 */
export const useUser = () => {
  const { user, isUserLoading } = useFirebaseContext();
  return { user, isUserLoading };
};

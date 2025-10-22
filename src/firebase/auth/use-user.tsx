'use client';

import { useFirebase } from '../provider';

/**
 * Hook specifically for accessing the authenticated user's state.
 */
export const useUser = () => {
  const { user, isUserLoading } = useFirebase();
  return { user, isUserLoading };
};

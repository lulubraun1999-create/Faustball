
'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';
import { Auth, User, onIdTokenChanged } from 'firebase/auth';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener'

// Augment the User type to include our custom claims if they exist
interface UserWithClaims extends User {
  customClaims?: {
    admin?: boolean;
  };
}

interface FirebaseProviderProps {
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}

// Internal state for user authentication
interface UserAuthState {
  user: UserWithClaims | null;
  isUserLoading: boolean;
  userError: Error | null;
  forceRefresh: (() => Promise<void>) | null; // Add forceRefresh to state
}

// Combined state for the Firebase context
export interface FirebaseContextState extends UserAuthState {
  areServicesAvailable: boolean; // True if core services (app, firestore, auth instance) are provided
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null; // The Auth service instance
}

// Return type for useFirebase()
export interface FirebaseServicesAndUser extends UserAuthState {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}

// React Context
export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

/**
 * FirebaseProvider manages and provides Firebase services and user authentication state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
}) => {
  const [userAuthState, setUserAuthState] = useState<UserAuthState>({
    user: null,
    isUserLoading: true, // Start loading until first auth event
    userError: null,
    forceRefresh: null,
  });

  // Effect to subscribe to Firebase auth state changes, including token changes
  useEffect(() => {
    if (!auth) { 
      setUserAuthState({ user: null, isUserLoading: false, userError: new Error("Auth service not provided."), forceRefresh: null });
      return;
    }

    setUserAuthState(current => ({ ...current, isUserLoading: true })); 

    const unsubscribe = onIdTokenChanged(
      auth,
      async (firebaseUser) => { 
        if (firebaseUser) {
            const tokenResult = await firebaseUser.getIdTokenResult();
            const userWithClaims: UserWithClaims = {
                ...firebaseUser,
                customClaims: (tokenResult.claims as { admin?: boolean }) ?? {},
            };
            setUserAuthState({ 
              user: userWithClaims, 
              isUserLoading: false, 
              userError: null,
              forceRefresh: () => firebaseUser.getIdToken(true)
            });
        } else {
            setUserAuthState({ user: null, isUserLoading: false, userError: null, forceRefresh: null });
        }
      },
      (error) => {
        console.error("FirebaseProvider: onIdTokenChanged error:", error);
        setUserAuthState({ user: null, isUserLoading: false, userError: error, forceRefresh: null });
      }
    );
    return () => unsubscribe(); // Cleanup
  }, [auth]);

  // Memoize the context value
  const contextValue = useMemo((): FirebaseContextState => {
    const servicesAvailable = !!(firebaseApp && firestore && auth);
    return {
      areServicesAvailable: servicesAvailable,
      firebaseApp: servicesAvailable ? firebaseApp : null,
      firestore: servicesAvailable ? firestore : null,
      auth: servicesAvailable ? auth : null,
      ...userAuthState,
    };
  }, [firebaseApp, firestore, auth, userAuthState]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

/**
 * Hook to access core Firebase services and user authentication state.
 * Throws error if core services are not available or used outside provider.
 */
export const useFirebase = (): FirebaseServicesAndUser => {
  const context = useContext(FirebaseContext);

  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider.');
  }

  if (!context.areServicesAvailable || !context.firebaseApp || !context.firestore || !context.auth) {
    throw new Error('Firebase core services not available. Check FirebaseProvider props.');
  }

  return {
    firebaseApp: context.firebaseApp,
    firestore: context.firestore,
    auth: context.auth,
    user: context.user,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
    forceRefresh: context.forceRefresh,
  };
};

/** Hook to access Firebase Auth instance. */
export const useAuth = (): Auth => {
  const { auth } = useFirebase();
  return auth;
};

/** Hook to access Firestore instance. */
export const useFirestore = (): Firestore => {
  const { firestore } = useFirebase();
  return firestore;
};

/** Hook to access Firebase App instance. */
export const useFirebaseApp = (): FirebaseApp => {
  const { firebaseApp } = useFirebase();
  return firebaseApp;
};

// This is not a hook, so it doesn't use 'use' prefix.
// It's a tagged template literal for memoizing Firestore queries/refs.
export function useMemoFirebase<T>(factory: () => T, deps: React.DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoized = useMemo(factory, deps);
  
  if (typeof memoized === 'object' && memoized !== null) {
    // Add a non-enumerable property to mark it as memoized.
    Object.defineProperty(memoized, '__memo', {
      value: true,
      writable: false,
      enumerable: false,
    });
  }
  
  return memoized;
}

'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// This function initializes and returns the Firebase services.
// It is designed to be called once and only on the client side.
export function initializeFirebase(): {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
} {
  // Check if Firebase has already been initialized.
  if (getApps().length === 0) {
    // Initialize Firebase with the configuration from config.ts.
    initializeApp(firebaseConfig);
  }

  // Get the already initialized app.
  const firebaseApp = getApp();
  const auth = getAuth(firebaseApp);
  const firestore = getFirestore(firebaseApp);

  return { firebaseApp, auth, firestore };
}

// Export all other necessary modules for use in the application.
export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './auth/use-user';
export * from './errors';
export * from './error-emitter';

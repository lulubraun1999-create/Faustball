
'use client';

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Initialize Firebase Admin SDK only if it hasn't been initialized yet
if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const setAdminRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const callerUid = request.auth.uid;
  const { uid: targetUid, role } = request.data;
  
  if (typeof targetUid !== 'string' || typeof role !== 'string' || (role !== 'admin' && role !== 'user')) {
    throw new HttpsError('invalid-argument', 'The function must be called with a valid "uid" and "role" argument.');
  }

  // A user can make themselves an admin for the first time.
  // In a production app, you might want a more secure way to bootstrap the first admin.
  // Subsequent admin assignments must be done by an existing admin.
  if (callerUid !== targetUid && request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Only admins can assign roles to other users.');
  }

  try {
    // Set custom user claims on the target user
    await admin.auth().setCustomUserClaims(targetUid, { admin: role === 'admin' });
    
    // Update the user's role in the Firestore 'users' collection
    const userDocRef = admin.firestore().collection('users').doc(targetUid);
    await userDocRef.set({ role: role }, { merge: true });

    return {
      message: `Success! User ${targetUid} has been made an ${role}.`,
    };
  } catch (error: any) {
    console.error('Error setting custom claims and Firestore role:', error);
    throw new HttpsError('internal', error.message, error);
  }
});

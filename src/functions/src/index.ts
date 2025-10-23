
'use client';

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Initialize Firebase Admin SDK only if it hasn't been initialized yet
if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const setAdminRole = onCall(async (request) => {
  // A user can make themselves an admin for the first time.
  // This is a simplified approach for this app's context.
  // In a production app, you might have a more secure way to bootstrap the first admin,
  // or a check like `if (request.auth.token.admin !== true)` to ensure only admins can make others admins.
  
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const targetUid = request.data.uid;
  const role = request.data.role;
  
  if (typeof targetUid !== 'string' || typeof role !== 'string' || role !== 'admin') {
    throw new HttpsError('invalid-argument', 'The function must be called with a valid "uid" and "role" argument.');
  }

  try {
    // Set custom user claims on the target user
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });
    
    // Also update the user's role in the Firestore 'users' collection for consistency in the UI
    const userDocRef = admin.firestore().collection('users').doc(targetUid);
    await userDocRef.set({ role: 'admin' }, { merge: true });

    return {
      message: `Success! User ${targetUid} has been made an admin.`,
    };
  } catch (error: any) {
    console.error('Error setting custom claims and Firestore role:', error);
    throw new HttpsError('internal', 'An internal error occurred while trying to set the admin role.', error.message);
  }
});

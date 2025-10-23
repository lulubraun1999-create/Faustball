
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

  // To-Do: Re-enable this check in a production environment.
  // For development, we allow a user to make themselves an admin.
  // if (request.auth.token.admin !== true) {
  //   throw new HttpsError('permission-denied', 'The function must be called by an admin.');
  // }

  const { uid, role } = request.data;

  if (typeof uid !== 'string' || typeof role !== 'string') {
    console.error('Invalid arguments:', { uid, role });
    throw new HttpsError('invalid-argument', 'The function must be called with a "uid" and "role" argument.');
  }

  try {
    // Set custom user claims
    await admin.auth().setCustomUserClaims(uid, { admin: role === 'admin' });
    
    // Update the user's role in Firestore
    const userDocRef = admin.firestore().collection('users').doc(uid);
    await userDocRef.set({ role: role }, { merge: true });

    return {
      message: `Success! User ${uid} has been made an ${role}.`,
    };
  } catch (error: any) {
    console.error('Error setting custom claims and Firestore role:', error);
    // Return a more detailed error to the client for better debugging
    throw new HttpsError('internal', error.message, error);
  }
});


import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

admin.initializeApp();

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
    throw new HttpsError('invalid-argument', 'The function must be called with a "uid" and "role" argument.');
  }
  
  try {
    // Set the custom claim for Firebase Auth. This is useful for client-side checks
    // that need immediate feedback without a Firestore read, but can be slightly delayed.
    await admin.auth().setCustomUserClaims(uid, { admin: role === 'admin' });

    // Also write the role to the user's document in Firestore.
    // This makes the role immediately available for security rules and is the source of truth.
    const userDocRef = admin.firestore().collection('users').doc(uid);
    await userDocRef.set({ role: role }, { merge: true });
    
    return {
      message: `Success! User ${uid} has been made an ${role}.`,
    };
  } catch (error) {
    console.error('Error setting custom claims and Firestore role:', error);
    throw new HttpsError('internal', 'An internal error occurred while setting the user role.');
  }
});

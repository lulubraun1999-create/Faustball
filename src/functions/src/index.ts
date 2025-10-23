
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Initialize Firebase Admin SDK only if it hasn't been initialized yet
if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const setAdminRole = onCall(async (request) => {
  // A user can make themselves an admin. 
  // In a real-world app, you'd want to secure this. For example:
  // if (request.auth.token.admin !== true) {
  //   throw new HttpsError('permission-denied', 'Only admins can set other admins.');
  // }
  
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
    
    // Also update the user's role in the Firestore 'users' collection for UI consistency
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
    

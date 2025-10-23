
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Initialize Firebase Admin SDK only if it hasn't been initialized yet
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Sets a user's role to 'admin' by adding a custom claim and updating Firestore.
 * In a real-world app, you'd add security checks here to ensure only authorized
 * users can call this function. For this app, any authenticated user can make themselves an admin.
 */
export const setAdminRole = onCall(async (request) => {
  if (!request.auth) {
    // This function must be called by an authenticated user.
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const targetUid = request.data.uid;
  const role = request.data.role;
  
  if (typeof targetUid !== 'string' || typeof role !== 'string' || role !== 'admin') {
    throw new HttpsError('invalid-argument', 'The function must be called with a valid "uid" and "role" argument.');
  }

  try {
    // 1. Set the custom claim on the user's auth token.
    // This is the source of truth for security rules.
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });
    
    // 2. Update the user's document in Firestore for UI consistency.
    // This makes the UI update faster without waiting for a token refresh.
    const userDocRef = admin.firestore().collection('users').doc(targetUid);
    await userDocRef.set({ role: 'admin' }, { merge: true });

    console.log(`Successfully set user ${targetUid} as an admin.`);
    return {
      status: 'success',
      message: `Success! User ${targetUid} has been made an admin.`,
    };
  } catch (error: any) {
    console.error(`Error setting admin role for UID: ${targetUid}`, error);
    throw new HttpsError('internal', 'An internal error occurred while trying to set the admin role.', error.message);
  }
});
    
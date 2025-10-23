
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Initialize Firebase Admin SDK only if it hasn't been initialized yet
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Sets a user's role to 'admin' by adding a custom claim and updating Firestore.
 * This function is the single source of truth for promoting a user to an admin.
 * Any authenticated user can call this to make themselves an admin for demo purposes.
 */
export const setAdminRole = onCall(async (request) => {
  // 1. Check for authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  // 2. Validate input data
  const targetUid = request.data.uid;
  if (typeof targetUid !== 'string') {
    throw new HttpsError('invalid-argument', 'The function must be called with a valid "uid" argument.');
  }
  
  // For this application, any authenticated user can make themselves an admin.
  // In a real-world scenario, you would add a check here to ensure the CALLER is already an admin.
  // For example:
  // if (request.auth.token.admin !== true) {
  //   throw new HttpsError('permission-denied', 'Only an admin can set other users as admins.');
  // }
  
  try {
    // 3. Set the custom claim on the user's auth token.
    // This is the source of truth for secure access via Firestore Security Rules.
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });
    
    // 4. Update the user's document in Firestore for UI consistency.
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
    // Throw a detailed error for easier debugging on the client-side.
    throw new HttpsError('internal', 'An internal error occurred while trying to set the admin role.', error.message);
  }
});
    

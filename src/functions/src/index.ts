
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Initialize Firebase Admin SDK only if it hasn't been initialized yet
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Sets a user's role to 'admin' by adding a custom claim and updating Firestore.
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
  
  // In a real-world scenario, you would add a check here to ensure the CALLER is already an admin.
  // if (request.auth.token.admin !== true) {
  //   throw new HttpsError('permission-denied', 'Only an admin can set other users as admins.');
  // }
  
  try {
    // 3. Set the custom claim on the user's auth token.
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });
    
    // 4. Update the user's document in Firestore for UI consistency.
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

/**
 * Revokes a user's 'admin' role by removing the custom claim and updating Firestore.
 */
export const revokeAdminRole = onCall(async (request) => {
  // 1. Check for authentication and admin privileges of the caller
  if (request.auth?.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Only an admin can revoke admin roles.');
  }

  // 2. Validate input data
  const targetUid = request.data.uid;
  if (typeof targetUid !== 'string') {
    throw new HttpsError('invalid-argument', 'The function must be called with a valid "uid" argument.');
  }

  try {
    // 3. Remove the custom claim by setting it to null or an empty object.
    await admin.auth().setCustomUserClaims(targetUid, { admin: null });
    
    // 4. Update the user's document in Firestore to 'user'.
    const userDocRef = admin.firestore().collection('users').doc(targetUid);
    await userDocRef.set({ role: 'user' }, { merge: true });

    console.log(`Successfully revoked admin role for user ${targetUid}.`);
    return {
      status: 'success',
      message: `Success! User ${targetUid}'s admin role has been revoked.`,
    };
  } catch (error: any) {
    console.error(`Error revoking admin role for UID: ${targetUid}`, error);
    throw new HttpsError('internal', 'An internal error occurred while trying to revoke the admin role.', error.message);
  }
});

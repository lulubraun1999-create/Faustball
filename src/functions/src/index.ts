
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Initialize Firebase Admin SDK only if it hasn't been initialized yet
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Checks if any admin users exist in the system by checking Firestore.
 * This is a callable function that any authenticated user can hit to check
 * if the initial admin setup needs to be performed.
 * @returns {Promise<{isAdminPresent: boolean}>} True if at least one admin exists, false otherwise.
 */
export const anyAdminExists = onCall(async (request) => {
    // This function should be callable by any authenticated user.
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userQuerySnapshot = await admin.firestore().collection('users').where('role', '==', 'admin').limit(1).get();
    return { isAdminPresent: !userQuerySnapshot.empty };
});


/**
 * Sets a user's role to 'admin'.
 * This function has two modes:
 * 1. Initial Bootstrap: If NO admin exists in the system, any authenticated user can call this
 *    function to make themselves the first admin.
 * 2. Admin-only Promotion: If at least one admin already exists, only another admin can call
 *    this function to promote other users.
 */
export const setAdminRole = onCall(async (request) => {
  // 1. Check for authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const callerUid = request.auth.uid;
  const isCallerAdmin = request.auth.token.admin === true;
  const targetUid = request.data?.uid; 

  // 2. Determine which user to make admin
  const uidToPromote = targetUid || callerUid;
  
  // 3. Authorization Logic
  const adminSnapshot = await admin.firestore().collection('users').where('role', '==', 'admin').limit(1).get();
  const adminsExist = !adminSnapshot.empty;

  // Allow if:
  // - The caller is already an admin (and can promote themselves or others).
  // - OR, no admins exist yet AND the user is promoting themselves.
  if (!isCallerAdmin && !(adminsExist === false && uidToPromote === callerUid)) {
      if (adminsExist) {
        throw new HttpsError('permission-denied', 'Only an admin can set other users as admins.');
      } else {
        throw new HttpsError('permission-denied', 'To become the first admin, you must call this function for yourself.');
      }
  }
  
  try {
    // 4. Set the custom claim on the user's auth token.
    await admin.auth().setCustomUserClaims(uidToPromote, { admin: true });
    
    // 5. Update the user's document in Firestore for UI consistency.
    const batch = admin.firestore().batch();
    const userDocRef = admin.firestore().collection('users').doc(uidToPromote);
    const memberDocRef = admin.firestore().collection('members').doc(uidToPromote);

    batch.set(userDocRef, { role: 'admin' }, { merge: true });
    batch.set(memberDocRef, { role: 'admin' }, { merge: true });

    await batch.commit();

    console.log(`Successfully set user ${uidToPromote} as an admin.`);
    return {
      status: 'success',
      message: `Success! User ${uidToPromote} has been made an admin.`,
    };
  } catch (error: any) {
    console.error(`Error setting admin role for UID: ${uidToPromote}`, error);
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
    const batch = admin.firestore().batch();
    const userDocRef = admin.firestore().collection('users').doc(targetUid);
    const memberDocRef = admin.firestore().collection('members').doc(targetUid);
    
    batch.set(userDocRef, { role: 'user' }, { merge: true });
    batch.set(memberDocRef, { role: 'user' }, { merge: true });

    await batch.commit();

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

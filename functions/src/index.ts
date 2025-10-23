import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

admin.initializeApp();

export const setAdminRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const { uid, role } = request.data;

  if (typeof uid !== 'string' || typeof role !== 'string') {
    throw new HttpsError('invalid-argument', 'The function must be called with a "uid" and "role" argument.');
  }

  // Only existing admins can set other admins
  const callingUser = await admin.auth().getUser(request.auth.uid);
  if (callingUser.customClaims?.['admin'] !== true) {
     // Exception: Allow users to make themselves admin if they are the first user or for setup.
     // In a real app, you'd have more robust checks. For this app, we allow self-assignment.
     if (request.auth.uid !== uid) {
        throw new HttpsError('permission-denied', 'Only admins can set roles for other users.');
     }
  }

  try {
    if (role === 'admin') {
      await admin.auth().setCustomUserClaims(uid, { admin: true });
    } else {
      await admin.auth().setCustomUserClaims(uid, { admin: false });
    }
    
    return {
      message: `Success! User ${uid} has been made an ${role}. Please refresh the page for the changes to take effect.`,
    };
  } catch (error) {
    console.error('Error setting custom claims:', error);
    throw new HttpsError('internal', 'An internal error occurred.');
  }
});

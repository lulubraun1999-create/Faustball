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

  // Only existing admins can set other admins (except for self-assignment)
  const callingUserDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const isCallerAdmin = callingUserDoc.data()?.role === 'admin';

  if (!isCallerAdmin && request.auth.uid !== uid) {
    throw new HttpsError('permission-denied', 'Only admins can set roles for other users.');
  }
  
  try {
    // Set the custom claim for Firebase Auth
    if (role === 'admin') {
      await admin.auth().setCustomUserClaims(uid, { admin: true });
    } else {
      await admin.auth().setCustomUserClaims(uid, { admin: false });
    }

    // Also write the role to the user's document in Firestore.
    // This makes the role immediately available for security rules and client-side checks.
    const userDocRef = admin.firestore().collection('users').doc(uid);
    await userDocRef.set({ role: role }, { merge: true });
    
    return {
      message: `Success! User ${uid} has been made an ${role}. Please refresh the page for the changes to take effect.`,
    };
  } catch (error) {
    console.error('Error setting custom claims and Firestore role:', error);
    throw new HttpsError('internal', 'An internal error occurred.');
  }
});

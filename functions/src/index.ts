
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// This function is no longer the primary method for setting admin roles
// due to potential environment/billing issues causing "internal" errors.
// The logic has been moved to the client-side with appropriate Firestore rules.
// This code is left as a reference but is not actively used by the profile page.
if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const setAdminRole = onCall(async (request) => {
  console.log("setAdminRole function was called, but is currently not in active use.");
  
  // Throwing a clear error to indicate that this function should not be used.
  throw new HttpsError(
    'failed-precondition', 
    'This function is deprecated. Admin roles are now set via client-side Firestore writes.'
  );
});

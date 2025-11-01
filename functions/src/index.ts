import * as admin from 'firebase-admin';
// KORREKTUR 1: Tippfehler "httpshttps" entfernt
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https'; 

// KORREKTUR 2: Diese Funktionen (serverTimestamp, getDocs etc.) 
// gehören zum CLIENT-SDK, nicht zum ADMIN-SDK.
// Das Admin-SDK verwendet admin.firestore.FieldValue.serverTimestamp()
// und admin.firestore().collection('...').get()
//
// ENTFERNT: import { serverTimestamp, getDocs, updateDoc, addDoc } from 'firebase-admin/firestore';
// Stattdessen importieren wir FieldValue, falls du es brauchst (obwohl dein Code es aktuell nichtmal nutzt)
import { FieldValue } from 'firebase-admin/firestore';


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
// KORREKTUR 3: 'request' getypt
export const anyAdminExists = onCall(async (request: CallableRequest) => {
    // This function should be callable by any authenticated user.
    if (!request.auth) {
        // Obwohl jeder authentifizierte Benutzer dies aufrufen können sollte,
        // ist es sicherer, hier eine Berechtigungsprüfung hinzuzufügen,
        // falls die Information als sensibel betrachtet wird.
        // Für dieses Beispiel lassen wir es offen für alle authentifizierten Benutzer.
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    try {
        const userQuerySnapshot = await admin.firestore().collection('users').where('role', '==', 'admin').limit(1).get();
        return { isAdminPresent: !userQuerySnapshot.empty };
    } catch (error: any) {
        console.error("Error checking admin existence:", error);
        // Wir geben einen internen Fehler zurück, damit der Client weiß, dass etwas schiefgelaufen ist.
        throw new HttpsError('internal', 'Could not check for admin existence.', error.message);
    }
});


/**
 * Sets a user's role to 'admin'.
 * This function has two modes:
 * 1. Initial Bootstrap: If NO admin exists in the system, any authenticated user can call this
 * function to make themselves the first admin.
 * 2. Admin-only Promotion: If at least one admin already exists, only another admin can call
 * this function to promote other users.
 */
// KORREKTUR 3: 'request' getypt
export const setAdminRole = onCall(async (request: CallableRequest) => {
  // 1. Check for authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const callerUid = request.auth.uid;
  const isCallerAdmin = request.auth.token.admin === true;
  // Akzeptiere eine optionale 'uid' aus den Daten, um andere User zum Admin zu machen.
  // Wenn keine 'uid' übergeben wird, versucht der Aufrufer, sich selbst zum Admin zu machen.
  const targetUid = request.data?.uid;

  // 2. Determine which user to make admin
  const uidToPromote = targetUid || callerUid;

  // 3. Authorization Logic
  let adminsExist = false;
  try {
      const adminSnapshot = await admin.firestore().collection('users').where('role', '==', 'admin').limit(1).get();
      adminsExist = !adminSnapshot.empty;
  } catch (error: any) {
       console.error("Error checking admin existence during setAdminRole:", error);
       throw new HttpsError('internal', 'Could not verify admin existence for promotion.', error.message);
  }


  // Allow if:
  // - The caller is already an admin (and can promote themselves or others).
  // - OR, no admins exist yet AND the user is promoting themselves (targetUid ist leer ODER gleich callerUid).
  if (!isCallerAdmin && !(adminsExist === false && (!targetUid || uidToPromote === callerUid))) {
      if (adminsExist) {
        throw new HttpsError('permission-denied', 'Only an admin can set other users as admins.');
      } else {
        throw new HttpsError('permission-denied', 'To become the first admin, you must call this function for yourself (without providing a uid).');
      }
  }

  try {
    // 4. Set the custom claim on the user's auth token.
    await admin.auth().setCustomUserClaims(uidToPromote, { admin: true });

    // 5. Update the user's document in Firestore for UI consistency.
    const batch = admin.firestore().batch();
    const userDocRef = admin.firestore().collection('users').doc(uidToPromote);
    const memberDocRef = admin.firestore().collection('members').doc(uidToPromote); // Auch im Member-Profil setzen

    // Stelle sicher, dass die Dokumente existieren, bevor du versuchst, sie zu aktualisieren.
    // Verwende set mit merge: true, um das Dokument zu erstellen, falls es fehlt, oder zu aktualisieren, falls es existiert.
    batch.set(userDocRef, { role: 'admin' }, { merge: true });
    batch.set(memberDocRef, { role: 'admin' }, { merge: true }); // Auch im Member-Profil setzen

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
// KORREKTUR 3: 'request' getypt
export const revokeAdminRole = onCall(async (request: CallableRequest) => {
  // 1. Check for authentication and admin privileges of the caller
  if (request.auth?.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Only an admin can revoke admin roles.');
  }

  // 2. Validate input data
  const targetUid = request.data.uid;
  if (typeof targetUid !== 'string' || targetUid.length === 0) { // Prüfe auf leeren String
    throw new HttpsError('invalid-argument', 'The function must be called with a valid "uid" argument.');
  }

  // Sicherheitsprüfung: Verhindere, dass der letzte Admin seine eigenen Rechte entzieht
  if (request.auth.uid === targetUid) {
      const adminSnapshot = await admin.firestore().collection('users').where('role', '==', 'admin').get();
      if (adminSnapshot.size <= 1) {
          throw new HttpsError('failed-precondition', 'Cannot revoke the last admin role.');
      }
  }


  try {
    // 3. Remove the custom claim by setting it to null or an empty object.
    await admin.auth().setCustomUserClaims(targetUid, { admin: null });

    // 4. Update the user's document in Firestore to 'user'.
    const batch = admin.firestore().batch();
    const userDocRef = admin.firestore().collection('users').doc(targetUid);
    const memberDocRef = admin.firestore().collection('members').doc(targetUid); // Auch im Member-Profil

    // Verwende set mit merge: true, falls Dokumente fehlen könnten
    batch.set(userDocRef, { role: 'user' }, { merge: true });
    batch.set(memberDocRef, { role: 'user' }, { merge: true }); // Auch im Member-Profil setzen

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
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

// Firebase Admin SDK initialisieren, falls noch nicht geschehen
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * Setzt die Rolle eines Benutzers auf 'admin', indem ein Custom Claim gesetzt
 * und das Firestore-Dokument aktualisiert wird.
 * Jeder authentifizierte Benutzer kann sich selbst zum Admin machen (für Demo/Entwicklung).
 */
export const setAdminRole = onCall(async (request) => {
  // 1. Prüfen, ob der Aufrufer angemeldet ist
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  // 2. Ziel-UID aus den Daten holen (der Aufrufer macht sich selbst zum Admin)
  const targetUid = request.auth.uid; // Verwende die UID des Anrufers

  // In einer echten App würdest du hier prüfen, ob der *Aufrufer* bereits Admin ist,
  // bevor er andere zu Admins machen darf. Für dieses Beispiel lassen wir das weg.
  // if (request.auth.token.admin !== true) {
  //   throw new HttpsError('permission-denied', 'Only an admin can set other users as admins.');
  // }

  try {
    // 3. Custom Claim im Auth Token setzen
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });

    // 4. Firestore Dokument aktualisieren (für schnellere UI-Updates)
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
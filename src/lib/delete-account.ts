'use client';

import { deleteUser, EmailAuthProvider, reauthenticateWithCredential, User } from 'firebase/auth';
import { Firestore, doc, deleteDoc } from 'firebase/firestore';

/**
 * Löscht Firestore-Daten + Firebase-Auth-User.
 * Wenn eine erneute Anmeldung nötig ist, wird ein spezieller Fehler geworfen.
 */
export async function deleteAccountOnClient(params: {
  authUser: User;
  firestore: Firestore;
  passwordForReauth?: string; // optional – wenn du noch mal das Passwort abfragst
}) {
  const { authUser, firestore, passwordForReauth } = params;

  // 1. Optional: Re-Auth, falls Passwort gegeben
  if (passwordForReauth) {
    const cred = EmailAuthProvider.credential(authUser.email || '', passwordForReauth);
    await reauthenticateWithCredential(authUser, cred);
  }

  // 2. Firestore-Daten löschen (users + members)
  const userId = authUser.uid;

  const userRef = doc(firestore, 'users', userId);
  const memberRef = doc(firestore, 'members', userId);

  await Promise.allSettled([
    deleteDoc(userRef),
    deleteDoc(memberRef),
  ]);

  // 3. Auth-User löschen
  try {
    await deleteUser(authUser);
  } catch (error: any) {
    if (error.code === 'auth/requires-recent-login') {
      const err = new Error('requires-recent-login');
      // @ts-expect-error custom flag
      err.code = 'auth/requires-recent-login';
      throw err;
    }
    throw error;
  }
}

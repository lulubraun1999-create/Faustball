import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, WriteBatch } from 'firebase-admin/firestore'; // Importiere Timestamp und WriteBatch
import type { Appointment, AppointmentException } from './types'; // Importiere deine Typen

// Firebase Admin SDK initialisieren
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();

/**
 * Prüft, ob bereits ein Admin-Benutzer im System existiert.
 */
export const anyAdminExists = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  try {
    const userQuerySnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
    return { isAdminPresent: !userQuerySnapshot.empty };
  } catch (error: any) {
    console.error("Error checking admin existence:", error);
    throw new HttpsError('internal', 'Could not check for admin existence.', error.message);
  }
});

/**
 * Setzt die Rolle eines Benutzers auf 'admin'.
 */
export const setAdminRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const callerUid = request.auth.uid;
  const isCallerAdmin = request.auth.token.admin === true;
  const targetUid = request.data?.uid || callerUid; // Standardmäßig sich selbst

  // Prüfen, ob bereits Admins existieren
  let adminsExist = false;
  try {
      const adminSnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      adminsExist = !adminSnapshot.empty;
  } catch (error: any) {
       console.error("Error checking admin existence during setAdminRole:", error);
       throw new HttpsError('internal', 'Could not verify admin existence for promotion.', error.message);
  }

  // Autorisierung: Erlaube, wenn der Aufrufer Admin ist ODER wenn kein Admin existiert und der Aufrufer sich selbst ernennt.
  if (!isCallerAdmin && !(adminsExist === false && targetUid === callerUid)) {
      throw new HttpsError('permission-denied', 'Only an admin can set other users as admins, or you must be the first user.');
  }

  try {
    // 1. Custom Claim im Auth Token setzen
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });

    // 2. Firestore Dokumente (users und members) aktualisieren
    const batch = db.batch();
    const userDocRef = db.collection('users').doc(targetUid);
    const memberDocRef = db.collection('members').doc(targetUid);
    
    batch.set(userDocRef, { role: 'admin' }, { merge: true });
    batch.set(memberDocRef, { role: 'admin' }, { merge: true });
    
    await batch.commit();

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
 * Entzieht einem Benutzer die 'admin'-Rolle.
 */
export const revokeAdminRole = onCall(async (request) => {
  // ... (Code für revokeAdminRole - stelle sicher, dass er hier ist, falls du ihn brauchst) ...
  if (request.auth?.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Only an admin can revoke admin roles.');
  }
  // ... (restliche Logik für revokeAdminRole)
  return { status: 'success', message: 'Rolle (Logik nicht vollständig implementiert) entfernt.' };
});


// --- TERMIN-FUNKTIONEN (HIER IST DIE KORREKTUR) ---

/**
 * Speichert eine Änderung für EINEN einzelnen Termin einer Serie als Ausnahme.
 */
export const saveSingleAppointmentException = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError('permission-denied', 'Only an admin can perform this action.');
    }
    if (!user) { // user-Variable aus dem Kontext holen (oder request.auth.uid)
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { pendingUpdateData, selectedInstanceToEdit, exceptions } = request.data;
    const userId = request.auth.uid; // ID des Admins, der die Änderung vornimmt

    const originalDate = new Date(pendingUpdateData.originalDateISO);
    const newStartDate = new Date(pendingUpdateData.startDate);
    const newEndDate = pendingUpdateData.endDate ? new Date(pendingUpdateData.endDate) : null;
    const originalDateStartOfDay = new Date(originalDate.setHours(0, 0, 0, 0));

    if (!isDateValid(originalDate) || !isDateValid(newStartDate) || (newEndDate && !isDateValid(newEndDate))) {
        throw new HttpsError('invalid-argument', 'Ungültige Datumsangaben.');
    }

    const exceptionsColRef = db.collection('appointmentExceptions');
    const existingException = exceptions?.find((ex: any) => // any verwenden, da Typen serverseitig anders sein können
        ex.originalAppointmentId === selectedInstanceToEdit.originalId &&
        isEqual(startOfDay(ex.originalDate.toDate()), originalDateStartOfDay)
    );

    const modifiedData: AppointmentException['modifiedData'] = {
        startDate: Timestamp.fromDate(newStartDate),
        endDate: newEndDate ? Timestamp.fromDate(newEndDate) : undefined,
        title: pendingUpdateData.title,
        locationId: pendingUpdateData.locationId,
        description: pendingUpdateData.description,
        meetingPoint: pendingUpdateData.meetingPoint,
        meetingTime: pendingUpdateData.meetingTime,
        isAllDay: pendingUpdateData.isAllDay,
    };

    const exceptionData: Omit<AppointmentException, 'id'> = {
        originalAppointmentId: selectedInstanceToEdit.originalId,
        originalDate: Timestamp.fromDate(originalDateStartOfDay),
        status: 'modified',
        modifiedData: modifiedData,
        createdAt: Timestamp.now(), // serverTimestamp() in .set/add verwenden
        userId: userId,
    };

    try {
        if (existingException) {
            const docRef = db.collection('appointmentExceptions').doc(existingException.id);
            await updateDoc(docRef, { modifiedData: modifiedData, status: 'modified', userId: userId });
            return { status: 'success', message: 'Terminänderung aktualisiert.' };
        } else {
            await addDoc(exceptionsColRef, exceptionData);
            return { status: 'success', message: 'Termin erfolgreich geändert (Ausnahme erstellt).' };
        }
    } catch (error: any) {
        console.error("Error saving single instance:", error);
        throw new HttpsError('internal', 'Änderung konnte nicht gespeichert werden.', error.message);
    }
});

/**
 * Teilt eine Terminserie auf und speichert Änderungen für alle zukünftigen Termine.
 */
export const saveFutureAppointmentInstances = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError('permission-denied', 'Only an admin can perform this action.');
    }
    if (!user) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    
    const { pendingUpdateData, selectedInstanceToEdit, typesMap } = request.data;
    const userId = request.auth.uid;

    try {
      const originalAppointmentRef = db.collection('appointments').doc(selectedInstanceToEdit.originalId);
      const originalAppointmentSnap = await originalAppointmentRef.get();

      if (!originalAppointmentSnap.exists) {
        throw new HttpsError('not-found', 'Original-Terminserie nicht gefunden');
      }

      const originalAppointmentData = originalAppointmentSnap.data() as Appointment;
      const batch = db.batch();

      const instanceDate = new Date(pendingUpdateData.originalDateISO);
      const dayBefore = addDays(instanceDate, -1);
      const originalStartDate = originalAppointmentData.startDate.toDate();
      
      if (dayBefore >= originalStartDate) {
        batch.update(originalAppointmentRef, {
          recurrenceEndDate: Timestamp.fromDate(dayBefore),
        });
      } else {
        batch.delete(originalAppointmentRef);
      }

      const newAppointmentRef = db.collection("appointments").doc(); // Neue ID generieren
      
      const newStartDate = new Date(pendingUpdateData.startDate!);
      const newEndDate = pendingUpdateData.endDate ? new Date(pendingUpdateData.endDate) : undefined;
      
      const typeName = typesMap[originalAppointmentData.appointmentTypeId] || 'Termin'; // typesMap muss übergeben werden
      const isSonstiges = typeName === 'Sonstiges';
      const titleIsDefault = !isSonstiges && originalAppointmentData.title === typeName;
      const originalDisplayTitle = titleIsDefault ? '' : originalAppointmentData.title;
      const finalTitle = pendingUpdateData.title !== originalDisplayTitle 
          ? (pendingUpdateData.title && pendingUpdateData.title.trim() !== '' ? pendingUpdateData.title.trim() : typeName)
          : originalAppointmentData.title;

      // *** HIER IST DIE KORREKTUR (Zeile 127 in deinem Screenshot) ***
      // Wir müssen ...originalAppointmentData verwenden, um alle Felder zu kopieren
      const newAppointmentData: Omit<Appointment, 'id'> = {
        ...originalAppointmentData, // <-- DAS HAT GEFEHLT!
        
        title: finalTitle || 'Termin',
        locationId: pendingUpdateData.locationId ?? originalAppointmentData.locationId,
        description: pendingUpdateData.description ?? originalAppointmentData.description,
        meetingPoint: pendingUpdateData.meetingPoint ?? originalAppointmentData.meetingPoint,
        meetingTime: pendingUpdateData.meetingTime ?? originalAppointmentData.meetingTime,
        isAllDay: pendingUpdateData.isAllDay ?? originalAppointmentData.isAllDay,
        
        startDate: Timestamp.fromDate(newStartDate),
        endDate: newEndDate ? Timestamp.fromDate(newEndDate) : undefined,
            
        recurrenceEndDate: originalAppointmentData.recurrenceEndDate, // Behält das *originale* Enddatum der Serie bei
        
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      };

      batch.set(newAppointmentRef, newAppointmentData);

      // Alte Ausnahmen löschen
      const exceptionsQuery = db.collection('appointmentExceptions')
        .where('originalAppointmentId', '==', selectedInstanceToEdit.originalId)
        .where('originalDate', '>=', Timestamp.fromDate(startOfDay(instanceDate)));
        
      const exceptionsSnap = await getDocs(exceptionsQuery); // getDocs importieren
      exceptionsSnap.forEach((doc) => batch.delete(doc.ref));
      
      await batch.commit();
      return { status: 'success', message: 'Terminserie erfolgreich aufgeteilt und aktualisiert' };

    } catch (error: any) {
        console.error('Error splitting and saving future instances: ', error);
        throw new HttpsError('internal', 'Terminserie konnte nicht aktualisiert werden', error.message);
    }
});
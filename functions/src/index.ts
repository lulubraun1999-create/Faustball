

import * as admin from 'firebase-admin';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, FieldValue, WriteBatch } from 'firebase-admin/firestore';
import type { Appointment, AppointmentException, AppointmentType } from './types'; 
import { addDays, isValid, startOfDay, parseISO } from 'date-fns';


// Firebase Admin SDK initialisieren
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = getFirestore();
const localTimeZone = 'Europe/Berlin';

/**
 * Prüft, ob bereits ein Admin-Benutzer im System existiert.
 */
export const anyAdminExists = onCall(async (request: CallableRequest) => {
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
export const setAdminRole = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const callerUid = request.auth.uid;
  const isCallerAdmin = request.auth.token.admin === true;
  const targetUid = request.data?.uid || callerUid; // Fallback to the caller's UID

  if (typeof targetUid !== 'string' || targetUid.length === 0) {
    throw new HttpsError('invalid-argument', 'The function was called without a valid target UID.');
  }

  let adminsExist = false;
  try {
      const adminSnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      adminsExist = !adminSnapshot.empty;
  } catch (error: any) {
       console.error("Error checking admin existence during setAdminRole:", error);
       throw new HttpsError('internal', 'Could not verify admin existence for promotion.', error.message);
  }

  if (!isCallerAdmin && !(adminsExist === false && targetUid === callerUid)) {
      throw new HttpsError('permission-denied', 'Only an admin can set other users as admins, or you must be the first user.');
  }

  try {
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });

    const batch: WriteBatch = db.batch();
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
export const revokeAdminRole = onCall(async (request: CallableRequest) => {
    if (request.auth?.token.admin !== true) {
        throw new HttpsError('permission-denied', 'Only an admin can revoke admin roles.');
    }

    const targetUid = request.data.uid;
    if (typeof targetUid !== 'string' || targetUid.length === 0) {
        throw new HttpsError('invalid-argument', 'The function must be called with a valid "uid" argument.');
    }

    if (request.auth.uid === targetUid) {
        const adminSnapshot = await db.collection('users').where('role', '==', 'admin').get();
        if (adminSnapshot.size <= 1) {
            throw new HttpsError('failed-precondition', 'Cannot revoke the last admin role.');
        }
    }

    try {
        await admin.auth().setCustomUserClaims(targetUid, { admin: null });
        const batch = db.batch();
        const userDocRef = db.collection('users').doc(targetUid);
        const memberDocRef = db.collection('members').doc(targetUid);
        batch.set(userDocRef, { role: 'user' }, { merge: true });
        batch.set(memberDocRef, { role: 'user' }, { merge: true });
        await batch.commit();

        return { status: 'success', message: `Successfully revoked admin role for user ${targetUid}.` };
    } catch (error: any) {
        console.error(`Error revoking admin role for UID: ${targetUid}`, error);
        throw new HttpsError('internal', 'An internal error occurred while trying to revoke the admin role.', error.message);
    }
});


/**
 * Sendet eine Chat-Nachricht und prüft die Berechtigungen serverseitig.
 */
export const sendMessage = onCall(async (request: CallableRequest) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    
    const { roomId, content } = request.data;
    const userId = request.auth.uid;

    if (!roomId || typeof roomId !== 'string' || !content || typeof content !== 'string') {
        throw new HttpsError('invalid-argument', 'The function must be called with a "roomId" and "content".');
    }

    const isUserAdmin = request.auth.token.admin === true;

    // Berechtigungsprüfung
    let isAllowed = false;
    if (roomId === 'all') {
        isAllowed = true;
    } else if (roomId === 'trainers' && isUserAdmin) {
        isAllowed = true;
    } else if (roomId.startsWith('team_')) {
        try {
            const teamId = roomId.split('team_')[1];
            const memberDoc = await db.collection('members').doc(userId).get();
            if (memberDoc.exists) {
                const memberData = memberDoc.data();
                if (memberData?.teams?.includes(teamId)) {
                    isAllowed = true;
                }
            }
        } catch (error) {
            console.error('Error checking team membership:', error);
            throw new HttpsError('internal', 'Could not verify team membership.');
        }
    }

    if (!isAllowed) {
        throw new HttpsError('permission-denied', 'You do not have permission to send messages to this room.');
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new HttpsError('not-found', 'User profile not found.');
    }
    const userData = userDoc.data();
    const userName = `${userData?.firstName || ''} ${userData?.lastName || ''}`.trim() || 'Unbekannt';

    const messageData = {
        userId: userId,
        userName: userName,
        content: content,
        createdAt: FieldValue.serverTimestamp(),
    };

    try {
        await db.collection('chats').doc(roomId).collection('messages').add(messageData);
        return { status: 'success', message: 'Message sent successfully.' };
    } catch (error) {
        console.error('Error sending message:', error);
        throw new HttpsError('internal', 'An error occurred while sending the message.');
    }
});


// --- TERMIN-FUNKTIONEN (NEU GESCHRIEBEN) ---

/**
 * Speichert eine Änderung für EINEN einzelnen Termin einer Serie als Ausnahme.
 */
export const saveSingleAppointmentException = onCall(async (request: CallableRequest) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError('permission-denied', 'Nur Administratoren können diese Aktion ausführen.');
    }

    const data = request.data;
    const userId = request.auth.uid;

    // Strenge Validierung der Eingabedaten
    if (!data.originalId || !data.originalDateISO || !data.startDate) {
        throw new HttpsError('invalid-argument', 'Fehlende Daten für die Ausnahme (originalId, originalDateISO, startDate).');
    }

    let originalDate: Date, newStartDate: Date, newEndDate: Date | null;
    try {
        originalDate = new Date(data.originalDateISO);
        newStartDate = new Date(data.startDate);
        newEndDate = (data.endDate && typeof data.endDate === 'string' && data.endDate.trim() !== '') 
          ? new Date(data.endDate)
          : null;

        if (!isValid(originalDate) || !isValid(newStartDate) || (newEndDate && !isValid(newEndDate))) {
            throw new Error('Invalid date format provided.');
        }
    } catch (e: any) {
        console.error("Date parsing error:", e);
        throw new HttpsError('invalid-argument', 'Ungültiges Datumsformat übergeben.');
    }

    const originalDateStartOfDay = startOfDay(originalDate);

    const exceptionsColRef = db.collection('appointmentExceptions');
    const q = exceptionsColRef.where('originalAppointmentId', '==', data.originalId)
                              .where('originalDate', '==', Timestamp.fromDate(originalDateStartOfDay));
    try {
        const querySnapshot = await q.get();
        const existingExceptionDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[0] : null;

        // Erstellt das Objekt mit den geänderten Daten, nur die Felder, die übergeben wurden.
        const modifiedData: AppointmentException['modifiedData'] = {
            startDate: Timestamp.fromDate(newStartDate),
            endDate: newEndDate ? Timestamp.fromDate(newEndDate) : null,
            title: data.title,
            locationId: data.locationId,
            description: data.description,
            meetingPoint: data.meetingPoint,
            meetingTime: data.meetingTime,
            isAllDay: data.isAllDay,
        };

        if (existingExceptionDoc) {
            // Update eine bestehende Ausnahme
            const docRefToUpdate = db.collection('appointmentExceptions').doc(existingExceptionDoc.id);
            await docRefToUpdate.update({
                 modifiedData: modifiedData,
                 status: 'modified', // Stellt sicher, dass der Status 'modified' ist
                 userId: userId,
                 lastUpdated: FieldValue.serverTimestamp()
            });
            return { status: 'success', message: 'Terminänderung erfolgreich aktualisiert.' };
        } else {
            // Erstelle eine neue Ausnahme
            const newExceptionData: Omit<AppointmentException, 'id'> = {
                originalAppointmentId: data.originalId,
                originalDate: Timestamp.fromDate(originalDateStartOfDay),
                status: 'modified',
                modifiedData: modifiedData,
                createdAt: FieldValue.serverTimestamp(),
                lastUpdated: FieldValue.serverTimestamp(),
                userId: userId,
            };
            const newDocRef = db.collection('appointmentExceptions').doc();
            await newDocRef.set(newExceptionData);
            return { status: 'success', message: 'Termin erfolgreich als Ausnahme gespeichert.' };
        }
    } catch (error: any) {
        console.error("Error saving single instance exception:", error);
        throw new HttpsError('internal', 'Fehler beim Speichern der Ausnahme.', error.message);
    }
});


/**
 * Teilt eine Terminserie auf und speichert Änderungen für alle zukünftigen Termine.
 */
export const saveFutureAppointmentInstances = onCall(async (request: CallableRequest) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError('permission-denied', 'Nur Administratoren können diese Aktion ausführen.');
    }
    
    const data = request.data;
    const userId = request.auth.uid;

    if (!data.originalId || !data.originalDateISO || !data.startDate) {
        throw new HttpsError('invalid-argument', 'Fehlende Daten zum Aufteilen der Serie.');
    }

    try {
        const originalAppointmentRef = db.collection('appointments').doc(data.originalId);
        const originalAppointmentSnap = await originalAppointmentRef.get();

        if (!originalAppointmentSnap.exists) {
            throw new HttpsError('not-found', 'Original-Terminserie nicht gefunden.');
        }

        const originalAppointmentData = originalAppointmentSnap.data() as Appointment;
        const batch = db.batch();

        // 1. Datum der aktuellen Instanz parsen
        const instanceDate = new Date(data.originalDateISO);
        if(!isValid(instanceDate)) {
             throw new HttpsError('invalid-argument', `Ungültiges Datum der Instanz: ${data.originalDateISO}`);
        }
        
        // 2. Ende der alten Serie setzen
        const dayBefore = addDays(instanceDate, -1);
        const originalStartDate = (originalAppointmentData.startDate as Timestamp).toDate();

        if (dayBefore >= originalStartDate) {
            batch.update(originalAppointmentRef, {
                recurrenceEndDate: Timestamp.fromDate(dayBefore),
                lastUpdated: FieldValue.serverTimestamp()
            });
        } else {
            // Wenn die erste Instanz geändert wird, wird die alte Serie komplett gelöscht
            batch.delete(originalAppointmentRef);
        }
        
        // 3. Neue Serie erstellen
        const newStartDate = new Date(data.startDate);
        const newEndDate = (data.endDate && typeof data.endDate === 'string' && data.endDate.trim() !== '') 
            ? new Date(data.endDate)
            : null;

        if (!isValid(newStartDate) || (newEndDate && !isValid(newEndDate))) {
            throw new HttpsError('invalid-argument', `Ungültiges Start- oder Enddatum für neue Serie.`);
        }
        
        // Titel bestimmen
        let typeName = 'Termin'; 
        if (originalAppointmentData.appointmentTypeId) { 
            const typeDoc = await db.collection('appointmentTypes').doc(originalAppointmentData.appointmentTypeId).get();
            if (typeDoc.exists) {
                typeName = (typeDoc.data() as AppointmentType).name;
            }
        }
        const finalTitle = (data.title && data.title.trim() !== '') ? data.title.trim() : typeName;
        
        const newAppointmentData: Omit<Appointment, 'id'> = {
            ...originalAppointmentData, // Übernimmt alle Felder der alten Serie
            title: finalTitle,
            startDate: Timestamp.fromDate(newStartDate),
            endDate: newEndDate ? Timestamp.fromDate(newEndDate) : null,
            isAllDay: data.isAllDay ?? originalAppointmentData.isAllDay,
            locationId: data.locationId ?? originalAppointmentData.locationId,
            description: data.description ?? originalAppointmentData.description,
            meetingPoint: data.meetingPoint ?? originalAppointmentData.meetingPoint,
            meetingTime: data.meetingTime ?? originalAppointmentData.meetingTime,
            // Wichtige Felder neu setzen
            createdBy: userId,
            createdAt: FieldValue.serverTimestamp(),
            lastUpdated: FieldValue.serverTimestamp(),
        };

        const newAppointmentRef = db.collection("appointments").doc();
        batch.set(newAppointmentRef, newAppointmentData);

        // 4. Alte Ausnahmen löschen, die nun zur neuen Serie gehören
        const instanceStartOfDay = startOfDay(instanceDate);
        const exceptionsQuery = db.collection('appointmentExceptions')
            .where('originalAppointmentId', '==', data.originalId)
            .where('originalDate', '>=', Timestamp.fromDate(instanceStartOfDay));
            
        const exceptionsSnap = await exceptionsQuery.get();
        exceptionsSnap.forEach((doc) => batch.delete(doc.ref));
        
        await batch.commit();
        return { status: 'success', message: 'Terminserie erfolgreich aufgeteilt und aktualisiert.' };

    } catch (error: any) {
        console.error('Error splitting and saving future instances: ', error);
        throw new HttpsError('internal', error.message || 'Terminserie konnte nicht aktualisiert werden.');
    }
});
    

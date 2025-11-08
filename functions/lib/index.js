"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveFutureAppointmentInstances = exports.saveSingleAppointmentException = exports.sendMessage = exports.revokeAdminRole = exports.setAdminRole = exports.anyAdminExists = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const date_fns_1 = require("date-fns");
// Firebase Admin SDK initialisieren
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = (0, firestore_1.getFirestore)();
// KORRIGIERT: 'localTimeZone' entfernt, da es nicht verwendet wird
/**
 * Prüft, ob bereits ein Admin-Benutzer im System existiert.
 */
exports.anyAdminExists = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    try {
        const userQuerySnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
        return { isAdminPresent: !userQuerySnapshot.empty };
    }
    catch (error) {
        console.error("Error checking admin existence:", error);
        throw new https_1.HttpsError('internal', 'Could not check for admin existence.', error.message);
    }
});
/**
 * Setzt die Rolle eines Benutzers auf 'admin'.
 */
exports.setAdminRole = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const callerUid = request.auth.uid;
    const isCallerAdmin = request.auth.token.admin === true;
    const targetUid = ((_a = request.data) === null || _a === void 0 ? void 0 : _a.uid) || callerUid; // Fallback to the caller's UID
    if (typeof targetUid !== 'string' || targetUid.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'The function was called without a valid target UID.');
    }
    let adminsExist = false;
    try {
        const adminSnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
        adminsExist = !adminSnapshot.empty;
    }
    catch (error) {
        console.error("Error checking admin existence during setAdminRole:", error);
        throw new https_1.HttpsError('internal', 'Could not verify admin existence for promotion.', error.message);
    }
    if (!isCallerAdmin && !(adminsExist === false && targetUid === callerUid)) {
        throw new https_1.HttpsError('permission-denied', 'Only an admin can set other users as admins, or you must be the first user.');
    }
    try {
        await admin.auth().setCustomUserClaims(targetUid, { admin: true });
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
    }
    catch (error) {
        console.error(`Error setting admin role for UID: ${targetUid}`, error);
        throw new https_1.HttpsError('internal', 'An internal error occurred while trying to set the admin role.', error.message);
    }
});
/**
 * Entzieht einem Benutzer die 'admin'-Rolle.
 */
exports.revokeAdminRole = (0, https_1.onCall)(async (request) => {
    var _a;
    if (((_a = request.auth) === null || _a === void 0 ? void 0 : _a.token.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Only an admin can revoke admin roles.');
    }
    const targetUid = request.data.uid;
    if (typeof targetUid !== 'string' || targetUid.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'The function must be called with a valid "uid" argument.');
    }
    if (request.auth.uid === targetUid) {
        const adminSnapshot = await db.collection('users').where('role', '==', 'admin').get();
        if (adminSnapshot.size <= 1) {
            throw new https_1.HttpsError('failed-precondition', 'Cannot revoke the last admin role.');
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
    }
    catch (error) {
        console.error(`Error revoking admin role for UID: ${targetUid}`, error);
        throw new https_1.HttpsError('internal', 'An internal error occurred while trying to revoke the admin role.', error.message);
    }
});
/**
 * Sendet eine Chat-Nachricht und prüft die Berechtigungen serverseitig.
 */
exports.sendMessage = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const { roomId, content } = request.data;
    const userId = request.auth.uid;
    if (!roomId || typeof roomId !== 'string' || !content || typeof content !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'The function must be called with a "roomId" and "content".');
    }
    const isUserAdmin = request.auth.token.admin === true;
    // Berechtigungsprüfung
    let isAllowed = false;
    if (roomId === 'all') {
        isAllowed = true;
    }
    else if (roomId === 'trainers' && isUserAdmin) {
        isAllowed = true;
    }
    else if (roomId.startsWith('team_')) {
        try {
            const teamId = roomId.split('team_')[1];
            const memberDoc = await db.collection('members').doc(userId).get();
            if (memberDoc.exists) {
                const memberData = memberDoc.data();
                if ((_a = memberData === null || memberData === void 0 ? void 0 : memberData.teams) === null || _a === void 0 ? void 0 : _a.includes(teamId)) {
                    isAllowed = true;
                }
            }
        }
        catch (error) {
            console.error('Error checking team membership:', error);
            throw new https_1.HttpsError('internal', 'Could not verify team membership.');
        }
    }
    if (!isAllowed) {
        throw new https_1.HttpsError('permission-denied', 'You do not have permission to send messages to this room.');
    }
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new https_1.HttpsError('not-found', 'User profile not found.');
    }
    const userData = userDoc.data();
    const userName = `${(userData === null || userData === void 0 ? void 0 : userData.firstName) || ''} ${(userData === null || userData === void 0 ? void 0 : userData.lastName) || ''}`.trim() || 'Unbekannt';
    const messageData = {
        userId: userId,
        userName: userName,
        content: content,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    };
    try {
        await db.collection('chats').doc(roomId).collection('messages').add(messageData);
        return { status: 'success', message: 'Message sent successfully.' };
    }
    catch (error) {
        console.error('Error sending message:', error);
        throw new https_1.HttpsError('internal', 'An error occurred while sending the message.');
    }
});
// --- TERMIN-FUNKTIONEN (NEU GESCHRIEBEN) ---
/**
 * Speichert eine Änderung für EINEN einzelnen Termin einer Serie als Ausnahme.
 */
exports.saveSingleAppointmentException = (0, https_1.onCall)(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new https_1.HttpsError('permission-denied', 'Nur Administratoren können diese Aktion ausführen.');
    }
    const data = request.data;
    const userId = request.auth.uid;
    // Strenge Validierung der Eingabedaten
    if (!data.originalId || !data.originalDateISO || !data.startDate) {
        throw new https_1.HttpsError('invalid-argument', 'Fehlende Daten für die Ausnahme (originalId, originalDateISO, startDate).');
    }
    let originalDate, newStartDate, newEndDate;
    try {
        originalDate = new Date(data.originalDateISO);
        newStartDate = new Date(data.startDate);
        newEndDate = (data.endDate && typeof data.endDate === 'string' && data.endDate.trim() !== '')
            ? new Date(data.endDate)
            : null;
        if (!(0, date_fns_1.isValid)(originalDate) || !(0, date_fns_1.isValid)(newStartDate) || (newEndDate && !(0, date_fns_1.isValid)(newEndDate))) {
            throw new Error('Invalid date format provided.');
        }
    }
    catch (e) {
        console.error("Date parsing error:", e);
        throw new https_1.HttpsError('invalid-argument', 'Ungültiges Datumsformat übergeben.');
    }
    const originalDateStartOfDay = (0, date_fns_1.startOfDay)(originalDate);
    const exceptionsColRef = db.collection('appointmentExceptions');
    const q = exceptionsColRef.where('originalAppointmentId', '==', data.originalId)
        .where('originalDate', '==', firestore_1.Timestamp.fromDate(originalDateStartOfDay));
    try {
        const querySnapshot = await q.get();
        const existingExceptionDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[0] : null;
        // Erstellt das Objekt mit den geänderten Daten, nur die Felder, die übergeben wurden.
        const modifiedData = {
            startDate: firestore_1.Timestamp.fromDate(newStartDate),
            endDate: newEndDate ? firestore_1.Timestamp.fromDate(newEndDate) : null,
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
                lastUpdated: firestore_1.FieldValue.serverTimestamp()
            });
            return { status: 'success', message: 'Terminänderung erfolgreich aktualisiert.' };
        }
        else {
            // Erstelle eine neue Ausnahme
            const newExceptionData = {
                originalAppointmentId: data.originalId,
                originalDate: firestore_1.Timestamp.fromDate(originalDateStartOfDay),
                status: 'modified',
                modifiedData: modifiedData,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                lastUpdated: firestore_1.FieldValue.serverTimestamp(),
                userId: userId,
            };
            const newDocRef = db.collection('appointmentExceptions').doc();
            await newDocRef.set(newExceptionData);
            return { status: 'success', message: 'Termin erfolgreich als Ausnahme gespeichert.' };
        }
    }
    catch (error) {
        console.error("Error saving single instance exception:", error);
        throw new https_1.HttpsError('internal', 'Fehler beim Speichern der Ausnahme.', error.message);
    }
});
/**
 * Teilt eine Terminserie auf und speichert Änderungen für alle zukünftigen Termine.
 */
exports.saveFutureAppointmentInstances = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!request.auth || !request.auth.token.admin) {
        throw new https_1.HttpsError('permission-denied', 'Nur Administratoren können diese Aktion ausführen.');
    }
    const data = request.data;
    const userId = request.auth.uid;
    if (!data.originalId || !data.originalDateISO || !data.startDate) {
        throw new https_1.HttpsError('invalid-argument', 'Fehlende Daten zum Aufteilen der Serie.');
    }
    try {
        const originalAppointmentRef = db.collection('appointments').doc(data.originalId);
        const originalAppointmentSnap = await originalAppointmentRef.get();
        if (!originalAppointmentSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Original-Terminserie nicht gefunden.');
        }
        const originalAppointmentData = originalAppointmentSnap.data();
        const batch = db.batch();
        // 1. Datum der aktuellen Instanz parsen
        const instanceDate = new Date(data.originalDateISO);
        if (!(0, date_fns_1.isValid)(instanceDate)) {
            throw new https_1.HttpsError('invalid-argument', `Ungültiges Datum der Instanz: ${data.originalDateISO}`);
        }
        // 2. Ende der alten Serie setzen
        const dayBefore = (0, date_fns_1.addDays)(instanceDate, -1);
        const originalStartDate = originalAppointmentData.startDate.toDate();
        if (dayBefore >= originalStartDate) {
            batch.update(originalAppointmentRef, {
                recurrenceEndDate: firestore_1.Timestamp.fromDate(dayBefore),
                lastUpdated: firestore_1.FieldValue.serverTimestamp()
            });
        }
        else {
            // Wenn die erste Instanz geändert wird, wird die alte Serie komplett gelöscht
            batch.delete(originalAppointmentRef);
        }
        // 3. Neue Serie erstellen
        const newStartDate = new Date(data.startDate);
        const newEndDate = (data.endDate && typeof data.endDate === 'string' && data.endDate.trim() !== '')
            ? new Date(data.endDate)
            : null;
        if (!(0, date_fns_1.isValid)(newStartDate) || (newEndDate && !(0, date_fns_1.isValid)(newEndDate))) {
            throw new https_1.HttpsError('invalid-argument', `Ungültiges Start- oder Enddatum für neue Serie.`);
        }
        // Titel bestimmen
        let typeName = 'Termin';
        if (originalAppointmentData.appointmentTypeId) {
            const typeDoc = await db.collection('appointmentTypes').doc(originalAppointmentData.appointmentTypeId).get();
            if (typeDoc.exists) {
                typeName = typeDoc.data().name;
            }
        }
        const finalTitle = (data.title && data.title.trim() !== '') ? data.title.trim() : typeName;
        const newAppointmentData = Object.assign(Object.assign({}, originalAppointmentData), { title: finalTitle, startDate: firestore_1.Timestamp.fromDate(newStartDate), endDate: newEndDate ? firestore_1.Timestamp.fromDate(newEndDate) : null, isAllDay: (_a = data.isAllDay) !== null && _a !== void 0 ? _a : originalAppointmentData.isAllDay, locationId: (_b = data.locationId) !== null && _b !== void 0 ? _b : originalAppointmentData.locationId, description: (_c = data.description) !== null && _c !== void 0 ? _c : originalAppointmentData.description, meetingPoint: (_d = data.meetingPoint) !== null && _d !== void 0 ? _d : originalAppointmentData.meetingPoint, meetingTime: (_e = data.meetingTime) !== null && _e !== void 0 ? _e : originalAppointmentData.meetingTime, 
            // Wichtige Felder neu setzen
            createdBy: userId, createdAt: firestore_1.FieldValue.serverTimestamp(), lastUpdated: firestore_1.FieldValue.serverTimestamp() });
        const newAppointmentRef = db.collection("appointments").doc();
        batch.set(newAppointmentRef, newAppointmentData);
        // 4. Alte Ausnahmen löschen, die nun zur neuen Serie gehören
        const instanceStartOfDay = (0, date_fns_1.startOfDay)(instanceDate);
        const exceptionsQuery = db.collection('appointmentExceptions')
            .where('originalAppointmentId', '==', data.originalId)
            .where('originalDate', '>=', firestore_1.Timestamp.fromDate(instanceStartOfDay));
        const exceptionsSnap = await exceptionsQuery.get();
        exceptionsSnap.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        return { status: 'success', message: 'Terminserie erfolgreich aufgeteilt und aktualisiert.' };
    }
    catch (error) {
        console.error('Error splitting and saving future instances: ', error);
        throw new https_1.HttpsError('internal', error.message || 'Terminserie konnte nicht aktualisiert werden.');
    }
});
//# sourceMappingURL=index.js.map
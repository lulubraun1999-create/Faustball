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
exports.saveFutureAppointmentInstances = exports.saveSingleAppointmentException = exports.revokeAdminRole = exports.setAdminRole = exports.anyAdminExists = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore"); // Importiere Timestamp und WriteBatch
// Firebase Admin SDK initialisieren
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = (0, firestore_1.getFirestore)();
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
    const targetUid = ((_a = request.data) === null || _a === void 0 ? void 0 : _a.uid) || callerUid; // Standardmäßig sich selbst
    // Prüfen, ob bereits Admins existieren
    let adminsExist = false;
    try {
        const adminSnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
        adminsExist = !adminSnapshot.empty;
    }
    catch (error) {
        console.error("Error checking admin existence during setAdminRole:", error);
        throw new https_1.HttpsError('internal', 'Could not verify admin existence for promotion.', error.message);
    }
    // Autorisierung: Erlaube, wenn der Aufrufer Admin ist ODER wenn kein Admin existiert und der Aufrufer sich selbst ernennt.
    if (!isCallerAdmin && !(adminsExist === false && targetUid === callerUid)) {
        throw new https_1.HttpsError('permission-denied', 'Only an admin can set other users as admins, or you must be the first user.');
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
    // ... (Code für revokeAdminRole - stelle sicher, dass er hier ist, falls du ihn brauchst) ...
    if (((_a = request.auth) === null || _a === void 0 ? void 0 : _a.token.admin) !== true) {
        throw new https_1.HttpsError('permission-denied', 'Only an admin can revoke admin roles.');
    }
    // ... (restliche Logik für revokeAdminRole)
    return { status: 'success', message: 'Rolle (Logik nicht vollständig implementiert) entfernt.' };
});
// --- TERMIN-FUNKTIONEN (HIER IST DIE KORREKTUR) ---
/**
 * Speichert eine Änderung für EINEN einzelnen Termin einer Serie als Ausnahme.
 */
exports.saveSingleAppointmentException = (0, https_1.onCall)(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new https_1.HttpsError('permission-denied', 'Only an admin can perform this action.');
    }
    if (!user) { // user-Variable aus dem Kontext holen (oder request.auth.uid)
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { pendingUpdateData, selectedInstanceToEdit, exceptions } = request.data;
    const userId = request.auth.uid; // ID des Admins, der die Änderung vornimmt
    const originalDate = new Date(pendingUpdateData.originalDateISO);
    const newStartDate = new Date(pendingUpdateData.startDate);
    const newEndDate = pendingUpdateData.endDate ? new Date(pendingUpdateData.endDate) : null;
    const originalDateStartOfDay = new Date(originalDate.setHours(0, 0, 0, 0));
    if (!isDateValid(originalDate) || !isDateValid(newStartDate) || (newEndDate && !isDateValid(newEndDate))) {
        throw new https_1.HttpsError('invalid-argument', 'Ungültige Datumsangaben.');
    }
    const exceptionsColRef = db.collection('appointmentExceptions');
    const existingException = exceptions === null || exceptions === void 0 ? void 0 : exceptions.find((ex) => // any verwenden, da Typen serverseitig anders sein können
     ex.originalAppointmentId === selectedInstanceToEdit.originalId &&
        isEqual(startOfDay(ex.originalDate.toDate()), originalDateStartOfDay));
    const modifiedData = {
        startDate: firestore_1.Timestamp.fromDate(newStartDate),
        endDate: newEndDate ? firestore_1.Timestamp.fromDate(newEndDate) : undefined,
        title: pendingUpdateData.title,
        locationId: pendingUpdateData.locationId,
        description: pendingUpdateData.description,
        meetingPoint: pendingUpdateData.meetingPoint,
        meetingTime: pendingUpdateData.meetingTime,
        isAllDay: pendingUpdateData.isAllDay,
    };
    const exceptionData = {
        originalAppointmentId: selectedInstanceToEdit.originalId,
        originalDate: firestore_1.Timestamp.fromDate(originalDateStartOfDay),
        status: 'modified',
        modifiedData: modifiedData,
        createdAt: firestore_1.Timestamp.now(), // serverTimestamp() in .set/add verwenden
        userId: userId,
    };
    try {
        if (existingException) {
            const docRef = db.collection('appointmentExceptions').doc(existingException.id);
            await updateDoc(docRef, { modifiedData: modifiedData, status: 'modified', userId: userId });
            return { status: 'success', message: 'Terminänderung aktualisiert.' };
        }
        else {
            await addDoc(exceptionsColRef, exceptionData);
            return { status: 'success', message: 'Termin erfolgreich geändert (Ausnahme erstellt).' };
        }
    }
    catch (error) {
        console.error("Error saving single instance:", error);
        throw new https_1.HttpsError('internal', 'Änderung konnte nicht gespeichert werden.', error.message);
    }
});
/**
 * Teilt eine Terminserie auf und speichert Änderungen für alle zukünftigen Termine.
 */
exports.saveFutureAppointmentInstances = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    if (!request.auth || !request.auth.token.admin) {
        throw new https_1.HttpsError('permission-denied', 'Only an admin can perform this action.');
    }
    if (!user) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { pendingUpdateData, selectedInstanceToEdit, typesMap } = request.data;
    const userId = request.auth.uid;
    try {
        const originalAppointmentRef = db.collection('appointments').doc(selectedInstanceToEdit.originalId);
        const originalAppointmentSnap = await originalAppointmentRef.get();
        if (!originalAppointmentSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Original-Terminserie nicht gefunden');
        }
        const originalAppointmentData = originalAppointmentSnap.data();
        const batch = db.batch();
        const instanceDate = new Date(pendingUpdateData.originalDateISO);
        const dayBefore = addDays(instanceDate, -1);
        const originalStartDate = originalAppointmentData.startDate.toDate();
        if (dayBefore >= originalStartDate) {
            batch.update(originalAppointmentRef, {
                recurrenceEndDate: firestore_1.Timestamp.fromDate(dayBefore),
            });
        }
        else {
            batch.delete(originalAppointmentRef);
        }
        const newAppointmentRef = db.collection("appointments").doc(); // Neue ID generieren
        const newStartDate = new Date(pendingUpdateData.startDate);
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
        const newAppointmentData = Object.assign(Object.assign({}, originalAppointmentData), { title: finalTitle || 'Termin', locationId: (_a = pendingUpdateData.locationId) !== null && _a !== void 0 ? _a : originalAppointmentData.locationId, description: (_b = pendingUpdateData.description) !== null && _b !== void 0 ? _b : originalAppointmentData.description, meetingPoint: (_c = pendingUpdateData.meetingPoint) !== null && _c !== void 0 ? _c : originalAppointmentData.meetingPoint, meetingTime: (_d = pendingUpdateData.meetingTime) !== null && _d !== void 0 ? _d : originalAppointmentData.meetingTime, isAllDay: (_e = pendingUpdateData.isAllDay) !== null && _e !== void 0 ? _e : originalAppointmentData.isAllDay, startDate: firestore_1.Timestamp.fromDate(newStartDate), endDate: newEndDate ? firestore_1.Timestamp.fromDate(newEndDate) : undefined, recurrenceEndDate: originalAppointmentData.recurrenceEndDate, createdAt: serverTimestamp(), lastUpdated: serverTimestamp() });
        batch.set(newAppointmentRef, newAppointmentData);
        // Alte Ausnahmen löschen
        const exceptionsQuery = db.collection('appointmentExceptions')
            .where('originalAppointmentId', '==', selectedInstanceToEdit.originalId)
            .where('originalDate', '>=', firestore_1.Timestamp.fromDate(startOfDay(instanceDate)));
        const exceptionsSnap = await getDocs(exceptionsQuery); // getDocs importieren
        exceptionsSnap.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        return { status: 'success', message: 'Terminserie erfolgreich aufgeteilt und aktualisiert' };
    }
    catch (error) {
        console.error('Error splitting and saving future instances: ', error);
        throw new https_1.HttpsError('internal', 'Terminserie konnte nicht aktualisiert werden', error.message);
    }
});
//# sourceMappingURL=index.js.map
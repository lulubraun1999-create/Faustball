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
exports.setAdminRole = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
// Firebase Admin SDK initialisieren, falls noch nicht geschehen
if (admin.apps.length === 0) {
    admin.initializeApp();
}
/**
 * Setzt die Rolle eines Benutzers auf 'admin', indem ein Custom Claim gesetzt
 * und das Firestore-Dokument aktualisiert wird.
 * Jeder authentifizierte Benutzer kann sich selbst zum Admin machen (für Demo/Entwicklung).
 */
exports.setAdminRole = (0, https_1.onCall)(async (request) => {
    // 1. Prüfen, ob der Aufrufer angemeldet ist
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'The function must be called while authenticated.');
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
    }
    catch (error) {
        console.error(`Error setting admin role for UID: ${targetUid}`, error);
        throw new https_1.HttpsError('internal', 'An internal error occurred while trying to set the admin role.', error.message);
    }
});
//# sourceMappingURL=index.js.map

'use client';

import dynamic from 'next/dynamic';

// Sage Next.js: Lade diese Komponente dynamisch
// und schalte Server-Side Rendering (ssr) dafür AUS.
const Kalender = dynamic(
    () => import('./KalenderComponent'), // Pfad zu unserer neuen Datei
    { 
        ssr: false, // DAS IST DER SCHLÜSSEL!
        loading: () => <p>Kalender wird geladen...</p> // Optional: Lade-Text
    }
);

// Die Seite selbst ist jetzt sehr simpel
export default function KalenderSeite() {
    return (
        <div>
            {/* Der Kalender wird jetzt erst im Browser geladen und hier eingefügt */}
            <Kalender />
        </div>
    );
}

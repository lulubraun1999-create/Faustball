"use client";

// Notwendige Imports beibehalten oder hinzufügen
import { useUser, useFirestore, useMemoFirebase, useDoc } from "@/firebase";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { doc, getDoc, writeBatch } from "firebase/firestore";
import type { UserProfile, MemberProfile } from "@/lib/types";

// ❗ useCollection wird nicht mehr benötigt, wenn es nur für 'users' war
// import { useCollection } from "@/firebase/firestore/use-collection";

export function MainLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  // useUser liefert authUser (Firebase Auth) und userProfile (/users/{uid} Daten)
  const { user: authUser, userProfile, isUserLoading: isAuthLoading } = useUser();
  const router = useRouter();
  const firestore = useFirestore();
  const [isCheckingFirstLogin, setIsCheckingFirstLogin] = useState(true);

  // --- KEIN useCollection('users') Aufruf mehr ---

  // Lade optional das Member-Profil (/members/{uid} Daten)
  const memberDocRef = useMemoFirebase(() => {
     if (!firestore || !authUser) return null;
     return doc(firestore, 'members', authUser.uid);
  }, [firestore, authUser]);
  const { data: memberProfile, isLoading: isMemberLoading } = useDoc<MemberProfile>(memberDocRef);


  useEffect(() => {
    // Wenn Auth noch lädt, warte ab
    if (isAuthLoading) {
      return;
    }

    // Wenn kein Benutzer angemeldet ist, leite zum Login weiter
    if (!authUser) {
      router.replace("/login");
      return;
    }

    // Wenn Firestore noch nicht bereit ist (sollte nicht passieren, aber sicher ist sicher)
    if (!firestore) {
      setIsCheckingFirstLogin(false);
      return;
    }

    // Funktion zur Sicherstellung der Profilkonsistenz (User- und Member-Dokument)
    const ensureProfileConsistency = async () => {
      const userDocRef = doc(firestore, "users", authUser.uid);
      const memberDocRef = doc(firestore, "members", authUser.uid);

      try {
        const userDocSnap = await getDoc(userDocRef);
        const memberDocSnap = await getDoc(memberDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as UserProfile;
          const batch = writeBatch(firestore);
          let writeNeeded = false;

          // Heile fehlendes Member-Dokument
          if (!memberDocSnap.exists()) {
            console.log("Member document missing for user. Creating it now.", authUser.uid);
            const newMemberData: MemberProfile = {
              userId: authUser.uid,
              firstName: userData.firstName,
              lastName: userData.lastName,
              email: userData.email,
              teams: [], // Standardwert für Teams
              // Initialisiere optionale Felder, um undefined zu vermeiden
              phone: '',
              location: '',
              position: [],
              birthday: '',
              gender: undefined,
            };
            batch.set(memberDocRef, newMemberData);
            writeNeeded = true;
          }

          // Markiere ersten Login als abgeschlossen, falls nötig
          if (userData.firstLoginComplete === false) {
              batch.update(userDocRef, { firstLoginComplete: true });
              writeNeeded = true;
          }

          // Führe Batch-Schreibvorgang aus, wenn Änderungen nötig waren
          if (writeNeeded) {
            console.log("Committing batch write for profile consistency.");
            await batch.commit();
          }

        } else {
            // Dies sollte nach der Registrierung nicht passieren, aber logge eine Warnung
            console.warn("User document does not exist for authenticated user:", authUser.uid);
        }
      } catch (error) {
        console.error("Error ensuring profile consistency:", error);
      } finally {
        // Setze den Ladezustand für die Konsistenzprüfung zurück
        setIsCheckingFirstLogin(false);
      }
    };

    // Führe die Konsistenzprüfung aus
    ensureProfileConsistency();

  // Abhängigkeiten des useEffect-Hooks
  }, [authUser, isAuthLoading, router, firestore]);

  // Gesamtladezustand: Auth lädt ODER Konsistenzprüfung läuft ODER Member-Profil lädt (falls Benutzer vorhanden)
  const isLoading = isAuthLoading || isCheckingFirstLogin || (authUser != null && isMemberLoading);

  // Zeige Ladeindikator, solange Daten geladen werden
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Wenn alles geladen ist und der Benutzer authentifiziert ist, rendere die Kinderkomponenten
  return <main className="flex-1">{children}</main>;
}
"use client";

import { useState, useMemo } from "react";
import { useUser } from "@/firebase/auth/use-user";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";
import { db } from "@/firebase";
import {
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  Appointment,
  AppointmentType,
  Group,
  MemberProfile,
} from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

type UserResponseStatus = "zugesagt" | "abgesagt" | "unsicher";

export default function VerwaltungTerminePage() {
  const auth = useUser();
  const { toast } = useToast();

  // State für Filter
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");

  // State für Absage-Dialog
  const [isAbsageDialogOpen, setIsAbsageDialogOpen] = useState(false);
  const [currentAbsageAppId, setCurrentAbsageAppId] = useState<string | null>(
    null,
  );
  const [absageGrund, setAbsageGrund] = useState("");

  // Daten abrufen
  const { data: profile, loading: profileLoading } =
    useDoc<MemberProfile | null>(
      auth.user ? `memberProfiles/${auth.user.uid}` : null,
    );
  const { data: appointments, loading: appointmentsLoading } =
    useCollection<Appointment>("appointments");
  const { data: appointmentTypes, loading: typesLoading } =
    useCollection<AppointmentType>("appointmentTypes");
  const { data: groups, loading: groupsLoading } =
    useCollection<Group>("groups");

  // Ladezustand
  const isLoading =
    auth.loading ||
    profileLoading ||
    appointmentsLoading ||
    typesLoading ||
    groupsLoading;

  // Teams für Filter extrahieren
  const teams = useMemo(
    () => groups.filter((g) => g.type === "team"),
    [groups],
  );

  // Helper-Funktion: Prüft, ob der Benutzer auf einen Termin antworten darf
  const isUserRelevantForAppointment = (
    app: Appointment,
    userProfile: MemberProfile | null,
  ): boolean => {
    if (!userProfile) return false;
    if (app.visibility.scope === "all") return true;
    if (!app.visibility.teamIds || !userProfile.teams) return false;

    // Prüft, ob es eine Überschneidung zwischen den Teams des Termins und den Teams des Benutzers gibt
    return app.visibility.teamIds.some((teamId) =>
      userProfile.teams?.includes(teamId),
    );
  };

  // Gefilterte Termine
  const filteredAppointments = useMemo(() => {
    return appointments
      .filter((app) => {
        // Nach Typ filtern
        if (selectedType !== "all" && app.appointmentTypeId !== selectedType) {
          return false;
        }
        // Nach Team filtern
        if (selectedTeam !== "all") {
          const isVisibleToAll = app.visibility.scope === "all";
          const isVisibleToTeam =
            app.visibility.teamIds?.includes(selectedTeam) ?? false;
          if (!isVisibleToAll && !isVisibleToTeam) {
            return false;
          }
        }
        return true;
      })
      .sort(
        (a, b) =>
          (a.date as Timestamp).toMillis() - (b.date as Timestamp).toMillis(),
      );
  }, [appointments, selectedType, selectedTeam]);

  // Handler für Zusage / Unsicher
  const handleResponse = async (
    appointmentId: string,
    status: UserResponseStatus,
  ) => {
    if (!auth.user) return;
    const docRef = doc(db, "appointments", appointmentId);
    try {
      await updateDoc(docRef, {
        [`responses.${auth.user.uid}`]: {
          status: status,
          userId: auth.user.uid,
          timestamp: serverTimestamp(),
          reason: status === "abgesagt" ? absageGrund : "", // Grund speichern oder löschen
        },
      });
      toast({
        title: "Antwort gespeichert",
        description: `Deine Antwort (${status}) wurde gespeichert.`,
      });
    } catch (error) {
      console.error("Fehler beim Speichern der Antwort:", error);
      toast({
        title: "Fehler",
        description: "Antwort konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  };

  // Handler für Klick auf "Absage"
  const handleAbsageClick = (appointmentId: string) => {
    setCurrentAbsageAppId(appointmentId);
    setAbsageGrund(""); // Grund zurücksetzen
    setIsAbsageDialogOpen(true);
  };

  // Handler für Bestätigung im Absage-Dialog
  const handleAbsageSubmit = async () => {
    if (!absageGrund) {
      toast({
        title: "Grund erforderlich",
        description: "Bitte gib einen Grund für die Absage an.",
        variant: "destructive",
      });
      return;
    }
    if (currentAbsageAppId) {
      await handleResponse(currentAbsageAppId, "abgesagt");
    }
    setIsAbsageDialogOpen(false);
    setCurrentAbsageAppId(null);
  };

  // Helper zum Nachschlagen von Namen
  const getTypeName = (typeId: string) =>
    appointmentTypes.find((t) => t.id === typeId)?.name ?? "Unbekannt";

  // Formatiert Datum und Uhrzeit
  const formatDateTime = (timestamp: Timestamp) => {
    if (!timestamp) return "Kein Datum";
    return timestamp.toDate().toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Termin Verwaltung</CardTitle>
          <CardDescription>
            Hier kannst du alle anstehenden Termine einsehen und deine Teilnahme
            bestätigen oder absagen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row mb-4">
            {/* Filter: Art */}
            <Select
              value={selectedType}
              onValueChange={setSelectedType}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Nach Art filtern..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Arten</SelectItem>
                {appointmentTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filter: Mannschaft */}
            <Select
              value={selectedTeam}
              onValueChange={setSelectedTeam}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Nach Mannschaft filtern..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Mannschaften</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Termin-Tabelle */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titel</TableHead>
                  <TableHead>Datum & Uhrzeit</TableHead>
                  <TableHead>Art</TableHead>
                  <TableHead>Ort</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  // Skeleton-Loading-Ansicht
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Skeleton className="h-8 w-48 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredAppointments.length > 0 ? (
                  // Geladene Termine
                  filteredAppointments.map((app) => {
                    const canRespond = isUserRelevantForAppointment(app, profile);
                    const userStatus =
                      auth.user && app.responses?.[auth.user.uid]?.status;

                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">
                          {app.title}
                        </TableCell>
                        <TableCell>
                          {formatDateTime(app.date as Timestamp)} Uhr
                        </TableCell>
                        <TableCell>{getTypeName(app.appointmentTypeId)}</TableCell>
                        <TableCell>{app.location}</TableCell>
                        <TableCell className="text-right">
                          {canRespond && auth.user ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant={
                                  userStatus === "zugesagt"
                                    ? "default"
                                    : "outline"
                                }
                                onClick={() =>
                                  handleResponse(app.id, "zugesagt")
                                }
                              >
                                Zusage
                              </Button>
                              <Button
                                size="sm"
                                variant={
                                  userStatus === "unsicher"
                                    ? "secondary"
                                    : "outline"
                                }
                                onClick={() =>
                                  handleResponse(app.id, "unsicher")
                                }
                              >
                                Unsicher
                              </Button>
                              <Button
                                size="sm"
                                variant={
                                  userStatus === "abgesagt"
                                    ? "destructive"
                                    : "outline"
                                }
                                onClick={() => handleAbsageClick(app.id)}
                              >
                                Absage
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Nicht relevant
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  // Keine Termine gefunden
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      Keine Termine gefunden, die den Filtern entsprechen.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Absage-Dialog */}
      <AlertDialog
        open={isAbsageDialogOpen}
        onOpenChange={setIsAbsageDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grund für Absage</AlertDialogTitle>
            <AlertDialogDescription>
              Bitte gib einen kurzen Grund für deine Absage an. Dies ist für die
              Trainer wichtig.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="absage-grund">Grund</Label>
            <Textarea
              id="absage-grund"
              placeholder="z.B. Krank, Arbeit, ..."
              value={absageGrund}
              onChange={(e) => setAbsageGrund(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleAbsageSubmit}>
              Absage bestätigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
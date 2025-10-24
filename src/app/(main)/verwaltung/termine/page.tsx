
"use client";

import { useState, useMemo } from "react";
import { useUser } from "@/firebase/auth/use-user";
import { useCollection } from "@/firebase/firestore/use-collection";
import { useDoc } from "@/firebase/firestore/use-doc";
import { useFirestore } from "@/firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import {
  Appointment,
  AppointmentType,
  Group,
  Location,
  MemberProfile,
  AppointmentResponse,
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
import { useMemoFirebase } from "@/firebase/provider";
import { collection } from "firebase/firestore";
import { differenceInMilliseconds, addDays, addWeeks, addMonths, format as formatDate } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


type UserResponseStatus = "zugesagt" | "abgesagt" | "unsicher";

type UnrolledAppointment = Appointment & {
  instanceDate: Date; // The specific date of this virtual instance
  instanceId: string; // A unique ID for this virtual instance
};


export default function VerwaltungTerminePage() {
  const auth = useUser();
  const { toast } = useToast();
  const firestore = useFirestore();

  // State für Filter
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");

  // State für Absage-Dialog
  const [isAbsageDialogOpen, setIsAbsageDialogOpen] = useState(false);
  const [currentAbsageApp, setCurrentAbsageApp] = useState<UnrolledAppointment | null>(null);
  const [absageGrund, setAbsageGrund] = useState("");

  // Daten abrufen
  const memberProfileRef = useMemoFirebase(
      () => (auth.user ? doc(firestore, 'members', auth.user.uid) : null),
      [firestore, auth.user]
  );
  const { data: profile, isLoading: profileLoading } = useDoc<MemberProfile | null>(memberProfileRef);
  
  const appointmentsRef = useMemoFirebase(
      () => collection(firestore, 'appointments'),
      [firestore]
  );
  const { data: appointments, isLoading: appointmentsLoading } = useCollection<Appointment>(appointmentsRef);
  
  const responsesRef = useMemoFirebase(
      () => auth.user ? query(collection(firestore, 'appointmentResponses'), where('userId', '==', auth.user.uid)) : null,
      [firestore, auth.user]
  );
  const { data: responses, isLoading: responsesLoading } = useCollection<AppointmentResponse>(responsesRef);

  const responsesMap = useMemo(() => {
    const map = new Map<string, AppointmentResponse>();
    responses?.forEach(res => {
      // Key by appointmentId and date string
      map.set(`${res.appointmentId}_${res.date}`, res);
    });
    return map;
  }, [responses]);


  const appointmentTypesRef = useMemoFirebase(
      () => collection(firestore, 'appointmentTypes'),
      [firestore]
  );
  const { data: appointmentTypes, isLoading: typesLoading } = useCollection<AppointmentType>(appointmentTypesRef);

  const groupsRef = useMemoFirebase(
      () => collection(firestore, 'groups'),
      [firestore]
  );
  const { data: groups, isLoading: groupsLoading } = useCollection<Group>(groupsRef);
  
  const locationsRef = useMemoFirebase(
      () => collection(firestore, 'locations'),
      [firestore]
  );
  const { data: locations, isLoading: locationsLoading } = useCollection<Location>(locationsRef);


  // Ladezustand
  const isLoading =
    auth.isUserLoading ||
    profileLoading ||
    appointmentsLoading ||
    typesLoading ||
    groupsLoading ||
    locationsLoading ||
    responsesLoading;

  // Teams für Filter extrahieren
  const { teams, teamsMap } = useMemo(() => {
      const allGroups = groups || [];
      const teams = allGroups.filter((g: Group) => g.type === 'team');
      const teamsMap = new Map(teams.map((t: Group) => [t.id, t.name]));
      return { teams, teamsMap };
  }, [groups]);
  
  // Locations-Map
   const locationsMap = useMemo(() => {
    const map = new Map<string, Location>();
    locations?.forEach((loc) => map.set(loc.id, loc));
    return map;
  }, [locations]);

  // Entrollte Termine (inkl. Wiederholungen)
  const unrolledAppointments = useMemo(() => {
    if (!appointments) return [];
    const allEvents: UnrolledAppointment[] = [];
    const now = new Date();
  
    appointments.forEach(app => {
      if (!app.startDate) return;

      const unroll = (currentDate: Date) => {
        if (currentDate >= now) {
          const newStartDate = Timestamp.fromMillis(currentDate.getTime());
          const instanceId = `${app.id}_${formatDate(currentDate, 'yyyy-MM-dd')}`;
          
          allEvents.push({
            ...app,
            startDate: newStartDate,
            instanceDate: currentDate,
            instanceId: instanceId,
          });
        }
      };

      if (!app.recurrence || app.recurrence === 'none' || !app.recurrenceEndDate) {
        unroll(app.startDate.toDate());
      } else {
        let currentDate = app.startDate.toDate();
        const recurrenceEndDate = addDays(app.recurrenceEndDate.toDate(), 1);
        
        let iter = 0;
        const MAX_ITERATIONS = 365;
  
        while (currentDate < recurrenceEndDate && iter < MAX_ITERATIONS) {
          unroll(currentDate);
          
          switch (app.recurrence) {
            case 'daily': currentDate = addDays(currentDate, 1); break;
            case 'weekly': currentDate = addWeeks(currentDate, 1); break;
            case 'bi-weekly': currentDate = addWeeks(currentDate, 2); break;
            case 'monthly': currentDate = addMonths(currentDate, 1); break;
            default: currentDate = addDays(recurrenceEndDate, 1); break;
          }
          iter++;
        }
      }
    });
    return allEvents;
  }, [appointments]);


  // Helper-Funktion: Prüft, ob der Benutzer auf einen Termin antworten darf
  const isUserRelevantForAppointment = (
    app: Appointment,
    userProfile: MemberProfile | null,
  ): boolean => {
    if (!userProfile) return false;
    if (app.visibility.type === "all") return true;
    if (!app.visibility.teamIds || !userProfile.teams) return false;

    // Prüft, ob es eine Überschneidung zwischen den Teams des Termins und den Teams des Benutzers gibt
    return app.visibility.teamIds.some((teamId) =>
      userProfile.teams?.includes(teamId),
    );
  };

  // Gefilterte Termine
  const filteredAppointments = useMemo(() => {
    return unrolledAppointments
      .filter((app) => {
        // Nach Typ filtern
        if (selectedType !== "all" && app.appointmentTypeId !== selectedType) {
          return false;
        }
        // Nach Team filtern
        if (selectedTeam !== "all") {
          const isVisibleToAll = app.visibility.type === "all";
          const isVisibleToTeam =
            app.visibility.teamIds?.includes(selectedTeam) ?? false;
          if (!isVisibleToAll && !isVisibleToTeam) {
            return false;
          }
        }
        // Nur relevante Termine für den Benutzer anzeigen
        if (!isUserRelevantForAppointment(app, profile)) {
          return false;
        }

        return true;
      })
      .sort(
        (a, b) =>
          (a.startDate as Timestamp).toMillis() -
          (b.startDate as Timestamp).toMillis(),
      );
  }, [unrolledAppointments, selectedType, selectedTeam, profile]);

  const setResponse = async (
    appointment: UnrolledAppointment,
    newStatus: UserResponseStatus,
    reason = ""
  ) => {
    if (!auth.user || !firestore) return;
    const dateString = formatDate(appointment.instanceDate, 'yyyy-MM-dd');
    const responseId = `${appointment.id}_${auth.user.uid}_${dateString}`;
    const docRef = doc(firestore, 'appointmentResponses', responseId);

    const responseData: AppointmentResponse = {
      id: responseId,
      appointmentId: appointment.id,
      userId: auth.user.uid,
      date: dateString,
      status: newStatus,
      reason: reason,
      timestamp: serverTimestamp() as Timestamp,
    };

    try {
      await setDoc(docRef, responseData);
      toast({
        title: 'Antwort gespeichert',
        description: `Deine Antwort (${newStatus}) wurde gespeichert.`,
      });
    } catch (error) {
      console.error('Fehler beim Speichern der Antwort:', error);
      toast({
        title: 'Fehler',
        description: 'Antwort konnte nicht gespeichert werden.',
        variant: 'destructive',
      });
    }
  };

  const deleteResponse = async (appointment: UnrolledAppointment) => {
      if (!auth.user || !firestore) return;
      const dateString = formatDate(appointment.instanceDate, 'yyyy-MM-dd');
      const responseId = `${appointment.id}_${auth.user.uid}_${dateString}`;
      const docRef = doc(firestore, 'appointmentResponses', responseId);

      // Check if the document exists before trying to delete
      const existingResponse = responsesMap.get(`${appointment.id}_${dateString}`);
      if (!existingResponse) return; // Nothing to delete

      try {
          await deleteDoc(docRef);
          toast({
              title: 'Antwort entfernt',
              description: 'Deine Teilnahme-Info wurde zurückgesetzt.',
          });
      } catch (error) {
          console.error('Fehler beim Entfernen der Antwort:', error);
          toast({
              title: 'Fehler',
              description: 'Antwort konnte nicht entfernt werden.',
              variant: 'destructive',
          });
      }
  };


  const handleSimpleResponse = async (
    appointment: UnrolledAppointment,
    newStatus: "zugesagt" | "unsicher",
    currentStatus: UserResponseStatus | undefined,
  ) => {
     if (newStatus === currentStatus) {
      await deleteResponse(appointment);
    } else {
      await setResponse(appointment, newStatus);
    }
  };

  // Handler für Klick auf "Absage"
  const handleAbsageClick = (appointment: UnrolledAppointment) => {
    setCurrentAbsageApp(appointment);
    setAbsageGrund("");
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
    if (!currentAbsageApp) return;

    await setResponse(currentAbsageApp, "abgesagt", absageGrund);
    
    // Dialog aufräumen
    setIsAbsageDialogOpen(false);
    setCurrentAbsageApp(null);
    setAbsageGrund("");
  };

  // Helper zum Nachschlagen von Namen
  const getTypeName = (typeId: string) =>
    appointmentTypes?.find((t) => t.id === typeId)?.name ?? "Unbekannt";

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
      <TooltipProvider>
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
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
                  {appointmentTypes?.map((type) => (
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
                    <TableHead>Ort</TableHead>
                    <TableHead>Sichtbar für</TableHead>
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
                          <Skeleton className="h-5 w-24" />
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
                      
                      const dateString = formatDate(app.instanceDate, 'yyyy-MM-dd');
                      const userResponse = responsesMap.get(`${app.id}_${dateString}`);
                      const userStatus = userResponse?.status;


                      const location = app.locationId ? locationsMap.get(app.locationId) : null;
                      const teamNames = app.visibility.type === 'all'
                        ? 'Alle'
                        : app.visibility.teamIds.map(id => teamsMap.get(id) || 'Unbekannt').join(', ');

                      const typeName = getTypeName(app.appointmentTypeId);
                      const isSonstiges = typeName === 'Sonstiges';
                      const titleIsDefault = !isSonstiges && app.title === typeName;
                      const showTitle = app.title && (!titleIsDefault || isSonstiges);
                      const displayTitle = showTitle ? `${typeName} (${app.title})` : typeName;

                      return (
                        <TableRow key={app.instanceId}>
                          <TableCell className="font-medium">
                            {displayTitle}
                          </TableCell>
                          <TableCell>
                            {formatDateTime(app.startDate as Timestamp)} Uhr
                          </TableCell>
                          <TableCell>
                            {location ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="underline decoration-dotted cursor-help">{location.name}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{location.address || 'Keine Adresse hinterlegt'}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{teamNames}</TableCell>
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
                                    handleSimpleResponse(
                                      app,
                                      "zugesagt",
                                      userStatus,
                                    )
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
                                    handleSimpleResponse(
                                      app,
                                      "unsicher",
                                      userStatus,
                                    )
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
                                  onClick={() => handleAbsageClick(app)}
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
        </div>
      </TooltipProvider>

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

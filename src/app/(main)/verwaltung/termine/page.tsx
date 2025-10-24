
"use client";

import { useState, useMemo } from "react";
import {
  useUser,
  useCollection,
  useDoc,
  useFirestore,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
} from "@/firebase";
import {
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  collection,
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
import { Calendar, Loader2 } from "lucide-react";
import { format, isPast } from "date-fns";
import { de } from "date-fns/locale";

type UserResponseStatus = "zugesagt" | "abgesagt" | "unsicher";

export default function VerwaltungTerminePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [showPast, setShowPast] = useState(false);

  const [isAbsageDialogOpen, setIsAbsageDialogOpen] = useState(false);
  const [currentAbsageAppId, setCurrentAbsageAppId] = useState<string | null>(
    null,
  );
  const [absageGrund, setAbsageGrund] = useState("");

  // Data fetching
  const profileRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, "members", user.uid) : null),
    [firestore, user],
  );
  const { data: profile, isLoading: profileLoading } =
    useDoc<MemberProfile>(profileRef);
    
  const appointmentsRef = useMemoFirebase(
      () => (firestore ? collection(firestore, 'appointments') : null),
      [firestore]
  );
  const { data: appointments, isLoading: appointmentsLoading } = useCollection<Appointment>(appointmentsRef);

  const typesRef = useMemoFirebase(
      () => (firestore ? collection(firestore, 'appointmentTypes') : null),
      [firestore]
  );
  const { data: appointmentTypes, isLoading: typesLoading } = useCollection<AppointmentType>(typesRef);
  
  const groupsRef = useMemoFirebase(
      () => (firestore ? collection(firestore, 'groups') : null),
      [firestore]
  );
  const { data: groups, isLoading: groupsLoading } = useCollection<Group>(groupsRef);


  const isLoading =
    isUserLoading ||
    profileLoading ||
    appointmentsLoading ||
    typesLoading ||
    groupsLoading;

  const teams = useMemo(
    () => groups?.filter((g) => g.type === "team").sort((a, b) => a.name.localeCompare(b.name)) || [],
    [groups],
  );

  const isUserRelevantForAppointment = (
    app: Appointment,
    userProfile: MemberProfile | null,
  ): boolean => {
    if (!userProfile) return false;
    if (app.visibility.type === "all") return true;
    if (!app.visibility.teamIds || !userProfile.teams) return false;
    return app.visibility.teamIds.some((teamId) =>
      userProfile.teams?.includes(teamId),
    );
  };

  const filteredAppointments = useMemo(() => {
    if (!appointments || !profile) return [];
    
    const now = new Date();

    return appointments
      .filter((app) => isUserRelevantForAppointment(app, profile))
      .filter((app) => {
        const appointmentDate = (app.startDate as Timestamp).toDate();
        if (showPast) {
            return isPast(appointmentDate);
        }
        return !isPast(appointmentDate);
      })
      .filter((app) => {
        if (selectedType !== "all" && app.appointmentTypeId !== selectedType) {
          return false;
        }
        if (selectedTeam !== "all") {
          const isVisibleToAll = app.visibility.type === "all";
          const isVisibleToTeam =
            app.visibility.teamIds?.includes(selectedTeam) ?? false;
          if (!isVisibleToAll && !isVisibleToTeam) {
            return false;
          }
        }
        return true;
      })
      .sort(
        (a, b) => {
            const dateA = (a.startDate as Timestamp).toMillis();
            const dateB = (b.startDate as Timestamp).toMillis();
            return showPast ? dateB - dateA : dateA - dateB;
        }
      );
  }, [appointments, selectedType, selectedTeam, profile, showPast]);

  const handleResponse = async (
    appointmentId: string,
    status: UserResponseStatus,
  ) => {
    if (!user || !firestore) return;
    const docRef = doc(firestore, "appointments", appointmentId);
    
    const currentAppointment = appointments?.find(a => a.id === appointmentId);
    if (!currentAppointment) return;

    const existingResponse = currentAppointment.responses?.[user.uid];

    const newResponse = {
        status: status,
        userId: user.uid,
        timestamp: serverTimestamp(),
        reason: status === "abgesagt" ? absageGrund : "",
    };

    updateDoc(docRef, {
        [`responses.${user.uid}`]: newResponse,
    }).then(() => {
         toast({
            title: "Antwort gespeichert",
            description: `Deine Antwort (${status}) wurde gespeichert.`,
        });
    }).catch(error => {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: { [`responses.${user.uid}`]: newResponse }
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const handleAbsageClick = (appointmentId: string) => {
    setCurrentAbsageAppId(appointmentId);
    const existingReason = appointments?.find(a => a.id === appointmentId)?.responses?.[user?.uid ?? '']?.reason;
    setAbsageGrund(existingReason || "");
    setIsAbsageDialogOpen(true);
  };

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

  const getTypeName = (typeId: string) =>
    appointmentTypes?.find((t) => t.id === typeId)?.name ?? "Unbekannt";

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
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-primary" />
              <span className="text-2xl font-headline">Deine Termine</span>
            </CardTitle>
            <div className="flex items-center gap-2">
                 <Button variant={showPast ? "secondary" : "outline"} onClick={() => setShowPast(false)}>Anstehend</Button>
                 <Button variant={!showPast ? "secondary" : "outline"} onClick={() => setShowPast(true)}>Vergangen</Button>
            </div>
          </div>
          <CardDescription>
            Hier kannst du alle für dich relevanten Termine einsehen und deine Teilnahme
            bestätigen oder absagen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row mb-4">
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
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell> <Skeleton className="h-5 w-32" /> </TableCell>
                      <TableCell> <Skeleton className="h-5 w-28" /> </TableCell>
                      <TableCell> <Skeleton className="h-5 w-20" /> </TableCell>
                      <TableCell> <Skeleton className="h-5 w-24" /> </TableCell>
                      <TableCell className="text-right"> <Skeleton className="h-8 w-48 ml-auto" /> </TableCell>
                    </TableRow>
                  ))
                ) : filteredAppointments.length > 0 ? (
                  filteredAppointments.map((app) => {
                    const userStatus =
                      user && app.responses?.[user.uid]?.status;

                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">
                          {app.title}
                        </TableCell>
                        <TableCell>
                          {formatDateTime(app.startDate as Timestamp)} Uhr
                        </TableCell>
                        <TableCell>{getTypeName(app.appointmentTypeId)}</TableCell>
                        <TableCell>{app.locationId}</TableCell>
                        <TableCell className="text-right">
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
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24">
                      Keine {showPast ? 'vergangenen' : 'anstehenden'} Termine gefunden, die den Filtern entsprechen.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}

    

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
  collection,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { addDays, addMonths, addWeeks, format as formatDate } from "date-fns";
import { de } from 'date-fns/locale';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Users } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
  
  const appointmentsRef = useMemoFirebase(() => {
    if (!firestore || !profile || !profile.teams || profile.teams.length === 0) return null;

    return query(
        collection(firestore, 'appointments'),
        where('visibility.teamIds', 'array-contains-any', profile.teams)
    );
  }, [firestore, profile]);
  const { data: teamAppointments, isLoading: appointmentsLoading } = useCollection<Appointment>(appointmentsRef);
  
  const allPublicAppointmentsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
         collection(firestore, 'appointments'),
         where('visibility.type', '==', 'all')
     );
  }, [firestore]);
  const { data: publicAppointments, isLoading: publicAppointmentsLoading } = useCollection<Appointment>(allPublicAppointmentsQuery);

  const appointments = useMemo(() => {
    const all = [...(teamAppointments || []), ...(publicAppointments || [])];
    return Array.from(new Map(all.map(app => [app.id, app])).values());
  }, [teamAppointments, publicAppointments]);


  const allMembersRef = useMemoFirebase(
    () => collection(firestore, 'members'),
    [firestore]
  );
  const { data: allMembers, isLoading: membersLoading } = useCollection<MemberProfile>(allMembersRef);

  const allResponsesRef = useMemoFirebase(
      () => collection(firestore, 'appointmentResponses'),
      [firestore]
  );
  const { data: allResponses, isLoading: allResponsesLoading } = useCollection<AppointmentResponse>(allResponsesRef);

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
    publicAppointmentsLoading ||
    typesLoading ||
    groupsLoading ||
    locationsLoading ||
    allResponsesLoading ||
    membersLoading;

  // Teams für Filter extrahieren, nur die, in denen der User Mitglied ist
  const { userTeams, teamsMap } = useMemo(() => {
    const allGroups = groups || [];
    const teamsMap = new Map(allGroups.filter(g => g.type === 'team').map((t: Group) => [t.id, t.name]));
    
    if (!profile || !profile.teams) {
        return { userTeams: [], teamsMap };
    }

    const userTeamIds = new Set(profile.teams);
    const userTeams = allGroups.filter(g => g.type === 'team' && userTeamIds.has(g.id))
                               .sort((a, b) => a.name.localeCompare(b.name));

    return { userTeams, teamsMap };
  }, [groups, profile]);
  
  
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
  
    appointments.forEach(app => {
      if (!app.startDate) return;

      const unroll = (currentDate: Date) => {
        const instanceId = `${app.id}_${formatDate(currentDate, 'yyyy-MM-dd')}`;
        
        allEvents.push({
          ...app,
          startDate: Timestamp.fromDate(currentDate),
          instanceDate: currentDate,
          instanceId: instanceId,
        });
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
    return allEvents.filter(event => event.instanceDate >= new Date());
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

  const groupedAppointments = useMemo(() => {
    const groups: Record<string, UnrolledAppointment[]> = {};
    filteredAppointments.forEach(app => {
      const monthYear = formatDate(app.instanceDate, 'MMMM yyyy', { locale: de });
      if (!groups[monthYear]) {
        groups[monthYear] = [];
      }
      groups[monthYear].push(app);
    });
    return groups;
  }, [filteredAppointments]);

  const setResponse = async (
    appointment: UnrolledAppointment,
    newStatus: UserResponseStatus,
    reason = ""
  ) => {
    if (!auth.user || !firestore) return;
    const dateString = formatDate(appointment.instanceDate, 'yyyy-MM-dd');
    const responseId = `${appointment.id}_${dateString}_${auth.user.uid}`;
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
      await setDoc(docRef, responseData, { merge: true });
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
      const responseId = `${appointment.id}_${dateString}_${auth.user.uid}`;
      const docRef = doc(firestore, 'appointmentResponses', responseId);

      const existingResponse = allResponses?.find(r => r.id === responseId);
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
    const dateString = formatDate(appointment.instanceDate, 'yyyy-MM-dd');
    const userResponse = allResponses?.find(r => r.id === `${appointment.id}_${dateString}_${auth.user?.uid}`);
    setCurrentAbsageApp(appointment);
    setAbsageGrund(userResponse?.reason || "");
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
    const formatDateTime = (app: UnrolledAppointment) => {
    if (!app.startDate) return "Kein Datum";
    const start = app.instanceDate; // Use the specific instance date
    const originalStart = app.startDate.toDate();

    // Preserve the original time
    start.setHours(originalStart.getHours());
    start.setMinutes(originalStart.getMinutes());
    start.setSeconds(originalStart.getSeconds());

    const end = app.endDate ? app.endDate.toDate() : undefined;
    if (end) {
        // if end date exists, we need to calculate the duration and add it to the instance date
        const duration = end.getTime() - originalStart.getTime();
        end.setTime(start.getTime() + duration);
    }


    const dateFormat = "dd.MM.yyyy";
    const timeFormat = "HH:mm";
    
    let datePart = formatDate(start, dateFormat, { locale: de });
    
    if (app.isAllDay) {
        if (end) {
             const endDatePart = formatDate(end, dateFormat, { locale: de });
             if (datePart !== endDatePart) {
                 return `${datePart} - ${endDatePart}`;
             }
        }
        return datePart;
    }
    
    let timePart = `${formatDate(start, timeFormat, { locale: de })}`;
    if (end) {
        timePart += ` - ${formatDate(end, timeFormat, { locale: de })}`;
    }
    
    return `${datePart} ${timePart} Uhr`;
};

  const accordionDefaultValue = Object.keys(groupedAppointments).length > 0 ? [Object.keys(groupedAppointments)[0]] : [];

  return (
    <>
      <TooltipProvider>
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Termine</CardTitle>
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
                disabled={isLoading || userTeams.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nach Mannschaft filtern..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle meine Mannschaften</SelectItem>
                  {userTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
                // Skeleton-Loading-Ansicht
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                    ))}
                </div>
            ) : Object.keys(groupedAppointments).length > 0 ? (
                <Accordion type="multiple" defaultValue={accordionDefaultValue} className="w-full">
                {Object.entries(groupedAppointments).map(([monthYear, appointmentsInMonth]) => (
                    <AccordionItem value={monthYear} key={monthYear}>
                        <AccordionTrigger className="text-lg font-semibold">
                            {monthYear} ({appointmentsInMonth.length})
                        </AccordionTrigger>
                        <AccordionContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                    <TableRow>
                                        <TableHead>Titel</TableHead>
                                        <TableHead>Datum & Uhrzeit</TableHead>
                                        <TableHead>Mannschaft</TableHead>
                                        <TableHead>Ort</TableHead>
                                        <TableHead>Rückmeldung bis</TableHead>
                                        <TableHead>Teilnehmer</TableHead>
                                        <TableHead className="text-right">Aktionen</TableHead>
                                    </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {appointmentsInMonth.map((app) => {
                                        const canRespond = isUserRelevantForAppointment(app, profile);
                                        const dateString = formatDate(app.instanceDate, 'yyyy-MM-dd');
                                        const userResponse = allResponses?.find(r => r.id === `${app.id}_${dateString}_${auth.user?.uid}`);

                                        const userStatus = userResponse?.status;
                                        const location = app.locationId ? locationsMap.get(app.locationId) : null;
                                        const typeName = getTypeName(app.appointmentTypeId);
                                        const isSonstiges = typeName === 'Sonstiges';
                                        const titleIsDefault = !isSonstiges && app.title === typeName;
                                        const showTitle = app.title && (!titleIsDefault || isSonstiges);
                                        const displayTitle = showTitle ? `${typeName} (${app.title})` : typeName;
                                        const originalAppointment = appointments?.find(a => a.id === app.id);
                                        let rsvpDeadlineString = '-';
                                        if (originalAppointment?.startDate && originalAppointment?.rsvpDeadline) {
                                            const startMillis = originalAppointment.startDate.toMillis();
                                            const rsvpMillis = originalAppointment.rsvpDeadline.toMillis();
                                            const offset = startMillis - rsvpMillis;
                                            const instanceStartMillis = app.instanceDate.getTime();
                                            const instanceRsvpMillis = instanceStartMillis - offset;
                                            rsvpDeadlineString = formatDate(new Date(instanceRsvpMillis), 'dd.MM.yy HH:mm');
                                        }

                                        return (
                                            <TableRow key={app.instanceId}>
                                            <TableCell className="font-medium">
                                                {displayTitle}
                                            </TableCell>
                                            <TableCell>
                                                {formatDateTime(app)}
                                            </TableCell>
                                            <TableCell>
                                                {app.visibility.type === 'all' 
                                                ? 'Alle' 
                                                : app.visibility.teamIds.map(id => teamsMap.get(id) || id).join(', ')}
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
                                            <TableCell>{rsvpDeadlineString}</TableCell>
                                            <TableCell>
                                                <ResponseStatus
                                                appointment={app}
                                                allMembers={allMembers || []}
                                                allResponses={allResponses || []}
                                                groups={groups || []}
                                                />
                                            </TableCell>
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
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
                </Accordion>
            ) : (
                <div className="text-center py-10">
                    Keine Termine gefunden, die den Filtern entsprechen.
                </div>
            )}
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

// Sub-component to display response status and details
interface ResponseStatusProps {
  appointment: UnrolledAppointment;
  allMembers: MemberProfile[];
  allResponses: AppointmentResponse[];
  groups: Group[];
}

const ResponseStatus: React.FC<ResponseStatusProps> = ({ appointment, allMembers, allResponses, groups }) => {
  const { relevantMembers, accepted, rejected, unsure, pending } = useMemo(() => {
    const relevantMemberIds = new Set<string>();
    const visibility = appointment.visibility;

    if (visibility.type === 'all') {
      allMembers.forEach(m => relevantMemberIds.add(m.userId));
    } else {
      visibility.teamIds.forEach(teamId => {
        allMembers.forEach(member => {
          if (member.teams?.includes(teamId)) {
            relevantMemberIds.add(member.userId);
          }
        });
      });
    }

    const relevantMembers = Array.from(relevantMemberIds).map(id => allMembers.find(m => m.userId === id)).filter(Boolean) as MemberProfile[];
    const dateString = formatDate(appointment.instanceDate, 'yyyy-MM-dd');
    const responsesForInstance = allResponses.filter(r => r.appointmentId === appointment.id && r.date === dateString);

    const accepted = responsesForInstance.filter(r => r.status === 'zugesagt');
    const rejected = responsesForInstance.filter(r => r.status === 'abgesagt');
    const unsure = responsesForInstance.filter(r => r.status === 'unsicher');

    const respondedUserIds = new Set(responsesForInstance.map(r => r.userId));
    const pending = relevantMembers.filter(m => !respondedUserIds.has(m.userId));

    return { relevantMembers, accepted, rejected, unsure, pending };
  }, [appointment, allMembers, allResponses]);
  
  const membersMap = useMemo(() => new Map(allMembers.map(m => [m.userId, m])), [allMembers]);


  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="h-auto p-0">
          <Users className="mr-2 h-4 w-4" />
          {accepted.length} / {relevantMembers.length}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Teilnehmerliste</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
        <div className="space-y-4 p-4">
          <div>
            <h3 className="font-semibold text-green-600 mb-2">Zusagen ({accepted.length})</h3>
            <ul className="list-disc pl-5 text-sm">
              {accepted.map(r => (
                <li key={r.userId}>{membersMap.get(r.userId)?.firstName} {membersMap.get(r.userId)?.lastName}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-destructive mb-2">Absagen ({rejected.length})</h3>
            <ul className="list-disc pl-5 text-sm">
                {rejected.map(r => (
                    <li key={r.userId}>
                        {membersMap.get(r.userId)?.firstName} {membersMap.get(r.userId)?.lastName}
                        {r.reason && <span className="text-muted-foreground italic"> - "{r.reason}"</span>}
                    </li>
                ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-yellow-600 mb-2">Unsicher ({unsure.length})</h3>
            <ul className="list-disc pl-5 text-sm">
              {unsure.map(r => (
                <li key={r.userId}>{membersMap.get(r.userId)?.firstName} {membersMap.get(r.userId)?.lastName}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-muted-foreground mb-2">Ausstehend ({pending.length})</h3>
            <ul className="list-disc pl-5 text-sm">
              {pending.map(m => (
                <li key={m.userId}>{m.firstName} {m.lastName}</li>
              ))}
            </ul>
          </div>
        </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

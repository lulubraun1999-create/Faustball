'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
  useUser,
  useDoc
} from '@/firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Edit, Trash2, ListTodo, Loader2, Plus, Filter, MapPin, CalendarPlus, CalendarX, X } from 'lucide-react';
import type { Appointment, AppointmentType, Location, Group, AppointmentException } from '@/lib/types';
import { format, formatISO, isValid as isDateValid, addDays, addWeeks, addMonths, differenceInMilliseconds, set, isEqual, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Typen (wie zuvor)
type GroupWithTeams = Group & { teams: Group[] };
type UnrolledAppointment = Appointment & {
  virtualId: string;
  originalId: string;
  originalDateISO?: string;
  isException?: boolean;
  isCancelled?: boolean;
};

// --- Zod Schemas (wie zuvor) ---
const locationSchema = z.object({ name: z.string().min(1), address: z.string().optional() });
type LocationFormValues = z.infer<typeof locationSchema>;
const appointmentTypeSchema = z.object({ name: z.string().min(1) });
type AppointmentTypeFormValues = z.infer<typeof appointmentTypeSchema>;
const singleAppointmentInstanceSchema = z.object({ /* ... wie zuvor ... */ });
type SingleAppointmentInstanceFormValues = z.infer<typeof singleAppointmentInstanceSchema>;
const useAppointmentSchema = (appointmentTypes: AppointmentType[] | null) => { /* ... wie zuvor ... */ };
type AppointmentFormValues = z.infer<ReturnType<typeof useAppointmentSchema>>;


function AdminTerminePageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user } = useUser();

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedInstanceToEdit, setSelectedInstanceToEdit] = useState<UnrolledAppointment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [isInstanceDialogOpen, setIsInstanceDialogOpen] = useState(false);
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);

  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // --- Daten holen (wie zuvor) ---
  const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);
  const exceptionsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentExceptions') : null), [firestore]);
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);
  const typesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentTypes') : null), [firestore]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(typesRef);
  const locationsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'locations') : null), [firestore]);
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsRef);
  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  // Maps (wie zuvor)
  const { typesMap, locationsMap, teams, teamsMap, groupedTeams } = useMemo<{ /*...*/ }>(() => { /*...*/ }, [appointmentTypes, locations, groups]);

  // Formulare (wie zuvor)
  const appointmentSchema = useAppointmentSchema(appointmentTypes);
  const appointmentForm = useForm<AppointmentFormValues>({ resolver: zodResolver(appointmentSchema), defaultValues: { /*...*/ } });
  const locationForm = useForm<LocationFormValues>({ resolver: zodResolver(locationSchema), defaultValues: { name: '', address: '' } });
  const typeForm = useForm<AppointmentTypeFormValues>({ resolver: zodResolver(appointmentTypeSchema), defaultValues: { name: '' } });
  const instanceForm = useForm<SingleAppointmentInstanceFormValues>({ resolver: zodResolver(singleAppointmentInstanceSchema) });

  // Watcher und Konstanten (wie zuvor)
  const watchAppointmentTypeId = appointmentForm.watch('appointmentTypeId');
  const watchVisibilityType = appointmentForm.watch('visibilityType');
  const watchIsAllDay = appointmentForm.watch('isAllDay');
  const watchRecurrence = appointmentForm.watch('recurrence');
  const sonstigeTypeId = useMemo(() => appointmentTypes?.find((t: AppointmentType) => t.name === 'Sonstiges')?.id, [appointmentTypes]);

  // Termine entfalten (wie zuvor)
  const unrolledAppointments = useMemo(() => { /* ... wie zuvor ... */ }, [appointments, exceptions, isLoadingExceptions]);

  // Termine filtern (wie zuvor)
  const filteredAppointments = useMemo(() => { /* ... wie zuvor ... */ }, [unrolledAppointments, teamFilter, typeFilter]);

  // Handler (onSubmitAppointment, onSubmitSingleInstance, handleCancelSingleInstance, handleDeleteAppointment, handleEditAppointment, resetAppointmentForm, onSubmitAppointmentType, onSubmitLocation)
  // sind bis auf eine kleine Korrektur in handleEditAppointment (siehe Kommentar) im Grunde wie zuvor
  const onSubmitAppointment = async (data: AppointmentFormValues) => { /* ... wie zuvor ... */ };
  const onSubmitSingleInstance = async (data: SingleAppointmentInstanceFormValues) => { /* ... wie zuvor ... */ };
  const handleCancelSingleInstance = async (appointment: UnrolledAppointment) => { /* ... wie zuvor ... */ };
  const handleDeleteAppointment = async (id: string) => { /* ... wie zuvor ... */ };

  const handleEditAppointment = (appointment: UnrolledAppointment) => {
    // Wenn es keine 'originalId' hat ODER virtualId == originalId, ist es ein Einmaltermin
    if (!appointment.originalId || appointment.virtualId === appointment.originalId) {
       const originalAppointment = appointments?.find(app => app.id === appointment.id);
       if (!originalAppointment) return;
       setSelectedAppointment(originalAppointment);

       const formatTimestampForInput = (ts: Timestamp | undefined, type: 'datetime' | 'date' = 'datetime') => { if (!ts) return ''; try { const date = ts.toDate(); if (type === 'date') return formatISO(date, { representation: 'date' }); return formatISO(date).slice(0, 16); } catch (e) { return ''; } };
       const startDateString = formatTimestampForInput(originalAppointment.startDate, originalAppointment.isAllDay ? 'date' : 'datetime');
       const endDateString = formatTimestampForInput(originalAppointment.endDate, originalAppointment.isAllDay ? 'date' : 'datetime');
       const rsvpDeadlineString = formatTimestampForInput(originalAppointment.rsvpDeadline, originalAppointment.isAllDay ? 'date' : 'datetime');
       const recurrenceEndDateString = formatTimestampForInput(originalAppointment.recurrenceEndDate, 'date');
       const typeName = typesMap.get(originalAppointment.appointmentTypeId);
       const isSonstiges = typeName === 'Sonstiges';
       const titleIsDefault = !isSonstiges && originalAppointment.title === typeName;
       appointmentForm.reset({
           title: titleIsDefault ? '' : originalAppointment.title,
           appointmentTypeId: originalAppointment.appointmentTypeId,
           startDate: startDateString, endDate: endDateString,
           isAllDay: originalAppointment.isAllDay ?? false,
           recurrence: originalAppointment.recurrence ?? 'none',
           recurrenceEndDate: recurrenceEndDateString,
           visibilityType: originalAppointment.visibility.type,
           visibleTeamIds: originalAppointment.visibility.teamIds,
           rsvpDeadline: rsvpDeadlineString, locationId: originalAppointment.locationId ?? '',
           meetingPoint: originalAppointment.meetingPoint ?? '', meetingTime: originalAppointment.meetingTime ?? '',
           description: originalAppointment.description ?? '',
        });
       setIsAppointmentDialogOpen(true);

    } else {
       setSelectedInstanceToEdit(appointment);
       
       const formatTimestampForInput = (ts: Timestamp | undefined, type: 'datetime' | 'date' = 'datetime') => {/*...*/ if (!ts) return ''; try { const date = ts.toDate(); if (type === 'date') return formatISO(date, { representation: 'date' }); return formatISO(date).slice(0, 16); } catch (e) { return ''; } };
       const startDateString = formatTimestampForInput(appointment.startDate, appointment.isAllDay ? 'date' : 'datetime');
       const endDateString = formatTimestampForInput(appointment.endDate, appointment.isAllDay ? 'date' : 'datetime');
       // *** KORREKTUR/Präzisierung: Originaldatum der Instanz verwenden ***
       const originalDateISOString = startOfDay(appointment.startDate.toDate()).toISOString(); 

       const typeName = typesMap.get(appointment.appointmentTypeId);
       const isSonstiges = typeName === 'Sonstiges';
       const titleIsDefault = !isSonstiges && appointment.title === typeName;
       
       instanceForm.reset({
           originalDateISO: originalDateISOString,
           startDate: startDateString,
           endDate: endDateString,
           title: titleIsDefault ? '' : appointment.title,
           locationId: appointment.locationId ?? '',
           description: appointment.description ?? '',
           meetingPoint: appointment.meetingPoint ?? '',
           meetingTime: appointment.meetingTime ?? '',
       });
       setIsInstanceDialogOpen(true);
    }
  };
  
  const resetAppointmentForm = () => { /* ... wie zuvor ... */ };
  const onSubmitAppointmentType = async (data: AppointmentTypeFormValues) => { /* ... wie zuvor ... */ };
  const onSubmitLocation = async (data: LocationFormValues) => { /* ... wie zuvor ... */ };

  const isLoading = isLoadingAppointments || isLoadingTypes || isLoadingLocations || isLoadingGroups || isLoadingExceptions;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      {/* Dialog für Serien-Bearbeitung / Neuen Termin */}
      <Dialog open={isAppointmentDialogOpen} onOpenChange={(open) => { /* ... */ }}>
          {/* ... Inhalt unverändert ... */}
          {/* Knopf: type="button" onClick={appointmentForm.handleSubmit(onSubmitAppointment)} */}
      </Dialog>
      
      {/* Dialog für Instanz-Bearbeitung */}
      <Dialog open={isInstanceDialogOpen} onOpenChange={(open) => { /* ... */ }}>
           {/* ... Inhalt unverändert ... */}
           {/* Knopf: type="button" onClick={instanceForm.handleSubmit(onSubmitSingleInstance)} */}
      </Dialog>
      
      {/* Dialog für Neuen Typ */}
      <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
           {/* ... Inhalt unverändert ... */}
           {/* Knopf: type="button" onClick={typeForm.handleSubmit(onSubmitAppointmentType)} */}
      </Dialog>

      {/* Dialog für Neuen Ort */}
      <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
          {/* ... Inhalt unverändert ... */}
          {/* Knopf: type="button" onClick={locationForm.handleSubmit(onSubmitLocation)} */}
      </Dialog>


      {/* --- Terminliste --- */}
      <Card>
        <CardHeader>
          {/* ... Titel und Filter unverändert ... */}
        </CardHeader>
        <CardContent>
          {isLoading ? ( <div className="flex justify-center p-12"> <Loader2 className="h-8 w-8 animate-spin text-primary" /> </div> ) : (
            <ScrollArea className="h-[600px] pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Art (Titel)</TableHead>
                  <TableHead>Datum/Zeit</TableHead>
                  <TableHead>Sichtbarkeit</TableHead>
                  <TableHead>Ort</TableHead>
                  <TableHead>Wiederholung</TableHead>
                  <TableHead>Rückmeldung bis</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAppointments.length > 0 ? (
                  filteredAppointments.map((app) => {
                      const typeName = typesMap.get(app.appointmentTypeId) || app.appointmentTypeId;
                      const isSonstiges = typeName === 'Sonstiges';
                      const titleIsDefault = !isSonstiges && app.title === typeName;
                      const showTitle = app.title && (!titleIsDefault || isSonstiges);
                      const displayTitle = showTitle ? `${typeName} (${app.title})` : typeName;
                      const isCancelled = app.isCancelled;
                      
                      return (
                        <TableRow key={app.virtualId} className={cn(isCancelled && "text-muted-foreground line-through opacity-70")}>
                          <TableCell className="font-medium max-w-[200px] truncate">{displayTitle}</TableCell>
                          <TableCell>
                            {app.startDate ? format(app.startDate.toDate(), app.isAllDay ? 'dd.MM.yy' : 'dd.MM.yy HH:mm', { locale: de }) : 'N/A'}
                            {app.endDate && !app.isAllDay && (<> - {format(app.endDate.toDate(), 'HH:mm', { locale: de })}</>)}
                            {app.isAllDay && <span className="text-xs text-muted-foreground"> (Ganztags)</span>}
                             {app.isException && !isCancelled && <span className="ml-1 text-xs text-blue-600">(Geändert)</span>}
                          </TableCell>
                          <TableCell>{app.visibility.type === 'all' ? 'Alle' : (app.visibility.teamIds.map(id => teamsMap.get(id) || id).join(', ') || '-')}</TableCell>
                          <TableCell>{app.locationId ? (locationsMap.get(app.locationId) || '-') : '-'}</TableCell>
                          <TableCell>{app.originalId !== app.virtualId && app.recurrence && app.recurrence !== 'none' ? `Serie bis ${app.recurrenceEndDate ? format(app.recurrenceEndDate.toDate(), 'dd.MM.yy', { locale: de }) : '...'}` : '-'}</TableCell>
                          <TableCell>{app.rsvpDeadline ? format(app.rsvpDeadline.toDate(), 'dd.MM.yy HH:mm', { locale: de }) : '-'}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditAppointment(app)} disabled={isCancelled}>
                               <Edit className="h-4 w-4" />
                               <span className="sr-only">Termin bearbeiten</span>
                            </Button>
                            
                            {/* Nur für Serientermine: Absagen/Rückgängig-Button */}
                            {app.originalId !== app.virtualId && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild><Button variant="ghost" size="icon" disabled={isSubmitting}> {isCancelled ? <X className="h-4 w-4 text-green-600"/> : <CalendarX className="h-4 w-4 text-orange-600" />} <span className="sr-only">{isCancelled ? 'Absage rückgängig' : 'Diesen Termin absagen'}</span></Button></AlertDialogTrigger>
                                  <AlertDialogContent>
                                      <AlertDialogHeader> <AlertDialogTitle>{isCancelled ? 'Absage rückgängig machen?' : 'Nur diesen Termin absagen?'}</AlertDialogTitle> <AlertDialogDescription>{isCancelled ? `Soll der abgesagte Termin am ${format(app.startDate.toDate(), 'dd.MM.yyyy')} wiederhergestellt werden?` : `Möchten Sie nur den Termin am ${format(app.startDate.toDate(), 'dd.MM.yyyy')} absagen? Die Serie bleibt bestehen.`}</AlertDialogDescription> </AlertDialogHeader>
                                      <AlertDialogFooter> <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                      {/* *** KORRIGIERTER onClick-Handler HIER *** */}
                                      <AlertDialogAction onClick={() => handleCancelSingleInstance(app)}>{isCancelled ? 'Wiederherstellen' : 'Absagen'}</AlertDialogAction>
                                      {/* *** ENDE KORREKTUR *** */}
                                  </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                            )}
                            
                             {/* Löschen löscht die Serie */}
                             <AlertDialog>
                               <AlertDialogTrigger asChild><Button variant="ghost" size="icon"> <Trash2 className="h-4 w-4 text-destructive" /> <span className="sr-only">Serie löschen</span></Button></AlertDialogTrigger>
                               <AlertDialogContent>
                                   <AlertDialogHeader> <AlertDialogTitle>Ganze Serie löschen?</AlertDialogTitle> <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden und löscht die gesamte Terminserie "{displayTitle}". Einzelne Änderungen oder Absagen für diese Serie werden ebenfalls entfernt.</AlertDialogDescription> </AlertDialogHeader>
                                   <AlertDialogFooter> <AlertDialogCancel>Abbrechen</AlertDialogCancel> <AlertDialogAction onClick={() => handleDeleteAppointment(app.originalId)} className="bg-destructive hover:bg-destructive/90">Serie löschen</AlertDialogAction> </AlertDialogFooter>
                               </AlertDialogContent>
                             </AlertDialog>
                          </TableCell>
                        </TableRow>
                      )
                  })
                ) : ( <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Keine Termine entsprechen den Filtern.</TableCell></TableRow> )}
              </TableBody>
            </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Wrapper-Komponente für die Admin-Prüfung
export default function AdminTerminePage() {
    const { isAdmin, isUserLoading } = useUser();
    if (isUserLoading) { return ( <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> ); }
    if (!isAdmin) { return ( <div className="container mx-auto p-4 sm:p-6 lg:p-8"><Card className="border-destructive/50"><CardHeader><CardTitle className="flex items-center gap-3 text-destructive"><ListTodo className="h-8 w-8" /><span className="text-2xl font-headline">Zugriff verweigert</span></CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Sie verfügen nicht über die erforderlichen Berechtigungen...</p></CardContent></Card></div> ); }
    return <AdminTerminePageContent />;
}

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
  query
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
import { Edit, Trash2, ListTodo, Loader2, Plus, Filter, MapPin, CalendarPlus } from 'lucide-react';
import type { Appointment, AppointmentType, Location, Group } from '@/lib/types';
import { format, formatISO, isValid as isDateValid } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// --- Zod Schemas ---
const locationSchema = z.object({
    name: z.string().min(1, 'Ortsname ist erforderlich.'),
    address: z.string().optional(),
});
type LocationFormValues = z.infer<typeof locationSchema>;

const useAppointmentSchema = (appointmentTypes: AppointmentType[] | null) => {
    return useMemo(() => {
        const sonstigeTypeId = appointmentTypes?.find(t => t.name === 'Sonstiges')?.id;

        return z.object({
          title: z.string().optional(), 
          appointmentTypeId: z.string().min(1, 'Termin-Typ ist erforderlich.'),
          startDate: z.string().min(1, 'Startdatum/-zeit ist erforderlich.'),
          endDate: z.string().optional(),
          isAllDay: z.boolean().default(false),
          recurrence: z.enum(['none', 'daily', 'weekly', 'bi-weekly', 'monthly']).default('none'),
          visibilityType: z.enum(['all', 'specificTeams']).default('all'),
          visibleTeamIds: z.array(z.string()).default([]),
          rsvpDeadline: z.string().optional(),
          locationId: z.string().optional(),
          meetingPoint: z.string().optional(),
          meetingTime: z.string().optional(),
          description: z.string().optional(),
        })
        .refine(data => !data.endDate || data.endDate >= data.startDate, {
            message: "Enddatum muss nach dem Startdatum liegen.",
            path: ["endDate"],
        })
        .refine(data => data.visibilityType !== 'specificTeams' || data.visibleTeamIds.length > 0, {
            message: "Bitte mindestens eine Mannschaft auswählen.",
            path: ["visibleTeamIds"],
        })
        .superRefine((data, ctx) => {
            if (data.appointmentTypeId === sonstigeTypeId && (!data.title || data.title.trim() === '')) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Titel ist bei Typ "Sonstiges" erforderlich.',
                    path: ['title'],
                });
            }
        });
    }, [appointmentTypes]);
};


type AppointmentFormValues = z.infer<ReturnType<typeof useAppointmentSchema>>;


function AdminTerminePageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);

  // Filter States
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // --- Daten holen ---
  const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);

  const typesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentTypes') : null), [firestore]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(typesRef);

  const locationsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'locations') : null), [firestore]);
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsRef);

  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  // --- Maps für schnellen Zugriff auf Namen ---
  const typesMap = useMemo(() => new Map(appointmentTypes?.map(t => [t.id, t.name])), [appointmentTypes]);
  const locationsMap = useMemo(() => new Map(locations?.map(l => [l.id, l.name])), [locations]);
  const teams = useMemo(() => groups?.filter(g => g.type === 'team').sort((a,b) => a.name.localeCompare(b.name)) || [], [groups]);
  const teamsMap = useMemo(() => new Map(teams.map(t => [t.id, t.name])), [teams]);

  // --- Formulare ---
  const appointmentSchema = useAppointmentSchema(appointmentTypes);
  const appointmentForm = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '', appointmentTypeId: '', startDate: '', endDate: '', isAllDay: false, recurrence: 'none',
      visibilityType: 'all', visibleTeamIds: [], rsvpDeadline: '', locationId: '',
      meetingPoint: '', meetingTime: '', description: '',
    },
  });

  const locationForm = useForm<LocationFormValues>({
      resolver: zodResolver(locationSchema),
      defaultValues: { name: '', address: '' },
  });

  const watchAppointmentTypeId = appointmentForm.watch('appointmentTypeId');
  const watchVisibilityType = appointmentForm.watch('visibilityType');
  const watchIsAllDay = appointmentForm.watch('isAllDay');

  // --- Gefilterte Termine ---
  const filteredAppointments = useMemo(() => {
      if (!appointments) return [];
      return appointments
        .filter(app => {
            const typeMatch = typeFilter === 'all' || app.appointmentTypeId === typeFilter;
            const teamMatch = teamFilter === 'all' || app.visibility.type === 'all' || app.visibility.teamIds.includes(teamFilter);
            return typeMatch && teamMatch;
        })
        .sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis());
  }, [appointments, teamFilter, typeFilter]);


  // --- Handler ---
  const onSubmitAppointment = async (data: AppointmentFormValues) => {
    if (!firestore || !appointmentsRef) return;
    setIsSubmitting(true);

    const selectedTypeName = typesMap.get(data.appointmentTypeId);
    const finalTitle = (selectedTypeName !== 'Sonstiges' && (!data.title || data.title.trim() === ''))
        ? selectedTypeName
        : data.title?.trim();

    const startDate = new Date(data.startDate);
    const endDate = data.endDate ? new Date(data.endDate) : null;
    const rsvpDeadline = data.rsvpDeadline ? new Date(data.rsvpDeadline) : null;

    if (!isDateValid(startDate)) {
         appointmentForm.setError('startDate', { message: 'Ungültiges Startdatum/-zeit Format.' });
         setIsSubmitting(false);
         return;
    }
     if (endDate && !isDateValid(endDate)) {
         appointmentForm.setError('endDate', { message: 'Ungültiges Enddatum/-zeit Format.' });
         setIsSubmitting(false);
         return;
    }
     if (rsvpDeadline && !isDateValid(rsvpDeadline)) {
         appointmentForm.setError('rsvpDeadline', { message: 'Ungültiges Rückmeldedatum/-zeit Format.' });
         setIsSubmitting(false);
         return;
    }


    const startDateTimestamp = Timestamp.fromDate(startDate);
    const endDateTimestamp = endDate ? Timestamp.fromDate(endDate) : null;
    const rsvpDeadlineTimestamp = rsvpDeadline ? Timestamp.fromDate(rsvpDeadline) : null;


    const appointmentData: Omit<Appointment, 'id'> = {
      title: finalTitle || '',
      appointmentTypeId: data.appointmentTypeId,
      startDate: startDateTimestamp,
      ...(endDateTimestamp && { endDate: endDateTimestamp }),
      isAllDay: data.isAllDay,
      recurrence: data.recurrence,
      visibility: {
        type: data.visibilityType,
        teamIds: data.visibilityType === 'specificTeams' ? data.visibleTeamIds : [],
      },
      ...(rsvpDeadlineTimestamp && { rsvpDeadline: rsvpDeadlineTimestamp }),
      ...(data.locationId && { locationId: data.locationId }),
      ...(data.meetingPoint && { meetingPoint: data.meetingPoint }),
      ...(data.meetingTime && { meetingTime: data.meetingTime }),
      ...(data.description && { description: data.description }),
    };

    try {
      if (selectedAppointment) {
        const docRef = doc(firestore, 'appointments', selectedAppointment.id!);
        await updateDoc(docRef, appointmentData);
        toast({ title: 'Termin erfolgreich aktualisiert.' });
      } else {
        await addDoc(appointmentsRef, { ...appointmentData, createdAt: serverTimestamp() });
        toast({ title: 'Neuer Termin erfolgreich erstellt.' });
      }
      resetAppointmentForm();
      setIsAppointmentDialogOpen(false);
    } catch (error: any) {
        const permissionError = new FirestorePermissionError({
            path: selectedAppointment ? `appointments/${selectedAppointment.id}` : 'appointments',
            operation: selectedAppointment ? 'update' : 'create',
            requestResourceData: appointmentData,
        });
        errorEmitter.emit('permission-error', permissionError);
        toast({
            variant: 'destructive', title: 'Fehler',
            description: selectedAppointment ? 'Der Termin konnte nicht aktualisiert werden.' : 'Der Termin konnte nicht erstellt werden.',
        });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
     if (!firestore) return;
      try {
        await deleteDoc(doc(firestore, 'appointments', id));
        toast({ title: 'Termin gelöscht.' });
      } catch (error) {
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({
            path: `appointments/${id}`,
            operation: 'delete',
          })
        );
      }
  };
  const handleEditAppointment = (appointment: Appointment) => {
      setSelectedAppointment(appointment);
      const startDateString = appointment.startDate ? formatISO(appointment.startDate.toDate()).slice(0, 16) : '';
      const endDateString = appointment.endDate ? formatISO(appointment.endDate.toDate()).slice(0, 16) : '';
      const rsvpDeadlineString = appointment.rsvpDeadline ? formatISO(appointment.rsvpDeadline.toDate()).slice(0, 16) : '';
      appointmentForm.reset({
          title: appointment.title, appointmentTypeId: appointment.appointmentTypeId,
          startDate: startDateString, endDate: endDateString, isAllDay: appointment.isAllDay ?? false,
          recurrence: appointment.recurrence ?? 'none', visibilityType: appointment.visibility.type,
          visibleTeamIds: appointment.visibility.teamIds, rsvpDeadline: rsvpDeadlineString,
          locationId: appointment.locationId ?? '', meetingPoint: appointment.meetingPoint ?? '',
          meetingTime: appointment.meetingTime ?? '', description: appointment.description ?? '',
       });
       setIsAppointmentDialogOpen(true);
   };
  const resetAppointmentForm = () => {
       appointmentForm.reset();
       setSelectedAppointment(null);
   };
  const onSubmitLocation = async (data: LocationFormValues) => {
     if (!firestore) return;
      try {
        await addDoc(collection(firestore, 'locations'), data);
        toast({ title: 'Ort erfolgreich erstellt.' });
        setIsLocationDialogOpen(false);
        locationForm.reset();
      } catch (error) {
        errorEmitter.emit(
          'permission-error',
          new FirestorePermissionError({
            path: 'locations',
            operation: 'create',
            requestResourceData: data,
          })
        );
      }
  };

  const isLoading = isLoadingAppointments || isLoadingTypes || isLoadingLocations || isLoadingGroups;

  // Render Logic
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Dialog open={isAppointmentDialogOpen} onOpenChange={(open) => {
          setIsAppointmentDialogOpen(open);
          if (!open) resetAppointmentForm();
      }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
             <DialogHeader>
               <DialogTitle className="flex items-center gap-2">
                 <CalendarPlus className="h-5 w-5"/>
                 {selectedAppointment ? 'Termin bearbeiten' : 'Neuer Termin'}
               </DialogTitle>
               <DialogDescription>
                 {selectedAppointment ? 'Details ändern.' : 'Neuen Termin hinzufügen.'}
               </DialogDescription>
             </DialogHeader>
              <Form {...appointmentForm}>
                <form onSubmit={appointmentForm.handleSubmit(onSubmitAppointment)} className="space-y-4 px-1 py-4">
                  <FormField control={appointmentForm.control} name="appointmentTypeId" render={({ field }) => ( <FormItem><FormLabel>Typ</FormLabel><Select onValueChange={field.onChange} value={field.value}> <FormControl><SelectTrigger><SelectValue placeholder="Typ auswählen..." /></SelectTrigger></FormControl> <SelectContent>{isLoadingTypes ? <SelectItem value="loading" disabled>Lade...</SelectItem> : appointmentTypes?.map(type => (<SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>))}</SelectContent> </Select><FormMessage /></FormItem> )}/>

                  <FormField control={appointmentForm.control} name="title" render={({ field }) => (
                     <FormItem>
                        <FormLabel>Titel {typesMap.get(watchAppointmentTypeId) !== 'Sonstiges' && <span className="text-xs text-muted-foreground">(Optional, Standard: Typ)</span>}</FormLabel>
                        <FormControl><Input placeholder="Titel nur bei 'Sonstiges' nötig..." {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                  )}/>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"> <FormField control={appointmentForm.control} name="startDate" render={({ field }) => ( <FormItem><FormLabel>Beginn</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem> )}/> <FormField control={appointmentForm.control} name="endDate" render={({ field }) => ( <FormItem><FormLabel>Ende (optional)</FormLabel><FormControl><Input type="datetime-local" {...field} disabled={watchIsAllDay} min={appointmentForm.getValues("startDate")} /></FormControl><FormMessage /></FormItem> )}/> </div>

                  <FormField control={appointmentForm.control} name="isAllDay" render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-2"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); if (checked) appointmentForm.setValue("endDate", ""); }} /></FormControl><FormLabel className="font-normal">Ganztägiger Termin</FormLabel></FormItem> )}/>

                  <FormField control={appointmentForm.control} name="recurrence" render={({ field }) => ( <FormItem><FormLabel>Wiederholung</FormLabel><Select onValueChange={field.onChange} value={field.value}> <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl> <SelectContent> <SelectItem value="none">Keine</SelectItem> <SelectItem value="daily">Täglich</SelectItem> <SelectItem value="weekly">Wöchentlich</SelectItem> <SelectItem value="bi-weekly">Alle 2 Wochen</SelectItem> <SelectItem value="monthly">Monatlich</SelectItem> </SelectContent> </Select><FormMessage /></FormItem> )}/>

                  <FormField control={appointmentForm.control} name="visibilityType" render={({ field }) => ( <FormItem><FormLabel>Sichtbar für</FormLabel><Select onValueChange={(value) => { field.onChange(value); if (value === 'all') appointmentForm.setValue('visibleTeamIds', []); }} value={field.value}> <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl> <SelectContent> <SelectItem value="all">Alle Mitglieder</SelectItem> <SelectItem value="specificTeams">Bestimmte Mannschaften</SelectItem> </SelectContent> </Select><FormMessage /></FormItem> )}/>

                  {watchVisibilityType === 'specificTeams' && (
                    <FormField
                      control={appointmentForm.control}
                      name="visibleTeamIds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mannschaften auswählen</FormLabel>
                          <ScrollArea className="h-40 rounded-md border p-4">
                              {isLoadingGroups ? (
                                  <div className="flex items-center justify-center h-full">
                                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                  </div>
                              ) : teams.length > 0 ? (
                                  <div className="space-y-2">
                                  {teams.map((team) => (
                                      <div key={team.id} className="flex items-center space-x-2">
                                          <Checkbox
                                              id={`team-appoint-${team.id}`}
                                              checked={field.value?.includes(team.id)}
                                              onCheckedChange={(checked) => {
                                                  const newValue = checked
                                                  ? [...(field.value || []), team.id]
                                                  : (field.value || []).filter(
                                                      (id) => id !== team.id
                                                  );
                                                  field.onChange(newValue);
                                              }}
                                          />
                                          <label htmlFor={`team-appoint-${team.id}`} className="text-sm font-medium leading-none">
                                              {team.name}
                                          </label>
                                      </div>
                                  ))}
                                  </div>
                              ) : (
                                  <p className="text-muted-foreground text-center">Keine Mannschaften gefunden.</p>
                              )}
                          </ScrollArea>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField control={appointmentForm.control} name="rsvpDeadline" render={({ field }) => ( <FormItem><FormLabel>Rückmeldung bis (optional)</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem> )}/>

                  <FormField control={appointmentForm.control} name="locationId" render={({ field }) => ( <FormItem> <div className="flex items-center justify-between"> <FormLabel>Ort</FormLabel> <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}><DialogTrigger asChild><Button variant="ghost" size="sm" type="button"><Plus className="h-3 w-3 mr-1"/> Neu</Button></DialogTrigger><DialogContent>
                      <DialogHeader>
                          <DialogTitle>Neuen Ort erstellen</DialogTitle>
                      </DialogHeader>
                       <Form {...locationForm}>
                          <form onSubmit={locationForm.handleSubmit(onSubmitLocation)} className="space-y-4">
                              <FormField control={locationForm.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Name des Ortes</FormLabel><FormControl><Input placeholder="z.B. Fritz-Jacobi-Anlage" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                              <FormField control={locationForm.control} name="address" render={({ field }) => ( <FormItem><FormLabel>Adresse (optional)</FormLabel><FormControl><Input placeholder="Kalkstr. 46, 51377 Leverkusen" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                              <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="secondary">Abbrechen</Button></DialogClose>
                                <Button type="submit" disabled={locationForm.formState.isSubmitting}>{locationForm.formState.isSubmitting && (<Loader2 className="mr-2 h-4 w-4 animate-spin"/>)}Speichern</Button>
                              </DialogFooter>
                          </form>
                      </Form>
                  </DialogContent></Dialog> </div> <Select onValueChange={field.onChange} value={field.value ?? ''}> <FormControl><SelectTrigger><SelectValue placeholder="Ort auswählen..." /></SelectTrigger></FormControl> <SelectContent> {isLoadingLocations ? <SelectItem value="loading" disabled>Lade...</SelectItem> : locations?.map(loc => (<SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>))} </SelectContent> </Select> <FormMessage /> </FormItem> )}/>

                  <FormField control={appointmentForm.control} name="meetingPoint" render={({ field }) => ( <FormItem><FormLabel>Treffpunkt (optional)</FormLabel><FormControl><Input placeholder="z.B. Eingang Halle" {...field} /></FormControl><FormMessage /></FormItem> )}/>

                  <FormField control={appointmentForm.control} name="meetingTime" render={({ field }) => ( <FormItem><FormLabel>Treffzeit (optional)</FormLabel><FormControl><Input placeholder="z.B. 18:45 Uhr oder 1h vor Beginn" {...field} /></FormControl><FormMessage /></FormItem> )}/>

                  <FormField control={appointmentForm.control} name="description" render={({ field }) => ( <FormItem><FormLabel>Beschreibung (optional)</FormLabel><FormControl><Textarea placeholder="Weitere Details..." {...field} /></FormControl><FormMessage /></FormItem> )}/>

                  <DialogFooter className="pt-4"> <DialogClose asChild><Button type="button" variant="ghost" onClick={resetAppointmentForm}> Abbrechen </Button></DialogClose> <Button type="submit" disabled={isSubmitting}> {isSubmitting && (<Loader2 className="mr-2 h-4 w-4 animate-spin" />)} {selectedAppointment ? 'Änderungen speichern' : 'Termin erstellen'} </Button> </DialogFooter>
                </form>
              </Form>
          </DialogContent>
      </Dialog>


      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-3"> <ListTodo className="h-6 w-6" /> <span>Alle Termine</span> </CardTitle>
            <div className="flex items-center gap-2">
                 <div className="flex flex-col gap-2 sm:flex-row sm:items-center"> <Filter className="h-4 w-4 text-muted-foreground sm:hidden" /> <Select value={teamFilter} onValueChange={setTeamFilter}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Nach Mannschaft filtern..." /></SelectTrigger><SelectContent><SelectItem value="all">Alle Mannschaften</SelectItem>{isLoadingGroups ? <SelectItem value="loading" disabled>Lade...</SelectItem> : teams.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent></Select> <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Nach Typ filtern..." /></SelectTrigger><SelectContent><SelectItem value="all">Alle Typen</SelectItem>{isLoadingTypes ? <SelectItem value="loading" disabled>Lade...</SelectItem> : appointmentTypes?.map(type => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select> </div>
                 <Button onClick={() => { setIsAppointmentDialogOpen(true); }}>
                     <Plus className="mr-2 h-4 w-4" /> Neu
                 </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? ( <div className="flex justify-center p-12"> <Loader2 className="h-8 w-8 animate-spin" /> </div> ) : (
            <ScrollArea className="h-[600px] pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titel</TableHead>
                  <TableHead>Datum/Zeit</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Sichtbarkeit</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAppointments.length > 0 ? (
                  filteredAppointments.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium max-w-[150px] truncate">{app.title}</TableCell>
                      <TableCell>
                        {app.startDate ? format(app.startDate.toDate(), 'dd.MM.yy HH:mm', { locale: de }) : 'N/A'}
                        {app.endDate && !app.isAllDay && (<> - {format(app.endDate.toDate(), 'HH:mm', { locale: de })}</>)}
                        {app.isAllDay && <span className="text-xs text-muted-foreground"> (Ganztags)</span>}
                      </TableCell>
                      <TableCell>{typesMap.get(app.appointmentTypeId) || app.appointmentTypeId}</TableCell>
                      <TableCell>{app.visibility.type === 'all' ? 'Alle' : app.visibility.teamIds.map(id => teamsMap.get(id) || id).join(', ') || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEditAppointment(app)}> <Edit className="h-4 w-4" /> </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon"> <Trash2 className="h-4 w-4 text-destructive" /> </Button></AlertDialogTrigger>
                          <AlertDialogContent><AlertDialogHeader> <AlertDialogTitle>Sind Sie sicher?</AlertDialogTitle> <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription> </AlertDialogHeader><AlertDialogFooter> <AlertDialogCancel>Abbrechen</AlertDialogCancel> <AlertDialogAction onClick={() => handleDeleteAppointment(app.id!)} className="bg-destructive hover:bg-destructive/90"> Löschen </AlertDialogAction> </AlertDialogFooter></AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                ) : ( <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Keine Termine entsprechen den Filtern.</TableCell></TableRow> )}
              </TableBody>
            </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Wrapper-Komponente für die Admin-Prüfung (bleibt gleich)
export default function AdminTerminePage() {
    const { isAdmin, isUserLoading } = useUser();
    if (isUserLoading) { return ( <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> ); }
    if (!isAdmin) { return ( <div className="container mx-auto p-4 sm:p-6 lg:p-8"><Card className="border-destructive/50"><CardHeader><CardTitle className="flex items-center gap-3 text-destructive"><ListTodo className="h-8 w-8" /><span className="text-2xl font-headline">Zugriff verweigert</span></CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Sie verfügen nicht über die erforderlichen Berechtigungen...</p></CardContent></Card></div> ); }
    return <AdminTerminePageContent />;
}

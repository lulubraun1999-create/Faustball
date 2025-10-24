
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
} from '@/firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
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
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Edit, Trash2, ListTodo, Loader2, Plus, Filter, CalendarPlus } from 'lucide-react';
import type { Appointment, AppointmentType, Location, Group } from '@/lib/types';
import { format, formatISO, isValid as isDateValid, addDays, addWeeks, addMonths, differenceInMilliseconds, set } from 'date-fns';
import { de } from 'date-fns/locale';

type GroupWithTeams = Group & { teams: Group[] };

type UnrolledAppointment = Appointment & {
  virtualId?: string; 
  originalStartDate?: Timestamp; 
};

const locationSchema = z.object({
    name: z.string().min(1, 'Ortsname ist erforderlich.'),
    address: z.string().optional(),
});
type LocationFormValues = z.infer<typeof locationSchema>;

const appointmentTypeSchema = z.object({
  name: z.string().min(1, 'Name des Typs ist erforderlich.'),
});
type AppointmentTypeFormValues = z.infer<typeof appointmentTypeSchema>;

const useAppointmentSchema = (appointmentTypes: AppointmentType[] | null) => {
    return useMemo(() => {
        const sonstigeTypeId = appointmentTypes?.find((t: AppointmentType) => t.name === 'Sonstiges')?.id;

        return z.object({
          title: z.string().optional(),
          appointmentTypeId: z.string().min(1, 'Art des Termins ist erforderlich.'),
          startDate: z.string().min(1, 'Startdatum/-zeit ist erforderlich.'),
          endDate: z.string().optional(),
          isAllDay: z.boolean().default(false),
          recurrence: z.enum(['none', 'daily', 'weekly', 'bi-weekly', 'monthly']).default('none'),
          recurrenceEndDate: z.string().optional(),
          visibilityType: z.enum(['all', 'specificTeams']).default('all'),
          visibleTeamIds: z.array(z.string()).default([]),
          rsvpDeadline: z.string().optional(),
          locationId: z.string().optional(),
          meetingPoint: z.string().optional(),
          meetingTime: z.string().optional(),
          description: z.string().optional(),
        })
        .refine(data => !data.endDate || !data.startDate || data.endDate >= data.startDate, {
            message: "Enddatum muss nach dem Startdatum liegen.",
            path: ["endDate"],
        })
        .refine(data => data.visibilityType !== 'specificTeams' || data.visibleTeamIds.length > 0, {
            message: "Bitte mindestens eine Mannschaft auswählen.",
            path: ["visibleTeamIds"],
        })
        .refine(data => data.recurrence === 'none' || (data.recurrence !== 'none' && !!data.recurrenceEndDate), {
            message: "Enddatum für Wiederholung ist erforderlich.",
            path: ["recurrenceEndDate"],
        })
        .refine(data => !data.recurrenceEndDate || !data.startDate || data.recurrenceEndDate >= data.startDate.split('T')[0], {
             message: "Ende der Wiederholung muss nach dem Startdatum liegen.",
             path: ["recurrenceEndDate"],
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
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);

  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);

  const typesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentTypes') : null), [firestore]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(typesRef);

  const locationsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'locations') : null), [firestore]);
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsRef);

  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const { typesMap, locationsMap, teams, teamsMap, groupedTeams } = useMemo<{
      typesMap: Map<string, string>;
      locationsMap: Map<string, string>;
      teams: Group[];
      teamsMap: Map<string, string>;
      groupedTeams: GroupWithTeams[];
  }>(() => {
      const allGroups = groups || [];
      const typesMap = new Map(appointmentTypes?.map((t: AppointmentType) => [t.id, t.name]));
      const locationsMap = new Map(locations?.map((l: Location) => [l.id, l.name]));
      const classes = allGroups.filter((g: Group) => g.type === 'class').sort((a: Group, b: Group) => a.name.localeCompare(b.name));
      const teams = allGroups.filter((g: Group) => g.type === 'team');
      const teamsMap = new Map(teams.map((t: Group) => [t.id, t.name]));

      const grouped: GroupWithTeams[] = classes.map((c: Group) => ({
          ...c,
          teams: teams.filter((t: Group) => t.parentId === c.id).sort((a: Group, b: Group) => a.name.localeCompare(b.name)),
      })).filter((c: GroupWithTeams) => c.teams.length > 0);
      
      return { typesMap, locationsMap, teams, teamsMap, groupedTeams: grouped };
  }, [appointmentTypes, locations, groups]);

  const appointmentSchema = useAppointmentSchema(appointmentTypes);
  const appointmentForm = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '', appointmentTypeId: '', startDate: '', endDate: '', isAllDay: false, recurrence: 'none',
      recurrenceEndDate: '',
      visibilityType: 'all', visibleTeamIds: [], rsvpDeadline: '', locationId: '',
      meetingPoint: '', meetingTime: '', description: '',
    },
  });

  const locationForm = useForm<LocationFormValues>({
      resolver: zodResolver(locationSchema),
      defaultValues: { name: '', address: '' },
  });
  
  const typeForm = useForm<AppointmentTypeFormValues>({
      resolver: zodResolver(appointmentTypeSchema),
      defaultValues: { name: '' },
  });

  const watchAppointmentTypeId = appointmentForm.watch('appointmentTypeId');
  const watchVisibilityType = appointmentForm.watch('visibilityType');
  const watchIsAllDay = appointmentForm.watch('isAllDay');
  const watchRecurrence = appointmentForm.watch('recurrence');
  const sonstigeTypeId = useMemo(() => appointmentTypes?.find((t: AppointmentType) => t.name === 'Sonstiges')?.id, [appointmentTypes]);

  const unrolledAppointments = useMemo(() => {
    if (!appointments) return [];
    const allEvents: UnrolledAppointment[] = [];

    appointments.forEach(app => {
      if (app.recurrence === 'none' || !app.recurrenceEndDate || !app.startDate) {
        allEvents.push(app);
      } else {
        let currentDate = app.startDate.toDate();
        const recurrenceEndDate = addDays(app.recurrenceEndDate.toDate(), 1); 
        const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), app.startDate.toDate()) : 0;

        let iter = 0;
        const MAX_ITERATIONS = 365; 

        while (currentDate < recurrenceEndDate && iter < MAX_ITERATIONS) {
          const newStartDate = Timestamp.fromDate(currentDate);
          const newEndDate = app.endDate ? Timestamp.fromMillis(currentDate.getTime() + duration) : undefined;
          
          allEvents.push({
            ...app,
            id: `${app.id}-${currentDate.toISOString()}`,
            virtualId: app.id,
            startDate: newStartDate,
            endDate: newEndDate,
            originalStartDate: app.startDate
          });

          switch (app.recurrence) {
            case 'daily':
              currentDate = addDays(currentDate, 1);
              break;
            case 'weekly':
              currentDate = addWeeks(currentDate, 1);
              break;
            case 'bi-weekly':
              currentDate = addWeeks(currentDate, 2);
              break;
            case 'monthly':
              currentDate = addMonths(currentDate, 1);
              break;
            default:
              currentDate = addDays(recurrenceEndDate, 1);
              break;
          }
          iter++;
        }
      }
    });
    return allEvents;
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
      return unrolledAppointments
        .filter(app => {
            const typeMatch = typeFilter === 'all' || app.appointmentTypeId === typeFilter;
            const teamMatch = teamFilter === 'all' || app.visibility.type === 'all' || app.visibility.teamIds.includes(teamFilter);
            return typeMatch && teamMatch;
        })
        .sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis());
  }, [unrolledAppointments, teamFilter, typeFilter]);


  const onSubmitAppointment = async (data: AppointmentFormValues) => {
    if (!firestore || !appointmentsRef) return;
    setIsSubmitting(true);

    const selectedTypeName = typesMap.get(data.appointmentTypeId);
    const finalTitle = (data.appointmentTypeId !== sonstigeTypeId && (!data.title || data.title.trim() === ''))
        ? selectedTypeName
        : data.title?.trim();

     if (data.appointmentTypeId === sonstigeTypeId && (!finalTitle || finalTitle.trim() === '')) {
         appointmentForm.setError('title', { message: 'Titel ist bei Typ "Sonstiges" erforderlich.' });
         setIsSubmitting(false);
         return;
     }

    const startDate = new Date(data.startDate);
    const endDate = data.endDate ? new Date(data.endDate) : null;
    const rsvpDeadline = data.rsvpDeadline ? new Date(data.rsvpDeadline) : null;
    const recurrenceEndDate = data.recurrenceEndDate ? new Date(data.recurrenceEndDate) : null;

    if (!isDateValid(startDate)) { appointmentForm.setError('startDate', { message: 'Ungültiges Startdatum.' }); setIsSubmitting(false); return; }
    if (endDate && !isDateValid(endDate)) { appointmentForm.setError('endDate', { message: 'Ungültiges Enddatum.' }); setIsSubmitting(false); return; }
    if (rsvpDeadline && !isDateValid(rsvpDeadline)) { appointmentForm.setError('rsvpDeadline', { message: 'Ungültige Frist.' }); setIsSubmitting(false); return; }
    if (recurrenceEndDate && !isDateValid(recurrenceEndDate)) { appointmentForm.setError('recurrenceEndDate', { message: 'Ungültiges Enddatum für Wiederholung.' }); setIsSubmitting(false); return; }


    const startDateTimestamp = Timestamp.fromDate(startDate);
    const endDateTimestamp = endDate ? Timestamp.fromDate(endDate) : null;
    const rsvpDeadlineTimestamp = rsvpDeadline ? Timestamp.fromDate(rsvpDeadline) : null;
    const recurrenceEndDateTimestamp = recurrenceEndDate ? Timestamp.fromDate(set(recurrenceEndDate, { hours: 23, minutes: 59, seconds: 59 })) : null;

    const appointmentData: Omit<Appointment, 'id' | 'createdAt' | 'lastUpdated'> = {
      title: finalTitle || '',
      appointmentTypeId: data.appointmentTypeId,
      startDate: startDateTimestamp,
      ...(endDateTimestamp && { endDate: endDateTimestamp }),
      isAllDay: data.isAllDay,
      recurrence: data.recurrence,
      ...(recurrenceEndDateTimestamp && data.recurrence !== 'none' && { recurrenceEndDate: recurrenceEndDateTimestamp }),
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
        const docRef = doc(firestore, 'appointments', selectedAppointment.id);
        await updateDoc(docRef, { ...appointmentData, lastUpdated: serverTimestamp() });
        toast({ title: 'Terminserie erfolgreich aktualisiert.' });
      } else {
        await addDoc(appointmentsRef, { ...appointmentData, createdAt: serverTimestamp() });
        toast({ title: 'Neue Terminserie erfolgreich erstellt.' });
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
    const docRef = doc(firestore, 'appointments', id);
    try {
        await deleteDoc(docRef);
        toast({ title: 'Terminserie gelöscht.' });
    } catch(e) {
        const permissionError = new FirestorePermissionError({ path: docRef.path, operation: 'delete' });
        errorEmitter.emit('permission-error', permissionError);
    }
  };

  const handleEditAppointment = (appointment: UnrolledAppointment) => {
    const originalId = appointment.virtualId || appointment.id;
    const originalAppointment = appointments?.find(app => app.id === originalId);
    
    if (!originalAppointment) {
        toast({ variant: 'destructive', title: 'Fehler', description: 'Originaltermin nicht gefunden.' });
        return;
    }
    
    setSelectedAppointment(originalAppointment);
    
    const formatTimestampForInput = (ts: Timestamp | undefined, type: 'datetime' | 'date' = 'datetime') => {
        if (!ts) return '';
        try {
            const date = ts.toDate();
            if (type === 'date') return formatISO(date, { representation: 'date' });
            return formatISO(date).slice(0, 16);
        } catch (e) {
            return '';
        }
    };

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
        startDate: startDateString,
        endDate: endDateString,
        isAllDay: originalAppointment.isAllDay ?? false,
        recurrence: originalAppointment.recurrence ?? 'none',
        recurrenceEndDate: recurrenceEndDateString,
        visibilityType: originalAppointment.visibility.type,
        visibleTeamIds: originalAppointment.visibility.teamIds,
        rsvpDeadline: rsvpDeadlineString,
        locationId: originalAppointment.locationId ?? '',
        meetingPoint: originalAppointment.meetingPoint ?? '',
        meetingTime: originalAppointment.meetingTime ?? '',
        description: originalAppointment.description ?? '',
     });
     setIsAppointmentDialogOpen(true);
  };

  const resetAppointmentForm = () => {
       appointmentForm.reset({
          title: '', appointmentTypeId: '', startDate: '', endDate: '', isAllDay: false, recurrence: 'none',
          recurrenceEndDate: '',
          visibilityType: 'all', visibleTeamIds: [], rsvpDeadline: '', locationId: '',
          meetingPoint: '', meetingTime: '', description: '',
        });
       setSelectedAppointment(null);
   };

  const onSubmitAppointmentType = async (data: AppointmentTypeFormValues) => {
      if(!firestore) return;
      const typeColRef = collection(firestore, 'appointmentTypes');
      try {
          const existingTypes = appointmentTypes?.map((t: AppointmentType) => t.name.toLowerCase()) || [];
          if (existingTypes.includes(data.name.toLowerCase())) {
              toast({ variant: 'destructive', title: 'Fehler', description: 'Dieser Typ existiert bereits.' });
              return;
          }
          await addDoc(typeColRef, data);
          toast({ title: 'Typ hinzugefügt' });
          typeForm.reset();
          setIsTypeDialogOpen(false);
      } catch (error) {
           errorEmitter.emit('permission-error', new FirestorePermissionError({
               path: 'appointmentTypes',
               operation: 'create',
               requestResourceData: data,
           }));
      }
  };

  const onSubmitLocation = async (data: LocationFormValues) => {
      if(!firestore) return;
      const locationColRef = collection(firestore, 'locations');
      try {
          await addDoc(locationColRef, data);
          toast({ title: 'Ort hinzugefügt' });
          locationForm.reset();
          setIsLocationDialogOpen(false);
      } catch (error) {
           errorEmitter.emit('permission-error', new FirestorePermissionError({
               path: 'locations',
               operation: 'create',
               requestResourceData: data,
           }));
      }
  };

  const isLoading = isLoadingAppointments || isLoadingTypes || isLoadingLocations || isLoadingGroups;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Dialog open={isAppointmentDialogOpen} onOpenChange={(open) => {
          setIsAppointmentDialogOpen(open);
          if (!open) resetAppointmentForm();
      }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh]">
             <DialogHeader>
               <DialogTitle className="flex items-center gap-2">
                 <CalendarPlus className="h-5 w-5"/>
                 {selectedAppointment ? 'Terminserie bearbeiten' : 'Neuer Termin'}
               </DialogTitle>
               <DialogDescription>
                 {selectedAppointment ? 'Details der Terminserie ändern.' : 'Neue Terminserie hinzufügen.'}
               </DialogDescription>
             </DialogHeader>
             <ScrollArea className="max-h-[70vh] p-1 pr-6">
              <Form {...appointmentForm}>
                <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); }} className="space-y-4 px-1 py-4">
                  
                  <FormField control={appointmentForm.control} name="appointmentTypeId" render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Art des Termins</FormLabel>
                        <Button variant="ghost" size="sm" type="button" onClick={() => setIsTypeDialogOpen(true)}>
                            <Plus className="h-3 w-3 mr-1"/> Neu
                        </Button>
                      </div>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Art auswählen..." /></SelectTrigger></FormControl>
                        <SelectContent>{isLoadingTypes ? <SelectItem value="loading" disabled>Lade...</SelectItem> : appointmentTypes?.map(type => (<SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>))}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}/>

                  <FormField control={appointmentForm.control} name="title" render={({ field }) => {
                       const isSonstigesSelected = sonstigeTypeId === watchAppointmentTypeId;
                       return (
                         <FormItem>
                            <FormLabel>Titel {isSonstigesSelected ? '' : <span className="text-xs text-muted-foreground">(Optional, Standard: Art)</span>}</FormLabel>
                            <FormControl><Input placeholder={isSonstigesSelected ? "Titel ist erforderlich..." : "Optionaler Titel..."} {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                       );
                  }}/>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"> <FormField control={appointmentForm.control} name="startDate" render={({ field }) => ( <FormItem><FormLabel>Beginn</FormLabel><FormControl><Input type={watchIsAllDay ? "date" : "datetime-local"} {...field} /></FormControl><FormMessage /></FormItem> )}/> <FormField control={appointmentForm.control} name="endDate" render={({ field }) => ( <FormItem><FormLabel>Ende (optional)</FormLabel><FormControl><Input type={watchIsAllDay ? "date" : "datetime-local"} {...field} disabled={watchIsAllDay} min={appointmentForm.getValues("startDate")} /></FormControl><FormMessage /></FormItem> )}/> </div>
                  <FormField control={appointmentForm.control} name="isAllDay" render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-2"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); if (checked) { appointmentForm.setValue("endDate", ""); } }} /></FormControl><FormLabel className="font-normal">Ganztägiger Termin</FormLabel></FormItem> )}/>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField control={appointmentForm.control} name="recurrence" render={({ field }) => ( <FormItem><FormLabel>Wiederholung</FormLabel><Select onValueChange={(value) => { field.onChange(value); if (value === 'none') { appointmentForm.setValue('recurrenceEndDate', ''); } }} value={field.value}> <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl> <SelectContent> <SelectItem value="none">Keine</SelectItem> <SelectItem value="daily">Täglich</SelectItem> <SelectItem value="weekly">Wöchentlich</SelectItem> <SelectItem value="bi-weekly">Alle 2 Wochen</SelectItem> <SelectItem value="monthly">Monatlich</SelectItem> </SelectContent> </Select><FormMessage /></FormItem> )}/>
                    {watchRecurrence !== 'none' && (
                        <FormField control={appointmentForm.control} name="recurrenceEndDate" render={({ field }) => ( <FormItem><FormLabel>Wiederholung endet am</FormLabel><FormControl><Input type="date" {...field} min={appointmentForm.getValues("startDate") ? appointmentForm.getValues("startDate").split('T')[0] : undefined} /></FormControl><FormMessage /></FormItem> )}/>
                    )}
                  </div>

                  <FormField control={appointmentForm.control} name="visibilityType" render={({ field }) => ( <FormItem><FormLabel>Sichtbar für</FormLabel><Select onValueChange={(value) => { field.onChange(value); if (value === 'all') appointmentForm.setValue('visibleTeamIds', []); }} value={field.value}> <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl> <SelectContent> <SelectItem value="all">Alle Mitglieder</SelectItem> <SelectItem value="specificTeams">Bestimmte Mannschaften</SelectItem> </SelectContent> </Select><FormMessage /></FormItem> )}/>
                  
                  {watchVisibilityType === 'specificTeams' && (
                     <FormField
                        control={appointmentForm.control}
                        name="visibleTeamIds"
                        render={() => (
                           <FormItem>
                              <FormLabel>Mannschaften auswählen</FormLabel>
                               <ScrollArea className="h-40 w-full rounded-md border p-4">
                                {isLoadingGroups ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    </div>
                                ) : groupedTeams.length > 0 ? (
                                    groupedTeams.map((group) => (
                                        <div key={group.id} className="mb-2">
                                            <h4 className="mb-1.5 border-b px-2 pb-1 text-sm font-semibold">{group.name}</h4>
                                            <div className="flex flex-col space-y-1 pl-2">
                                                {group.teams.map((team) => (
                                                    <FormField
                                                        key={team.id}
                                                        control={appointmentForm.control}
                                                        name="visibleTeamIds"
                                                        render={({ field }) => {
                                                            return (
                                                                <FormItem
                                                                    key={team.id}
                                                                    className="flex flex-row items-start space-x-3 space-y-0"
                                                                >
                                                                    <FormControl>
                                                                        <Checkbox
                                                                            checked={field.value?.includes(team.id)}
                                                                            onCheckedChange={(checked) => {
                                                                                return checked
                                                                                    ? field.onChange([...field.value, team.id])
                                                                                    : field.onChange(field.value?.filter((value) => value !== team.id));
                                                                            }}
                                                                        />
                                                                    </FormControl>
                                                                    <FormLabel className="font-normal">{team.name}</FormLabel>
                                                                </FormItem>
                                                            );
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="p-2 text-center text-sm text-muted-foreground">Keine Mannschaften erstellt.</p>
                                )}
                               </ScrollArea>
                              <FormMessage />
                           </FormItem>
                        )}
                      />
                  )}

                  <FormField control={appointmentForm.control} name="rsvpDeadline" render={({ field }) => ( <FormItem><FormLabel>Rückmeldung bis (optional)</FormLabel><FormControl><Input type={watchIsAllDay ? "date" : "datetime-local"} {...field} /></FormControl><FormMessage /></FormItem> )}/>

                  <FormField control={appointmentForm.control} name="locationId" render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Ort</FormLabel>
                        <Button variant="ghost" size="sm" type="button" onClick={() => setIsLocationDialogOpen(true)}>
                            <Plus className="h-3 w-3 mr-1"/> Neu
                        </Button>
                      </div>
                      <Select onValueChange={field.onChange} value={field.value ?? ''}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Ort auswählen..." /></SelectTrigger></FormControl>
                        <SelectContent>{isLoadingLocations ? <SelectItem value="loading" disabled>Lade...</SelectItem> : locations?.map(loc => (<SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>))}</SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField control={appointmentForm.control} name="meetingPoint" render={({ field }) => ( <FormItem><FormLabel>Treffpunkt (optional)</FormLabel><FormControl><Input placeholder="z.B. Eingang Halle" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                    <FormField control={appointmentForm.control} name="meetingTime" render={({ field }) => ( <FormItem><FormLabel>Treffzeit (optional)</FormLabel><FormControl><Input placeholder="z.B. 18:45 Uhr" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                  </div>

                  <FormField control={appointmentForm.control} name="description" render={({ field }) => ( <FormItem><FormLabel>Beschreibung (optional)</FormLabel><FormControl><Textarea placeholder="Weitere Details..." {...field} /></FormControl><FormMessage /></FormItem> )}/>
                  
                  <DialogFooter className="pt-4">
                    <DialogClose asChild><Button type="button" variant="ghost" onClick={resetAppointmentForm}> Abbrechen </Button></DialogClose>
                    <Button type="submit" onClick={appointmentForm.handleSubmit(onSubmitAppointment)} disabled={isSubmitting}>
                         {isSubmitting && (<Loader2 className="mr-2 h-4 w-4 animate-spin" />)}
                         {selectedAppointment ? 'Änderungen speichern' : 'Termin erstellen'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
             </ScrollArea>
          </DialogContent>
      </Dialog>
      
      <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Neue Termin-Art hinzufügen</DialogTitle></DialogHeader>
              <Form {...typeForm}>
                  <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); typeForm.handleSubmit(onSubmitAppointmentType)(); }}>
                      <div className="space-y-4 py-4">
                          <FormField control={typeForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Name der Art</FormLabel><FormControl><Input placeholder="z.B. Turnier" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                      </div>
                      <DialogFooter>
                          <DialogClose asChild><Button type="button" variant="ghost">Abbrechen</Button></DialogClose>
                          <Button type="button" onClick={typeForm.handleSubmit(onSubmitAppointmentType)} disabled={typeForm.formState.isSubmitting}>
                              {typeForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Typ Speichern
                          </Button>
                      </DialogFooter>
                  </form>
              </Form>
          </DialogContent>
      </Dialog>

      <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
          <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Neuen Ort hinzufügen</DialogTitle></DialogHeader>
              <Form {...locationForm}>
                  <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); locationForm.handleSubmit(onSubmitLocation)(); }}>
                      <div className="space-y-4 py-4">
                          <FormField control={locationForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Name des Ortes</FormLabel><FormControl><Input placeholder="z.B. Fritz-Jacobi-Anlage" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={locationForm.control} name="address" render={({ field }) => (<FormItem><FormLabel>Adresse (optional)</FormLabel><FormControl><Input placeholder="Straße, PLZ Ort" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                      </div>
                      <DialogFooter>
                          <DialogClose asChild><Button type="button" variant="ghost">Abbrechen</Button></DialogClose>
                          <Button type="button" onClick={locationForm.handleSubmit(onSubmitLocation)} disabled={locationForm.formState.isSubmitting}>
                              {locationForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Ort Speichern
                          </Button>
                      </DialogFooter>
                  </form>
              </Form>
          </DialogContent>
      </Dialog>


      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-3"> <ListTodo className="h-6 w-6" /> <span>Alle Termine</span> </CardTitle>
            <div className="flex items-center gap-2">
                 <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Filter className="h-4 w-4 text-muted-foreground sm:hidden" />
                    <Select value={teamFilter} onValueChange={setTeamFilter}>
                        <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Nach Mannschaft filtern..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Alle Mannschaften</SelectItem>
                            {isLoadingGroups ? <SelectItem value="loading" disabled>Lade...</SelectItem> :
                                teams.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)
                            }
                        </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Nach Typ filtern..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Alle Typen</SelectItem>
                             {isLoadingTypes ? <SelectItem value="loading" disabled>Lade...</SelectItem> :
                                (appointmentTypes?.map(type => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>) ?? [])
                            }
                        </SelectContent>
                    </Select>
                 </div>
                 <Button onClick={() => { resetAppointmentForm(); setIsAppointmentDialogOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Neu
                 </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                        <TableCell colSpan={7}><Loader2 className="h-5 w-5 animate-spin"/></TableCell>
                    </TableRow>
                  ))
                ) : filteredAppointments.length > 0 ? (
                  filteredAppointments.map((app) => {
                    const typeName = typesMap.get(app.appointmentTypeId) || app.appointmentTypeId;
                    const isSonstiges = typeName === 'Sonstiges';
                    const titleIsDefault = !isSonstiges && app.title === typeName;
                    const showTitle = app.title && (!titleIsDefault || isSonstiges);
                    const displayTitle = showTitle ? `${typeName} (${app.title})` : typeName;
                    
                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{displayTitle}</TableCell>
                        <TableCell>
                          {app.startDate ? format(app.startDate.toDate(), app.isAllDay ? 'dd.MM.yy' : 'dd.MM.yy HH:mm', { locale: de }) : 'N/A'}
                          {app.endDate && !app.isAllDay && (<> - {format(app.endDate.toDate(), 'HH:mm', { locale: de })}</>)}
                          {app.isAllDay && <span className="text-xs text-muted-foreground"> (Ganztags)</span>}
                        </TableCell>
                        <TableCell>{app.visibility.type === 'all' ? 'Alle' : (app.visibility.teamIds.map(id => teamsMap.get(id) || id).join(', ') || '-')}</TableCell>
                        <TableCell>{app.locationId ? (locationsMap.get(app.locationId) || '-') : '-'}</TableCell>
                        <TableCell>{app.recurrence && app.recurrence !== 'none' ? `bis ${app.recurrenceEndDate ? format(app.recurrenceEndDate.toDate(), 'dd.MM.yy', { locale: de }) : '...'}` : '-'}</TableCell>
                        <TableCell>{app.rsvpDeadline ? format(app.rsvpDeadline.toDate(), 'dd.MM.yy HH:mm', { locale: de }) : '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEditAppointment(app)}> <Edit className="h-4 w-4" /> </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="ghost" size="icon"> <Trash2 className="h-4 w-4 text-destructive" /> </Button></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Sind Sie sicher?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Diese Aktion kann nicht rückgängig gemacht werden.
                                      {app.virtualId ? " Hiermit wird die gesamte Serie gelöscht, zu der dieser Termin gehört." : ` Der Termin "${app.title}" wird dauerhaft gelöscht.`}
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteAppointment(app.virtualId || app.id)} className="bg-destructive hover:bg-destructive/90">
                                        Löschen
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : ( <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Keine Termine entsprechen den Filtern.</TableCell></TableRow> )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminTerminePage() {
    const { isAdmin, isUserLoading } = useUser();
    if (isUserLoading) { return ( <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> ); }
    if (!isAdmin) { return ( <div className="container mx-auto p-4 sm:p-6 lg:p-8"><Card className="border-destructive/50"><CardHeader><CardTitle className="flex items-center gap-3 text-destructive"><ListTodo className="h-8 w-8" /><span className="text-2xl font-headline">Zugriff verweigert</span></CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Sie verfügen nicht über die erforderlichen Berechtigungen...</p></CardContent></Card></div> ); }
    return <AdminTerminePageContent />;
}

    
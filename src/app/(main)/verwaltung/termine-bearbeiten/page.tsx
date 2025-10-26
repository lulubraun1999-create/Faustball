
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
  writeBatch,
  getDocs
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
import { format, formatISO, isValid as isDateValid, addDays, addWeeks, addMonths, differenceInMilliseconds, set, isEqual, startOfDay, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

// --- Typen ---
type GroupWithTeams = Group & { teams: Group[] };

type UnrolledAppointment = Appointment & {
  virtualId: string;
  originalId: string;
  instanceDate: Date;
  isException?: boolean;
  isCancelled?: boolean;
};


// --- Zod Schemas ---
const locationSchema = z.object({ name: z.string().min(1, "Name ist erforderlich."), address: z.string().optional() });
type LocationFormValues = z.infer<typeof locationSchema>;

const appointmentTypeSchema = z.object({ name: z.string().min(1, "Name ist erforderlich.") });
type AppointmentTypeFormValues = z.infer<typeof appointmentTypeSchema>;

const singleAppointmentInstanceSchema = z.object({
  title: z.string().optional(),
  startDate: z.string().min(1, "Beginn ist erforderlich."),
  endDate: z.string().optional(),
  isAllDay: z.boolean().default(false),
  locationId: z.string().optional(),
  description: z.string().optional(),
  meetingPoint: z.string().optional(),
  meetingTime: z.string().optional(),
});
type SingleAppointmentInstanceFormValues = z.infer<typeof singleAppointmentInstanceSchema>;

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
        .refine(data => !data.endDate || !data.startDate || new Date(data.endDate) >= new Date(data.startDate), { path: ["endDate"], message: "Enddatum muss nach dem Startdatum liegen." })
        .refine(data => data.visibilityType !== 'specificTeams' || data.visibleTeamIds.length > 0, { path: ["visibleTeamIds"], message: "Bitte mindestens eine Mannschaft auswählen." })
        .refine(data => data.recurrence === 'none' || (data.recurrence !== 'none' && !!data.recurrenceEndDate), { path: ["recurrenceEndDate"], message: "Enddatum für Wiederholung ist erforderlich." })
        .refine(data => {
            if (data.recurrenceEndDate && data.startDate) {
               try {
                  const recurrenceEnd = new Date(data.recurrenceEndDate);
                  const startDateValue = data.startDate.includes('T') ? data.startDate.split('T')[0] : data.startDate;
                  const start = new Date(startDateValue);
                  return isDateValid(recurrenceEnd) && isDateValid(start) && recurrenceEnd >= start;
               } catch (e) { return false; }
            }
            return true;
        }, {
             message: "Ende der Wiederholung muss nach dem Startdatum liegen.",
             path: ["recurrenceEndDate"],
        })
        .superRefine((data, ctx) => {
            if (data.appointmentTypeId === sonstigeTypeId && (!data.title || data.title.trim() === '')) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Titel ist bei Typ "Sonstiges" erforderlich.', path: ['title'], });
            }
        });
    }, [appointmentTypes]);
};
type AppointmentFormValues = z.infer<ReturnType<typeof useAppointmentSchema>>;


function AdminTerminePageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, isAdmin } = useUser();

  // Dialog & Form States
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedInstanceToEdit, setSelectedInstanceToEdit] = useState<UnrolledAppointment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [isInstanceDialogOpen, setIsInstanceDialogOpen] = useState(false);
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  
  // Filter States
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  // Data fetching
  const appointmentsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointments') : null), [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);
  
  const appointmentIds = useMemo(() => appointments?.map(app => app.id) || [], [appointments]);

  const exceptionsRef = useMemoFirebase(() => {
    if (!firestore || appointmentIds.length === 0) return null;
    return query(collection(firestore, 'appointmentExceptions'), where('originalAppointmentId', 'in', appointmentIds));
  }, [firestore, appointmentIds]);

  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);

  const typesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentTypes') : null), [firestore]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(typesRef);
  const locationsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'locations') : null), [firestore]);
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsRef);
  const groupsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'groups') : null), [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);
  
  // Memoized Maps and derived data
  const { typesMap, locationsMap, teams, teamsMap, groupedTeams } = useMemo(() => {
    const typesMap = new Map(appointmentTypes?.map(t => [t.id, t.name]));
    const locationsMap = new Map(locations?.map(l => [l.id, l]));
    const classes = groups?.filter(g => g.type === 'class').sort((a,b) => a.name.localeCompare(b.name)) || [];
    const teams = groups?.filter(g => g.type === 'team').sort((a,b) => a.name.localeCompare(b.name)) || [];
    const teamsMap = new Map(teams.map(t => [t.id, t.name]));
    const groupedTeams: GroupWithTeams[] = classes.map(c => ({
      ...c,
      teams: teams.filter(t => t.parentId === c.id)
    }));

    return { typesMap, locationsMap, teams, teamsMap, groupedTeams };
  }, [appointmentTypes, locations, groups]);


  // Forms setup
  const appointmentSchema = useAppointmentSchema(appointmentTypes);
  const appointmentForm = useForm<AppointmentFormValues>({ 
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
        title: '',
        appointmentTypeId: '',
        startDate: '',
        endDate: '',
        isAllDay: false,
        recurrence: 'none',
        recurrenceEndDate: '',
        visibilityType: 'all',
        visibleTeamIds: [],
        rsvpDeadline: '',
        locationId: '',
        meetingPoint: '',
        meetingTime: '',
        description: '',
    }
  });
  const locationForm = useForm<LocationFormValues>({ resolver: zodResolver(locationSchema), defaultValues: { name: '', address: '' }});
  const typeForm = useForm<AppointmentTypeFormValues>({ resolver: zodResolver(appointmentTypeSchema), defaultValues: { name: '' } });
  const instanceForm = useForm<SingleAppointmentInstanceFormValues>({ resolver: zodResolver(singleAppointmentInstanceSchema) });

  // Form watchers
  const watchAppointmentTypeId = appointmentForm.watch('appointmentTypeId');
  const watchVisibilityType = appointmentForm.watch('visibilityType');
  const watchIsAllDay = appointmentForm.watch('isAllDay');
  const watchRecurrence = appointmentForm.watch('recurrence');
  const sonstigeTypeId = useMemo(() => appointmentTypes?.find((t: AppointmentType) => t.name === 'Sonstiges')?.id, [appointmentTypes]);

  // Unroll appointments
  const unrolledAppointments = useMemo(() => {
    if (!appointments || isLoadingExceptions) return [];
    
    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions?.forEach(ex => {
        const originalDateString = format(ex.originalDate.toDate(), 'yyyy-MM-dd');
        exceptionsMap.set(`${ex.originalAppointmentId}_${originalDateString}`, ex);
    });

    const allEvents: UnrolledAppointment[] = [];

    appointments.forEach(app => {
        const unroll = (currentDate: Date, originalDate?: Date) => {
            const dateStr = format(currentDate, 'yyyy-MM-dd');
            const originalDateStr = format(originalDate || currentDate, 'yyyy-MM-dd');
            const virtualId = `${app.id}_${dateStr}`;
            const exception = exceptionsMap.get(`${app.id}_${originalDateStr}`);
            
            let instance = {
                ...app,
                virtualId,
                originalId: app.id,
                instanceDate: currentDate,
                isException: !!exception,
                isCancelled: exception?.status === 'cancelled',
            };

            if (exception?.status === 'modified' && exception.modifiedData) {
                instance = { ...instance, ...exception.modifiedData };
            }
            
            allEvents.push(instance);
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
                    default: currentDate = recurrenceEndDate; break;
                }
                iter++;
            }
        }
    });

    return allEvents.filter(event => event.instanceDate >= new Date() && !event.isCancelled)
                    .sort((a,b) => a.instanceDate.getTime() - b.instanceDate.getTime());

  }, [appointments, exceptions, isLoadingExceptions]);

  const filteredAppointments = useMemo(() => {
    return unrolledAppointments.filter(app => {
        if (typeFilter !== 'all' && app.appointmentTypeId !== typeFilter) return false;
        if (teamFilter !== 'all' && !(app.visibility.type === 'all' || app.visibility.teamIds.includes(teamFilter))) return false;
        return true;
    });
  }, [unrolledAppointments, teamFilter, typeFilter]);

  const resetAppointmentForm = () => {
        appointmentForm.reset({
            title: '', appointmentTypeId: '', startDate: '', endDate: '',
            isAllDay: false, recurrence: 'none', recurrenceEndDate: '',
            visibilityType: 'all', visibleTeamIds: [], rsvpDeadline: '',
            locationId: '', meetingPoint: '', meetingTime: '', description: '',
        });
        setSelectedAppointment(null);
  };
  
  const handleEditAppointment = (appointment: UnrolledAppointment) => {
    const originalApp = appointments?.find(a => a.id === appointment.originalId);
    if (!originalApp) return;

    setSelectedAppointment(originalApp);
    const formatForInput = (date: Timestamp | undefined, type: 'date' | 'datetime-local') => {
        if (!date) return '';
        const d = date.toDate();
        return type === 'date' ? format(d, 'yyyy-MM-dd') : format(d, "yyyy-MM-dd'T'HH:mm");
    };

    appointmentForm.reset({
        title: originalApp.title,
        appointmentTypeId: originalApp.appointmentTypeId,
        startDate: formatForInput(originalApp.startDate, originalApp.isAllDay ? 'date' : 'datetime-local'),
        endDate: formatForInput(originalApp.endDate, originalApp.isAllDay ? 'date' : 'datetime-local'),
        isAllDay: originalApp.isAllDay,
        recurrence: originalApp.recurrence || 'none',
        recurrenceEndDate: formatForInput(originalApp.recurrenceEndDate, 'date'),
        visibilityType: originalApp.visibility.type,
        visibleTeamIds: originalApp.visibility.teamIds,
        rsvpDeadline: originalApp.rsvpDeadline ? format(originalApp.rsvpDeadline.toDate(), 'yyyy-MM-dd') : '',
        locationId: originalApp.locationId,
        meetingPoint: originalApp.meetingPoint,
        meetingTime: originalApp.meetingTime,
        description: originalApp.description,
    });
    setIsAppointmentDialogOpen(true);
  };

  const handleEditSingleInstance = (instance: UnrolledAppointment) => {
    setSelectedInstanceToEdit(instance);
    const formatForInput = (date: Date | Timestamp | undefined, type: 'date' | 'datetime-local') => {
        if (!date) return '';
        const d = date instanceof Timestamp ? date.toDate() : date;
        return type === 'date' ? format(d, 'yyyy-MM-dd') : format(d, "yyyy-MM-dd'T'HH:mm");
    };

    instanceForm.reset({
        title: instance.title,
        startDate: formatForInput(instance.startDate, instance.isAllDay ? 'date' : 'datetime-local'),
        endDate: formatForInput(instance.endDate, instance.isAllDay ? 'date' : 'datetime-local'),
        isAllDay: instance.isAllDay,
        locationId: instance.locationId,
        description: instance.description,
        meetingPoint: instance.meetingPoint,
        meetingTime: instance.meetingTime,
    });
    setIsInstanceDialogOpen(true);
  };


  const onSubmitAppointment = async (data: AppointmentFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);
    
    const { visibilityType, visibleTeamIds, ...rest } = data;
    const start = new Date(data.startDate);
    const end = data.endDate ? new Date(data.endDate) : undefined;
    const recurrenceEnd = data.recurrenceEndDate ? new Date(data.recurrenceEndDate) : undefined;
    const rsvpDeadline = data.rsvpDeadline ? new Date(data.rsvpDeadline) : undefined;

    const finalTitle = (data.appointmentTypeId !== sonstigeTypeId) 
      ? typesMap.get(data.appointmentTypeId) ?? data.title
      : data.title;
    
    const appointmentData: Omit<Appointment, 'id'> = {
        ...rest,
        title: finalTitle!,
        startDate: Timestamp.fromDate(start),
        endDate: end ? Timestamp.fromDate(end) : undefined,
        recurrenceEndDate: recurrenceEnd ? Timestamp.fromDate(recurrenceEnd) : undefined,
        rsvpDeadline: rsvpDeadline ? Timestamp.fromDate(rsvpDeadline) : undefined,
        visibility: {
            type: visibilityType,
            teamIds: visibilityType === 'specificTeams' ? visibleTeamIds : [],
        },
        createdAt: serverTimestamp() as Timestamp,
        lastUpdated: serverTimestamp() as Timestamp,
    };
    
    try {
      if (selectedAppointment) {
        const docRef = doc(firestore, 'appointments', selectedAppointment.id);
        await updateDoc(docRef, appointmentData);
        toast({ title: 'Terminserie aktualisiert' });
      } else {
        await addDoc(collection(firestore, 'appointments'), appointmentData);
        toast({ title: 'Neue Terminserie erstellt' });
      }
      setIsAppointmentDialogOpen(false);
      resetAppointmentForm();
    } catch(e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: selectedAppointment ? `appointments/${selectedAppointment.id}` : 'appointments',
        operation: selectedAppointment ? 'update' : 'create',
        requestResourceData: appointmentData,
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitSingleInstance = async (data: SingleAppointmentInstanceFormValues) => {
    if (!firestore || !user || !selectedInstanceToEdit) return;
    setIsSubmitting(true);

    const originalDate = startOfDay(selectedInstanceToEdit.instanceDate);

    const exceptionData: Omit<AppointmentException, 'id'> = {
        originalAppointmentId: selectedInstanceToEdit.originalId,
        originalDate: Timestamp.fromDate(originalDate),
        status: 'modified',
        modifiedData: {
            ...data,
            startDate: data.startDate ? Timestamp.fromDate(new Date(data.startDate)) : undefined,
            endDate: data.endDate ? Timestamp.fromDate(new Date(data.endDate)) : undefined,
        },
        createdAt: serverTimestamp() as Timestamp,
        userId: user.uid,
    };

    try {
        await addDoc(collection(firestore, 'appointmentExceptions'), exceptionData);
        toast({ title: "Termin-Instanz aktualisiert." });
        setIsInstanceDialogOpen(false);
        setSelectedInstanceToEdit(null);
    } catch(e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'appointmentExceptions',
            operation: 'create',
            requestResourceData: exceptionData,
        }));
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleCancelSingleInstance = async (appointment: UnrolledAppointment) => {
    if (!firestore || !user) return;
    
    const originalDate = startOfDay(appointment.instanceDate);
    
    const exceptionData: Omit<AppointmentException, 'id'> = {
        originalAppointmentId: appointment.originalId,
        originalDate: Timestamp.fromDate(originalDate),
        status: 'cancelled',
        createdAt: serverTimestamp() as Timestamp,
        userId: user.uid,
    };

    try {
        await addDoc(collection(firestore, 'appointmentExceptions'), exceptionData);
        toast({ title: 'Einzelner Termin wurde abgesagt.'});
    } catch(e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'appointmentExceptions',
            operation: 'create',
            requestResourceData: exceptionData,
        }));
    }
  };

  const handleDeleteAppointment = async (id: string) => {
      if (!firestore) return;
      try {
          const batch = writeBatch(firestore);
          const appointmentDocRef = doc(firestore, 'appointments', id);
          const exceptionsQuery = query(collection(firestore, 'appointmentExceptions'), where('originalAppointmentId', '==', id));
          const exceptionsSnapshot = await getDocs(exceptionsQuery);
          exceptionsSnapshot.forEach(doc => batch.delete(doc.ref));
          batch.delete(appointmentDocRef);
          await batch.commit();
          toast({ title: 'Terminserie und alle Ausnahmen gelöscht' });
      } catch(e) {
          errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `appointments/${id}`, operation: 'delete' }));
      }
  };
  
  const onSubmitLocation = async (data: LocationFormValues) => {
    if (!firestore) return;
    try {
      await addDoc(collection(firestore, 'locations'), data);
      toast({ title: "Neuer Ort hinzugefügt" });
      locationForm.reset();
      setIsLocationDialogOpen(false);
    } catch(e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'locations', operation: 'create', requestResourceData: data }));
    }
  };
  
  const onSubmitAppointmentType = async (data: AppointmentTypeFormValues) => {
    if (!firestore) return;
    try {
      await addDoc(collection(firestore, 'appointmentTypes'), data);
      toast({ title: "Neue Art hinzugefügt" });
      typeForm.reset();
      setIsTypeDialogOpen(false);
    } catch(e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'appointmentTypes', operation: 'create', requestResourceData: data }));
    }
  };
  
  const isLoading = isLoadingAppointments || isLoadingTypes || isLoadingLocations || isLoadingGroups || isLoadingExceptions;

  if (!isAdmin) {
    return (
       <div className="container mx-auto p-4 sm:p-6 lg:p-8">
         <Card className="border-destructive/50">
           <CardHeader><CardTitle className="flex items-center gap-3 text-destructive"><ListTodo className="h-8 w-8" /><span className="text-2xl font-headline">Zugriff verweigert</span></CardTitle></CardHeader>
           <CardContent><p className="text-muted-foreground">Sie verfügen nicht über die erforderlichen Berechtigungen, um auf diesen Bereich zuzugreifen.</p></CardContent>
         </Card>
       </div>
     );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Dialog open={isAppointmentDialogOpen} onOpenChange={(open) => { if (!open) resetAppointmentForm(); setIsAppointmentDialogOpen(open); }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh]">
             <DialogHeader>
                <DialogTitle>{selectedAppointment ? 'Terminserie bearbeiten' : 'Neue Terminserie erstellen'}</DialogTitle>
                <DialogDescription>Details zur Terminserie eingeben.</DialogDescription>
             </DialogHeader>
             <ScrollArea className="max-h-[70vh] p-1 pr-6">
              <Form {...appointmentForm}>
                <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); }} className="space-y-4 px-1 py-4">
                  
                  {/* Art & Titel */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField control={appointmentForm.control} name="appointmentTypeId" render={({ field }) => ( <FormItem><FormLabel>Art</FormLabel><Select onValueChange={field.onChange} value={field.value}> <FormControl><SelectTrigger><SelectValue placeholder="Art auswählen..." /></SelectTrigger></FormControl> <SelectContent>{appointmentTypes?.map(type => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent> </Select><FormMessage /></FormItem> )}/>
                    {watchAppointmentTypeId === sonstigeTypeId && ( <FormField control={appointmentForm.control} name="title" render={({ field }) => ( <FormItem><FormLabel>Titel</FormLabel><FormControl><Input placeholder="Titel für den Termin" {...field} /></FormControl><FormMessage /></FormItem> )}/> )}
                  </div>

                  {/* Start, Ende, Ganztags */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField control={appointmentForm.control} name="startDate" render={({ field }) => ( <FormItem><FormLabel>Beginn</FormLabel><FormControl><Input type={watchIsAllDay ? "date" : "datetime-local"} {...field} /></FormControl><FormMessage /></FormItem> )}/>
                    {!watchIsAllDay && <FormField control={appointmentForm.control} name="endDate" render={({ field }) => ( <FormItem><FormLabel>Ende (optional)</FormLabel><FormControl><Input type="datetime-local" {...field} min={appointmentForm.getValues("startDate")} /></FormControl><FormMessage /></FormItem> )}/>}
                  </div>
                  <FormField control={appointmentForm.control} name="isAllDay" render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-2"><FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); if (checked) { appointmentForm.setValue("endDate", ""); } }} /></FormControl><FormLabel className="font-normal">Ganztägiger Termin</FormLabel></FormItem> )}/>

                  {/* Wiederholung */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField control={appointmentForm.control} name="recurrence" render={({ field }) => ( <FormItem><FormLabel>Wiederholung</FormLabel><Select onValueChange={field.onChange} value={field.value}> <FormControl><SelectTrigger><SelectValue placeholder="Wiederholung auswählen" /></SelectTrigger></FormControl> <SelectContent> <SelectItem value="none">Keine</SelectItem> <SelectItem value="daily">Täglich</SelectItem> <SelectItem value="weekly">Wöchentlich</SelectItem> <SelectItem value="bi-weekly">Alle 2 Wochen</SelectItem> <SelectItem value="monthly">Monatlich</SelectItem> </SelectContent> </Select></FormItem> )}/>
                    {watchRecurrence !== 'none' && <FormField control={appointmentForm.control} name="recurrenceEndDate" render={({ field }) => ( <FormItem><FormLabel>Wiederholung endet am</FormLabel><FormControl><Input type="date" {...field} min={appointmentForm.getValues("startDate").split('T')[0]} /></FormControl><FormMessage /></FormItem> )}/>}
                  </div>

                  {/* Sichtbarkeit */}
                  <FormField control={appointmentForm.control} name="visibilityType" render={({ field }) => ( <FormItem><FormLabel>Sichtbar für</FormLabel><Select onValueChange={field.onChange} value={field.value}> <FormControl><SelectTrigger><SelectValue placeholder="Sichtbarkeit festlegen" /></SelectTrigger></FormControl> <SelectContent> <SelectItem value="all">Alle</SelectItem> <SelectItem value="specificTeams">Bestimmte Mannschaften</SelectItem> </SelectContent> </Select></FormItem> )}/>
                  {watchVisibilityType === 'specificTeams' && ( <FormField control={appointmentForm.control} name="visibleTeamIds" render={({ field }) => ( <FormItem><FormLabel>Mannschaften auswählen</FormLabel><Popover> <PopoverTrigger asChild> <FormControl> <Button variant="outline" role="combobox" className={cn("w-full justify-between", !field.value?.length && "text-muted-foreground")}>{field.value?.length > 0 ? `${field.value.length} ausgewählt` : "Mannschaften auswählen"} <Plus className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button> </FormControl> </PopoverTrigger> <PopoverContent className="w-[--radix-popover-trigger-width] p-0"><ScrollArea className="h-48">{groupedTeams.map(group => (<div key={group.id} className="p-2"><h4 className="font-semibold text-sm px-2">{group.name}</h4>{group.teams.map(team => (<FormField key={team.id} control={appointmentForm.control} name="visibleTeamIds" render={({ field }) => ( <FormItem key={team.id} className="flex flex-row items-start space-x-3 space-y-0 px-2 py-1.5"><FormControl><Checkbox checked={field.value?.includes(team.id)} onCheckedChange={(checked) => {return checked ? field.onChange([...field.value, team.id]) : field.onChange(field.value?.filter(value => value !== team.id));}} /></FormControl><FormLabel className="font-normal">{team.name}</FormLabel></FormItem> )}/>))}</div>))}</ScrollArea></PopoverContent> </Popover><FormMessage /></FormItem> )}/> )}

                  {/* Ort, Treffpunkt */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField control={appointmentForm.control} name="locationId" render={({ field }) => ( <FormItem><FormLabel>Ort</FormLabel><div className="flex gap-2"><Select onValueChange={field.onChange} value={field.value}> <FormControl><SelectTrigger><SelectValue placeholder="Ort auswählen..." /></SelectTrigger></FormControl> <SelectContent>{locations?.map(loc => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}</SelectContent> </Select><Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}><DialogTrigger asChild><Button type="button" variant="outline" size="icon"><Plus className="h-4 w-4"/></Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Neuen Ort hinzufügen</DialogTitle></DialogHeader><Form {...locationForm}><form onSubmit={locationForm.handleSubmit(onSubmitLocation)} className="space-y-4"><FormField control={locationForm.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Name des Ortes</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/><FormField control={locationForm.control} name="address" render={({ field }) => ( <FormItem><FormLabel>Adresse (optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/><DialogFooter><Button type="submit">Speichern</Button></DialogFooter></form></Form></DialogContent></Dialog></div><FormMessage /></FormItem> )}/>
                    <FormField control={appointmentForm.control} name="rsvpDeadline" render={({ field }) => ( <FormItem><FormLabel>Anmeldeschluss (optional)</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem> )}/>
                    <FormField control={appointmentForm.control} name="meetingPoint" render={({ field }) => ( <FormItem><FormLabel>Treffpunkt (optional)</FormLabel><FormControl><Input placeholder="z.B. Eingangshalle" {...field} /></FormControl></FormItem> )}/>
                    <FormField control={appointmentForm.control} name="meetingTime" render={({ field }) => ( <FormItem><FormLabel>Treffzeit (optional)</FormLabel><FormControl><Input placeholder="z.B. 1h vor Beginn" {...field} /></FormControl></FormItem> )}/>
                  </div>
                   <FormField control={appointmentForm.control} name="description" render={({ field }) => ( <FormItem><FormLabel>Beschreibung (optional)</FormLabel><FormControl><Textarea placeholder="Weitere Details zum Termin..." {...field} /></FormControl></FormItem> )}/>
                </form>
              </Form>
             </ScrollArea>
             <DialogFooter className="pt-4 border-t">
                <DialogClose asChild><Button type="button" variant="ghost">Abbrechen</Button></DialogClose>
                <Button type="button" onClick={appointmentForm.handleSubmit(onSubmitAppointment)} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{selectedAppointment ? 'Änderungen speichern' : 'Terminserie erstellen'}</Button>
             </DialogFooter>
          </DialogContent>
      </Dialog>
      
      {/*... Other Dialogs for Instance, Type ... */}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h1 className="flex items-center gap-3 text-3xl font-bold font-headline">Termine bearbeiten</h1>
        <div className="flex gap-2">
            <Button onClick={() => { resetAppointmentForm(); setIsAppointmentDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Neue Terminserie
            </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Anstehende Termine</CardTitle>
           <div className="flex flex-col md:flex-row gap-2 mt-4">
              <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Nach Art filtern..." /></SelectTrigger><SelectContent><SelectItem value="all">Alle Arten</SelectItem>{appointmentTypes?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
              <Select value={teamFilter} onValueChange={setTeamFilter}><SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Nach Mannschaft filtern..." /></SelectTrigger><SelectContent><SelectItem value="all">Alle Mannschaften</SelectItem>{teams?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
           </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Titel</TableHead><TableHead>Sichtbarkeit</TableHead><TableHead className="text-right">Aktionen</TableHead></TableRow></TableHeader>
            <TableBody>
                {filteredAppointments.length > 0 ? filteredAppointments.map(app => (
                    <TableRow key={app.virtualId} className={cn(app.isException && 'bg-amber-50 dark:bg-amber-900/20')}>
                        <TableCell>{format(app.instanceDate, 'eee, dd.MM.yyyy HH:mm', { locale: de })}</TableCell>
                        <TableCell className="font-medium">{app.title}</TableCell>
                        <TableCell>{app.visibility.type === 'all' ? 'Alle' : app.visibility.teamIds.map(id => teamsMap.get(id)).join(', ')}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditSingleInstance(app)}><Edit className="h-4 w-4"/></Button>
                            <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon"><CalendarX className="h-4 w-4 text-orange-600"/></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Einzelnen Termin absagen?</AlertDialogTitle><AlertDialogDescription>Soll nur dieser eine Termin am {format(app.instanceDate, 'dd.MM.yyyy')} abgesagt werden? Die Serie bleibt bestehen.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={() => handleCancelSingleInstance(app)}>Ja, nur diesen absagen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                            <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive"/></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Gesamte Serie löschen?</AlertDialogTitle><AlertDialogDescription>Möchten Sie die gesamte Terminserie "{app.title}" unwiderruflich löschen? Alle zukünftigen Termine dieser Serie werden entfernt.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteAppointment(app.originalId)} className="bg-destructive hover:bg-destructive/90">Serie löschen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                          </div>
                        </TableCell>
                    </TableRow>
                )) : (
                    <TableRow><TableCell colSpan={4} className="h-24 text-center">Keine Termine gefunden.</TableCell></TableRow>
                )}
            </TableBody>
          </Table>
          )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AdminTerminePage() {
  const { isUserLoading, isAdmin } = useUser();

  if (isUserLoading) {
    return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  
  if(!isAdmin) {
    return (
       <div className="container mx-auto p-4 sm:p-6 lg:p-8">
         <Card className="border-destructive/50">
           <CardHeader><CardTitle className="flex items-center gap-3 text-destructive"><ListTodo className="h-8 w-8" /><span className="text-2xl font-headline">Zugriff verweigert</span></CardTitle></CardHeader>
           <CardContent><p className="text-muted-foreground">Sie verfügen nicht über die erforderlichen Berechtigungen, um auf diesen Bereich zuzugreifen.</p></CardContent>
         </Card>
       </div>
     );
  }

  return <AdminTerminePageContent />;
}

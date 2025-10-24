
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
  getDocs,
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
import { Label } from '@/components/ui/label';

type GroupWithTeams = Group & { teams: Group[] };

type UnrolledAppointment = Appointment & {
  virtualId: string;
  originalId: string;
  isException?: boolean;
  isCancelled?: boolean;
};

const locationSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich."),
  address: z.string().optional(),
});

type LocationFormValues = z.infer<typeof locationSchema>;

const appointmentTypeSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich."),
});

type AppointmentTypeFormValues = z.infer<typeof appointmentTypeSchema>;

const singleAppointmentInstanceSchema = z.object({
  originalDate: z.string(),
  startDate: z.string().min(1, 'Startdatum/-zeit ist erforderlich.'),
  endDate: z.string().optional(),
  title: z.string().optional(),
  locationId: z.string().optional(),
  description: z.string().optional(),
  meetingPoint: z.string().optional(),
  meetingTime: z.string().optional(),
})
.refine(data => !data.endDate || !data.startDate || new Date(data.endDate) >= new Date(data.startDate), {
    message: "Enddatum muss nach dem Startdatum liegen.",
    path: ["endDate"],
});
type SingleAppointmentInstanceFormValues = z.infer<typeof singleAppointmentInstanceSchema>;

const useAppointmentSchema = (appointmentTypes: AppointmentType[] | null) => {
    const sonstigeTypeId = appointmentTypes?.find(
        (t: AppointmentType) => t.name === 'Sonstiges'
    )?.id;

    return z.object({
        title: z.string().optional(),
        appointmentTypeId: z.string({ required_error: 'Art des Termins ist erforderlich.' }),
        startDate: z.string().min(1, 'Startdatum ist erforderlich.'),
        endDate: z.string().optional(),
        isAllDay: z.boolean().default(false),
        locationId: z.string().optional(),
        description: z.string().optional(),
        visibilityType: z.enum(['all', 'specificTeams']).default('all'),
        visibleTeamIds: z.array(z.string()).default([]),
        recurrence: z
            .enum(['none', 'daily', 'weekly', 'bi-weekly', 'monthly'])
            .default('none'),
        recurrenceEndDate: z.string().optional(),
        rsvpDeadline: z.string().optional(),
        meetingPoint: z.string().optional(),
        meetingTime: z.string().optional(),
    }).refine(
        (data) => {
            if (data.appointmentTypeId === sonstigeTypeId) {
                return !!data.title && data.title.length > 0;
            }
            return true;
        },
        {
            message: 'Für "Sonstiges" ist ein Titel erforderlich.',
            path: ['title'],
        }
    ).refine(data => !data.endDate || !data.startDate || new Date(data.endDate) >= new Date(data.startDate), {
        message: 'Enddatum muss nach dem Startdatum liegen.',
        path: ['endDate'],
    }).refine(data => data.recurrence === 'none' || !!data.recurrenceEndDate, {
        message: 'Für wiederkehrende Termine ist ein Enddatum der Wiederholung erforderlich.',
        path: ['recurrenceEndDate'],
    });
};
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
  const [itemToDelete, setItemToDelete] = useState<{ id: string, name: string, type: 'location' | 'type' } | null>(null);


  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

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

  const { typesMap, locationsMap, teams, teamsMap, groupedTeams } = useMemo(() => {
    const typesMap = new Map(appointmentTypes?.map((t: AppointmentType) => [t.id, t.name]));
    const locationsMap = new Map(locations?.map((l: Location) => [l.id, l.name]));
    const allGroups = groups || [];
    const classes = allGroups.filter(g => g.type === 'class').sort((a, b) => a.name.localeCompare(b.name));
    const teams = allGroups.filter(g => g.type === 'team');
    const teamsMap = new Map(teams.map((t: Group) => [t.id, t.name]));
    const groupedTeams = classes.map(c => ({
        ...c,
        teams: teams.filter(t => t.parentId === c.id).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter(c => c.teams.length > 0);

    return { typesMap, locationsMap, teams, teamsMap, groupedTeams };
  }, [appointmentTypes, locations, groups]);


  const appointmentSchema = useAppointmentSchema(appointmentTypes);
  const appointmentForm = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '',
      startDate: '',
      endDate: '',
      isAllDay: false,
      visibilityType: 'all',
      visibleTeamIds: [],
      recurrence: 'none',
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

  const instanceForm = useForm<SingleAppointmentInstanceFormValues>({
      resolver: zodResolver(singleAppointmentInstanceSchema),
  });


  const watchAppointmentTypeId = appointmentForm.watch('appointmentTypeId');
  const watchVisibilityType = appointmentForm.watch('visibilityType');
  const watchIsAllDay = appointmentForm.watch('isAllDay');
  const watchRecurrence = appointmentForm.watch('recurrence');
  const sonstigeTypeId = useMemo(() => appointmentTypes?.find((t: AppointmentType) => t.name === 'Sonstiges')?.id, [appointmentTypes]);

  const unrolledAppointments = useMemo(() => {
    if (!appointments || isLoadingExceptions) return [];
    
    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions?.forEach(ex => {
        if (ex.originalDate) {
            const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
            exceptionsMap.set(key, ex);
        }
    });

    const allEvents: UnrolledAppointment[] = [];
    const now = new Date();

    appointments.forEach(app => {
      const originalAppId = app.id!;
      
      const unroll = (currentDate: Date) => {
        const currentDateStartOfDay = startOfDay(currentDate);
        const key = `${originalAppId}-${currentDateStartOfDay.toISOString()}`;
        const exception = exceptionsMap.get(key);
        
        let isCancelled = false;
        if (exception?.status === 'cancelled') {
            isCancelled = true;
        }

        const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), app.startDate.toDate()) : 0;
        const newStartDate = Timestamp.fromDate(currentDate);
        const newEndDate = app.endDate ? Timestamp.fromMillis(currentDate.getTime() + duration) : undefined;
        
        let instanceData: Appointment = {
            ...app,
            startDate: newStartDate,
            endDate: newEndDate,
        };

        let isException = false;
        if (exception?.status === 'modified' && exception.modifiedData) {
            instanceData = {
                ...instanceData,
                ...exception.modifiedData,
            };
            isException = true;
        }
        
        allEvents.push({
            ...instanceData,
            id: `${originalAppId}-${currentDate.toISOString()}`,
            virtualId: `${originalAppId}-${currentDate.toISOString()}`,
            originalId: originalAppId,
            isException,
            isCancelled,
        });
      };
      
      if (!app.startDate) return;

      if (app.recurrence === 'none' || !app.recurrenceEndDate) {
        unroll(app.startDate.toDate());
      } else {
        let currentDate = app.startDate.toDate();
        const recurrenceEndDate = addDays(app.recurrenceEndDate.toDate(), 1);
        
        let iter = 0;
        const MAX_ITERATIONS = 500;
  
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
        if (iter === MAX_ITERATIONS) { console.warn(`Max iterations reached for appointment ${app.id}.`); }
      }
    });
    return allEvents;
  }, [appointments, exceptions, isLoadingExceptions]);


  const filteredAppointments = useMemo(() => {
      return unrolledAppointments
        .filter(app => {
            const typeMatch = typeFilter === 'all' || app.appointmentTypeId === typeFilter;
            const teamMatch = teamFilter === 'all' || app.visibility.type === 'all' || app.visibility.teamIds.includes(teamFilter);
            return typeMatch && teamMatch;
        })
        .sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis());
  }, [unrolledAppointments, teamFilter, typeFilter]);

  useEffect(() => {
    if (!isAppointmentDialogOpen) {
        setSelectedAppointment(null);
        appointmentForm.reset({
          title: '',
          startDate: '',
          endDate: '',
          isAllDay: false,
          visibilityType: 'all',
          visibleTeamIds: [],
          recurrence: 'none',
        });
    }
  }, [isAppointmentDialogOpen, appointmentForm]);

  const onSubmitAppointment = async (data: AppointmentFormValues) => {
    if (!firestore) return;
    setIsSubmitting(true);
    
    const isSonstiges = data.appointmentTypeId === sonstigeTypeId;
    const title = isSonstiges ? data.title : (data.title || typesMap.get(data.appointmentTypeId));

    const appointmentData: Omit<Appointment, 'id'> = {
        title: title!,
        appointmentTypeId: data.appointmentTypeId,
        startDate: Timestamp.fromDate(new Date(data.startDate)),
        endDate: data.endDate ? Timestamp.fromDate(new Date(data.endDate)) : undefined,
        isAllDay: data.isAllDay,
        description: data.description,
        visibility: {
            type: data.visibilityType,
            teamIds: data.visibilityType === 'specificTeams' ? data.visibleTeamIds : [],
        },
        recurrence: data.recurrence,
        recurrenceEndDate: data.recurrenceEndDate ? Timestamp.fromDate(new Date(data.recurrenceEndDate)) : undefined,
        rsvpDeadline: data.rsvpDeadline ? Timestamp.fromDate(new Date(data.rsvpDeadline)) : undefined,
        meetingPoint: data.meetingPoint,
        meetingTime: data.meetingTime,
        locationId: data.locationId,
        createdAt: selectedAppointment?.createdAt ?? serverTimestamp(),
        lastUpdated: serverTimestamp(),
    };

    try {
        if (selectedAppointment) {
            await updateDoc(doc(firestore, 'appointments', selectedAppointment.id), appointmentData);
            toast({ title: 'Termin erfolgreich aktualisiert.' });
        } else {
            await addDoc(collection(firestore, 'appointments'), appointmentData);
            toast({ title: 'Termin erfolgreich erstellt.' });
        }
        setIsAppointmentDialogOpen(false);
    } catch (e) {
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
      if (!firestore || !selectedInstanceToEdit || !user) return;
      setIsSubmitting(true);

      const exceptionsColRef = collection(firestore, 'appointmentExceptions');
      const originalDate = new Date(data.originalDate);
      const newStartDate = new Date(data.startDate);
      const newEndDate = data.endDate ? new Date(data.endDate) : null;

      if (!isDateValid(originalDate) || !isDateValid(newStartDate) || (newEndDate && !isDateValid(newEndDate))) {
          toast({ variant: 'destructive', title: 'Fehler', description: 'Ungültige Datumsangaben.' });
          setIsSubmitting(false);
          return;
      }

      const existingException = exceptions?.find(ex =>
          ex.originalAppointmentId === selectedInstanceToEdit.originalId &&
          isEqual(startOfDay(ex.originalDate.toDate()), startOfDay(originalDate))
      );


      const exceptionData = {
          originalAppointmentId: selectedInstanceToEdit.originalId,
          originalDate: Timestamp.fromDate(startOfDay(originalDate)),
          status: 'modified' as 'modified',
          modifiedData: {
              startDate: Timestamp.fromDate(newStartDate),
              ...(newEndDate && { endDate: Timestamp.fromDate(newEndDate) }),
              ...(data.title && data.title !== selectedInstanceToEdit.title && { title: data.title }),
              ...(data.locationId && data.locationId !== selectedInstanceToEdit.locationId && { locationId: data.locationId }),
              ...(data.description && data.description !== selectedInstanceToEdit.description && { description: data.description }),
              ...(data.meetingPoint && data.meetingPoint !== selectedInstanceToEdit.meetingPoint && { meetingPoint: data.meetingPoint }),
              ...(data.meetingTime && data.meetingTime !== selectedInstanceToEdit.meetingTime && { meetingTime: data.meetingTime }),
          },
          createdAt: serverTimestamp(),
          userId: user.uid,
      };

      try {
           if (existingException) {
              const docRef = doc(firestore, 'appointmentExceptions', existingException.id);
              await updateDoc(docRef, exceptionData);
              toast({ title: 'Terminänderung aktualisiert.' });
          } else {
              await addDoc(exceptionsColRef, exceptionData);
              toast({ title: 'Termin erfolgreich geändert (Ausnahme erstellt).' });
          }
          setIsInstanceDialogOpen(false);
          instanceForm.reset();
      } catch (error: any) {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
              path: existingException ? `appointmentExceptions/${existingException.id}` : 'appointmentExceptions',
              operation: existingException ? 'update' : 'create',
              requestResourceData: exceptionData,
          }));
          toast({ variant: 'destructive', title: 'Fehler', description: 'Änderung konnte nicht gespeichert werden.' });
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleCancelSingleInstance = async (appointment: UnrolledAppointment) => {
    if (!firestore || !user) return;
    setIsSubmitting(true);

    const exceptionsColRef = collection(firestore, 'appointmentExceptions');
    const originalDate = appointment.startDate.toDate();

     const existingException = exceptions?.find(ex =>
          ex.originalAppointmentId === appointment.originalId &&
          isEqual(startOfDay(ex.originalDate.toDate()), startOfDay(originalDate))
      );

    const exceptionData = {
        originalAppointmentId: appointment.originalId,
        originalDate: Timestamp.fromDate(startOfDay(originalDate)),
        status: 'cancelled' as 'cancelled',
        modifiedData: {},
        createdAt: serverTimestamp(),
        userId: user.uid,
    };

    try {
        if (existingException) {
            const docRef = doc(firestore, 'appointmentExceptions', existingException.id);
            await updateDoc(docRef, exceptionData);
        } else {
            await addDoc(exceptionsColRef, exceptionData);
        }
        toast({ title: 'Termin abgesagt.' });
    } catch (error: any) {
         errorEmitter.emit('permission-error', new FirestorePermissionError({
              path: existingException ? `appointmentExceptions/${existingException.id}` : 'appointmentExceptions',
              operation: existingException ? 'update' : 'create',
              requestResourceData: exceptionData,
         }));
         toast({ variant: 'destructive', title: 'Fehler', description: 'Termin konnte nicht abgesagt werden.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!firestore) return;
    try {
        const q = query(collection(firestore, 'appointmentExceptions'), where('originalAppointmentId', '==', id));
        const exceptionSnap = await getDocs(q);
        const batch = firestore.batch();
        exceptionSnap.forEach(doc => batch.delete(doc.ref));
        batch.delete(doc(firestore, 'appointments', id));
        await batch.commit();
        toast({ title: 'Terminserie und alle Ausnahmen gelöscht.' });
    } catch(e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `appointments/${id}`, operation: 'delete' }));
    }
  };

  const handleEditAppointment = (appointment: UnrolledAppointment) => {
    const originalAppointment = appointments?.find(app => app.id === appointment.originalId);
    if (!originalAppointment) return;
       setSelectedInstanceToEdit(appointment);
       
       const formatTimestampForInput = (ts: Timestamp | undefined, type: 'datetime' | 'date' = 'datetime') => {
            if (!ts) return '';
            try {
                const date = ts.toDate();
                if (type === 'date') return formatISO(date, { representation: 'date' });
                return formatISO(date).slice(0, 16);
            } catch (e) { return ''; }
        };
        
       const startDateString = formatTimestampForInput(appointment.startDate, appointment.isAllDay ? 'date' : 'datetime');
       const endDateString = formatTimestampForInput(appointment.endDate, appointment.isAllDay ? 'date' : 'datetime');
       const originalDateString = formatISO(appointment.startDate.toDate());

       const typeName = typesMap.get(appointment.appointmentTypeId);
       const isSonstiges = typeName === 'Sonstiges';
       const titleIsDefault = !isSonstiges && appointment.title === typeName;
       
       instanceForm.reset({
           originalDate: originalDateString,
           startDate: startDateString,
           endDate: endDateString,
           title: titleIsDefault ? '' : appointment.title,
           locationId: appointment.locationId ?? '',
           description: appointment.description ?? '',
           meetingPoint: appointment.meetingPoint ?? '',
           meetingTime: appointment.meetingTime ?? '',
       });
       setIsInstanceDialogOpen(true);
  };
  
    const handleEditSerie = (appointment: UnrolledAppointment) => {
        const originalAppointment = appointments?.find(app => app.id === appointment.originalId);
        if (!originalAppointment) return;

        setSelectedAppointment(originalAppointment);
        
        const formatTimestampForInput = (ts: Timestamp | undefined, type: 'datetime' | 'date' = 'datetime') => {
            if (!ts) return '';
            const date = ts.toDate();
            if (!isDateValid(date)) return '';
            if (type === 'date') return format(date, 'yyyy-MM-dd');
            return format(date, "yyyy-MM-dd'T'HH:mm");
        };

        const startDateString = formatTimestampForInput(originalAppointment.startDate, originalAppointment.isAllDay ? 'date' : 'datetime');
        const endDateString = formatTimestampForInput(originalAppointment.endDate, originalAppointment.isAllDay ? 'date' : 'datetime');
        const rsvpDeadlineString = formatTimestampForInput(originalAppointment.rsvpDeadline);
        const recurrenceEndDateString = formatTimestampForInput(originalAppointment.recurrenceEndDate, 'date');
        
        const typeName = typesMap.get(originalAppointment.appointmentTypeId);
        const isSonstiges = typeName === 'Sonstiges';
        const titleIsDefault = !isSonstiges && originalAppointment.title === typeName;

        appointmentForm.reset({
            title: titleIsDefault ? '' : originalAppointment.title,
            appointmentTypeId: originalAppointment.appointmentTypeId,
            startDate: startDateString,
            endDate: endDateString,
            isAllDay: originalAppointment.isAllDay || false,
            locationId: originalAppointment.locationId || '',
            description: originalAppointment.description || '',
            visibilityType: originalAppointment.visibility.type,
            visibleTeamIds: originalAppointment.visibility.teamIds || [],
            recurrence: originalAppointment.recurrence || 'none',
            recurrenceEndDate: recurrenceEndDateString,
            rsvpDeadline: rsvpDeadlineString,
            meetingPoint: originalAppointment.meetingPoint || '',
            meetingTime: originalAppointment.meetingTime || '',
        });
        setIsAppointmentDialogOpen(true);
    };

  const resetAppointmentForm = () => {
    appointmentForm.reset({
      title: '',
      startDate: '',
      endDate: '',
      isAllDay: false,
      visibilityType: 'all',
      visibleTeamIds: [],
      recurrence: 'none',
    });
    setSelectedAppointment(null);
  };
  
  const onSubmitAppointmentType = async (data: AppointmentTypeFormValues) => {
    if (!firestore) return;
    try {
        await addDoc(collection(firestore, 'appointmentTypes'), data);
        toast({ title: 'Termin-Art erstellt.' });
        typeForm.reset();
    } catch(e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'appointmentTypes', operation: 'create', requestResourceData: data }));
    }
  };
  
  const onSubmitLocation = async (data: LocationFormValues) => {
    if (!firestore) return;
    try {
        await addDoc(collection(firestore, 'locations'), data);
        toast({ title: 'Ort erstellt.' });
        locationForm.reset();
    } catch(e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'locations', operation: 'create', requestResourceData: data }));
    }
  };

  const handleDeleteItem = async () => {
    if (!firestore || !itemToDelete) return;
    
    const { id, type } = itemToDelete;
    const collectionName = type === 'location' ? 'locations' : 'appointmentTypes';

    try {
        await deleteDoc(doc(firestore, collectionName, id));
        toast({ title: `${type === 'location' ? 'Ort' : 'Art'} gelöscht.` });
    } catch (e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `${collectionName}/${id}`, operation: 'delete' }));
    } finally {
        setItemToDelete(null);
    }
  };

  const isLoading = isLoadingAppointments || isLoadingTypes || isLoadingLocations || isLoadingGroups || isLoadingExceptions;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Dialog open={isAppointmentDialogOpen} onOpenChange={(open) => {
          if(!open) {
              resetAppointmentForm();
          }
          setIsAppointmentDialogOpen(open);
      }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                  <DialogTitle>{selectedAppointment ? 'Terminserie bearbeiten' : 'Neue Terminserie erstellen'}</DialogTitle>
              </DialogHeader>
              <Form {...appointmentForm}>
                  <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-6 p-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={appointmentForm.control} name="appointmentTypeId" render={({ field }) => ( <FormItem> <FormLabel>Art des Termins</FormLabel> <div className="flex gap-2"> <Select onValueChange={field.onChange} value={field.value ?? ''}> <FormControl><SelectTrigger><SelectValue placeholder="Art auswählen..." /></SelectTrigger></FormControl> <SelectContent>{isLoadingTypes ? <SelectItem value="loading" disabled>Lade...</SelectItem> : appointmentTypes?.map(type => (<SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>))}</SelectContent> </Select> <Button type="button" variant="outline" onClick={() => setIsTypeDialogOpen(true)}><Plus className="h-4 w-4" /></Button> </div> <FormMessage /> </FormItem> )}/>
                        {watchAppointmentTypeId === sonstigeTypeId && ( <FormField control={appointmentForm.control} name="title" render={({ field }) => ( <FormItem> <FormLabel>Titel</FormLabel> <FormControl><Input placeholder="Titel für 'Sonstiges'..." {...field} /></FormControl> <FormMessage /> </FormItem> )}/> )}
                      </div>
                      <FormField control={appointmentForm.control} name="isAllDay" render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"> <div className="space-y-0.5"><FormLabel>Ganztägig</FormLabel></div> <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl> </FormItem> )}/>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={appointmentForm.control} name="startDate" render={({ field }) => ( <FormItem> <FormLabel>Beginn</FormLabel> <FormControl><Input type={watchIsAllDay ? "date" : "datetime-local"} {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                        <FormField control={appointmentForm.control} name="endDate" render={({ field }) => ( <FormItem> <FormLabel>Ende</FormLabel> <FormControl><Input type={watchIsAllDay ? "date" : "datetime-local"} {...field} min={appointmentForm.getValues("startDate")} /></FormControl> <FormMessage /> </FormItem> )}/>
                      </div>
                      <FormField control={appointmentForm.control} name="recurrence" render={({ field }) => ( <FormItem> <FormLabel>Wiederholung</FormLabel> <Select onValueChange={field.onChange} value={field.value ?? 'none'}> <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl> <SelectContent> <SelectItem value="none">Keine</SelectItem> <SelectItem value="daily">Täglich</SelectItem> <SelectItem value="weekly">Wöchentlich</SelectItem> <SelectItem value="bi-weekly">Alle 2 Wochen</SelectItem> <SelectItem value="monthly">Monatlich</SelectItem> </SelectContent> </Select> </FormItem> )}/>
                      {watchRecurrence !== 'none' && (<FormField control={appointmentForm.control} name="recurrenceEndDate" render={({ field }) => ( <FormItem> <FormLabel>Wiederholung endet am</FormLabel> <FormControl><Input type="date" {...field} min={appointmentForm.getValues("startDate")} /></FormControl> <FormMessage /> </FormItem> )}/> )}
                      <FormField control={appointmentForm.control} name="rsvpDeadline" render={({ field }) => ( <FormItem> <FormLabel>Rückmeldefrist (optional)</FormLabel> <FormControl><Input type="datetime-local" {...field} /></FormControl> <FormMessage /> </FormItem> )}/>
                      <FormField control={appointmentForm.control} name="locationId" render={({ field }) => ( <FormItem> <FormLabel>Ort</FormLabel> <div className="flex gap-2"> <Select onValueChange={field.onChange} value={field.value ?? ''}> <FormControl><SelectTrigger><SelectValue placeholder="Ort auswählen..." /></SelectTrigger></FormControl> <SelectContent>{isLoadingLocations ? <SelectItem value="loading" disabled>Lade...</SelectItem> : locations?.map(loc => (<SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>))}</SelectContent> </Select> <Button type="button" variant="outline" onClick={() => setIsLocationDialogOpen(true)}><Plus className="h-4 w-4" /></Button> </div> <FormMessage /> </FormItem> )}/>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField control={appointmentForm.control} name="meetingPoint" render={({ field }) => ( <FormItem><FormLabel>Treffpunkt (optional)</FormLabel><FormControl><Input placeholder="z.B. Eingang Halle" {...field}/></FormControl></FormItem> )}/>
                        <FormField control={appointmentForm.control} name="meetingTime" render={({ field }) => ( <FormItem><FormLabel>Treffzeit (optional)</FormLabel><FormControl><Input placeholder="z.B. 18:45 Uhr" {...field}/></FormControl></FormItem> )}/>
                      </div>
                      <FormField control={appointmentForm.control} name="description" render={({ field }) => ( <FormItem><FormLabel>Beschreibung (optional)</FormLabel><FormControl><Textarea placeholder="Weitere Details zum Termin..." {...field}/></FormControl></FormItem> )}/>
                      <FormField control={appointmentForm.control} name="visibilityType" render={({ field }) => ( <FormItem><FormLabel>Sichtbarkeit</FormLabel><Select onValueChange={field.onChange} value={field.value ?? 'all'}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="all">Alle</SelectItem><SelectItem value="specificTeams">Bestimmte Mannschaften</SelectItem></SelectContent></Select></FormItem> )}/>
                      {watchVisibilityType === 'specificTeams' && (<FormField control={appointmentForm.control} name="visibleTeamIds" render={() => ( <FormItem> <div className="mb-4"><FormLabel>Mannschaften</FormLabel><FormDescription>Wählen Sie die Mannschaften aus, die diesen Termin sehen können.</FormDescription></div> <Popover> <PopoverTrigger asChild> <Button variant="outline" className="w-full justify-start text-left font-normal"> <Plus className="mr-2 h-4 w-4" /> Mannschaften auswählen <span className="ml-auto text-xs">{appointmentForm.watch('visibleTeamIds').length} ausgewählt</span> </Button> </PopoverTrigger> <PopoverContent className="w-auto p-0"> <ScrollArea className="h-72"> <div className="p-4 space-y-4"> {groupedTeams.map(group => ( <div key={group.id}> <h4 className="font-semibold text-sm mb-2 border-b pb-1">{group.name}</h4> <div className="flex flex-col space-y-2"> {group.teams.map(team => ( <FormField key={team.id} control={appointmentForm.control} name="visibleTeamIds" render={({ field }) => ( <FormItem className="flex flex-row items-center space-x-3 space-y-0"> <FormControl> <Checkbox checked={field.value?.includes(team.id)} onCheckedChange={(checked) => { return checked ? field.onChange([...field.value, team.id]) : field.onChange(field.value?.filter(value => value !== team.id)); }} /> </FormControl> <FormLabel className="font-normal">{team.name}</FormLabel> </FormItem> )}/> ))} </div> </div> ))} </div> </ScrollArea> </PopoverContent> </Popover> <FormMessage /> </FormItem> )}/>)}

                      <DialogFooter>
                          <DialogClose asChild><Button type="button" variant="ghost">Abbrechen</Button></DialogClose>
                          <Button type="button" onClick={appointmentForm.handleSubmit(onSubmitAppointment)} disabled={isSubmitting}>
                              {isSubmitting && (<Loader2 className="mr-2 h-4 w-4 animate-spin" />)}
                              {selectedAppointment ? 'Änderungen speichern' : 'Termin erstellen'}
                          </Button>
                      </DialogFooter>
                  </form>
              </Form>
          </DialogContent>
      </Dialog>
      
      <Dialog open={isInstanceDialogOpen} onOpenChange={(open) => {
          setIsInstanceDialogOpen(open);
          if (!open) { setSelectedInstanceToEdit(null); instanceForm.reset(); }
      }}>
          <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                  <DialogTitle>Einzelnen Termin bearbeiten</DialogTitle>
                  <DialogDescription>
                      Ändere Details nur für diesen spezifischen Termin am {selectedInstanceToEdit?.startDate ? format(selectedInstanceToEdit.startDate.toDate(), 'dd.MM.yyyy HH:mm', { locale: de }) : ''}.
                      Die Änderungen werden als Ausnahme zur Serie gespeichert.
                  </DialogDescription>
              </DialogHeader>
              <Form {...instanceForm}>
                  <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); }} className="space-y-4 pt-4">
                      <input type="hidden" {...instanceForm.register('originalDate')} />
                      <FormField control={instanceForm.control} name="startDate" render={({ field }) => ( <FormItem><FormLabel>Beginn</FormLabel><FormControl><Input type={selectedInstanceToEdit?.isAllDay ? "date" : "datetime-local"} {...field} /></FormControl><FormMessage /></FormItem> )}/>
                      {!selectedInstanceToEdit?.isAllDay && <FormField control={instanceForm.control} name="endDate" render={({ field }) => ( <FormItem><FormLabel>Ende (optional)</FormLabel><FormControl><Input type="datetime-local" {...field} min={instanceForm.getValues("startDate")} /></FormControl><FormMessage /></FormItem> )}/>}
                      
                      <FormField control={instanceForm.control} name="title" render={({ field }) => {
                           const typeName = selectedInstanceToEdit ? typesMap.get(selectedInstanceToEdit.appointmentTypeId) : '';
                           const isSonstiges = typeName === 'Sonstiges';
                           return (
                               <FormItem>
                                   <FormLabel>Titel {isSonstiges ? '' : <span className="text-xs text-muted-foreground">(Optional, Standard: Art)</span>}</FormLabel>
                                   <FormControl><Input placeholder={isSonstiges ? "Titel ist erforderlich..." : "Optionaler Titel..."} {...field} value={field.value || ''}/></FormControl>
                                   <FormMessage />
                               </FormItem>
                           );
                       }}/>

                      <FormField control={instanceForm.control} name="locationId" render={({ field }) => ( <FormItem> <FormLabel>Ort</FormLabel> <Select onValueChange={field.onChange} value={field.value ?? ''}> <FormControl><SelectTrigger><SelectValue placeholder="Ort auswählen..." /></SelectTrigger></FormControl> <SelectContent>{isLoadingLocations ? <SelectItem value="loading" disabled>Lade...</SelectItem> : locations?.map(loc => (<SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>))}</SelectContent> </Select> <FormMessage /> </FormItem> )}/>
                      <FormField control={instanceForm.control} name="meetingPoint" render={({ field }) => ( <FormItem><FormLabel>Treffpunkt (optional)</FormLabel><FormControl><Input placeholder="z.B. Eingang Halle" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem> )}/>
                      <FormField control={instanceForm.control} name="meetingTime" render={({ field }) => ( <FormItem><FormLabel>Treffzeit (optional)</FormLabel><FormControl><Input placeholder="z.B. 18:45 Uhr" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem> )}/>
                      <FormField control={instanceForm.control} name="description" render={({ field }) => ( <FormItem><FormLabel>Beschreibung (optional)</FormLabel><FormControl><Textarea placeholder="Weitere Details..." {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem> )}/>

                      <DialogFooter className="pt-4">
                          <DialogClose asChild><Button type="button" variant="ghost">Abbrechen</Button></DialogClose>
                          <Button type="button" onClick={instanceForm.handleSubmit(onSubmitSingleInstance)} disabled={isSubmitting}>
                              {isSubmitting && (<Loader2 className="mr-2 h-4 w-4 animate-spin" />)}
                              Änderung speichern
                          </Button>
                      </DialogFooter>
                  </form>
              </Form>
          </DialogContent>
      </Dialog>
      
      <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Termin-Arten verwalten</DialogTitle>
                  <DialogDescription>Füge neue Arten hinzu oder lösche bestehende.</DialogDescription>
              </DialogHeader>
              <Form {...typeForm}>
                  <form onSubmit={typeForm.handleSubmit(onSubmitAppointmentType)} className="space-y-4 pt-4">
                       <FormField control={typeForm.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Name der neuen Art</FormLabel><FormControl><Input placeholder="z.B. Sitzung" {...field}/></FormControl><FormMessage/></FormItem> )}/>
                       <Button type="submit" disabled={typeForm.formState.isSubmitting}>Neue Art erstellen</Button>
                  </form>
              </Form>
              <div className="mt-6">
                <h3 className="mb-2 font-medium text-sm">Bestehende Arten</h3>
                <ScrollArea className="h-40 rounded-md border">
                    <div className="p-4 space-y-2">
                        {appointmentTypes?.map(item => (
                            <div key={item.id} className="flex items-center justify-between">
                                <span>{item.name}</span>
                                <Button variant="ghost" size="icon" onClick={() => setItemToDelete({ id: item.id, name: item.name, type: 'type' })}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
              </div>
          </DialogContent>
      </Dialog>

      <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
         <DialogContent>
            <DialogHeader>
                <DialogTitle>Orte verwalten</DialogTitle>
                <DialogDescription>Füge neue Orte hinzu oder lösche bestehende.</DialogDescription>
            </DialogHeader>
            <Form {...locationForm}>
                <form onSubmit={locationForm.handleSubmit(onSubmitLocation)} className="space-y-4 pt-4">
                    <FormField control={locationForm.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Name des neuen Ortes</FormLabel><FormControl><Input placeholder="z.B. Halle West" {...field}/></FormControl><FormMessage/></FormItem> )}/>
                    <FormField control={locationForm.control} name="address" render={({ field }) => ( <FormItem><FormLabel>Adresse (optional)</FormLabel><FormControl><Input placeholder="Straße, PLZ Ort" {...field}/></FormControl><FormMessage/></FormItem> )}/>
                    <Button type="submit" disabled={locationForm.formState.isSubmitting}>Neuen Ort erstellen</Button>
                </form>
            </Form>
             <div className="mt-6">
                <h3 className="mb-2 font-medium text-sm">Bestehende Orte</h3>
                <ScrollArea className="h-40 rounded-md border">
                    <div className="p-4 space-y-2">
                        {locations?.map(item => (
                            <div key={item.id} className="flex items-center justify-between">
                                <span>{item.name}</span>
                                <Button variant="ghost" size="icon" onClick={() => setItemToDelete({ id: item.id, name: item.name, type: 'location' })}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
              </div>
         </DialogContent>
      </Dialog>

      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>Sind Sie sicher?</AlertDialogTitle>
                  <AlertDialogDescription>
                      Möchten Sie "{itemToDelete?.name}" wirklich löschen? Dies kann nicht rückgängig gemacht werden.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setItemToDelete(null)}>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteItem}>Löschen</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>


      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-3"> <ListTodo className="h-6 w-6" /> <span>Alle Termine</span> </CardTitle>
            <div className="flex items-center gap-2">
                 <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Nach Art filtern..." /></SelectTrigger><SelectContent><SelectItem value="all">Alle Arten</SelectItem>{appointmentTypes?.map(type => (<SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>))}</SelectContent></Select>
                 <Select value={teamFilter} onValueChange={setTeamFilter}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Nach Team filtern..." /></SelectTrigger><SelectContent><SelectItem value="all">Alle Teams</SelectItem>{teams.map(team => (<SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>))}</SelectContent></Select>
                 <Button onClick={() => { resetAppointmentForm(); setIsAppointmentDialogOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" /> Neue Serie
                 </Button>
            </div>
          </div>
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

                      let rsvpDeadlineString = '-';
                      if (app.startDate && app.rsvpDeadline) {
                        try {
                            const originalAppointment = appointments?.find(a => a.id === app.originalId);
                            if(originalAppointment && originalAppointment.startDate && originalAppointment.rsvpDeadline) {
                                const offset = originalAppointment.startDate.toMillis() - originalAppointment.rsvpDeadline.toMillis();
                                const instanceRsvpMillis = app.startDate.toMillis() - offset;
                                rsvpDeadlineString = format(new Date(instanceRsvpMillis), 'dd.MM.yy HH:mm');
                            }
                        } catch (e) {
                            console.error("Error calculating RSVP deadline", e);
                        }
                      }

                      return (
                        <TableRow key={app.virtualId || app.id} className={cn("transition-opacity", isCancelled && "text-muted-foreground line-through opacity-60")}>
                          <TableCell className="font-medium max-w-[200px] truncate">{displayTitle} {app.isException && <span className='text-xs text-blue-500'>(geändert)</span>}</TableCell>
                          <TableCell>
                            {app.startDate ? format(app.startDate.toDate(), app.isAllDay ? 'dd.MM.yy' : 'dd.MM.yy HH:mm', { locale: de }) : 'N/A'}
                            {app.endDate && !app.isAllDay && (<> - {format(app.endDate.toDate(), 'HH:mm', { locale: de })}</>)}
                            {app.isAllDay && <span className="text-xs text-muted-foreground"> (Ganztags)</span>}
                          </TableCell>
                          <TableCell>{app.visibility.type === 'all' ? 'Alle' : (app.visibility.teamIds.map(id => teamsMap.get(id) || id).join(', ') || '-')}</TableCell>
                          <TableCell>{app.locationId ? (locationsMap.get(app.locationId) || '-') : '-'}</TableCell>
                          <TableCell>{app.recurrence && app.recurrence !== 'none' ? `bis ${app.recurrenceEndDate ? format(app.recurrenceEndDate.toDate(), 'dd.MM.yy', { locale: de }) : '...'}` : '-'}</TableCell>
                          <TableCell>{rsvpDeadlineString}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditAppointment(app)} disabled={isCancelled}>
                               <Edit className="h-4 w-4" />
                               <span className="sr-only">Termin bearbeiten</span>
                            </Button>
                            
                            {app.virtualId && !isCancelled && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild><Button variant="ghost" size="icon"> <CalendarX className="h-4 w-4 text-orange-600" /> <span className="sr-only">Diesen Termin absagen</span></Button></AlertDialogTrigger>
                                  <AlertDialogContent>
                                      <AlertDialogHeader> <AlertDialogTitle>Nur diesen Termin absagen?</AlertDialogTitle> <AlertDialogDescription>Möchten Sie nur den Termin am {format(app.startDate.toDate(), 'dd.MM.yyyy')} absagen? Die Serie bleibt bestehen.</AlertDialogDescription> </AlertDialogHeader>
                                      <AlertDialogFooter> <AlertDialogCancel>Abbrechen</AlertDialogCancel> <AlertDialogAction onClick={() => handleCancelSingleInstance(app)}>Absagen</AlertDialogAction> </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                            )}
                            
                             <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="ghost" size="icon"> <Trash2 className="h-4 w-4 text-destructive" /> <span className="sr-only">Serie löschen</span></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader> <AlertDialogTitle>Ganze Serie löschen?</AlertDialogTitle> <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden und löscht die gesamte Terminserie "{app.title}" und alle zugehörigen Ausnahmen.</AlertDialogDescription> </AlertDialogHeader>
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

export default function AdminTerminePage() {
    const { isAdmin, isUserLoading } = useUser();
    if (isUserLoading) { return ( <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> ); }
    if (!isAdmin) { return ( <div className="container mx-auto p-4 sm:p-6 lg:p-8"><Card className="border-destructive/50"><CardHeader><CardTitle className="flex items-center gap-3 text-destructive"><ListTodo className="h-8 w-8" /><span className="text-2xl font-headline">Zugriff verweigert</span></CardTitle></CardHeader><CardContent><p className="text-muted-foreground">Sie verfügen nicht über die erforderlichen Berechtigungen...</p></CardContent></Card></div> ); }
    return <AdminTerminePageContent />;
}

    
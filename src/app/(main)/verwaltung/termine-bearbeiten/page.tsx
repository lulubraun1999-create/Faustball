
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
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
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  query,
  where,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import type { Appointment, AppointmentType, Group, Location, AppointmentException } from '@/lib/types';
import { Loader2, CalendarPlus, Edit, Trash2, X, AlertTriangle, ArrowRight, Plus } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format as formatDate, addDays, addMonths, addWeeks, isBefore, startOfDay, set, getYear, getMonth, differenceInMilliseconds } from "date-fns";
import { de } from 'date-fns/locale';

const appointmentSchema = z.object({
    id: z.string().optional(),
    title: z.string().optional(),
    appointmentTypeId: z.string().min(1, 'Terminart ist erforderlich.'),
    startDate: z.string().min(1, 'Startdatum ist erforderlich.'),
    endDate: z.string().optional(),
    isAllDay: z.boolean().default(false),
    locationId: z.string().optional(),
    description: z.string().optional(),
    meetingPoint: z.string().optional(),
    meetingTime: z.string().optional(),
    visibilityType: z.enum(['all', 'specificTeams']).default('all'),
    visibleTeamIds: z.array(z.string()).default([]),
    recurrence: z.enum(['none', 'daily', 'weekly', 'bi-weekly', 'monthly']).default('none'),
    recurrenceEndDate: z.string().optional(),
    rsvpDeadline: z.string().optional(),
    // NEU: Felder für Bearbeitungsmodus
    editMode: z.enum(['single', 'future']).optional(),
    originalDateISO: z.string().optional(), 
  }).refine(data => {
      if (data.recurrence !== 'none' && !data.recurrenceEndDate) {
          return false;
      }
      return true;
  }, {
      message: 'Ein Enddatum für die Wiederholung ist erforderlich.',
      path: ['recurrenceEndDate'],
  }).refine(data => {
    if (data.endDate && data.startDate && new Date(data.endDate) < new Date(data.startDate)) {
        return false;
    }
    return true;
  }, {
      message: 'Das Enddatum darf nicht vor dem Startdatum liegen.',
      path: ['endDate'],
  });

type AppointmentFormValues = z.infer<typeof appointmentSchema>;

type UnrolledAppointment = Appointment & {
  instanceDate: Date; 
  virtualId: string;
  originalId: string;
  isCancelled: boolean;
  isException: boolean;
};

export default function AppointmentManagementPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { isAdmin, isUserLoading, user } = useUser();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<UnrolledAppointment | null>(null);
  const [editMode, setEditMode] = useState<'single' | 'future' | null>(null);

  // Data fetching
  const appointmentsRef = useMemoFirebase(() => firestore ? collection(firestore, 'appointments') : null, [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);

  const exceptionsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentExceptions') : null), [firestore]);
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);

  const appointmentTypesRef = useMemoFirebase(() => firestore ? collection(firestore, 'appointmentTypes') : null, [firestore]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(appointmentTypesRef);
  
  const locationsRef = useMemoFirebase(() => firestore ? collection(firestore, 'locations') : null, [firestore]);
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsRef);

  const groupsRef = useMemoFirebase(() => firestore ? collection(firestore, 'groups') : null, [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const teams = groups?.filter(g => g.type === 'team').sort((a,b) => a.name.localeCompare(b.name)) || [];

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '',
      appointmentTypeId: '',
      startDate: '',
      endDate: '',
      isAllDay: false,
      locationId: '',
      description: '',
      meetingPoint: '',
      meetingTime: '',
      visibilityType: 'all',
      visibleTeamIds: [],
      recurrence: 'none',
      recurrenceEndDate: '',
      rsvpDeadline: '',
    },
  });

  const watchVisibilityType = form.watch('visibilityType');

  // Logic to unroll recurring appointments
  const { unrolledAppointments, isProcessing } = useMemo(() => {
    if (!appointments || isLoadingExceptions) return { unrolledAppointments: [], isProcessing: true };

    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions?.forEach(ex => {
      if (ex.originalDate && ex.originalDate instanceof Timestamp) {
        const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
        exceptionsMap.set(key, ex);
      }
    });

    const allEvents: UnrolledAppointment[] = [];
    const today = startOfDay(new Date());

    appointments.forEach(app => {
      if (!app.startDate || !(app.startDate instanceof Timestamp)) return;
      const recurrenceEndDate = app.recurrenceEndDate ? app.recurrenceEndDate.toDate() : null;
      const appStartDate = app.startDate.toDate();

      if (app.recurrence === 'none' || !app.recurrence || !recurrenceEndDate) {
        if (isBefore(appStartDate, today)) return;

        const originalDateStartOfDayISO = startOfDay(appStartDate).toISOString();
        const exception = exceptionsMap.get(`${app.id}-${originalDateStartOfDayISO}`);
        if (exception?.status === 'cancelled') return;

        let finalData: Appointment = { ...app };
        let isException = false;
        if (exception?.status === 'modified' && exception.modifiedData) {
          const modData = exception.modifiedData;
          finalData = {
            ...app,
            ...modData,
            startDate: modData.startDate || app.startDate,
            endDate: modData.endDate === undefined ? app.endDate : (modData.endDate || undefined),
            id: app.id
          };
          isException = true;
        }

        allEvents.push({
          ...finalData,
          instanceDate: finalData.startDate.toDate(),
          originalId: app.id,
          virtualId: app.id,
          isCancelled: false,
          isException,
        });
      } else {
        let currentDate = appStartDate;
        const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), currentDate) : 0;
        let iter = 0;
        const MAX_ITERATIONS = 500;
        const startMonth = getMonth(currentDate);
        const startDayOfMonth = currentDate.getDate();

        while (currentDate <= recurrenceEndDate && iter < MAX_ITERATIONS) {
          if (currentDate >= today) {
            const currentDateStartOfDayISO = startOfDay(currentDate).toISOString();
            const instanceException = exceptionsMap.get(`${app.id}-${currentDateStartOfDayISO}`);

            if (instanceException?.status !== 'cancelled') {
              let isException = false;
              let instanceData: Appointment = { ...app };
              let instanceStartDate = currentDate;
              let instanceEndDate: Date | undefined = duration > 0 ? new Date(currentDate.getTime() + duration) : undefined;
              
              if (instanceException?.status === 'modified' && instanceException.modifiedData) {
                  isException = true;
                  const modData = instanceException.modifiedData;
                  instanceData = { ...instanceData, ...modData };
                  instanceStartDate = modData.startDate?.toDate() ?? instanceStartDate;
                  instanceEndDate = modData.endDate?.toDate() ?? instanceEndDate;
              }

              allEvents.push({
                ...instanceData,
                id: `${app.id}-${currentDate.toISOString()}`,
                virtualId: `${app.id}-${currentDateStartOfDayISO}`,
                originalId: app.id,
                instanceDate: instanceStartDate,
                startDate: Timestamp.fromDate(instanceStartDate),
                endDate: instanceEndDate ? Timestamp.fromDate(instanceEndDate) : undefined,
                isCancelled: false,
                isException,
              });
            }
          }
          iter++;
          switch (app.recurrence) {
            case 'daily': currentDate = addDays(currentDate, 1); break;
            case 'weekly': currentDate = addWeeks(currentDate, 1); break;
            case 'bi-weekly': currentDate = addWeeks(currentDate, 2); break;
            case 'monthly':
                const nextMonth = addMonths(currentDate, 1);
                const daysInNextMonth = new Date(getYear(nextMonth), getMonth(nextMonth) + 1, 0).getDate();
                const targetDate = Math.min(startDayOfMonth, daysInNextMonth);
                currentDate = set(nextMonth, { date: targetDate });
                break;
            default: iter = MAX_ITERATIONS; break;
          }
        }
      }
    });
    return { unrolledAppointments: allEvents.sort((a,b) => a.instanceDate.getTime() - b.instanceDate.getTime()), isProcessing: false };
  }, [appointments, exceptions, isLoadingExceptions]);

  // Function to format JS Date to 'YYYY-MM-DDTHH:mm'
  const formatToDateTimeLocal = (date: Date | null | undefined) => {
    if (!date) return '';
    const d = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return d.toISOString().slice(0, 16);
  };
  
  // Function to format JS Date to 'YYYY-MM-DD'
  const formatToDate = (date: Date | null | undefined) => {
      if (!date) return '';
      return date.toISOString().split('T')[0];
  };

  const handleAddNew = () => {
    setSelectedAppointment(null);
    setEditMode(null);
    form.reset({
      title: '',
      appointmentTypeId: '',
      startDate: '',
      endDate: '',
      isAllDay: false,
      locationId: '',
      description: '',
      meetingPoint: '',
      meetingTime: '',
      visibilityType: 'all',
      visibleTeamIds: [],
      recurrence: 'none',
      recurrenceEndDate: '',
      rsvpDeadline: '',
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (app: UnrolledAppointment) => {
    setSelectedAppointment(app);
    const originalApp = appointments?.find(a => a.id === app.originalId);

    if (originalApp?.recurrence && originalApp.recurrence !== 'none') {
        // Is a recurring appointment, ask user what to edit
        setEditMode(null); // Reset mode selection
    } else {
        // Is a single appointment, open form directly
        setEditMode('single'); 
    }
    
    // Format dates for form
    const startDate = formatToDateTimeLocal(app.instanceDate);
    const endDate = app.endDate ? formatToDateTimeLocal(app.endDate.toDate()) : '';
    const recurrenceEndDate = originalApp?.recurrenceEndDate ? formatToDate(originalApp.recurrenceEndDate.toDate()) : '';

    let rsvpDeadlineString = '';
    if (originalApp?.rsvpDeadline) {
      const startMillis = app.startDate.toMillis();
      const rsvpMillis = originalApp.rsvpDeadline.toMillis();
      const offset = startMillis - rsvpMillis; // This is wrong for series, but best guess
      const totalHours = Math.floor(offset / (1000 * 60 * 60));
      const days = Math.floor(totalHours / 24);
      const hours = totalHours % 24;
      rsvpDeadlineString = `${days}:${hours}`;
    }

    form.reset({
      id: app.originalId,
      title: app.title,
      appointmentTypeId: app.appointmentTypeId,
      startDate: startDate,
      endDate: endDate,
      isAllDay: app.isAllDay ?? false,
      locationId: app.locationId,
      description: app.description,
      meetingPoint: app.meetingPoint,
      meetingTime: app.meetingTime,
      visibilityType: app.visibility.type,
      visibleTeamIds: app.visibility.teamIds || [],
      recurrence: originalApp?.recurrence || 'none',
      recurrenceEndDate: recurrenceEndDate,
      rsvpDeadline: rsvpDeadlineString,
      originalDateISO: app.instanceDate.toISOString(),
    });
    setIsDialogOpen(true);
  };
  
  const handleEditModeSelection = (mode: 'single' | 'future') => {
      setEditMode(mode);
  }

  const handleDelete = async (appToDelete: UnrolledAppointment) => {
    if (!firestore) return;
  
    const functions = getFunctions();
    const deleteSingleFn = httpsCallable(functions, 'deleteSingleAppointmentInstance');
    const deleteFutureFn = httpsCallable(functions, 'deleteFutureAppointmentInstances');
    
    // Simple confirmation dialog
    const userChoice = window.prompt(`Möchten Sie nur diesen Termin ("diesen"), alle zukünftigen Termine ("zukünftige") oder die ganze Serie ("ganze") löschen?`);

    if (userChoice?.toLowerCase() === 'diesen') {
        try {
            await deleteSingleFn({ originalId: appToDelete.originalId, originalDateISO: appToDelete.instanceDate.toISOString() });
            toast({ title: "Termin abgesagt", description: "Der einzelne Termin wurde als abgesagt markiert."});
        } catch(e: any) {
            console.error("Error cancelling single appointment:", e);
            toast({ variant: "destructive", title: "Fehler", description: e.message });
        }
    } else if (userChoice?.toLowerCase() === 'zukünftige') {
         try {
            await deleteFutureFn({ originalId: appToDelete.originalId, originalDateISO: appToDelete.instanceDate.toISOString() });
            toast({ title: "Zukünftige Termine gelöscht", description: "Alle zukünftigen Termine wurden entfernt."});
        } catch(e: any) {
            console.error("Error deleting future appointments:", e);
            toast({ variant: "destructive", title: "Fehler", description: e.message });
        }
    } else if (userChoice?.toLowerCase() === 'ganze') {
      try {
        // Delete all exceptions associated with the series
        const q = query(collection(firestore, 'appointmentExceptions'), where('originalAppointmentId', '==', appToDelete.originalId));
        const exceptionSnapshot = await getDocs(q);
        const batch = writeBatch(firestore);
        exceptionSnapshot.forEach(doc => batch.delete(doc.ref));
        
        // Delete the main appointment document
        batch.delete(doc(firestore, 'appointments', appToDelete.originalId));
        
        await batch.commit();
        toast({ title: "Serie gelöscht", description: "Die gesamte Terminserie wurde gelöscht."});
      } catch (e: any) {
        console.error("Error deleting series:", e);
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `appointments/${appToDelete.originalId}`, operation: 'delete'
        }));
      }
    } else if (userChoice) {
        alert("Ungültige Eingabe. Bitte geben Sie 'diesen', 'zukünftige' oder 'ganze' ein.");
    }
  };


  const onSubmit = async (data: AppointmentFormValues) => {
    if (!firestore || !user) return;
    
    const isEditing = !!selectedAppointment;

    try {
        // Logic for EDITING an appointment
        if (isEditing && data.id && data.originalDateISO) {
             const functions = getFunctions();
            if (editMode === 'single') {
                 const saveSingleFn = httpsCallable(functions, 'saveSingleAppointmentException');
                 await saveSingleFn({
                     ...data,
                     originalId: data.id,
                 });
                 toast({ title: 'Änderung gespeichert', description: 'Die Änderung für diesen einzelnen Termin wurde gespeichert.' });
            } else if (editMode === 'future') {
                 const saveFutureFn = httpsCallable(functions, 'saveFutureAppointmentInstances');
                 await saveFutureFn({
                     ...data,
                     originalId: data.id,
                 });
                 toast({ title: 'Serie aktualisiert', description: 'Alle zukünftigen Termine wurden aktualisiert.' });
            }
        // Logic for CREATING a new appointment
        } else {
            const typeName = appointmentTypes?.find(t => t.id === data.appointmentTypeId)?.name || 'Termin';
            let rsvpTimestamp: Timestamp | null = null;
            if (data.rsvpDeadline) {
                const [days, hours] = data.rsvpDeadline.split(':').map(Number);
                const totalMillis = ((days * 24) + hours) * 60 * 60 * 1000;
                const startDateMillis = new Date(data.startDate).getTime();
                rsvpTimestamp = Timestamp.fromMillis(startDateMillis - totalMillis);
            }

            const newAppointmentData = {
                title: (data.title || '').trim() === '' ? typeName : data.title,
                startDate: Timestamp.fromDate(new Date(data.startDate)),
                endDate: data.endDate ? Timestamp.fromDate(new Date(data.endDate)) : null,
                isAllDay: data.isAllDay,
                appointmentTypeId: data.appointmentTypeId,
                locationId: data.locationId,
                description: data.description,
                meetingPoint: data.meetingPoint,
                meetingTime: data.meetingTime,
                recurrence: data.recurrence,
                recurrenceEndDate: data.recurrenceEndDate ? Timestamp.fromDate(new Date(data.recurrenceEndDate)) : null,
                rsvpDeadline: rsvpTimestamp,
                visibility: {
                    type: data.visibilityType,
                    teamIds: data.visibilityType === 'specificTeams' ? data.visibleTeamIds : [],
                },
                createdBy: user.uid,
                createdAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
            };

            await addDoc(collection(firestore, 'appointments'), newAppointmentData);
            toast({ title: 'Erfolg', description: `Der Termin "${newAppointmentData.title}" wurde erfolgreich erstellt.` });
        }
        
        form.reset();
        setIsDialogOpen(false);
        setSelectedAppointment(null);
        setEditMode(null);

    } catch (e: any) {
        console.error("Error saving appointment:", e);
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `appointments`,
            operation: 'write', // Generic write as it can be create or update
            requestResourceData: data,
        }));
        toast({
            variant: 'destructive',
            title: 'Fehler beim Speichern des Termins',
            description: e.message,
        });
    }
  };

  const isLoading = isUserLoading || isLoadingTypes || isLoadingLocations || isLoadingGroups || isLoadingAppointments || isProcessing || isLoadingExceptions;
  
  if (isLoading) {
    return (
      <div className="container mx-auto flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Zugriff verweigert</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Sie haben keine Berechtigung, auf diese Seite zuzugreifen.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderEditModeSelection = () => (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
        <DialogHeader>
            <DialogTitle className="text-center text-2xl">Was möchten Sie bearbeiten?</DialogTitle>
            <DialogDescription className="text-center">
                Dies ist ein Serientermin. Sie können nur diese eine Instanz oder alle zukünftigen Instanzen bearbeiten.
            </DialogDescription>
        </DialogHeader>
        <div className="flex w-full gap-4">
            <Button className="w-1/2" variant="outline" size="lg" onClick={() => handleEditModeSelection('single')}>
                Nur diesen Termin
            </Button>
            <Button className="w-1/2" size="lg" onClick={() => handleEditModeSelection('future')}>
                Alle zukünftigen Termine
            </Button>
        </div>
    </div>
  );

  const renderForm = () => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
         <ScrollArea className="max-h-[70vh] p-4">
             <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField control={form.control} name="appointmentTypeId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Art des Termins*</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Terminart auswählen..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {appointmentTypes?.map(type => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="title" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Titel (optional)</FormLabel>
                            <FormControl><Input placeholder="Wird automatisch gesetzt, wenn leer" {...field} /></FormControl>
                            <FormDescription>Wenn leer, wird der Name der Terminart verwendet.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="locationId" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Ort</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Ort auswählen..." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {locations?.map(loc => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="startDate" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Startdatum & Uhrzeit*</FormLabel>
                            <FormControl><Input type="datetime-local" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="endDate" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Enddatum & Uhrzeit</FormLabel>
                            <FormControl><Input type="datetime-local" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="isAllDay" render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm h-full">
                            <div className="space-y-0.5"><FormLabel>Ganztägig</FormLabel></div>
                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        </FormItem>
                    )}/>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                     <FormField control={form.control} name="recurrence" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Wiederholung</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={!!selectedAppointment}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Wiederholung auswählen" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="none">Keine</SelectItem>
                                    <SelectItem value="daily">Täglich</SelectItem>
                                    <SelectItem value="weekly">Wöchentlich</SelectItem>
                                    <SelectItem value="bi-weekly">Alle 2 Wochen</SelectItem>
                                    <SelectItem value="monthly">Monatlich</SelectItem>
                                </SelectContent>
                            </Select>
                             {selectedAppointment && <FormDescription>Wiederholungen können nicht nachträglich geändert werden.</FormDescription>}
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="recurrenceEndDate" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Ende der Wiederholung</FormLabel>
                            <FormControl><Input type="date" {...field} disabled={form.watch('recurrence') === 'none' || !!selectedAppointment} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="rsvpDeadline" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Rückmeldefrist</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Frist für Rückmeldung" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="0:12">12 Stunden vorher</SelectItem>
                                    <SelectItem value="1:0">1 Tag vorher</SelectItem>
                                    <SelectItem value="2:0">2 Tage vorher</SelectItem>
                                    <SelectItem value="3:0">3 Tage vorher</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}/>
                </div>
                 <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <FormField control={form.control} name="meetingPoint" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Treffpunkt</FormLabel>
                            <FormControl><Input placeholder="z.B. Vor der Halle" {...field} /></FormControl>
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="meetingTime" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Treffzeit</FormLabel>
                            <FormControl><Input placeholder="z.B. 1h vor Beginn" {...field} /></FormControl>
                        </FormItem>
                    )}/>
                    <div className="md:col-span-2">
                        <FormField control={form.control} name="description" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Beschreibung</FormLabel>
                            <FormControl><Textarea placeholder="Zusätzliche Informationen zum Termin" {...field} /></FormControl>
                        </FormItem>
                    )}/>
                    </div>
                </div>
                 <div>
                    <FormField control={form.control} name="visibilityType" render={({ field }) => (
                        <FormItem className="space-y-3">
                            <FormLabel>Sichtbarkeit</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value="all">Alle</SelectItem>
                                    <SelectItem value="specificTeams">Bestimmte Mannschaften</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormItem>
                    )}/>
                    {watchVisibilityType === 'specificTeams' && (
                        <div className="pt-4">
                            <FormField control={form.control} name="visibleTeamIds" render={() => (
                                <FormItem>
                                    <FormLabel>Mannschaften auswählen</FormLabel>
                                    <ScrollArea className="h-32 rounded-md border p-4">
                                        <div className="grid grid-cols-2 gap-2">
                                            {teams.map(team => (
                                                <FormField key={team.id} control={form.control} name="visibleTeamIds" render={({ field }) => (
                                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                                        <FormControl>
                                                            <Checkbox checked={field.value?.includes(team.id)} onCheckedChange={checked => {
                                                                return checked
                                                                    ? field.onChange([...field.value || [], team.id])
                                                                    : field.onChange(field.value?.filter(value => value !== team.id));
                                                            }} />
                                                        </FormControl>
                                                        <FormLabel className="font-normal">{team.name}</FormLabel>
                                                    </FormItem>
                                                )} />
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </FormItem>
                            )}/>
                        </div>
                    )}
                 </div>
              </div>
          </ScrollArea>

          <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => { setIsDialogOpen(false); setEditMode(null); }}>Abbrechen</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {selectedAppointment ? 'Änderungen speichern' : 'Termin erstellen'}
              </Button>
          </DialogFooter>
      </form>
    </Form>
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
       <div className="flex items-center justify-between mb-6">
            <h1 className="flex items-center gap-3 text-3xl font-bold">
                <CalendarPlus className="h-8 w-8 text-primary" />
                <span className="font-headline">Termine verwalten</span>
            </h1>
            <Button onClick={handleAddNew}>
                <Plus className="mr-2 h-4 w-4" />
                Neuen Termin erstellen
            </Button>
        </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { setIsDialogOpen(false); setEditMode(null); } else { setIsDialogOpen(true); }}}>
        <DialogContent className="max-h-[90vh] sm:max-w-3xl">
          {(selectedAppointment && selectedAppointment.recurrence !== 'none' && !editMode) ? renderEditModeSelection() : renderForm()}
        </DialogContent>
      </Dialog>
      
      <Card>
          <CardHeader>
              <CardTitle>Bestehende Termine</CardTitle>
              <CardDescription>Übersicht aller bevorstehenden Termine.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
               <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Titel</TableHead>
                        <TableHead>Datum</TableHead>
                        <TableHead>Art</TableHead>
                        <TableHead>Wiederholung</TableHead>
                        <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {unrolledAppointments.length > 0 ? (
                        unrolledAppointments.map(app => (
                            <TableRow key={app.virtualId}>
                                <TableCell className="font-medium">{app.title}</TableCell>
                                <TableCell>{formatDate(app.instanceDate, 'dd.MM.yyyy HH:mm')}</TableCell>
                                <TableCell>{appointmentTypes?.find(t => t.id === app.appointmentTypeId)?.name || 'N/A'}</TableCell>
                                <TableCell>{app.recurrence !== 'none' ? 'Serie' : 'Einzel'}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(app)}><Edit className="h-4 w-4" /></Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Termin löschen</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Möchten Sie diesen Termin wirklich löschen?
                                                    {app.recurrence !== 'none' && " Dies ist ein Serientermin. Bitte wählen Sie, was Sie löschen möchten."}
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter className="sm:justify-start">
                                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                                 {app.recurrence !== 'none' ? (
                                                     <>
                                                      <AlertDialogAction onClick={() => handleDelete({ ...app, editMode: 'single' } as any)}>Nur diesen</AlertDialogAction>
                                                      <AlertDialogAction onClick={() => handleDelete({ ...app, editMode: 'future' } as any)}>Diesen & zukünftige</AlertDialogAction>
                                                      <AlertDialogAction onClick={() => handleDelete({ ...app, editMode: 'all' } as any)}>Ganze Serie</AlertDialogAction>
                                                    </>
                                                 ) : (
                                                    <AlertDialogAction onClick={() => handleDelete(app)}>Endgültig löschen</AlertDialogAction>
                                                 )}
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow><TableCell colSpan={5} className="text-center h-24">Keine bevorstehenden Termine gefunden.</TableCell></TableRow>
                    )}
                </TableBody>
               </Table>
            </div>
          </CardContent>
      </Card>
    </div>
  );
}

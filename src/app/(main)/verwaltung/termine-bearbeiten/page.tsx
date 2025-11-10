
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
import type { Appointment, AppointmentType, Group, Location, AppointmentException, MemberProfile, AppointmentResponse } from '@/lib/types';
import { Loader2, CalendarPlus, Edit, Trash2, X, AlertTriangle, ArrowRight, CalendarIcon, Users } from 'lucide-react';
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
  DialogDescription,
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { format as formatDate, addDays, addMonths, addWeeks, isBefore, startOfDay, set, getYear, getMonth, differenceInMilliseconds } from "date-fns";
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';


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
  
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');

  const appointmentsRef = useMemoFirebase(() => firestore ? collection(firestore, 'appointments') : null, [firestore]);
  const { data: appointments, isLoading: isLoadingAppointments } = useCollection<Appointment>(appointmentsRef);
  const exceptionsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentExceptions') : null), [firestore]);
  const { data: exceptions, isLoading: isLoadingExceptions } = useCollection<AppointmentException>(exceptionsRef);
  const allMembersRef = useMemoFirebase(() => (firestore ? collection(firestore, 'members') : null), [firestore]);
  const { data: allMembers, isLoading: membersLoading } = useCollection<MemberProfile>(allMembersRef);
  const allResponsesRef = useMemoFirebase(() => (firestore ? collection(firestore, 'appointmentResponses') : null), [firestore]);
  const { data: allResponses, isLoading: allResponsesLoading } = useCollection<AppointmentResponse>(allResponsesRef);
  const appointmentTypesRef = useMemoFirebase(() => firestore ? collection(firestore, 'appointmentTypes') : null, [firestore]);
  const { data: appointmentTypes, isLoading: isLoadingTypes } = useCollection<AppointmentType>(appointmentTypesRef);
  const locationsRef = useMemoFirebase(() => firestore ? collection(firestore, 'locations') : null, [firestore]);
  const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsRef);
  const groupsRef = useMemoFirebase(() => firestore ? collection(firestore, 'groups') : null, [firestore]);
  const { data: groups, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);
  
  const teams = useMemo(() => groups?.filter(g => g.type === 'team').sort((a,b) => a.name.localeCompare(b.name)) || [], [groups]);
  const teamsMap = useMemo(() => new Map(teams.map(t => [t.id, t.name])), [teams]);
  const locationsMap = useMemo(() => new Map(locations?.map(l => [l.id, l.name])), [locations]);

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '', appointmentTypeId: '', startDate: '', endDate: '', isAllDay: false,
      locationId: '', description: '', meetingPoint: '', meetingTime: '',
      visibilityType: 'all', visibleTeamIds: [], recurrence: 'none',
      recurrenceEndDate: '', rsvpDeadline: '',
    },
  });

  const watchVisibilityType = form.watch('visibilityType');

  const { unrolledAppointments, isProcessing } = useMemo(() => {
    if (!appointments || isLoadingExceptions) return { unrolledAppointments: [], isProcessing: true };

    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions?.forEach(ex => {
      if (ex.originalDate instanceof Timestamp) {
        const key = `${ex.originalAppointmentId}-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
        exceptionsMap.set(key, ex);
      }
    });

    const allEvents: UnrolledAppointment[] = [];
    const today = startOfDay(new Date());

    appointments.forEach(app => {
      if (!(app.startDate instanceof Timestamp)) return;
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
          finalData = { ...app, ...modData, startDate: modData.startDate || app.startDate, endDate: modData.endDate === undefined ? app.endDate : (modData.endDate || undefined), id: app.id };
          isException = true;
        }

        allEvents.push({ ...finalData, instanceDate: finalData.startDate.toDate(), originalId: app.id, virtualId: app.id, isCancelled: false, isException });
      } else {
        let currentDate = appStartDate;
        const duration = app.endDate ? differenceInMilliseconds(app.endDate.toDate(), currentDate) : 0;
        const MAX_ITERATIONS = 500;
        for (let i = 0; currentDate <= recurrenceEndDate && i < MAX_ITERATIONS; i++) {
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
                id: `${app.id}-${currentDate.toISOString()}`, virtualId: `${app.id}-${currentDateStartOfDayISO}`, originalId: app.id,
                instanceDate: instanceStartDate, startDate: Timestamp.fromDate(instanceStartDate), endDate: instanceEndDate ? Timestamp.fromDate(instanceEndDate) : undefined,
                isCancelled: false, isException,
              });
            }
          }
          
          switch (app.recurrence) {
            case 'daily': currentDate = addDays(currentDate, 1); break;
            case 'weekly': currentDate = addWeeks(currentDate, 1); break;
            case 'bi-weekly': currentDate = addWeeks(currentDate, 2); break;
            case 'monthly':
                const nextMonth = addMonths(currentDate, 1);
                currentDate = set(nextMonth, { date: Math.min(appStartDate.getDate(), new Date(getYear(nextMonth), getMonth(nextMonth) + 1, 0).getDate()) });
                break;
            default: i = MAX_ITERATIONS; break;
          }
        }
      }
    });
    return { unrolledAppointments: allEvents.sort((a,b) => a.instanceDate.getTime() - b.instanceDate.getTime()), isProcessing: false };
  }, [appointments, exceptions, isLoadingExceptions]);
  
  const filteredAppointments = useMemo(() => {
    return unrolledAppointments.filter(app => {
      const typeMatch = selectedTypeFilter === 'all' || app.appointmentTypeId === selectedTypeFilter;
      const teamMatch = selectedTeamFilter === 'all' || app.visibility.teamIds.includes(selectedTeamFilter) || app.visibility.type === 'all';
      return typeMatch && teamMatch;
    });
  }, [unrolledAppointments, selectedTypeFilter, selectedTeamFilter]);

  const groupedAppointments = useMemo(() => {
    return filteredAppointments.reduce((acc, app) => {
      const monthYear = formatDate(app.instanceDate, 'MMMM yyyy', { locale: de });
      if (!acc[monthYear]) acc[monthYear] = [];
      acc[monthYear].push(app);
      return acc;
    }, {} as Record<string, UnrolledAppointment[]>);
  }, [filteredAppointments]);


  const handleAddNew = () => {
    form.reset({ title: '', appointmentTypeId: '', startDate: '', endDate: '', isAllDay: false, locationId: '', description: '', meetingPoint: '', meetingTime: '', visibilityType: 'all', visibleTeamIds: [], recurrence: 'none', recurrenceEndDate: '', rsvpDeadline: '' });
    setIsDialogOpen(true);
  };

  const handleCancelSingle = async (appToCancel: UnrolledAppointment) => {
    if (!firestore || !user) return;
    const exceptionsColRef = collection(firestore, 'appointmentExceptions');
    const newException = {
        originalAppointmentId: appToCancel.originalId,
        originalDate: Timestamp.fromDate(startOfDay(appToCancel.instanceDate)),
        status: 'cancelled',
        userId: user!.uid,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
    };
    try {
        await addDoc(exceptionsColRef, newException);
        toast({ title: "Termin abgesagt", description: "Der einzelne Termin wurde als abgesagt markiert."});
    } catch(e: any) {
        console.error("Error cancelling single appointment:", e);
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'appointmentExceptions', operation: 'create', requestResourceData: newException }));
    }
  };

  const handleDelete = async (appToDelete: UnrolledAppointment) => {
    if (!firestore) return;
    try {
        const batch = writeBatch(firestore);
        
        if (appToDelete.recurrence === 'none') {
            // Einzeltermin löschen
            batch.delete(doc(firestore, 'appointments', appToDelete.originalId));
        } else {
            // Komplette Serie löschen
            const q = query(collection(firestore, 'appointmentExceptions'), where('originalAppointmentId', '==', appToDelete.originalId));
            const exceptionSnapshot = await getDocs(q);
            exceptionSnapshot.forEach(doc => batch.delete(doc.ref));
            batch.delete(doc(firestore, 'appointments', appToDelete.originalId));
        }
        
        await batch.commit();
        toast({ title: "Termin/Serie gelöscht", description: "Der Termin oder die Serie wurde vollständig gelöscht."});
    } catch (e: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `appointments/${appToDelete.originalId}`, operation: 'delete' }));
    }
  };


  const onSubmit = async (data: AppointmentFormValues) => {
    if (!firestore || !user) return;
    
    try {
        const typeName = appointmentTypes?.find(t => t.id === data.appointmentTypeId)?.name || 'Termin';
        let rsvpTimestamp: Timestamp | null = null;
        if (data.rsvpDeadline) {
            const [days, hours] = data.rsvpDeadline.split(':').map(Number);
            const totalMillis = ((days * 24) + (hours || 0)) * 3600000;
            rsvpTimestamp = Timestamp.fromMillis(new Date(data.startDate).getTime() - totalMillis);
        }

        const newAppointmentData = {
            title: (data.title || '').trim() === '' ? typeName : data.title,
            startDate: Timestamp.fromDate(new Date(data.startDate)),
            endDate: data.endDate ? Timestamp.fromDate(new Date(data.endDate)) : null,
            isAllDay: data.isAllDay, appointmentTypeId: data.appointmentTypeId, locationId: data.locationId || null,
            description: data.description || null, meetingPoint: data.meetingPoint || null, meetingTime: data.meetingTime || null,
            recurrence: data.recurrence, recurrenceEndDate: data.recurrenceEndDate ? Timestamp.fromDate(new Date(data.recurrenceEndDate)) : null,
            rsvpDeadline: rsvpTimestamp,
            visibility: { type: data.visibilityType, teamIds: data.visibilityType === 'specificTeams' ? data.visibleTeamIds : [] },
            createdBy: user.uid, createdAt: serverTimestamp(), lastUpdated: serverTimestamp()
        };

        await addDoc(collection(firestore, 'appointments'), newAppointmentData);
        toast({ title: 'Erfolg', description: `Der Termin "${newAppointmentData.title}" wurde erstellt.` });
        
        form.reset();
        setIsDialogOpen(false);

    } catch (e: any) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: `appointments`, operation: 'write', requestResourceData: data }));
        toast({ variant: 'destructive', title: 'Fehler beim Speichern', description: e.message });
    }
  };

  const isLoading = isUserLoading || isLoadingTypes || isLoadingLocations || isLoadingGroups || isLoadingAppointments || isProcessing || isLoadingExceptions || allResponsesLoading || membersLoading;
  
  if (isLoading) {
    return <div className="container mx-auto flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Card className="border-destructive/50"><CardHeader><CardTitle className="text-destructive">Zugriff verweigert</CardTitle></CardHeader><CardContent><p>Sie haben keine Berechtigung für diese Seite.</p></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
       <div className="flex items-center justify-between mb-6">
            <h1 className="flex items-center gap-3 text-3xl font-bold">
                <CalendarIcon className="h-8 w-8 text-primary" />
                <span className="font-headline">Termine verwalten</span>
            </h1>
            <div className="flex items-center gap-2">
              <Select value={selectedTeamFilter} onValueChange={setSelectedTeamFilter}><SelectTrigger className="w-auto min-w-[160px]"><SelectValue placeholder="Nach Mannschaft filtern..." /></SelectTrigger><SelectContent><SelectItem value="all">Alle Mannschaften</SelectItem>{teams.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent></Select>
              <Select value={selectedTypeFilter} onValueChange={setSelectedTypeFilter}><SelectTrigger className="w-auto min-w-[160px]"><SelectValue placeholder="Nach Art filtern..." /></SelectTrigger><SelectContent><SelectItem value="all">Alle Typen</SelectItem>{appointmentTypes?.map(type => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select>
              <Button onClick={handleAddNew}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Termin hinzufügen
              </Button>
            </div>
        </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <DialogHeader><DialogTitle>Neuen Termin erstellen</DialogTitle></DialogHeader>
              <div className="py-4 max-h-[70vh] overflow-y-auto px-1">
                  <div className="space-y-6 p-4">
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <FormField control={form.control} name="appointmentTypeId" render={({ field }) => (<FormItem><FormLabel>Art des Termins*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Terminart auswählen..." /></SelectTrigger></FormControl><SelectContent>{appointmentTypes?.map(type => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                          <FormField control={form.control} name="title" render={({ field }) => (<FormItem><FormLabel>Titel (optional)</FormLabel><FormControl><Input placeholder="Wird automatisch gesetzt" {...field} /></FormControl><FormDescription>Wenn leer, wird der Name der Terminart verwendet.</FormDescription><FormMessage /></FormItem>)}/>
                          <FormField control={form.control} name="locationId" render={({ field }) => (<FormItem><FormLabel>Ort</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Ort auswählen..." /></SelectTrigger></FormControl><SelectContent>{locations?.map(loc => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}</SelectContent></Select></FormItem>)}/>
                          <FormField control={form.control} name="startDate" render={({ field }) => (<FormItem><FormLabel>Startdatum & Uhrzeit*</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={form.control} name="endDate" render={({ field }) => (<FormItem><FormLabel>Enddatum & Uhrzeit</FormLabel><FormControl><Input type="datetime-local" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={form.control} name="isAllDay" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm h-full"><div className="space-y-0.5"><FormLabel>Ganztägig</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)}/>
                      </div>
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                          <FormField control={form.control} name="recurrence" render={({ field }) => (<FormItem><FormLabel>Wiederholung</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="none">Keine</SelectItem><SelectItem value="daily">Täglich</SelectItem><SelectItem value="weekly">Wöchentlich</SelectItem><SelectItem value="bi-weekly">Alle 2 Wochen</SelectItem><SelectItem value="monthly">Monatlich</SelectItem></SelectContent></Select></FormItem>)}/>
                          <FormField control={form.control} name="recurrenceEndDate" render={({ field }) => (<FormItem><FormLabel>Ende der Wiederholung</FormLabel><FormControl><Input type="date" {...field} disabled={form.watch('recurrence') === 'none'} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={form.control} name="rsvpDeadline" render={({ field }) => (<FormItem><FormLabel>Rückmeldefrist</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Frist für Rückmeldung" /></SelectTrigger></FormControl><SelectContent><SelectItem value="0:12">12 Stunden vorher</SelectItem><SelectItem value="1:0">1 Tag vorher</SelectItem><SelectItem value="2:0">2 Tage vorher</SelectItem><SelectItem value="3:0">3 Tage vorher</SelectItem></SelectContent></Select></FormItem>)}/>
                      </div>
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <FormField control={form.control} name="meetingPoint" render={({ field }) => (<FormItem><FormLabel>Treffpunkt</FormLabel><FormControl><Input placeholder="z.B. Vor der Halle" {...field} /></FormControl></FormItem>)}/>
                          <FormField control={form.control} name="meetingTime" render={({ field }) => (<FormItem><FormLabel>Treffzeit</FormLabel><FormControl><Input placeholder="z.B. 1h vor Beginn" {...field} /></FormControl></FormItem>)}/>
                          <div className="md:col-span-2"><FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>Beschreibung</FormLabel><FormControl><Textarea placeholder="Zusätzliche Informationen" {...field} /></FormControl></FormItem>)}/></div>
                      </div>
                      <div>
                          <FormField control={form.control} name="visibilityType" render={({ field }) => (<FormItem className="space-y-3"><FormLabel>Sichtbarkeit</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="all">Alle</SelectItem><SelectItem value="specificTeams">Bestimmte Mannschaften</SelectItem></SelectContent></Select></FormItem>)}/>
                          {watchVisibilityType === 'specificTeams' && (<div className="pt-4"><FormField control={form.control} name="visibleTeamIds" render={() => (<FormItem><FormLabel>Mannschaften auswählen</FormLabel><ScrollArea className="h-32 rounded-md border p-4"><div className="grid grid-cols-2 gap-2">{teams.map(team => (<FormField key={team.id} control={form.control} name="visibleTeamIds" render={({ field }) => (<FormItem className="flex items-center space-x-3"><FormControl><Checkbox checked={field.value?.includes(team.id)} onCheckedChange={checked => field.onChange(checked ? [...field.value || [], team.id] : field.value?.filter(id => id !== team.id))} /></FormControl><FormLabel className="font-normal">{team.name}</FormLabel></FormItem>)} />))}</div></ScrollArea></FormItem>)}/></div>)}
                      </div>
                    </div>
                </div>
                <DialogFooter className="pt-4 border-t"><Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Abbrechen</Button><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Termin erstellen</Button></DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {isLoading ? <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
        : Object.keys(groupedAppointments).length > 0 ? (
          <Accordion type="multiple" defaultValue={[Object.keys(groupedAppointments)[0]]} className="w-full space-y-4">
              {Object.entries(groupedAppointments).map(([monthYear, appointmentsInMonth]) => (
                  <AccordionItem value={monthYear} key={monthYear} className="border-b-0">
                      <AccordionTrigger className="text-xl font-semibold py-3 px-4 bg-muted/50 rounded-t-lg hover:no-underline">{monthYear} ({appointmentsInMonth.length})</AccordionTrigger>
                      <AccordionContent className="border border-t-0 rounded-b-lg p-0">
                          <div className="overflow-x-auto">
                              <Table>
                                  <TableHeader><TableRow><TableHead>Art (Titel)</TableHead><TableHead>Datum/Zeit</TableHead><TableHead>Sichtbarkeit</TableHead><TableHead>Ort</TableHead><TableHead>Treffpunkt</TableHead><TableHead>Treffzeit</TableHead><TableHead>Wiederholung</TableHead><TableHead>Rückmeldung bis</TableHead><TableHead className="text-right">Aktionen</TableHead></TableRow></TableHeader>
                                  <TableBody>
                                      {appointmentsInMonth.map(app => {
                                        const typeName = appointmentTypes?.find(t => t.id === app.appointmentTypeId)?.name;
                                        const rsvpDeadline = appointments?.find(a => a.id === app.originalId)?.rsvpDeadline;
                                        let rsvpDeadlineString = '-';
                                        if (rsvpDeadline) {
                                            const startMillis = app.startDate.toMillis();
                                            const rsvpMillis = rsvpDeadline.toMillis();
                                            const offset = startMillis - rsvpMillis;
                                            const instanceStartMillis = app.instanceDate.getTime();
                                            const instanceRsvpMillis = instanceStartMillis - offset;
                                            rsvpDeadlineString = formatDate(new Date(instanceRsvpMillis), 'dd.MM.yy HH:mm');
                                        }

                                        return (
                                          <TableRow key={app.virtualId}>
                                              <TableCell><div className="font-medium">{typeName}</div>{app.title !== typeName && <div className="text-xs text-muted-foreground">({app.title})</div>}</TableCell>
                                              <TableCell>{formatDate(app.instanceDate, 'dd.MM.yy')}<br/>{formatDate(app.instanceDate, 'HH:mm')}</TableCell>
                                              <TableCell>{app.visibility.type === 'all' ? 'Alle' : app.visibility.teamIds.map(id => teamsMap.get(id)).join(', ')}</TableCell>
                                              <TableCell>{app.locationId ? locationsMap.get(app.locationId) : '-'}</TableCell>
                                              <TableCell>{app.meetingPoint || '-'}</TableCell>
                                              <TableCell>{app.meetingTime || '-'}</TableCell>
                                              <TableCell>{app.recurrence !== 'none' ? `bis ${formatDate(app.recurrenceEndDate!.toDate(), 'dd.MM.yy')}` : '-'}</TableCell>
                                              <TableCell>{rsvpDeadlineString}</TableCell>
                                              <TableCell className="text-right">
                                                  <ParticipantListDialog appointment={app} allMembers={allMembers} allResponses={allResponses} />
                                                  <AlertDialog>
                                                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><X className="h-4 w-4 text-orange-600" /></Button></AlertDialogTrigger>
                                                      <AlertDialogContent>
                                                          <AlertDialogHeader><AlertDialogTitle>Diesen Termin absagen?</AlertDialogTitle><AlertDialogDescription>Möchten Sie wirklich nur diesen einen Termin absagen? Er wird für alle als "abgesagt" markiert. Dies kann nicht rückgängig gemacht werden.</AlertDialogDescription></AlertDialogHeader>
                                                          <AlertDialogFooter>
                                                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                                              <AlertDialogAction onClick={() => handleCancelSingle(app)}>Ja, nur diesen Termin absagen</AlertDialogAction>
                                                          </AlertDialogFooter>
                                                      </AlertDialogContent>
                                                  </AlertDialog>
                                                  <AlertDialog>
                                                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                                                      <AlertDialogContent>
                                                          <AlertDialogHeader><AlertDialogTitle>Termin löschen?</AlertDialogTitle><AlertDialogDescription>{app.recurrence !== 'none' ? "Dies ist ein Serientermin. Das Löschen entfernt die GESAMTE Serie für alle Benutzer endgültig." : "Möchten Sie diesen Termin wirklich endgültig löschen?"}</AlertDialogDescription></AlertDialogHeader>
                                                          <AlertDialogFooter>
                                                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                                              <AlertDialogAction onClick={() => handleDelete(app)} className="bg-destructive hover:bg-destructive/90">Ja, endgültig löschen</AlertDialogAction>
                                                          </AlertDialogFooter>
                                                      </AlertDialogContent>
                                                  </AlertDialog>
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
        ) : (<div className="text-center py-10 text-muted-foreground">Keine bevorstehenden Termine gefunden.</div>)
      }
    </div>
  );
}

interface ParticipantListDialogProps {
  appointment: UnrolledAppointment;
  allMembers: MemberProfile[] | null;
  allResponses: AppointmentResponse[] | null;
}

const ParticipantListDialog: React.FC<ParticipantListDialogProps> = ({ appointment, allMembers, allResponses }) => {
  const { accepted, rejected, unsure, pending } = useMemo(() => {
    if (!allMembers) return { accepted: [], rejected: [], unsure: [], pending: []};
    const relevantMemberIds = new Set<string>();
    if (appointment.visibility.type === 'all') {
      allMembers.forEach(m => relevantMemberIds.add(m.userId));
    } else {
      appointment.visibility.teamIds.forEach(teamId => {
        allMembers.forEach(member => {
          if (member.teams?.includes(teamId)) relevantMemberIds.add(member.userId);
        });
      });
    }

    const dateString = formatDate(appointment.instanceDate, 'yyyy-MM-dd');
    const responsesForInstance = allResponses?.filter(r => r.appointmentId === appointment.originalId && r.date === dateString) || [];
    
    const accepted = responsesForInstance.filter(r => r.status === 'zugesagt');
    const rejected = responsesForInstance.filter(r => r.status === 'abgesagt');
    const unsure = responsesForInstance.filter(r => r.status === 'unsicher');

    const respondedUserIds = new Set(responsesForInstance.map(r => r.userId));
    const pending = Array.from(relevantMemberIds).map(id => allMembers.find(m => m.userId === id)).filter((m): m is MemberProfile => !!m && !respondedUserIds.has(m.userId));

    return { accepted, rejected, unsure, pending };
  }, [appointment, allMembers, allResponses]);

  const membersMap = useMemo(() => new Map(allMembers?.map(m => [m.userId, m])), [allMembers]);

  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" size="icon"><Users className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Teilnehmerliste für "{appointment.title}"</DialogTitle><DialogDescription>{formatDate(appointment.instanceDate, "eeee, dd. MMMM yyyy 'um' HH:mm 'Uhr'", { locale: de })}</DialogDescription></DialogHeader>
        <ScrollArea className="max-h-[60vh]"><div className="space-y-4 p-4">
          <div><h3 className="font-semibold text-green-600 mb-2">Zusagen ({accepted.length})</h3><ul className="list-disc pl-5 text-sm">{accepted.map(r => (<li key={r.userId}>{membersMap.get(r.userId)?.firstName} {membersMap.get(r.userId)?.lastName}</li>))}</ul></div>
          <div><h3 className="font-semibold text-destructive mb-2">Absagen ({rejected.length})</h3><ul className="list-disc pl-5 text-sm">{rejected.map(r => (<li key={r.userId}>{membersMap.get(r.userId)?.firstName} {membersMap.get(r.userId)?.lastName}{r.reason && <span className="text-muted-foreground italic"> - "{r.reason}"</span>}</li>))}</ul></div>
          <div><h3 className="font-semibold text-yellow-600 mb-2">Unsicher ({unsure.length})</h3><ul className="list-disc pl-5 text-sm">{unsure.map(r => (<li key={r.userId}>{membersMap.get(r.userId)?.firstName} {membersMap.get(r.userId)?.lastName}</li>))}</ul></div>
          <div><h3 className="font-semibold text-muted-foreground mb-2">Ausstehend ({pending.length})</h3><ul className="list-disc pl-5 text-sm">{pending.map(m => (<li key={m.userId}>{m.firstName} {m.lastName}</li>))}</ul></div>
        </div></ScrollArea>
      </DialogContent>
    </Dialog>
  );
}


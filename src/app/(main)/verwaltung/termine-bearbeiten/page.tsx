
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
  useDoc,
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
  getDocs,
  getDoc,
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
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import {
  Edit,
  Trash2,
  ListTodo,
  Loader2,
  Plus,
  Filter,
  MapPin,
  CalendarPlus,
  CalendarX,
  X,
  RefreshCw,
} from 'lucide-react';
import type {
  Appointment,
  AppointmentType,
  Location,
  Group,
  AppointmentException,
  MemberProfile,
} from '@/lib/types';
import {
  format,
  formatISO,
  isValid as isDateValid,
  addDays,
  addWeeks,
  addMonths,
  differenceInMilliseconds,
  set,
  isEqual,
  startOfDay,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

type GroupWithTeams = Group & { teams: Group[] };

type UnrolledAppointment = Appointment & {
  virtualId: string;
  originalId: string;
  originalDateISO?: string;
  isException?: boolean;
  isCancelled?: boolean;
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

const singleAppointmentInstanceSchema = z
  .object({
    originalDateISO: z.string(),
    startDate: z.string().min(1, 'Startdatum/-zeit ist erforderlich.'),
    endDate: z.string().optional(),
    isAllDay: z.boolean().default(false),
    title: z.string().optional(),
    locationId: z.string().optional(),
    description: z.string().optional(),
    meetingPoint: z.string().optional(),
    meetingTime: z.string().optional(),
  })
  .refine((data) => !data.endDate || !data.startDate || data.endDate >= data.startDate, {
    message: 'Enddatum muss nach dem Startdatum liegen.',
    path: ['endDate'],
  });
type SingleAppointmentInstanceFormValues = z.infer<
  typeof singleAppointmentInstanceSchema
>;

const useAppointmentSchema = (appointmentTypes: AppointmentType[] | null) => {
  return useMemo(() => {
    const sonstigeTypeId = appointmentTypes?.find(
      (t: AppointmentType) => t.name === 'Sonstiges'
    )?.id;

    return z
      .object({
        title: z.string().optional(),
        appointmentTypeId: z
          .string()
          .min(1, 'Art des Termins ist erforderlich.'),
        startDate: z.string().min(1, 'Startdatum/-zeit ist erforderlich.'),
        endDate: z.string().optional(),
        isAllDay: z.boolean().default(false),
        recurrence: z
          .enum(['none', 'daily', 'weekly', 'bi-weekly', 'monthly'])
          .default('none'),
        recurrenceEndDate: z.string().optional(),
        visibilityType: z.enum(['all', 'specificTeams']).default('all'),
        visibleTeamIds: z.array(z.string()).default([]),
        rsvpDeadline: z.string().optional(),
        locationId: z.string().optional(),
        meetingPoint: z.string().optional(),
        meetingTime: z.string().optional(),
        description: z.string().optional(),
      })
      .refine((data) => !data.endDate || !data.startDate || data.endDate >= data.startDate, {
        path: ['endDate'],
        message: 'Enddatum muss nach dem Startdatum liegen.',
      })
      .refine(
        (data) =>
          data.visibilityType !== 'specificTeams' ||
          data.visibleTeamIds.length > 0,
        {
          path: ['visibleTeamIds'],
          message: 'Bitte mindestens eine Mannschaft auswählen.',
        }
      )
      .refine(
        (data) => {
          if (data.recurrence !== 'none') {
            return !!data.recurrenceEndDate;
          }
          return true;
        },
        {
          message: 'Enddatum für Wiederholung ist erforderlich.',
          path: ['recurrenceEndDate'],
        }
      )
      .refine(
        (data) => {
          if (data.recurrenceEndDate && data.startDate) {
            try {
              const recurrenceEnd = new Date(data.recurrenceEndDate);
              const startDateValue = data.startDate.includes('T')
                ? data.startDate.split('T')[0]
                : data.startDate;
              const start = new Date(startDateValue);
              return (
                isDateValid(recurrenceEnd) &&
                isDateValid(start) &&
                recurrenceEnd >= start
              );
            } catch (e) {
              return false;
            }
          }
          return true;
        },
        {
          message: 'Ende der Wiederholung muss nach dem Startdatum liegen.',
          path: ['recurrenceEndDate'],
        }
      )
      .superRefine((data, ctx) => {
        if (
          data.appointmentTypeId === sonstigeTypeId &&
          (!data.title || data.title.trim() === '')
        ) {
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
  const { user } = useUser();

  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [selectedInstanceToEdit, setSelectedInstanceToEdit] =
    useState<UnrolledAppointment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
  const [isInstanceDialogOpen, setIsInstanceDialogOpen] = useState(false);
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [isUpdateTypeDialogOpen, setIsUpdateTypeDialogOpen] = useState(false);
  const [pendingUpdateData, setPendingUpdateData] =
    useState<SingleAppointmentInstanceFormValues | null>(null);

  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const appointmentsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'appointments') : null),
    [firestore]
  );
  const { data: appointments, isLoading: isLoadingAppointments } =
    useCollection<Appointment>(appointmentsRef);
  const exceptionsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'appointmentExceptions') : null),
    [firestore]
  );
  const { data: exceptions, isLoading: isLoadingExceptions } =
    useCollection<AppointmentException>(exceptionsRef);
  const typesRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'appointmentTypes') : null),
    [firestore]
  );
  const { data: appointmentTypes, isLoading: isLoadingTypes } =
    useCollection<AppointmentType>(typesRef);
  const locationsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'locations') : null),
    [firestore]
  );
  const { data: locations, isLoading: isLoadingLocations } =
    useCollection<Location>(locationsRef);
  const groupsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'groups') : null),
    [firestore]
  );
  const { data: groups, isLoading: isLoadingGroups } =
    useCollection<Group>(groupsRef);
    
  const memberProfileRef = useMemoFirebase(
    () => (user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: memberProfile, isLoading: isMemberProfileLoading } =
    useDoc<MemberProfile>(memberProfileRef);

  const { typesMap, locationsMap, teams, teamsMap, groupedTeams } = useMemo<{
    typesMap: Map<string, string>;
    locationsMap: Map<string, Location>;
    teams: Group[];
    teamsMap: Map<string, string>;
    groupedTeams: GroupWithTeams[];
  }>(() => {
    const allGroups: Group[] = groups || [];
    const typesMap = new Map(
      appointmentTypes?.map((t: AppointmentType) => [t.id, t.name])
    );
    const locationsMap = new Map(
      locations?.map((l: Location) => [l.id, l])
    );
    const classes = allGroups
      .filter((g: Group) => g.type === 'class')
      .sort((a: Group, b: Group) => a.name.localeCompare(b.name));
    const teams = allGroups
      .filter((g: Group) => g.type === 'team')
      .sort((a: Group, b: Group) => a.name.localeCompare(b.name));
    const teamsMap = new Map(teams.map((t: Group) => [t.id, t.name]));

    const customSort = (a: Group, b: Group) => {
      const regex = /^(U)(\d+)/i;
      const matchA = a.name.match(regex);
      const matchB = b.name.match(regex);

      if (matchA && matchB) {
        return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
      }
      return a.name.localeCompare(b.name);
    };

    const grouped: GroupWithTeams[] = classes
      .sort(customSort)
      .map((c: Group) => ({
        ...c,
        teams: teams
          .filter((t: Group) => t.parentId === c.id)
          .sort(customSort),
      }))
      .filter((c: GroupWithTeams) => c.teams.length > 0);

    return { typesMap, locationsMap, teams, teamsMap, groupedTeams: grouped };
  }, [appointmentTypes, locations, groups]);

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
  const sonstigeTypeId = useMemo(
    () =>
      appointmentTypes?.find((t: AppointmentType) => t.name === 'Sonstiges')
        ?.id,
    [appointmentTypes]
  );

  const unrolledAppointments = useMemo(() => {
    if (!appointments || isLoadingExceptions) return [];

    const exceptionsMap = new Map<string, AppointmentException>();
    exceptions?.forEach((ex) => {
      if (ex.originalDate) {
        const key = `${
          ex.originalAppointmentId
        }-${startOfDay(ex.originalDate.toDate()).toISOString()}`;
        exceptionsMap.set(key, ex);
      }
    });

    const allEvents: UnrolledAppointment[] = [];
    const now = new Date();

    appointments.forEach((app) => {
      if (!app.startDate) return;

      const originalDateStartOfDay = startOfDay(app.startDate.toDate());
      const originalDateStartOfDayISO = originalDateStartOfDay.toISOString();
      const key = `${app.id}-${originalDateStartOfDayISO}`;
      const exception = exceptionsMap.get(key);
      const isCancelled = exception?.status === 'cancelled';

      if (app.recurrence === 'none') {
        const modifiedApp =
          exception?.status === 'modified'
            ? { ...app, ...(exception.modifiedData || {}), isException: true }
            : app;
        if (originalDateStartOfDay >= startOfDay(now) || isCancelled) {
          allEvents.push({
            ...modifiedApp,
            originalId: app.id,
            virtualId: app.id,
            isCancelled,
            originalDateISO: originalDateStartOfDayISO,
          });
        }
      } else {
        let currentDate = app.startDate.toDate();
        const recurrenceEndDate = app.recurrenceEndDate
          ? addDays(app.recurrenceEndDate.toDate(), 1)
          : addDays(now, 365);
        const duration = app.endDate
          ? differenceInMilliseconds(
              app.endDate.toDate(),
              app.startDate.toDate()
            )
          : 0;
        let iter = 0;
        const MAX_ITERATIONS = 500;

        while (currentDate < recurrenceEndDate && iter < MAX_ITERATIONS) {
          const currentDateStartOfDay = startOfDay(currentDate);
          const currentDateStartOfDayISO = currentDateStartOfDay.toISOString();
          const instanceKey = `${app.id}-${currentDateStartOfDayISO}`;
          const instanceException = exceptionsMap.get(instanceKey);
          const instanceIsCancelled = instanceException?.status === 'cancelled';

          if (currentDateStartOfDay >= startOfDay(now) || instanceIsCancelled) {
            const newStartDate = Timestamp.fromDate(currentDate);
            const newEndDate = app.endDate
              ? Timestamp.fromMillis(currentDate.getTime() + duration)
              : undefined;

            let instanceData: UnrolledAppointment = {
              ...app,
              id: `${app.id}-${currentDate.toISOString()}`,
              virtualId: instanceKey,
              originalId: app.id,
              originalDateISO: currentDateStartOfDayISO,
              startDate: newStartDate,
              endDate: newEndDate,
              isCancelled: instanceIsCancelled,
            };

            if (
              instanceException?.status === 'modified' &&
              instanceException.modifiedData
            ) {
              instanceData = {
                ...instanceData,
                ...instanceException.modifiedData,
                isException: true,
              };
            }
            allEvents.push(instanceData);
          }

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
  }, [appointments, exceptions, isLoadingExceptions]);

  const filteredAppointments = useMemo(() => {
    // Wait until the member profile is loaded
    if (!memberProfile) return [];
  
    const userTeamIdsSet = new Set(memberProfile.teams || []);
  
    let preFiltered = unrolledAppointments;
  
    // 1. Filter by team
    if (teamFilter === 'myTeams') {
      preFiltered = unrolledAppointments.filter((app) => {
        if (app.visibility.type === 'all') return true;
        // Check if there is any intersection between the appointment's teams and the user's teams
        return app.visibility.teamIds.some((teamId) => userTeamIdsSet.has(teamId));
      });
    } else if (teamFilter !== 'all') {
      preFiltered = unrolledAppointments.filter(
        (app) =>
          // Include if the appointment is for everyone or for the specific selected team
          app.visibility.type === 'all' ||
          app.visibility.teamIds.includes(teamFilter)
      );
    }
  
    // 2. Filter by type
    const finalFiltered = preFiltered.filter(
      (app) => typeFilter === 'all' || app.appointmentTypeId === typeFilter
    );
  
    // 3. Sort by start date
    return finalFiltered.sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis());
  }, [unrolledAppointments, teamFilter, typeFilter, memberProfile]);


  const onSubmitAppointment = async (data: AppointmentFormValues) => {
    if (!firestore || !appointmentsRef) return;
    setIsSubmitting(true);

    const selectedTypeName = typesMap.get(data.appointmentTypeId);
    const finalTitle =
      data.appointmentTypeId !== sonstigeTypeId &&
      (!data.title || data.title.trim() === '')
        ? selectedTypeName
        : data.title?.trim();

    if (
      data.appointmentTypeId === sonstigeTypeId &&
      (!finalTitle || finalTitle.trim() === '')
    ) {
      appointmentForm.setError('title', {
        message: 'Titel ist bei Typ "Sonstiges" erforderlich.',
      });
      setIsSubmitting(false);
      return;
    }

    const startDate = new Date(data.startDate);
    const endDate = data.endDate ? new Date(data.endDate) : null;
    const rsvpDeadline = data.rsvpDeadline ? new Date(data.rsvpDeadline) : null;
    const recurrenceEndDate = data.recurrenceEndDate
      ? new Date(data.recurrenceEndDate)
      : null;

    if (!isDateValid(startDate)) {
      appointmentForm.setError('startDate', { message: 'Ungültiges Startdatum.' });
      setIsSubmitting(false);
      return;
    }
    if (endDate && !isDateValid(endDate)) {
      appointmentForm.setError('endDate', { message: 'Ungültiges Enddatum.' });
      setIsSubmitting(false);
      return;
    }
    if (rsvpDeadline && !isDateValid(rsvpDeadline)) {
      appointmentForm.setError('rsvpDeadline', { message: 'Ungültige Frist.' });
      setIsSubmitting(false);
      return;
    }
    if (recurrenceEndDate && !isDateValid(recurrenceEndDate)) {
      appointmentForm.setError('recurrenceEndDate', {
        message: 'Ungültiges Enddatum für Wiederholung.',
      });
      setIsSubmitting(false);
      return;
    }

    const startDateTimestamp = Timestamp.fromDate(startDate);
    const endDateTimestamp = endDate ? Timestamp.fromDate(endDate) : null;
    const rsvpDeadlineTimestamp = rsvpDeadline
      ? Timestamp.fromDate(rsvpDeadline)
      : null;
    const recurrenceEndDateTimestamp = recurrenceEndDate
      ? Timestamp.fromDate(set(recurrenceEndDate, { hours: 23, minutes: 59, seconds: 59 }))
      : null;

    const appointmentData: Omit<Appointment, 'id' | 'lastUpdated'> = {
      title: finalTitle || '',
      appointmentTypeId: data.appointmentTypeId,
      startDate: startDateTimestamp,
      ...(endDateTimestamp && { endDate: endDateTimestamp }),
      isAllDay: data.isAllDay,
      recurrence: data.recurrence,
      ...(recurrenceEndDateTimestamp &&
        data.recurrence !== 'none' && {
          recurrenceEndDate: recurrenceEndDateTimestamp,
        }),
      visibility: {
        type: data.visibilityType,
        teamIds:
          data.visibilityType === 'specificTeams' ? data.visibleTeamIds : [],
      },
      ...(rsvpDeadlineTimestamp && { rsvpDeadline: rsvpDeadlineTimestamp }),
      ...(data.locationId && { locationId: data.locationId }),
      ...(data.meetingPoint && { meetingPoint: data.meetingPoint }),
      ...(data.meetingTime && { meetingTime: data.meetingTime }),
      ...(data.description && { description: data.description }),
      createdBy: user?.uid,
      createdAt: selectedAppointment?.createdAt || serverTimestamp(),
    };

    try {
      if (selectedAppointment) {
        const docRef = doc(firestore, 'appointments', selectedAppointment.id);
        await updateDoc(docRef, { ...appointmentData, lastUpdated: serverTimestamp() });
        toast({ title: 'Terminserie erfolgreich aktualisiert.' });
      } else {
        await addDoc(appointmentsRef, {
          ...appointmentData,
        });
        toast({ title: 'Neuer Termin erfolgreich erstellt.' });
      }
      resetAppointmentForm();
      setIsAppointmentDialogOpen(false);
    } catch (error: any) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: selectedAppointment
            ? `appointments/${selectedAppointment.id}`
            : 'appointments',
          operation: selectedAppointment ? 'update' : 'create',
          requestResourceData: appointmentData,
        })
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitSingleInstance = async (
    data: SingleAppointmentInstanceFormValues
  ) => {
    if (!selectedInstanceToEdit) return;
    setPendingUpdateData(data);
    setIsInstanceDialogOpen(false);
    setIsUpdateTypeDialogOpen(true);
  };

  const resetSingleInstanceDialogs = () => {
    setIsInstanceDialogOpen(false);
    setIsUpdateTypeDialogOpen(false);
    setSelectedInstanceToEdit(null);
    setPendingUpdateData(null);
    instanceForm.reset();
  };

  async function handleSaveSingleOnly() {
    if (!pendingUpdateData || !selectedInstanceToEdit || !firestore || !user)
      return;
    setIsSubmitting(true);

    const originalDate = new Date(pendingUpdateData.originalDateISO);
    const newStartDate = new Date(pendingUpdateData.startDate);
    const newEndDate = pendingUpdateData.endDate
      ? new Date(pendingUpdateData.endDate)
      : null;
    const originalDateStartOfDay = startOfDay(originalDate);

    try {
      if (!isDateValid(newStartDate) || (newEndDate && !isDateValid(newEndDate))) {
        throw new Error('Ungültiges Datum im Formular.');
      }

      const exceptionsColRef = collection(firestore, 'appointmentExceptions');
      const existingException = exceptions?.find(
        (ex) =>
          ex.originalAppointmentId === selectedInstanceToEdit.originalId &&
          isEqual(startOfDay(ex.originalDate.toDate()), originalDateStartOfDay)
      );

      const modifiedData: AppointmentException['modifiedData'] = {};
      const formatForCompare = (ts: Timestamp | undefined) =>
        ts ? ts.toMillis() : null;
      const newStartMillis = Timestamp.fromDate(newStartDate).toMillis();
      const newEndMillis = newEndDate
        ? Timestamp.fromDate(newEndDate).toMillis()
        : null;

      if (newStartMillis !== selectedInstanceToEdit.startDate.toMillis())
        modifiedData.startDate = Timestamp.fromDate(newStartDate);
      if (newEndMillis !== formatForCompare(selectedInstanceToEdit.endDate))
        modifiedData.endDate = newEndDate
          ? Timestamp.fromDate(newEndDate)
          : undefined;

      const typeName = typesMap.get(selectedInstanceToEdit.appointmentTypeId);
      const isSonstiges = typeName === 'Sonstiges';
      const titleIsDefault =
        !isSonstiges && selectedInstanceToEdit.title === typeName;
      const originalDisplayTitle = titleIsDefault
        ? ''
        : selectedInstanceToEdit.title;

      if (pendingUpdateData.title !== originalDisplayTitle) {
        modifiedData.title =
          pendingUpdateData.title && pendingUpdateData.title.trim() !== ''
            ? pendingUpdateData.title.trim()
            : typeName || 'Termin';
      }

      if (
        pendingUpdateData.locationId !== (selectedInstanceToEdit.locationId ?? '')
      )
        modifiedData.locationId = pendingUpdateData.locationId || undefined;
      if (
        pendingUpdateData.description !==
        (selectedInstanceToEdit.description ?? '')
      )
        modifiedData.description = pendingUpdateData.description || undefined;
      if (
        pendingUpdateData.meetingPoint !==
        (selectedInstanceToEdit.meetingPoint ?? '')
      )
        modifiedData.meetingPoint = pendingUpdateData.meetingPoint || undefined;
      if (
        pendingUpdateData.meetingTime !==
        (selectedInstanceToEdit.meetingTime ?? '')
      )
        modifiedData.meetingTime = pendingUpdateData.meetingTime || undefined;

      if (Object.keys(modifiedData).length === 0) {
        toast({
          title: 'Keine Änderungen',
          description: 'Es wurden keine Änderungen vorgenommen.',
        });
        if (existingException && existingException.status === 'modified') {
          const docRef = doc(
            firestore,
            'appointmentExceptions',
            existingException.id
          );
          await deleteDoc(docRef);
          toast({
            title: 'Änderung zurückgesetzt',
            description: 'Die Ausnahme für diesen Termin wurde entfernt.',
          });
        }
        resetSingleInstanceDialogs();
        setIsSubmitting(false);
        return;
      }

      const exceptionData: Omit<AppointmentException, 'id'> = {
        originalAppointmentId: selectedInstanceToEdit.originalId,
        originalDate: Timestamp.fromDate(originalDateStartOfDay),
        status: 'modified',
        modifiedData: modifiedData,
        createdAt: serverTimestamp(),
        userId: user.uid,
      };

      if (existingException) {
        const docRef = doc(
          firestore,
          'appointmentExceptions',
          existingException.id
        );
        await updateDoc(docRef, {
          modifiedData: modifiedData,
          status: 'modified',
          userId: user.uid,
        });
        toast({ title: 'Terminänderung aktualisiert.' });
      } else {
        await addDoc(exceptionsColRef, exceptionData);
        toast({ title: 'Termin erfolgreich geändert (Ausnahme erstellt).' });
      }
    } catch (error: any) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: 'appointmentExceptions',
          operation: 'create',
          requestResourceData: pendingUpdateData,
        })
      );
    } finally {
      setIsSubmitting(false);
      resetSingleInstanceDialogs();
    }
  }

  async function handleSaveForFuture() {
    if (!pendingUpdateData || !selectedInstanceToEdit || !firestore || !user)
      return;

    setIsSubmitting(true);
    try {
      const originalAppointmentRef = doc(
        firestore,
        'appointments',
        selectedInstanceToEdit.originalId
      );
      const originalAppointmentSnap = await getDoc(originalAppointmentRef);

      if (!originalAppointmentSnap.exists()) {
        throw new Error('Original-Terminserie nicht gefunden');
      }

      const originalAppointmentData =
        originalAppointmentSnap.data() as Appointment;
      const batch = writeBatch(firestore);

      const instanceDate = new Date(pendingUpdateData.originalDateISO);
      const dayBefore = addDays(instanceDate, -1);
      const originalStartDate = originalAppointmentData.startDate.toDate();

      if (dayBefore >= originalStartDate) {
        batch.update(originalAppointmentRef, {
          recurrenceEndDate: Timestamp.fromDate(dayBefore),
        });
      } else {
        batch.delete(originalAppointmentRef);
      }

      const newAppointmentRef = doc(collection(firestore, 'appointments'));

      const newStartDate = new Date(pendingUpdateData.startDate!);
      const newEndDate = pendingUpdateData.endDate
        ? new Date(pendingUpdateData.endDate)
        : undefined;

      const typeName = typesMap.get(originalAppointmentData.appointmentTypeId);
      const isSonstiges = typeName === 'Sonstiges';
      const titleIsDefault =
        !isSonstiges && originalAppointmentData.title === typeName;
      const originalDisplayTitle = titleIsDefault
        ? ''
        : originalAppointmentData.title;
      const finalTitle =
        pendingUpdateData.title !== originalDisplayTitle
          ? pendingUpdateData.title && pendingUpdateData.title.trim() !== ''
            ? pendingUpdateData.title.trim()
            : typeName
          : originalAppointmentData.title;

      const newAppointmentData: Omit<Appointment, 'id'> = {
        ...originalAppointmentData,
        createdBy: user.uid, // Set current user as creator of the new series
        title: finalTitle || 'Termin',
        locationId:
          pendingUpdateData.locationId ?? originalAppointmentData.locationId,
        description:
          pendingUpdateData.description ?? originalAppointmentData.description,
        meetingPoint:
          pendingUpdateData.meetingPoint ?? originalAppointmentData.meetingPoint,
        meetingTime:
          pendingUpdateData.meetingTime ?? originalAppointmentData.meetingTime,
        isAllDay:
          pendingUpdateData.isAllDay ?? originalAppointmentData.isAllDay,
        startDate: Timestamp.fromDate(newStartDate),
        endDate: newEndDate ? Timestamp.fromDate(newEndDate) : undefined,
        recurrenceEndDate: originalAppointmentData.recurrenceEndDate,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      };

      batch.set(newAppointmentRef, newAppointmentData);

      const exceptionsQuery = query(
        collection(firestore, 'appointmentExceptions'),
        where('originalAppointmentId', '==', selectedInstanceToEdit.originalId),
        where('originalDate', '>=', Timestamp.fromDate(startOfDay(instanceDate)))
      );
      const exceptionsSnap = await getDocs(exceptionsQuery);

      exceptionsSnap.forEach((doc) => batch.delete(doc.ref));

      await batch.commit();
      toast({ title: 'Terminserie erfolgreich aufgeteilt und aktualisiert' });
    } catch (error: any) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: 'appointments',
          operation: 'batch write (update/create/delete)',
        })
      );
    } finally {
      setIsSubmitting(false);
      resetSingleInstanceDialogs();
    }
  }

  const handleCancelSingleInstance = async (
    appointment: UnrolledAppointment
  ) => {
    if (!firestore || !user || !appointment.originalId) return;
    setIsSubmitting(true);

    const exceptionsColRef = collection(firestore, 'appointmentExceptions');
    const originalDate = appointment.startDate.toDate();
    const originalDateStartOfDay = startOfDay(originalDate);

    const existingException = exceptions?.find(
      (ex) =>
        ex.originalAppointmentId === appointment.originalId &&
        isEqual(startOfDay(ex.originalDate.toDate()), originalDateStartOfDay)
    );

    try {
      if (existingException) {
        const docRef = doc(
          firestore,
          'appointmentExceptions',
          existingException.id
        );
        if (appointment.isCancelled) {
          if (
            existingException.modifiedData &&
            Object.keys(existingException.modifiedData).length > 0
          ) {
            await updateDoc(docRef, { status: 'modified' });
            toast({ title: 'Termin wiederhergestellt (geändert).' });
          } else {
            await deleteDoc(docRef);
            toast({ title: 'Termin wiederhergestellt.' });
          }
        } else {
          await updateDoc(docRef, {
            status: 'cancelled',
            modifiedData: {},
            userId: user.uid,
            createdAt: serverTimestamp(),
          });
          toast({ title: 'Termin abgesagt.' });
        }
      } else {
        const exceptionData: Omit<AppointmentException, 'id'> = {
          originalAppointmentId: appointment.originalId,
          originalDate: Timestamp.fromDate(originalDateStartOfDay),
          status: 'cancelled',
          modifiedData: {},
          createdAt: serverTimestamp(),
          userId: user.uid,
        };
        await addDoc(exceptionsColRef, exceptionData);
        toast({ title: 'Termin abgesagt.' });
      }
    } catch (error: any) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: 'appointmentExceptions',
          operation: existingException ? 'update' : 'create',
        })
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    if (!firestore) return;
    setIsSubmitting(true);
    try {
      const batch = writeBatch(firestore);
      const appointmentDocRef = doc(firestore, 'appointments', id);

      const exceptionsQuery = query(
        collection(firestore, 'appointmentExceptions'),
        where('originalAppointmentId', '==', id)
      );
      const exceptionsSnapshot = await getDocs(exceptionsQuery);
      exceptionsSnapshot.forEach((doc) => batch.delete(doc.ref));

      batch.delete(appointmentDocRef);
      await batch.commit();
      toast({ title: 'Terminserie und alle Ausnahmen gelöscht' });
    } catch (e: any) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: `appointments/${id}`,
          operation: 'delete',
        })
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditAppointment = (appointment: UnrolledAppointment) => {
    if (!appointment.originalId || appointment.virtualId === appointment.originalId) {
      const originalAppointment = appointments?.find(
        (app) => app.id === appointment.id
      );
      if (!originalAppointment) return;
      setSelectedAppointment(originalAppointment);

      const formatTimestampForInput = (
        ts: Timestamp | undefined,
        type: 'datetime' | 'date' = 'datetime'
      ) => {
        if (!ts) return '';
        try {
          const date = ts.toDate();
          if (type === 'date') return formatISO(date, { representation: 'date' });
          return formatISO(date).slice(0, 16);
        } catch (e) {
          return '';
        }
      };
      const startDateString = formatTimestampForInput(
        originalAppointment.startDate,
        originalAppointment.isAllDay ? 'date' : 'datetime'
      );
      const endDateString = formatTimestampForInput(
        originalAppointment.endDate,
        originalAppointment.isAllDay ? 'date' : 'datetime'
      );
      const rsvpDeadlineString = formatTimestampForInput(
        originalAppointment.rsvpDeadline,
        originalAppointment.isAllDay ? 'date' : 'datetime'
      );
      const recurrenceEndDateString = formatTimestampForInput(
        originalAppointment.recurrenceEndDate,
        'date'
      );
      const typeName = typesMap.get(originalAppointment.appointmentTypeId);
      const isSonstiges = typeName === 'Sonstiges';
      const titleIsDefault =
        !isSonstiges && originalAppointment.title === typeName;

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
    } else {
      setSelectedInstanceToEdit(appointment);

      const formatTimestampForInput = (
        ts: Timestamp | undefined,
        type: 'datetime' | 'date' = 'datetime'
      ) => {
        if (!ts) return '';
        try {
          const date = ts.toDate();
          if (type === 'date') return formatISO(date, { representation: 'date' });
          return formatISO(date).slice(0, 16);
        } catch (e) {
          return '';
        }
      };
      const startDateString = formatTimestampForInput(
        appointment.startDate,
        appointment.isAllDay ? 'date' : 'datetime'
      );
      const endDateString = formatTimestampForInput(
        appointment.endDate,
        appointment.isAllDay ? 'date' : 'datetime'
      );
      const originalDateISOString =
        appointment.originalDateISO ||
        startOfDay(appointment.startDate.toDate()).toISOString();

      const typeName = typesMap.get(appointment.appointmentTypeId);
      const isSonstiges = typeName === 'Sonstiges';
      const titleIsDefault = !isSonstiges && appointment.title === typeName;

      instanceForm.reset({
        originalDateISO: originalDateISOString,
        startDate: startDateString,
        endDate: endDateString,
        isAllDay: appointment.isAllDay ?? false,
        title: titleIsDefault ? '' : appointment.title,
        locationId: appointment.locationId ?? '',
        description: appointment.description ?? '',
        meetingPoint: appointment.meetingPoint ?? '',
        meetingTime: appointment.meetingTime ?? '',
      });
      setIsInstanceDialogOpen(true);
    }
  };

  const resetAppointmentForm = () => {
    appointmentForm.reset({
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
    });
    setSelectedAppointment(null);
  };
  const onSubmitAppointmentType = async (data: AppointmentTypeFormValues) => {
    if (!firestore) return;
    const typesColRef = collection(firestore, 'appointmentTypes');
    try {
      await addDoc(typesColRef, { name: data.name });
      toast({ title: 'Termin-Art erfolgreich erstellt.' });
      typeForm.reset();
    } catch (e) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: 'appointmentTypes',
          operation: 'create',
          requestResourceData: data,
        })
      );
    }
  };
  const onDeleteAppointmentType = async (id: string) => {
    if (!firestore) return;
    const docRef = doc(firestore, 'appointmentTypes', id);
    try {
      await deleteDoc(docRef);
      toast({ title: 'Termin-Art gelöscht.' });
    } catch (e) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: `appointmentTypes/${id}`,
          operation: 'delete',
        })
      );
    }
  };
  const onSubmitLocation = async (data: LocationFormValues) => {
    if (!firestore) return;
    const locationsColRef = collection(firestore, 'locations');
    try {
      await addDoc(locationsColRef, { name: data.name, address: data.address });
      toast({ title: 'Ort erfolgreich erstellt.' });
      locationForm.reset();
    } catch (e) {
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
  const onDeleteLocation = async (id: string) => {
    if (!firestore) return;
    const docRef = doc(firestore, 'locations', id);
    try {
      await deleteDoc(docRef);
      toast({ title: 'Ort gelöscht.' });
    } catch (e) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: `locations/${id}`,
          operation: 'delete',
        })
      );
    }
  };

  const isLoading =
    isLoadingAppointments ||
    isLoadingTypes ||
    isLoadingLocations ||
    isLoadingGroups ||
    isLoadingExceptions ||
    isMemberProfileLoading;

  const customSort = (a: Group, b: Group) => {
    const regex = /^(U)(\d+)/i;
    const matchA = a.name.match(regex);
    const matchB = b.name.match(regex);

    if (matchA && matchB) {
      return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
    }
    return a.name.localeCompare(b.name);
  };
  const sortedTeamsForFilter = useMemo(() => {
    if (!teams) return [];
    return [...teams].sort(customSort)
  }, [teams]);
  
  const sortedGroupedTeams = useMemo(() => {
      if (!groups) return [];
      const classes = groups.filter(g => g.type === 'class').sort(customSort);
      const teamlist = groups.filter(g => g.type === 'team');
  
      return classes.map(c => ({
          ...c,
          teams: teamlist.filter(t => t.parentId === c.id).sort(customSort),
      })).filter(c => c.teams.length > 0);
  }, [groups]);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Dialog
        open={isAppointmentDialogOpen}
        onOpenChange={(open) => {
          setIsAppointmentDialogOpen(open);
          if (!open) resetAppointmentForm();
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5" />
              {selectedAppointment ? 'Termin bearbeiten' : 'Termin hinzufügen'}
            </DialogTitle>
            <DialogDescription>
              {selectedAppointment
                ? 'Details der Terminserie ändern.'
                : 'Neuen Termin oder Serie hinzufügen.'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] p-1 pr-6">
            <Form {...appointmentForm}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="space-y-4 px-1 py-4"
              >
                <FormField
                  control={appointmentForm.control}
                  name="appointmentTypeId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Art des Termins</FormLabel>
                        <Dialog
                          open={isTypeDialogOpen}
                          onOpenChange={setIsTypeDialogOpen}
                        >
                          <DialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7"
                            >
                              <Plus className="h-3 w-3 mr-1" /> Verwalten
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Termin-Arten verwalten</DialogTitle>
                            </DialogHeader>
                            <Form {...typeForm}>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                <div className="space-y-4 py-4">
                                  <FormField
                                    control={typeForm.control}
                                    name="name"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Neue Art hinzufügen</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="z.B. Turnier"
                                            {...field}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <Button
                                    type="button"
                                    className="w-full"
                                    onClick={typeForm.handleSubmit(
                                      onSubmitAppointmentType
                                    )}
                                    disabled={
                                      typeForm.formState.isSubmitting
                                    }
                                  >
                                    {typeForm.formState.isSubmitting && (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Typ Speichern
                                  </Button>
                                </div>
                              </form>
                            </Form>
                            <Separator className="my-4" />
                            <h4 className="text-sm font-medium mb-2">
                              Bestehende Arten
                            </h4>
                            <ScrollArea className="h-40">
                              <div className="space-y-2 pr-4">
                                {appointmentTypes &&
                                appointmentTypes.length > 0 ? (
                                  appointmentTypes.map((type) => (
                                    <div
                                      key={type.id}
                                      className="flex justify-between items-center p-2 hover:bg-accent rounded-md"
                                    >
                                      <span>{type.name}</span>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>
                                              Sind Sie sicher?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Möchten Sie "{type.name}"
                                              wirklich löschen?
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>
                                              Abbrechen
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() =>
                                                onDeleteAppointmentType(
                                                  type.id
                                                )
                                              }
                                              className="bg-destructive hover:bg-destructive/90"
                                            >
                                              Löschen
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground text-center">
                                    Keine Arten gefunden.
                                  </p>
                                )}
                              </div>
                            </ScrollArea>
                            <DialogFooter className="mt-4">
                              <DialogClose asChild>
                                <Button type="button" variant="outline">
                                  Schließen
                                </Button>
                              </DialogClose>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Art auswählen..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingTypes ? (
                            <SelectItem value="loading" disabled>
                              Lade...
                            </SelectItem>
                          ) : (
                            appointmentTypes?.map((type) => (
                              <SelectItem key={type.id} value={type.id}>
                                {type.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={appointmentForm.control}
                  name="title"
                  render={({ field }) => {
                    const isSonstigesSelected =
                      sonstigeTypeId === watchAppointmentTypeId;
                    return (
                      <FormItem>
                        <FormLabel>
                          Titel{' '}
                          {isSonstigesSelected ? (
                            ''
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              (Optional, Standard: Art)
                            </span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={
                              isSonstigesSelected
                                ? 'Titel ist erforderlich...'
                                : 'Optionaler Titel...'
                            }
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={appointmentForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Beginn</FormLabel>
                        <FormControl>
                          <Input
                            type={watchIsAllDay ? 'date' : 'datetime-local'}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={appointmentForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ende (optional)</FormLabel>
                        <FormControl>
                          <Input
                            type={watchIsAllDay ? 'date' : 'datetime-local'}
                            {...field}
                            disabled={watchIsAllDay}
                            min={appointmentForm.getValues('startDate')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={appointmentForm.control}
                  name="isAllDay"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (checked) {
                              appointmentForm.setValue('endDate', '');
                            }
                          }}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">
                        Ganztägiger Termin
                      </FormLabel>
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={appointmentForm.control}
                    name="recurrence"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Wiederholung</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            if (value === 'none') {
                              appointmentForm.setValue('recurrenceEndDate', '');
                            }
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Keine</SelectItem>
                            <SelectItem value="daily">Täglich</SelectItem>
                            <SelectItem value="weekly">Wöchentlich</SelectItem>
                            <SelectItem value="bi-weekly">
                              Alle 2 Wochen
                            </SelectItem>
                            <SelectItem value="monthly">Monatlich</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {watchRecurrence !== 'none' && (
                    <FormField
                      control={appointmentForm.control}
                      name="recurrenceEndDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Wiederholung endet am</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              min={
                                appointmentForm.getValues('startDate')
                                  ? appointmentForm
                                      .getValues('startDate')
                                      .split('T')[0]
                                  : undefined
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <FormField
                  control={appointmentForm.control}
                  name="visibilityType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sichtbar für</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value === 'all')
                            appointmentForm.setValue('visibleTeamIds', []);
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">Alle Mitglieder</SelectItem>
                          <SelectItem value="specificTeams">
                            Bestimmte Mannschaften
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchVisibilityType === 'specificTeams' && (
                  <FormField
                    control={appointmentForm.control}
                    name="visibleTeamIds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mannschaften auswählen</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  'w-full justify-between h-auto min-h-10 py-2',
                                  !field.value?.length &&
                                    'text-muted-foreground'
                                )}
                              >
                                <span className="flex flex-wrap gap-1">
                                  {field.value?.length > 0
                                    ? field.value.map((id) => (
                                        <span
                                          key={id}
                                          className="bg-muted text-muted-foreground px-2 py-0.5 rounded-sm"
                                        >
                                          {teamsMap.get(id) || id}
                                        </span>
                                      ))
                                    : 'Mannschaften auswählen'}
                                </span>
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[--radix-popover-trigger-width] p-0"
                            onInteractOutside={(e) => e.preventDefault()}
                          >
                            <ScrollArea className="h-48">
                              <div className="p-2 space-y-1">
                                {isLoadingGroups ? (
                                  <p className="text-sm text-muted-foreground p-2">
                                    Lade...
                                  </p>
                                ) : sortedGroupedTeams.length > 0 ? (
                                  sortedGroupedTeams.map(
                                    (group: GroupWithTeams) => (
                                      <div key={group.id} className="mb-2">
                                        <h4 className="font-semibold text-sm mb-1.5 px-2">
                                          {group.name}
                                        </h4>
                                        <div className="flex flex-col space-y-1 pl-4">
                                          {group.teams.map((team: Group) => (
                                            <FormField
                                              key={team.id}
                                              control={
                                                appointmentForm.control
                                              }
                                              name="visibleTeamIds"
                                              render={({
                                                field: multiSelectField,
                                              }) => (
                                                <FormItem
                                                  key={team.id}
                                                  className="flex flex-row items-center space-x-2 space-y-0 px-2 py-1.5 rounded-sm hover:bg-accent"
                                                >
                                                  <FormControl>
                                                    <Checkbox
                                                      checked={multiSelectField.value?.includes(
                                                        team.id
                                                      )}
                                                      onCheckedChange={(
                                                        checked
                                                      ) => {
                                                        const newValue =
                                                          checked
                                                            ? [
                                                                ...(multiSelectField.value ||
                                                                  []),
                                                                team.id,
                                                              ]
                                                            : (
                                                                multiSelectField.value ||
                                                                []
                                                              ).filter(
                                                                (id) =>
                                                                  id !== team.id
                                                              );
                                                        multiSelectField.onChange(
                                                          newValue
                                                        );
                                                      }}
                                                    />
                                                  </FormControl>
                                                  <FormLabel
                                                    className="text-sm font-normal cursor-pointer"
                                                    onClick={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      const newValue =
                                                        multiSelectField.value?.includes(
                                                          team.id
                                                        )
                                                          ? (
                                                              multiSelectField.value ||
                                                              []
                                                            ).filter(
                                                              (id) =>
                                                                id !== team.id
                                                            )
                                                          : [
                                                              ...(multiSelectField.value ||
                                                                []),
                                                              team.id,
                                                            ];
                                                      multiSelectField.onChange(
                                                        newValue
                                                      );
                                                    }}
                                                  >
                                                    {team.name}
                                                  </FormLabel>
                                                </FormItem>
                                              )}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )
                                  )
                                ) : (
                                  <p className="text-sm text-muted-foreground p-2 text-center">
                                    Keine Mannschaften erstellt.
                                  </p>
                                )}
                              </div>
                            </ScrollArea>
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={appointmentForm.control}
                  name="rsvpDeadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rückmeldung bis (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type={watchIsAllDay ? 'date' : 'datetime-local'}
                          {...field}
                          max={appointmentForm.getValues('startDate')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={appointmentForm.control}
                  name="locationId"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Ort</FormLabel>
                        <Dialog
                          open={isLocationDialogOpen}
                          onOpenChange={setIsLocationDialogOpen}
                        >
                          <DialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7"
                            >
                              <Plus className="h-3 w-3 mr-1" /> Verwalten
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Orte verwalten</DialogTitle>
                            </DialogHeader>
                            <Form {...locationForm}>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                <div className="space-y-4 py-4">
                                  <FormField
                                    control={locationForm.control}
                                    name="name"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Name des Ortes</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="z.B. Fritz-Jacobi-Anlage"
                                            {...field}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={locationForm.control}
                                    name="address"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>
                                          Adresse (optional)
                                        </FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="Straße, PLZ Ort"
                                            {...field}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <Button
                                    type="button"
                                    className="w-full"
                                    onClick={locationForm.handleSubmit(
                                      onSubmitLocation
                                    )}
                                    disabled={
                                      locationForm.formState.isSubmitting
                                    }
                                  >
                                    {locationForm.formState.isSubmitting && (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Ort Speichern
                                  </Button>
                                </div>
                              </form>
                            </Form>
                            <Separator className="my-4" />
                            <h4 className="text-sm font-medium mb-2">
                              Bestehende Orte
                            </h4>
                            <ScrollArea className="h-40">
                              <div className="space-y-2 pr-4">
                                {locations && locations.length > 0 ? (
                                  locations.map((loc) => (
                                    <div
                                      key={loc.id}
                                      className="flex justify-between items-center p-2 hover:bg-accent rounded-md"
                                    >
                                      <div>
                                        <p>{loc.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {loc.address}
                                        </p>
                                      </div>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>
                                              Sind Sie sicher?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Möchten Sie "{loc.name}" wirklich
                                              löschen?
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>
                                              Abbrechen
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() =>
                                                onDeleteLocation(loc.id)
                                              }
                                              className="bg-destructive hover:bg-destructive/90"
                                            >
                                              Löschen
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground text-center">
                                    Keine Orte gefunden.
                                  </p>
                                )}
                              </div>
                            </ScrollArea>
                            <DialogFooter className="mt-4">
                              <DialogClose asChild>
                                <Button type="button" variant="outline">
                                  Schließen
                                </Button>
                              </DialogClose>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Ort auswählen..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {isLoadingLocations ? (
                            <SelectItem value="loading" disabled>
                              Lade...
                            </SelectItem>
                          ) : (
                            locations?.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                {loc.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={appointmentForm.control}
                    name="meetingPoint"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Treffpunkt (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="z.B. Eingang Halle" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={appointmentForm.control}
                    name="meetingTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Treffzeit (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="z.B. 18:45 Uhr" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={appointmentForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beschreibung (optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Weitere Details..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="pt-4">
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={resetAppointmentForm}
                    >
                      Abbrechen
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    onClick={appointmentForm.handleSubmit(onSubmitAppointment)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {selectedAppointment ? 'Serie speichern' : 'Termin hinzufügen'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isInstanceDialogOpen}
        onOpenChange={(open) => {
          setIsInstanceDialogOpen(open);
          if (!open) {
            setSelectedInstanceToEdit(null);
            instanceForm.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Einzelnen Termin bearbeiten</DialogTitle>
            <DialogDescription>
              Ändere Details nur für diesen spezifischen Termin am{' '}
              {selectedInstanceToEdit?.startDate
                ? format(
                    selectedInstanceToEdit.startDate.toDate(),
                    'dd.MM.yyyy HH:mm',
                    { locale: de }
                  )
                : ''}
              .
            </DialogDescription>
          </DialogHeader>
          <Form {...instanceForm}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="space-y-4 pt-4"
            >
              <input
                type="hidden"
                {...instanceForm.register('originalDateISO')}
              />
              <FormField
                control={instanceForm.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beginn</FormLabel>
                    <FormControl>
                      <Input
                        type={
                          selectedInstanceToEdit?.isAllDay
                            ? 'date'
                            : 'datetime-local'
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!selectedInstanceToEdit?.isAllDay && (
                <FormField
                  control={instanceForm.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ende (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          {...field}
                          min={instanceForm.getValues('startDate')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={instanceForm.control}
                name="isAllDay"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-2 space-y-0 pt-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">
                      Ganztägiger Termin
                    </FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={instanceForm.control}
                name="title"
                render={({ field }) => {
                  const typeName = selectedInstanceToEdit
                    ? typesMap.get(selectedInstanceToEdit.appointmentTypeId)
                    : '';
                  const isSonstiges = typeName === 'Sonstiges';
                  return (
                    <FormItem>
                      <FormLabel>
                        Titel{' '}
                        {isSonstiges ? (
                          ''
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            (Optional)
                          </span>
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            isSonstiges
                              ? 'Titel ist erforderlich...'
                              : 'Optionaler Titel...'
                          }
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={instanceForm.control}
                name="locationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ort</FormLabel>{' '}
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ''}
                    >
                      {' '}
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Ort auswählen..." />
                        </SelectTrigger>
                      </FormControl>{' '}
                      <SelectContent>
                        {isLoadingLocations ? (
                          <SelectItem value="loading" disabled>
                            Lade...
                          </SelectItem>
                        ) : (
                          locations?.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>{' '}
                    </Select>{' '}
                    <FormMessage />{' '}
                  </FormItem>
                )}
              />
              <FormField
                control={instanceForm.control}
                name="meetingPoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Treffpunkt (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="z.B. Eingang Halle"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={instanceForm.control}
                name="meetingTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Treffzeit (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="z.B. 18:45 Uhr"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={instanceForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beschreibung (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Weitere Details..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="pt-4">
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Abbrechen
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={instanceForm.handleSubmit(onSubmitSingleInstance)}
                  disabled={isSubmitting}
                >
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Speichern
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={isUpdateTypeDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetSingleInstanceDialogs();
          setIsUpdateTypeDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Änderung speichern</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du diese Änderung nur für diesen Termin ({' '}
              {selectedInstanceToEdit?.startDate
                ? format(
                    selectedInstanceToEdit.startDate.toDate(),
                    'dd.MM.yy',
                    { locale: de }
                  )
                : ''}
              ) speichern oder für diesen und alle zukünftigen Termine dieser
              Serie?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetSingleInstanceDialogs}>
              Abbrechen
            </AlertDialogCancel>
            <Button onClick={handleSaveSingleOnly} disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Nur diesen Termin
            </Button>
            <Button onClick={handleSaveForFuture} disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Diesen und zukünftige
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-3">
              {' '}
              <ListTodo className="h-6 w-6" /> <span>Alle Termine</span>{' '}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Filter className="h-4 w-4 text-muted-foreground sm:hidden" />
                <Select value={teamFilter} onValueChange={setTeamFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Nach Mannschaft filtern..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Mannschaften</SelectItem>
                    <SelectItem value="myTeams">Meine Mannschaften</SelectItem>
                    <Separator />
                    {isLoadingGroups ? (
                      <SelectItem value="loading" disabled>
                        Lade...
                      </SelectItem>
                    ) : (
                      sortedTeamsForFilter.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Nach Typ filtern..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Typen</SelectItem>
                    {isLoadingTypes ? (
                      <SelectItem value="loading" disabled>
                        Lade...
                      </SelectItem>
                    ) : (
                      appointmentTypes?.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      )) ?? []
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => {
                  resetAppointmentForm();
                  setIsAppointmentDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Termin hinzufügen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
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
                      const typeName =
                        typesMap.get(app.appointmentTypeId) ||
                        app.appointmentTypeId;
                      const isSonstiges = typeName === 'Sonstiges';
                      const titleIsDefault =
                        !isSonstiges && app.title === typeName;
                      const showTitle =
                        app.title && (!titleIsDefault || isSonstiges);
                      const displayTitle = showTitle
                        ? `${typeName} (${app.title})`
                        : typeName;
                      const isCancelled = app.isCancelled;

                      return (
                        <TableRow
                          key={app.virtualId}
                          className={cn(
                            isCancelled &&
                              'text-muted-foreground line-through opacity-70'
                          )}
                        >
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {displayTitle}
                          </TableCell>
                          <TableCell>
                            {app.startDate
                              ? format(
                                  app.startDate.toDate(),
                                  app.isAllDay ? 'dd.MM.yy' : 'dd.MM.yy HH:mm',
                                  { locale: de }
                                )
                              : 'N/A'}
                            {app.endDate && !app.isAllDay && (
                              <>
                                {' '}
                                -{' '}
                                {format(app.endDate.toDate(), 'HH:mm', {
                                  locale: de,
                                })}
                              </>
                            )}
                            {app.isAllDay && (
                              <span className="text-xs text-muted-foreground">
                                {' '}
                                (Ganztags)
                              </span>
                            )}
                            {app.isException && !isCancelled && (
                              <span className="ml-1 text-xs text-blue-600">
                                (Geändert)
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {app.visibility.type === 'all'
                              ? 'Alle'
                              : app.visibility.teamIds
                                  .map((id) => teamsMap.get(id) || id)
                                  .join(', ') || '-'}
                          </TableCell>
                          <TableCell>
                            {app.locationId
                              ? locationsMap.get(app.locationId)?.name || '-'
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {app.originalId !== app.virtualId &&
                            app.recurrence &&
                            app.recurrence !== 'none'
                              ? `${app.recurrence} bis ${
                                  app.recurrenceEndDate
                                    ? format(
                                        app.recurrenceEndDate.toDate(),
                                        'dd.MM.yy',
                                        { locale: de }
                                      )
                                    : '...'
                                }`
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {app.rsvpDeadline
                              ? format(
                                  app.rsvpDeadline.toDate(),
                                  'dd.MM.yy HH:mm',
                                  { locale: de }
                                )
                              : '-'}
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditAppointment(app)}
                              disabled={isCancelled}
                            >
                              <Edit className="h-4 w-4" />
                              <span className="sr-only">
                                Termin bearbeiten
                              </span>
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={isSubmitting}
                                >
                                  {' '}
                                  {isCancelled ? (
                                    <RefreshCw className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <CalendarX className="h-4 w-4 text-orange-600" />
                                  )}{' '}
                                  <span className="sr-only">
                                    {isCancelled
                                      ? 'Absage rückgängig'
                                      : 'Diesen Termin absagen'}
                                  </span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  {' '}
                                  <AlertDialogTitle>
                                    {isCancelled
                                      ? 'Absage rückgängig machen?'
                                      : 'Nur diesen Termin absagen?'}
                                  </AlertDialogTitle>{' '}
                                  <AlertDialogDescription>
                                    {isCancelled
                                      ? `Soll der abgesagte Termin am ${format(
                                          app.startDate.toDate(),
                                          'dd.MM.yyyy'
                                        )} wiederhergestellt werden?`
                                      : `Möchten Sie nur den Termin am ${format(
                                          app.startDate.toDate(),
                                          'dd.MM.yyyy'
                                        )} absagen? Die Serie bleibt bestehen.`}
                                  </AlertDialogDescription>{' '}
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  {' '}
                                  <AlertDialogCancel>
                                    Abbrechen
                                  </AlertDialogCancel>{' '}
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleCancelSingleInstance(app)
                                    }
                                  >
                                    {isCancelled
                                      ? 'Wiederherstellen'
                                      : 'Absagen'}
                                  </AlertDialogAction>{' '}
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  {' '}
                                  <Trash2 className="h-4 w-4 text-destructive" />{' '}
                                  <span className="sr-only">
                                    Serie löschen
                                  </span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  {' '}
                                  <AlertDialogTitle>
                                    Ganze Serie löschen?
                                  </AlertDialogTitle>{' '}
                                  <AlertDialogDescription>
                                    Diese Aktion kann nicht rückgängig gemacht
                                    werden und löscht die gesamte Terminserie "
                                    {displayTitle}". Alle zukünftigen Termine
                                    dieser Serie werden entfernt (dies kann
                                    einen Moment dauern).
                                  </AlertDialogDescription>{' '}
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  {' '}
                                  <AlertDialogCancel>
                                    Abbrechen
                                  </AlertDialogCancel>{' '}
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleDeleteAppointment(app.originalId)
                                    }
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    Serie löschen
                                  </AlertDialogAction>{' '}
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-24 text-center text-muted-foreground"
                      >
                        Keine Termine entsprechen den Filtern.
                      </TableCell>
                    </TableRow>
                  )}
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
  if (isUserLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-destructive">
              <ListTodo className="h-8 w-8" />
              <span className="text-2xl font-headline">Zugriff verweigert</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Sie verfügen nicht über die erforderlichen Berechtigungen...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  return <AdminTerminePageContent />;
}

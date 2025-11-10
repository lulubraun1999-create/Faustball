
'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
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
  Timestamp,
} from 'firebase/firestore';
import type { Appointment, AppointmentType, Group, Location } from '@/lib/types';
import { Loader2, CalendarPlus, X } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';

const appointmentSchema = z.object({
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

export default function AppointmentCreationPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { isAdmin, isUserLoading, user } = useUser();
  const router = useRouter();

  // Data fetching
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

  const onSubmit = async (data: AppointmentFormValues) => {
    if (!firestore || !user) return;

    try {
        const typeName = appointmentTypes?.find(t => t.id === data.appointmentTypeId)?.name || 'Termin';
        
        let rsvpTimestamp: Timestamp | null = null;
        if (data.rsvpDeadline) {
          const [days, hours] = data.rsvpDeadline.split(':').map(Number);
          const totalHours = (days * 24) + hours;
          const deadlineMillis = totalHours * 60 * 60 * 1000;
          // Temporärer Platzhalter - wird serverseitig pro Instanz berechnet
          rsvpTimestamp = Timestamp.fromMillis(deadlineMillis);
        }

        const newAppointmentData = {
          ...data,
          title: data.title?.trim() === '' ? typeName : data.title,
          startDate: Timestamp.fromDate(new Date(data.startDate)),
          endDate: data.endDate ? Timestamp.fromDate(new Date(data.endDate)) : null,
          recurrenceEndDate: data.recurrenceEndDate ? Timestamp.fromDate(new Date(data.recurrenceEndDate)) : null,
          rsvpDeadline: rsvpTimestamp,
          visibility: {
              type: data.visibilityType,
              teamIds: data.visibilityType === 'specificTeams' ? data.visibleTeamIds : [],
          },
          createdBy: user.uid,
          createdAt: Timestamp.now(),
          lastUpdated: Timestamp.now()
        };

        // Remove properties that are not part of the final DB schema
        delete (newAppointmentData as any).visibilityType;
        delete (newAppointmentData as any).visibleTeamIds;

        await addDoc(collection(firestore, 'appointments'), newAppointmentData);
        toast({ title: 'Erfolg', description: `Der Termin "${newAppointmentData.title}" wurde erfolgreich erstellt.` });
        form.reset();

    } catch (e: any) {
        console.error("Error creating appointment:", e);
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `appointments`,
            operation: 'create',
            requestResourceData: data,
        }));
        toast({
            variant: 'destructive',
            title: 'Fehler beim Erstellen des Termins',
            description: e.message,
        });
    }
  };

  const isLoading = isUserLoading || isLoadingTypes || isLoadingLocations || isLoadingGroups;

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

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
       <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-3">
                  <CalendarPlus className="h-6 w-6" />
                  Neuen Termin erstellen
              </CardTitle>
              <CardDescription>
                  Füllen Sie die Details aus, um einen neuen Termin oder eine Terminserie zu erstellen.
              </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        <FormField control={form.control} name="appointmentTypeId" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Art des Termins*</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        <FormField control={form.control} name="recurrence" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Wiederholung</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Wiederholung auswählen" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">Keine</SelectItem>
                                        <SelectItem value="daily">Täglich</SelectItem>
                                        <SelectItem value="weekly">Wöchentlich</SelectItem>
                                        <SelectItem value="bi-weekly">Alle 2 Wochen</SelectItem>
                                        <SelectItem value="monthly">Monatlich</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="recurrenceEndDate" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Ende der Wiederholung</FormLabel>
                                <FormControl><Input type="date" {...field} disabled={form.watch('recurrence') === 'none'} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}/>
                        <FormField control={form.control} name="rsvpDeadline" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Rückmeldefrist</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        <div className="lg:col-span-3">
                           <FormField control={form.control} name="description" render={({ field }) => (
                              <FormItem>
                                  <FormLabel>Beschreibung</FormLabel>
                                  <FormControl><Textarea placeholder="Zusätzliche Informationen zum Termin" {...field} /></FormControl>
                              </FormItem>
                          )}/>
                        </div>
                        <FormField control={form.control} name="visibilityType" render={({ field }) => (
                            <FormItem className="space-y-3">
                                <FormLabel>Sichtbarkeit</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="all">Alle</SelectItem>
                                        <SelectItem value="specificTeams">Bestimmte Mannschaften</SelectItem>
                                    </SelectContent>
                                </Select>
                            </FormItem>
                        )}/>
                        {watchVisibilityType === 'specificTeams' && (
                            <div className="lg:col-span-2">
                                <FormField control={form.control} name="visibleTeamIds" render={() => (
                                    <FormItem>
                                        <FormLabel>Mannschaften auswählen</FormLabel>
                                        <ScrollArea className="h-40 rounded-md border p-4">
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
                    <div className="flex justify-end pt-8">
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Termin erstellen
                        </Button>
                    </div>
                </form>
            </Form>
          </CardContent>
       </Card>
    </div>
  );
}

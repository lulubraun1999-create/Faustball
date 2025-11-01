
'use client';

import { useState, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
import { useToast } from '@/hooks/use-toast';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
  useUser,
} from '@/firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where,
} from 'firebase/firestore';
import { Loader2, Plus, Trash2, CalendarOff } from 'lucide-react';
import { format, isPast, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Absence } from '@/lib/types';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '@/firebase';

const absenceSchema = z.object({
  startDate: z.string().min(1, 'Startdatum ist erforderlich.'),
  endDate: z.string().min(1, 'Enddatum ist erforderlich.'),
  reason: z.string().min(1, 'Ein Grund ist erforderlich (z.B. Urlaub, Krank).'),
}).refine(data => {
    try {
        return new Date(data.endDate) >= new Date(data.startDate);
    } catch {
        return false;
    }
}, {
    message: "Das Enddatum darf nicht vor dem Startdatum liegen.",
    path: ["endDate"],
});


type AbsenceFormValues = z.infer<typeof absenceSchema>;

export default function VerwaltungAbwesenheitenPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const absencesQuery = useMemoFirebase(
    () =>
      firestore && user
        ? query(collection(firestore, 'absences'), where('userId', '==', user.uid))
        : null,
    [firestore, user]
  );
  const { data: absences, isLoading: isLoadingAbsences } = useCollection<Absence>(absencesQuery);

  const form = useForm<AbsenceFormValues>({
    resolver: zodResolver(absenceSchema),
    defaultValues: {
      startDate: '',
      endDate: '',
      reason: '',
    },
  });

  const onSubmit = async (data: AbsenceFormValues) => {
    if (!firestore || !user) return;

    // Daten für die Cloud Function vorbereiten (Datumsangaben als Strings)
    const absenceDataForFunction = {
      ...data,
    };

    try {
      const { firebaseApp } = initializeFirebase();
      const functions = getFunctions(firebaseApp);
      const processAbsence = httpsCallable(functions, 'processAbsence');

      await processAbsence(absenceDataForFunction);
      
      toast({
        title: 'Abwesenheit gespeichert',
        description: 'Deine Termine in diesem Zeitraum wurden automatisch als abgesagt markiert.',
      });
      form.reset();
    } catch (error: any) {
        console.error("Fehler beim Verarbeiten der Abwesenheit: ", error);
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: error.message || 'Die Abwesenheit konnte nicht verarbeitet werden.',
      });
    }
  };

  const handleDeleteAbsence = async (absenceId: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'absences', absenceId));
      toast({ title: 'Abwesenheit gelöscht' });
    } catch (e) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: `absences/${absenceId}`,
          operation: 'delete',
        })
      );
    }
  };

  const { upcomingAbsences, pastAbsences } = useMemo(() => {
    if (!absences) return { upcomingAbsences: [], pastAbsences: [] };
    const now = new Date();
    const upcoming: Absence[] = [];
    const past: Absence[] = [];
    
    absences.forEach(absence => {
        if (isPast(absence.endDate.toDate())) {
            past.push(absence);
        } else {
            upcoming.push(absence);
        }
    });

    upcoming.sort((a,b) => a.startDate.toMillis() - b.startDate.toMillis());
    past.sort((a,b) => b.endDate.toMillis() - a.endDate.toMillis());

    return { upcomingAbsences: upcoming, pastAbsences: past };
  }, [absences]);
  
  const isLoading = isUserLoading || isLoadingAbsences;


  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
       <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <CalendarOff className="h-8 w-8 text-primary" />
          <span className="font-headline">Meine Abwesenheiten</span>
        </h1>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle>Neue Abwesenheit eintragen</CardTitle>
                    <CardDescription>
                        Trage hier deinen Urlaub oder andere längere Abwesenheiten ein. Deine Termine in diesem Zeitraum werden automatisch abgesagt.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="startDate"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Startdatum</FormLabel>
                                    <FormControl>
                                        <Input type="date" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="endDate"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Enddatum</FormLabel>
                                    <FormControl>
                                        <Input type="date" {...field} min={form.watch('startDate')}/>
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="reason"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Grund</FormLabel>
                                    <FormControl>
                                        <Input placeholder="z.B. Urlaub, Krank" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Speichern
                            </Button>
                        </form>
                     </Form>
                </CardContent>
            </Card>
        </div>

        <div className="lg:col-span-2">
           <Card>
            <CardHeader>
              <CardTitle>Geplante & vergangene Abwesenheiten</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-medium mb-2">Anstehend</h3>
                        {upcomingAbsences.length > 0 ? (
                            <Table>
                                <TableHeader><TableRow><TableHead>Grund</TableHead><TableHead>Start</TableHead><TableHead>Ende</TableHead><TableHead className="text-right"></TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {upcomingAbsences.map(absence => (
                                        <TableRow key={absence.id}>
                                            <TableCell className="font-medium">{absence.reason}</TableCell>
                                            <TableCell>{format(absence.startDate.toDate(), 'dd.MM.yyyy', {locale: de})}</TableCell>
                                            <TableCell>{format(absence.endDate.toDate(), 'dd.MM.yyyy', {locale: de})}</TableCell>
                                            <TableCell className="text-right">
                                                 <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Sicher?</AlertDialogTitle>
                                                            <AlertDialogDescription>Möchtest du diese Abwesenheit wirklich löschen? Die automatischen Terminabsagen werden dadurch nicht zurückgenommen.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDeleteAbsence(absence.id)} className="bg-destructive hover:bg-destructive/90">Löschen</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : <p className="text-sm text-muted-foreground text-center p-4">Keine anstehenden Abwesenheiten.</p>}
                    </div>
                     <div>
                        <h3 className="text-lg font-medium mb-2">Vergangen</h3>
                        {pastAbsences.length > 0 ? (
                             <Table>
                                <TableHeader><TableRow><TableHead>Grund</TableHead><TableHead>Start</TableHead><TableHead>Ende</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {pastAbsences.map(absence => (
                                        <TableRow key={absence.id} className="text-muted-foreground">
                                            <TableCell>{absence.reason}</TableCell>
                                            <TableCell>{format(absence.startDate.toDate(), 'dd.MM.yyyy', {locale: de})}</TableCell>
                                            <TableCell>{format(absence.endDate.toDate(), 'dd.MM.yyyy', {locale: de})}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : <p className="text-sm text-muted-foreground text-center p-4">Keine vergangenen Abwesenheiten.</p>}
                    </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}


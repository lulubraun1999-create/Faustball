
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
} from '@/firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
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
import { Edit, Trash2, ListTodo, Loader2 } from 'lucide-react';
import type { Appointment } from '@/lib/types';
import { AdminGuard } from '@/components/admin-guard';

const appointmentSchema = z.object({
  title: z.string().min(1, 'Titel ist erforderlich.'),
  date: z.string().min(1, 'Datum ist erforderlich.'),
  type: z.enum(['Training', 'Spieltag', 'Event']),
  location: z.string().optional(),
  description: z.string().optional(),
});

type AppointmentFormValues = z.infer<typeof appointmentSchema>;

function AdminTerminePageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();

  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const appointmentsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'appointments') : null),
    [firestore]
  );
  const { data: appointments, isLoading } =
    useCollection<Appointment>(appointmentsRef);

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      title: '',
      date: '',
      type: 'Training',
      location: '',
      description: '',
    },
  });

  const onSubmit = async (data: AppointmentFormValues) => {
    if (!firestore || !appointmentsRef) return;
    setIsSubmitting(true);

    const appointmentData = {
      ...data,
      date: Timestamp.fromDate(new Date(data.date)),
    };

    try {
      if (selectedAppointment) {
        const docRef = doc(firestore, 'appointments', selectedAppointment.id!);
        updateDoc(docRef, appointmentData).catch((e) => {
          const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: appointmentData,
          });
          errorEmitter.emit('permission-error', permissionError);
        });
        toast({ title: 'Termin erfolgreich aktualisiert.' });
      } else {
        addDoc(appointmentsRef, appointmentData).catch((e) => {
          const permissionError = new FirestorePermissionError({
            path: 'appointments',
            operation: 'create',
            requestResourceData: appointmentData,
          });
          errorEmitter.emit('permission-error', permissionError);
        });
        toast({ title: 'Neuer Termin erfolgreich erstellt.' });
      }
      resetForm();
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Fehler',
            description: 'Der Termin konnte nicht gespeichert werden.',
        });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!firestore) return;
    const docRef = doc(firestore, 'appointments', id);
    deleteDoc(docRef).catch((e) => {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    });
    toast({ title: 'Termin gelöscht.' });
  };

  const handleEdit = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    const date = (appointment.date as unknown as Timestamp)
      .toDate()
      .toISOString()
      .slice(0, 16);
    form.reset({ ...appointment, date });
  };

  const resetForm = () => {
    form.reset();
    setSelectedAppointment(null);
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedAppointment ? 'Termin bearbeiten' : 'Neuer Termin'}
              </CardTitle>
              <CardDescription>
                {selectedAppointment
                  ? 'Ändern Sie die Details des Termins.'
                  : 'Fügen Sie einen neuen Termin hinzu.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Titel</FormLabel>
                        <FormControl>
                          <Input placeholder="z.B. Training Herren" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Datum und Uhrzeit</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Typ</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Typ auswählen" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Training">Training</SelectItem>
                            <SelectItem value="Spieltag">Spieltag</SelectItem>
                            <SelectItem value="Event">Event</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ort</FormLabel>
                        <FormControl>
                          <Input placeholder="z.B. Fritz-Jacobi-Anlage" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Beschreibung</FormLabel>
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
                  <div className="flex justify-end space-x-2">
                    {selectedAppointment && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetForm}
                      >
                        Abbrechen
                      </Button>
                    )}
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {selectedAppointment ? 'Speichern' : 'Erstellen'}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <ListTodo className="h-6 w-6" />
                <span>Alle Termine</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titel</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments
                      ?.sort((a, b) => (a.date as any) - (b.date as any))
                      .map((app) => (
                        <TableRow key={app.id}>
                          <TableCell className="font-medium">{app.title}</TableCell>
                          <TableCell>
                            {new Date(
                              (app.date as unknown as Timestamp).seconds * 1000
                            ).toLocaleString('de-DE', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </TableCell>
                          <TableCell>{app.type}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(app)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Sind Sie sicher?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Diese Aktion kann nicht rückgängig gemacht
                                    werden.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(app.id!)}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    Löschen
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AdminTerminePage() {
  return (
    <AdminGuard>
      <AdminTerminePageContent />
    </AdminGuard>
  );
}

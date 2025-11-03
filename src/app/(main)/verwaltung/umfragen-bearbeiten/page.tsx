
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
    useCollection,
    useFirestore,
    useMemoFirebase,
    errorEmitter, 
    FirestorePermissionError,
    useUser
} from '@/firebase';
import type { Group, Poll } from '@/lib/types';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, parseISO } from 'date-fns';
import { collection, addDoc, Timestamp, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import {
  Loader2,
  Plus,
  Trash2,
  Vote,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
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

const pollSchema = z.object({
  title: z.string().min(1, 'Titel ist erforderlich.'),
  options: z
    .array(z.object({ text: z.string().min(1, 'Option darf nicht leer sein.') }))
    .min(2, 'Es müssen mindestens 2 Optionen vorhanden sein.'),
  endDate: z.string().min(1, 'Ein Enddatum ist erforderlich.'),
  allowMultipleAnswers: z.boolean().default(false),
  visibilityType: z.enum(['all', 'specificTeams']).default('all'),
  visibleTeamIds: z.array(z.string()).default([]),
});

type PollFormValues = z.infer<typeof pollSchema>;

export default function AdminUmfragenBearbeitenPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const { isAdmin, isUserLoading } = useUser();

  const groupsRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'groups') : null),
    [firestore, isAdmin]
  );
  const { data: groupsData, isLoading: isLoadingGroups } = useCollection<Group>(groupsRef);

  const pollsRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'polls') : null),
    [firestore, isAdmin]
  );
  const { data: polls, isLoading: isLoadingPolls } = useCollection<Poll>(pollsRef);

  const teams = useMemo(() => {
    return groupsData?.filter(g => g.type === 'team').sort((a,b) => a.name.localeCompare(b.name)) || [];
  }, [groupsData]);

  const form = useForm<PollFormValues>({
    resolver: zodResolver(pollSchema),
    defaultValues: {
      title: '',
      options: [{ text: '' }, { text: '' }],
      endDate: '',
      allowMultipleAnswers: false,
      visibilityType: 'all',
      visibleTeamIds: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'options',
  });
  
  const watchVisibilityType = form.watch('visibilityType');

  const onSubmit = async (data: PollFormValues) => {
    if (!firestore) return;
    
    const endDateTimestamp = Timestamp.fromDate(parseISO(data.endDate));

    const pollData = {
        ...data,
        endDate: endDateTimestamp,
        createdAt: serverTimestamp(),
        visibility: {
            type: data.visibilityType,
            teamIds: data.visibilityType === 'specificTeams' ? data.visibleTeamIds : [],
        },
        votes: [],
        options: data.options.map((opt, index) => ({ id: `${index}`, text: opt.text }))
    };

    delete (pollData as any).visibilityType;
    delete (pollData as any).visibleTeamIds;

    try {
        await addDoc(collection(firestore, 'polls'), pollData);
        toast({ title: "Erfolg", description: "Die Umfrage wurde erfolgreich erstellt." });
        form.reset();
        setIsDialogOpen(false);
    } catch (error) {
         errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'polls',
            operation: 'create',
            requestResourceData: pollData,
        }));
    }
  };
  
  const handleDeletePoll = async (pollId: string) => {
    if (!firestore) return;
    try {
        await deleteDoc(doc(firestore, 'polls', pollId));
        toast({ title: "Erfolg", description: "Die Umfrage wurde gelöscht." });
    } catch(e) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: `polls/${pollId}`,
            operation: 'delete',
        }));
    }
  }
  
  const sortedPolls = useMemo(() => {
    if (!polls) return [];
    return [...polls].sort((a, b) => {
      const dateA = a.endDate as Timestamp;
      const dateB = b.endDate as Timestamp;
      return dateB.toMillis() - dateA.toMillis();
    });
  }, [polls]);
  
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
                  <Vote className="h-8 w-8" />
                  <span className="text-2xl font-headline">Zugriff verweigert</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Sie verfügen nicht über die erforderlichen Berechtigungen, um auf
                  diesen Bereich zuzugreifen.
                </p>
              </CardContent>
            </Card>
          </div>
        );
    }

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Vote className="h-8 w-8 text-primary" />
          <span className="font-headline">Umfragen verwalten</span>
        </h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Neue Umfrage erstellen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Neue Umfrage erstellen</DialogTitle>
              <DialogDescription>
                Füllen Sie die Details aus, um eine neue Umfrage zu erstellen.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Umfragetitel</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. Termin für Weihnachtsfeier" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <Label>Antwortmöglichkeiten</Label>
                  <div className="mt-2 space-y-3">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-2">
                        <FormField
                          control={form.control}
                          name={`options.${index}.text`}
                          render={({ field }) => (
                            <FormItem className="flex-grow">
                              <FormControl>
                                <Input placeholder={`Option ${index + 1}`} {...field} />
                              </FormControl>
                               <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          disabled={fields.length <= 2}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                   {form.formState.errors.options && form.formState.errors.options.root && (
                      <p className="text-sm font-medium text-destructive mt-2">
                        {form.formState.errors.options.root.message}
                      </p>
                    )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => append({ text: '' })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Option hinzufügen
                  </Button>
                </div>

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Abstimmung endet am</FormLabel>
                       <FormControl>
                         <Input type="date" {...field} />
                       </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="allowMultipleAnswers"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Mehrfachantworten erlauben</FormLabel>
                          <FormDescription>
                            Benutzer können mehrere Optionen auswählen.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                
                 <FormField
                  control={form.control}
                  name="visibilityType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Sichtbarkeit</FormLabel>
                      <FormControl>
                         <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Wählen Sie, wer abstimmen kann" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="all">Alle Mitglieder</SelectItem>
                                <SelectItem value="specificTeams">Bestimmte Mannschaften</SelectItem>
                            </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchVisibilityType === 'specificTeams' && (
                  <FormField
                    control={form.control}
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
                                            id={`team-${team.id}`}
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
                                        <label htmlFor={`team-${team.id}`} className="text-sm font-medium leading-none">
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


                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {form.reset(); setIsDialogOpen(false)}}
                  >
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Umfrage speichern
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bestehende Umfragen</CardTitle>
        </CardHeader>
        <CardContent>
           {isLoadingPolls ? (
             <div className="flex justify-center p-12">
                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
           ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titel</TableHead>
                <TableHead>Endet am</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {sortedPolls && sortedPolls.length > 0 ? (
                sortedPolls.map((poll) => {
                    const endDate = (poll.endDate as Timestamp).toDate();
                    const isActive = endDate >= new Date();
                    return (
                        <TableRow key={poll.id}>
                            <TableCell className="font-medium">{poll.title}</TableCell>
                            <TableCell>{format(endDate, 'dd.MM.yyyy')}</TableCell>
                            <TableCell>
                                <span className={cn("px-2 py-1 rounded-full text-xs font-medium", isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                                    {isActive ? 'Aktiv' : 'Abgelaufen'}
                                </span>
                            </TableCell>
                            <TableCell className="text-right">
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon">
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Sind Sie sicher?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Möchten Sie die Umfrage "{poll.title}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeletePoll(poll.id!)} className="bg-destructive hover:bg-destructive/90">
                                            Löschen
                                        </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </TableCell>
                        </TableRow>
                    )
                })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  Noch keine Umfragen erstellt.
                </TableCell>
              </TableRow>
            )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

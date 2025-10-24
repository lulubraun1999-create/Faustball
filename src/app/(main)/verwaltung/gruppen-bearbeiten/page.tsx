
'use client';

import { useState, useEffect } from 'react';
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
  SelectGroup,
  SelectLabel
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Users,
  Loader2,
  Users2,
  Settings,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useFirestore,
  errorEmitter,
  FirestorePermissionError,
  useUser,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import {
  collection,
  addDoc,
  doc,
  deleteDoc,
  query,
  where,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Group } from '@/lib/types';
import { AdminGuard } from '@/components/admin-guard';

const groupManagementSchema = z.object({
  action: z.enum(['add', 'delete']),
  type: z.enum(['class', 'team']),
  parentId: z.string().optional(),
  name: z.string().optional(),
  deleteId: z.string().optional(),
});

type GroupManagementValues = z.infer<typeof groupManagementSchema>;

function AdminGruppenBearbeitenPageContent() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const { isAdmin } = useUser();
  const [isEditingOpen, setIsEditingOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Group | null>(null);

  const groupsRef = useMemoFirebase(
    () => (firestore && isAdmin ? collection(firestore, 'groups') : null),
    [firestore, isAdmin]
  );
  const { data: groups, isLoading } = useCollection<Group>(groupsRef);

  const classes =
    groups?.filter((g) => g.type === 'class').sort((a, b) => a.name.localeCompare(b.name)) || [];
  const teams =
    groups?.filter((g) => g.type === 'team' && g.parentId === selectedClass?.id)
      .sort((a, b) => a.name.localeCompare(b.name)) || [];

  useEffect(() => {
    if (!selectedClass && classes.length > 0) {
      setSelectedClass(classes[0]);
    }
    if (selectedClass) {
        const updatedSelectedClass = classes.find(c => c.id === selectedClass.id);
        if(updatedSelectedClass) {
            setSelectedClass(updatedSelectedClass);
        } else if (classes.length > 0) {
            setSelectedClass(classes[0]);
        } else {
            setSelectedClass(null);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);
  
  const form = useForm<GroupManagementValues>({
    resolver: zodResolver(groupManagementSchema),
    defaultValues: {
      action: 'add',
      type: 'class',
      name: '',
      parentId: '',
      deleteId: '',
    },
  });
  const watchAction = form.watch('action');
  const watchType = form.watch('type');
  const watchParentId = form.watch('parentId');

  useEffect(() => {
      const currentValues = form.getValues();
      form.reset({
          ...currentValues,
          deleteId: '',
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchParentId, watchType, watchAction]);


  const onManagementSubmit = async (data: GroupManagementValues) => {
    if (!firestore) return;
    const groupsRef = collection(firestore, 'groups');

    const currentFormValues = form.getValues();

    if (data.action === 'add') {
      if (!data.name || data.name.trim() === '') {
        form.setError('name', {
          type: 'manual',
          message: 'Name ist erforderlich.',
        });
        return;
      }
      if (data.type === 'team' && !data.parentId) {
        form.setError('parentId', {
          type: 'manual',
          message: 'Eine Obergruppe ist erforderlich.',
        });
        return;
      }
      const newGroup: Omit<Group, 'id'> = {
        name: data.name,
        type: data.type,
        ...(data.type === 'team' && { parentId: data.parentId }),
      };
      
      addDoc(groupsRef, newGroup).then(() => {
        toast({ title: 'Gruppe erfolgreich erstellt.' });
        form.reset({ ...currentFormValues, name: '', deleteId: '' });
      }).catch(() => {
        const permissionError = new FirestorePermissionError({
          path: 'groups',
          operation: 'create',
          requestResourceData: newGroup
        });
        errorEmitter.emit('permission-error', permissionError);
      });

    } else if (data.action === 'delete') {
      if (!data.deleteId) {
        form.setError('deleteId', {
          type: 'manual',
          message: 'Bitte wählen Sie ein Element zum Löschen aus.',
        });
        return;
      }
      
      const docRef = doc(firestore, 'groups', data.deleteId);
      const itemToDelete = groups?.find(g => g.id === data.deleteId);

      if (itemToDelete?.type === 'class') {
          const batch = writeBatch(firestore);
          const teamQuery = query(collection(firestore, 'groups'), where('parentId', '==', data.deleteId));
          getDocs(teamQuery).then(teamSnapshot => {
            teamSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            batch.delete(docRef);
            return batch.commit();
          }).then(() => {
            toast({ title: 'Obergruppe und alle zugehörigen Untergruppen gelöscht.' });
            form.reset({ ...currentFormValues, name: '', deleteId: '' });
          }).catch(() => {
            const permissionError = new FirestorePermissionError({
              path: `groups/${data.deleteId}`,
              operation: 'delete',
            });
            errorEmitter.emit('permission-error', permissionError);
          });
      } else {
          deleteDoc(docRef).then(() => {
            toast({ title: 'Gruppe erfolgreich gelöscht.' });
            form.reset({ ...currentFormValues, name: '', deleteId: '' });
          }).catch(() => {
            const permissionError = new FirestorePermissionError({
              path: `groups/${data.deleteId}`,
              operation: 'delete',
            });
            errorEmitter.emit('permission-error', permissionError);
          });
      }
    }
  };

  const getDeletableItems = () => {
    if (watchType === 'class') {
        return classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>);
    }
    if (watchType === 'team') {
        return classes.map(c => {
            const teamsOfClass = groups?.filter(g => g.type === 'team' && g.parentId === c.id);
            if (!teamsOfClass || teamsOfClass.length === 0) return null;
            return (
                <SelectGroup key={c.id}>
                    <SelectLabel>{c.name}</SelectLabel>
                    {teamsOfClass.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectGroup>
            )
        })
    }
    return [];
  };

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
            <Users2 className="h-8 w-8 text-primary" />
            <span className="font-headline">Mannschaften bearbeiten</span>
        </h1>
        <Dialog open={isEditingOpen} onOpenChange={setIsEditingOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon">
                <Settings className="h-5 w-5" />
                <span className="sr-only">Mannschaften verwalten</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
                <DialogTitle>Mannschaften verwalten</DialogTitle>
                <DialogDescription>
                  Füge neue Mannschaften hinzu, bearbeite oder lösche bestehende.
                </DialogDescription>
            </DialogHeader>
             <Form {...form}>
                <form
                    onSubmit={form.handleSubmit(onManagementSubmit)}
                    className="space-y-6 pt-4"
                >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="action"
                        render={({ field }) => (
                        <FormItem>
                            <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            >
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Aktion auswählen" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="add">Hinzufügen</SelectItem>
                                <SelectItem value="delete">Löschen</SelectItem>
                            </SelectContent>
                            </Select>
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                        <FormItem>
                            <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            >
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Typ auswählen" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="class">Obergruppe</SelectItem>
                                <SelectItem value="team">Untergruppe</SelectItem>
                            </SelectContent>
                            </Select>
                        </FormItem>
                        )}
                    />
                    </div>
                    
                    {watchAction === 'add' ? (
                    <>
                        {watchType === 'team' && (
                        <FormField
                            control={form.control}
                            name="parentId"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Obergruppe wählen...</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ''}>
                                    <FormControl>
                                        <SelectTrigger>
                                        <SelectValue placeholder="Obergruppe für neue Mannschaft auswählen" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        )}
                        <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Name für neues Element...</FormLabel>
                            <FormControl>
                                <Input placeholder={`Name für neue ${watchType === 'class' ? 'Obergruppe' : 'Mannschaft'}`} {...field} value={field.value || ''}/>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    </>
                    ) : (
                        <>
                        <FormField
                            control={form.control}
                            name="deleteId"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Zu löschendes Element</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value || ''}>
                                    <FormControl>
                                        <SelectTrigger>
                                        <SelectValue placeholder="Element zum Löschen auswählen" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {getDeletableItems()}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        </>
                    )}


                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">
                            Schließen
                            </Button>
                        </DialogClose>
                        <Button type="submit" disabled={form.formState.isSubmitting}>
                            {form.formState.isSubmitting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                            'Aktion ausführen'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

       <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="md:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">TSV Bayer Leverkusen</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <nav className="flex flex-col space-y-1">
                {classes.length > 0 ? classes.map((category) => (
                  <Button
                    key={category.id}
                    variant="ghost"
                    onClick={() => setSelectedClass(category)}
                    className={cn(
                      'justify-start px-3 text-left font-normal',
                      selectedClass?.id === category.id &&
                        'bg-accent text-accent-foreground'
                    )}
                  >
                    {category.name}
                  </Button>
                )) : (
                    <p className="text-sm text-muted-foreground p-4 text-center">Noch keine Obergruppen erstellt.</p>
                )}
              </nav>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {selectedClass ? selectedClass.name : (isLoading ? 'Laden...' : 'Keine Obergruppe ausgewählt')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
               <div className="flex justify-center p-12">
                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
               </div>
            ) : teams.length > 0 ? (
              <div className="space-y-2">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="rounded-md border p-3 hover:bg-accent/50"
                  >
                    {team.name}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 p-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">
                  {selectedClass ? 'Keine Mannschaften in dieser Obergruppe.' : 'Bitte eine Obergruppe auswählen.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}

export default function AdminGruppenBearbeitenPage() {
  return (
    <AdminGuard>
      <AdminGruppenBearbeitenPageContent />
    </AdminGuard>
  );
}

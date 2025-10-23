
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
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Users,
  Loader2,
} from 'lucide-react';
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

const groupManagementSchema = z.object({
  action: z.enum(['add', 'delete']),
  type: z.enum(['class', 'team']),
  parentId: z.string().optional(),
  name: z.string().optional(),
  deleteId: z.string().optional(),
});

type GroupManagementValues = z.infer<typeof groupManagementSchema>;

export default function AdminGruppenBearbeitenPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Group | null>(null);

  const groupsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'groups') : null),
    [firestore]
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

  const onManagementSubmit = async (data: GroupManagementValues) => {
    if (!firestore || !groupsRef) return;

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
      
      try {
        const docRef = await addDoc(groupsRef, newGroup);
        toast({ title: 'Gruppe erfolgreich erstellt.' });
        form.reset({ action: 'add', type: 'class', name: '', parentId: '', deleteId: '' });
      } catch (error) {
        const permissionError = new FirestorePermissionError({
          path: 'groups',
          operation: 'create',
          requestResourceData: newGroup
        });
        errorEmitter.emit('permission-error', permissionError);
      }
    } else if (data.action === 'delete') {
      if (!data.deleteId) {
        form.setError('deleteId', {
          type: 'manual',
          message: 'Bitte wählen Sie ein Element zum Löschen aus.',
        });
        return;
      }
      
      try {
        const docRef = doc(firestore, 'groups', data.deleteId);
        const itemToDelete = groups?.find(g => g.id === data.deleteId);

        if (itemToDelete?.type === 'class') {
            const batch = writeBatch(firestore);
            const teamQuery = query(collection(firestore, 'groups'), where('parentId', '==', data.deleteId));
            const teamSnapshot = await getDocs(teamQuery);
            teamSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            batch.delete(docRef);
            await batch.commit();
             toast({ title: 'Obergruppe und alle zugehörigen Untergruppen gelöscht.' });
        } else {
            await deleteDoc(docRef);
            toast({ title: 'Gruppe erfolgreich gelöscht.' });
        }
        form.reset({ action: 'add', type: 'class', name: '', parentId: '', deleteId: '' });
      } catch (error) {
         const permissionError = new FirestorePermissionError({
          path: `groups/${data.deleteId}`,
          operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
      }
    }
  };

  const getDeletableItems = () => {
    if (watchType === 'class') {
      return classes;
    }
    if (watchType === 'team' && form.watch('parentId')) {
      return groups?.filter((g) => g.parentId === form.watch('parentId')) || [];
    }
    return [];
  };

  const renderDisplayView = () => (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="md:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">TSV Bayer Leverkusen</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <nav className="flex flex-col space-y-1">
                {classes.map((category) => (
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
                ))}
              </nav>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {selectedClass ? selectedClass.name : 'Keine Obergruppe ausgewählt'}
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
                  Keine Mannschaften in dieser Obergruppe.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderEditingView = () => (
    <Card>
      <CardHeader>
        <CardTitle>Gruppen verwalten</CardTitle>
        <CardDescription>
          Füge neue Gruppen hinzu, bearbeite oder lösche bestehende.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onManagementSubmit)}
            className="space-y-6"
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                {watchType === 'team' && (
                   <FormField
                    control={form.control}
                    name="parentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Obergruppe der zu löschenden Mannschaft</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Obergruppe auswählen" />
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
                    name="deleteId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Zu löschendes Element</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={watchType === 'team' && !form.watch('parentId')}>
                            <FormControl>
                                <SelectTrigger>
                                <SelectValue placeholder="Element zum Löschen auswählen" />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                {getDeletableItems().map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </>
            )}


            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  'Aktion ausführen'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gruppen</h1>
        <Button onClick={() => setIsEditing(!isEditing)}>
          {isEditing ? 'Schließen' : 'Gruppen bearbeiten'}
        </Button>
      </div>

      {isEditing ? renderEditingView() : renderDisplayView()}
    </div>
  );
}

    
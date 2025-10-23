
'use client';

import { AdminGuard } from '@/components/admin-guard';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import {
  CalendarIcon,
  Loader2,
  Plus,
  Trash2,
  Vote,
} from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

const pollSchema = z.object({
  title: z.string().min(1, 'Titel ist erforderlich.'),
  options: z
    .array(z.object({ text: z.string().min(1, 'Option darf nicht leer sein.') }))
    .min(2, 'Es müssen mindestens 2 Optionen vorhanden sein.'),
  endDate: z.date({
    required_error: 'Ein Enddatum ist erforderlich.',
  }),
  allowCustomAnswers: z.boolean().default(false),
  isAnonymous: z.boolean().default(false),
  visibilityType: z.enum(['all', 'specificTeams']).default('all'),
  visibleTeamIds: z.array(z.string()).default([]),
});

type PollFormValues = z.infer<typeof pollSchema>;

function AdminUmfragenPageContent() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<PollFormValues>({
    resolver: zodResolver(pollSchema),
    defaultValues: {
      title: '',
      options: [{ text: '' }, { text: '' }],
      endDate: new Date(),
      allowCustomAnswers: false,
      isAnonymous: false,
      visibilityType: 'all',
      visibleTeamIds: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'options',
  });
  
  const watchVisibilityType = form.watch('visibilityType');

  const onSubmit = (data: PollFormValues) => {
    console.log(data);
    // TODO: Firestore logic
    setIsDialogOpen(false);
  };

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
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={'outline'}
                              className={cn(
                                'w-[240px] pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {field.value ? (
                                format(field.value, 'PPP')
                              ) : (
                                <span>Datum auswählen</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="allowCustomAnswers"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Eigene Antworten erlauben</FormLabel>
                          <FormDescription>
                            Benutzer können eigene Antwortoptionen hinzufügen.
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
                  <FormField
                    control={form.control}
                    name="isAnonymous"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Anonyme Umfrage</FormLabel>
                          <FormDescription>
                            Die Stimmen der Benutzer werden nicht angezeigt.
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
                    render={() => (
                      <FormItem>
                         <FormLabel>Mannschaften auswählen</FormLabel>
                         <div className="p-4 border rounded-md max-h-48 overflow-y-auto">
                            <p className="text-muted-foreground text-center">Mannschaftsauswahl wird in Kürze implementiert.</p>
                         </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}


                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button type="submit">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin hidden" />
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
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  Noch keine Umfragen erstellt.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminUmfragenBearbeitenPage() {
  return (
    <AdminGuard>
      <AdminUmfragenPageContent />
    </AdminGuard>
  );
}

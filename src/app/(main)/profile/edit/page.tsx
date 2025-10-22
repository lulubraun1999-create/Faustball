'use client';

import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@/hooks/use-toast';
import {
  useFirestore,
  useDoc,
  useUser,
  useMemoFirebase,
} from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';

const profileFormSchema = z.object({
  firstName: z.string().min(1, 'Vorname ist erforderlich.'),
  lastName: z.string().min(1, 'Nachname ist erforderlich.'),
  phone: z.string().optional(),
  location: z.string().optional(),
  birthday: z.string().optional(),
  position: z.array(z.string()).optional().default([]),
  gender: z
    .enum(['männlich', 'weiblich', 'divers (damenteam)', 'divers (herrenteam)'])
    .optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfileEditPage() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const { user: authUser, isUserLoading: isAuthLoading } = useUser();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !authUser) return null;
    return doc(firestore, 'users', authUser.uid);
  }, [firestore, authUser]);

  const { data: user, isLoading: isUserDocLoading } = useDoc<UserProfile>(userDocRef);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      location: '',
      birthday: '',
      position: [],
    },
  });

  useEffect(() => {
    if (user) {
      // Ensure positions are an array
      const userPosition = user.position ? (Array.isArray(user.position) ? user.position : [user.position]) : [];

      form.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || '',
        location: user.location || '',
        birthday: user.birthday || '',
        position: userPosition,
        gender: user.gender,
      });
    }
  }, [user, form]);

  const onSubmit = async (data: ProfileFormValues) => {
    if (!userDocRef) return;

    try {
      await setDoc(userDocRef, data, { merge: true });
      toast({
        title: 'Profil aktualisiert',
        description: 'Ihre Informationen wurden erfolgreich gespeichert.',
      });
      // Optionally, you could redirect or just show the toast
      // router.push('/profile');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler beim Speichern',
        description: 'Ihre Informationen konnten nicht gespeichert werden. ' + error.message,
      });
    }
  };

  const isLoading = isAuthLoading || isUserDocLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
        {/* Left-hand Menu */}
        <aside className="md:col-span-1">
          <h2 className="mb-4 text-xl font-semibold">Menü</h2>
          <nav className="flex flex-col space-y-2">
            <Button variant="ghost" className="justify-start text-left">Daten ändern</Button>
            <Button variant="ghost" className="justify-start text-left text-muted-foreground" disabled>Passwort ändern</Button>
            <Button variant="ghost" className="justify-start text-left text-muted-foreground" disabled>Logout</Button>
          </nav>
          <div className="mt-8 rounded-lg border border-destructive/50 p-4">
            <h3 className="font-semibold">Konto löschen</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Achtung: Diese Aktion ist dauerhaft und kann nicht rückgängig gemacht werden.
            </p>
            <Button variant="destructive" className="mt-4 w-full" disabled>
              Konto dauerhaft löschen
            </Button>
          </div>
        </aside>

        {/* Right-hand Form */}
        <main className="md:col-span-3">
          <h1 className="mb-6 text-2xl font-bold">Daten ändern</h1>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vorname</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nachname</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefon</FormLabel>
                      <FormControl>
                        <Input placeholder="+49 123 4567890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Wohnort</FormLabel>
                      <FormControl>
                        <Input placeholder="Leverkusen" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormItem>
                  <FormLabel>Position</FormLabel>
                  <div className="flex space-x-4">
                    {['Abwehr', 'Zuspiel', 'Angriff'].map((position) => (
                      <FormField
                        key={position}
                        control={form.control}
                        name="position"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={position}
                              className="flex flex-row items-start space-x-2 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(position)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...(field.value || []), position])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== position
                                          )
                                        )
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {position}
                              </FormLabel>
                            </FormItem>
                          )
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>

                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Geschlecht</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Geschlecht auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="weiblich">weiblich</SelectItem>
                          <SelectItem value="männlich">männlich</SelectItem>
                          <SelectItem value="divers (damenteam)">
                            divers (Damenteam)
                          </SelectItem>
                           <SelectItem value="divers (herrenteam)">
                            divers (Herrenteam)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="birthday"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Geburtstag</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormItem>
                    <FormLabel>Rolle</FormLabel>
                    <FormControl>
                        <Input readOnly value={user?.role || 'Spieler'} className="bg-muted/50" />
                    </FormControl>
                </FormItem>
                
                <FormItem>
                    <FormLabel>E-Mail</FormLabel>
                    <FormControl>
                        <Input readOnly value={user?.email || ''} className="bg-muted/50" />
                    </FormControl>
                </FormItem>

              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Speichern
                </Button>
              </div>
            </form>
          </Form>
        </main>
      </div>
    </div>
  );
}

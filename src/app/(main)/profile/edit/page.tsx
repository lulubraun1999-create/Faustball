
'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
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
  useAuth,
  useMemoFirebase,
  errorEmitter,
  FirestorePermissionError,
  initializeFirebase,
} from '@/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  updatePassword,
  verifyBeforeUpdateEmail,
  deleteUser,
  signOut,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { MemberProfile } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

const profileFormSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  location: z.string().optional(),
  birthday: z.string().optional(),
  position: z.array(z.string()).optional().default([]),
  gender: z
    .enum(['männlich', 'weiblich', 'divers (Damenteam)', 'divers (Herrenteam)'])
    .optional(),
});

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Aktuelles Passwort ist erforderlich.'),
    newPassword: z
      .string()
      .min(6, 'Das neue Passwort muss mindestens 6 Zeichen lang sein.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Die Passwörter stimmen nicht überein.',
    path: ['confirmPassword'],
  });

const emailFormSchema = z.object({
  newEmail: z.string().email('Bitte geben Sie eine gültige E-Mail-Adresse ein.'),
  currentPassword: z.string().min(1, 'Aktuelles Passwort ist erforderlich.'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type PasswordFormValues = z.infer<typeof passwordFormSchema>;
type EmailFormValues = z.infer<typeof emailFormSchema>;

export default function ProfileEditPage() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const auth = useAuth();
  const { user: authUser, userProfile, isUserLoading, isAdmin, forceRefresh } = useUser();

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isSettingAdmin, setIsSettingAdmin] = useState(false);

  const memberDocRef = useMemoFirebase(() => {
    if (!firestore || !authUser) return null;
    return doc(firestore, 'members', authUser.uid);
  }, [firestore, authUser]);

  const { data: member, isLoading: isMemberDocLoading } =
    useDoc<MemberProfile>(memberDocRef);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      location: '',
      birthday: '',
      position: [],
      gender: undefined,
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      newEmail: '',
      currentPassword: '',
    },
  });

  useEffect(() => {
    if (userProfile || member) {
      profileForm.reset({
        firstName: userProfile?.firstName || '',
        lastName: userProfile?.lastName || '',
        phone: member?.phone || '',
        location: member?.location || '',
        birthday: member?.birthday || '',
        position: member?.position || [],
        gender: member?.gender,
      });
    }
  }, [userProfile, member, profileForm]);

  const handleSetAdmin = async () => {
    if (!authUser) {
      toast({ variant: 'destructive', title: 'Fehler', description: 'Benutzer nicht angemeldet.' });
      return;
    }
    setIsSettingAdmin(true);

    try {
      const { firebaseApp } = initializeFirebase();
      const functions = getFunctions(firebaseApp);
      const setAdminRole = httpsCallable(functions, 'setAdminRole');

      // Call the function with the user's UID in the data payload
      await setAdminRole({ uid: authUser.uid });
      
      toast({
        title: 'Admin-Rolle wird zugewiesen',
        description: 'Ihre Berechtigungen werden aktualisiert. Die Seite wird in Kürze neu geladen.',
      });

      // Force a refresh of the ID token to get the new custom claim
      await forceRefresh?.();

      // Reload the page to ensure all components get the new state
      setTimeout(() => window.location.reload(), 3000);

    } catch (error: any) {
      console.error('Fehler beim Zuweisen der Admin-Rolle:', error);
      toast({
        variant: 'destructive',
        title: 'Fehler bei der Rollenzuweisung',
        description: error.message || 'Die Admin-Rolle konnte nicht zugewiesen werden. Versuchen Sie es später erneut.',
      });
       setIsSettingAdmin(false);
    }
  };


  const onProfileSubmit = async (data: ProfileFormValues) => {
    if (!memberDocRef || !authUser) return;

    const memberData: Omit<MemberProfile, 'userId'| 'firstName' | 'lastName' | 'email'> = {
      phone: data.phone,
      location: data.location,
      birthday: data.birthday,
      position: data.position,
      gender: data.gender,
    };
    
    setDoc(memberDocRef, memberData, { merge: true })
      .then(() => {
        toast({
          title: 'Profil aktualisiert',
          description: 'Ihre Informationen wurden erfolgreich gespeichert.',
        });
      })
      .catch(() => {
        const permissionError = new FirestorePermissionError({
          path: memberDocRef.path,
          operation: 'update',
          requestResourceData: memberData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });
  };

  const reauthenticate = async (password: string) => {
    if (!authUser || !authUser.email) {
      throw new Error('Benutzer nicht authentifiziert oder E-Mail fehlt.');
    }
    const credential = EmailAuthProvider.credential(authUser.email, password);
    await reauthenticateWithCredential(authUser, credential);
  };

  const onPasswordChange = async (data: PasswordFormValues) => {
    if (!authUser) return;
    try {
      await reauthenticate(data.currentPassword);
      await updatePassword(authUser, data.newPassword);
      toast({
        title: 'Passwort erfolgreich geändert',
        description:
          'Sie werden nun ausgeloggt. Bitte melden Sie sich mit Ihrem neuen Passwort an.',
      });
      await handleLogout();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler beim Ändern des Passworts',
        description:
          error.code === 'auth/wrong-password'
            ? 'Das aktuelle Passwort ist falsch.'
            : 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
      });
    } finally {
      setIsPasswordDialogOpen(false);
      passwordForm.reset();
    }
  };

  const onEmailChange = async (data: EmailFormValues) => {
    const userDocRef = firestore ? doc(firestore, 'users', authUser!.uid) : null;
    if (!authUser || !userDocRef) return;

    try {
      await reauthenticate(data.currentPassword);
      await verifyBeforeUpdateEmail(authUser, data.newEmail);

      const userUpdateData = { email: data.newEmail };
      setDoc(userDocRef, userUpdateData, { merge: true }).catch(() => {
        const permissionError = new FirestorePermissionError({
          path: userDocRef.path,
          operation: 'update',
          requestResourceData: userUpdateData,
        });
        errorEmitter.emit('permission-error', permissionError);
      });

      toast({
        title: 'Bestätigungs-E-Mail gesendet',
        description: `Eine E-Mail wurde an ${data.newEmail} gesendet. Bitte klicken Sie auf den Link, um die Änderung abzuschließen.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler beim Ändern der E-Mail',
        description:
          error.code === 'auth/wrong-password'
            ? 'Das aktuelle Passwort ist falsch.'
            : 'Diese E-Mail wird möglicherweise bereits verwendet oder ein anderer Fehler ist aufgetreten.',
      });
    } finally {
      setIsEmailDialogOpen(false);
      emailForm.reset();
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push('/login');
    }
  };

  const handleDeleteAccount = async () => {
    if (!authUser || !firestore) return;
    const userDocRef = doc(firestore, 'users', authUser.uid);
    try {
      if (memberDocRef) {
        deleteDoc(memberDocRef).catch(() => {
          const permissionError = new FirestorePermissionError({
            path: memberDocRef.path,
            operation: 'delete',
          });
          errorEmitter.emit('permission-error', permissionError);
        });
      }
      if (userDocRef) {
        deleteDoc(userDocRef).catch(() => {
          const permissionError = new FirestorePermissionError({
            path: userDocRef.path,
            operation: 'delete',
          });
          errorEmitter.emit('permission-error', permissionError);
        });
      }

      await deleteUser(authUser);

      toast({
        title: 'Konto gelöscht',
        description: 'Ihr Konto wurde dauerhaft gelöscht.',
      });
      router.push('/login');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler beim Löschen des Kontos',
        description:
          'Aus Sicherheitsgründen erfordert diese Aktion eine kürzliche Anmeldung. Bitte melden Sie sich erneut an und versuchen Sie es noch einmal.',
      });
    }
  };

  const isLoading = isUserLoading || isMemberDocLoading;

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  const isConsideredAdmin = isAdmin || userProfile?.role === 'admin';


  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
        <aside className="md:col-span-1">
          <h2 className="mb-4 text-xl font-semibold">Menü</h2>
          <nav className="flex flex-col space-y-2">
            <Button variant="ghost" className="justify-start text-left">
              Daten ändern
            </Button>

            <Dialog
              open={isPasswordDialogOpen}
              onOpenChange={setIsPasswordDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="ghost" className="justify-start text-left">
                  Passwort ändern
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Neues Passwort festlegen</DialogTitle>
                  <DialogDescription>
                    Bestätigen Sie Ihr aktuelles Passwort und geben Sie ein
                    neues ein. Sie werden danach abgemeldet.
                  </DialogDescription>
                </DialogHeader>
                <Form {...passwordForm}>
                  <form
                    onSubmit={passwordForm.handleSubmit(onPasswordChange)}
                    className="space-y-4"
                  >
                    <FormField
                      control={passwordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Aktuelles Passwort</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Neues Passwort</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Neues Passwort bestätigen</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="secondary">
                          Abbrechen
                        </Button>
                      </DialogClose>
                      <Button
                        type="submit"
                        disabled={passwordForm.formState.isSubmitting}
                      >
                        {passwordForm.formState.isSubmitting && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Speichern
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" className="justify-start text-left">
                  E-Mail ändern
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>E-Mail-Adresse ändern</DialogTitle>
                  <DialogDescription>
                    Bestätigen Sie Ihr Passwort und geben Sie die neue
                    E-Mail-Adresse ein.
                  </DialogDescription>
                </DialogHeader>
                <Form {...emailForm}>
                  <form
                    onSubmit={emailForm.handleSubmit(onEmailChange)}
                    className="space-y-4"
                  >
                    <FormField
                      control={emailForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Aktuelles Passwort</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={emailForm.control}
                      name="newEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Neue E-Mail-Adresse</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="neue.email@beispiel.de"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="secondary">
                          Abbrechen
                        </Button>
                      </DialogClose>
                      <Button
                        type="submit"
                        disabled={emailForm.formState.isSubmitting}
                      >
                        {emailForm.formState.isSubmitting && (
                           <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Bestätigungs-E-Mail senden
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            <Button
              variant="ghost"
              onClick={handleLogout}
              className="justify-start text-left"
            >
              Logout
            </Button>
          </nav>

          <div className="mt-8 rounded-lg border border-border p-4">
             <h3 className="font-semibold">Admin Status</h3>
             <p className="mt-2 text-sm text-muted-foreground">
              {isConsideredAdmin ? "Sie haben bereits Administratorrechte." : "Klicken Sie hier, um sich selbst Administratorrechte zu geben."}
             </p>
             {!isConsideredAdmin && (
                <Button
                    variant="outline"
                    className="mt-4 w-full"
                    onClick={handleSetAdmin}
                    disabled={isSettingAdmin}
                >
                    {isSettingAdmin ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Mich zum Admin machen
                </Button>
             )}
          </div>

          <div className="mt-8 rounded-lg border border-destructive/50 p-4">
            <h3 className="font-semibold">Konto löschen</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Achtung: Diese Aktion ist dauerhaft und kann nicht rückgängig
              gemacht werden.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="mt-4 w-full">
                  Konto dauerhaft löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sind Sie absolut sicher?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Diese Aktion kann nicht rückgängig gemacht werden. Dadurch
                    werden Ihr Konto und alle zugehörigen Daten dauerhaft von
                    unseren Servern gelöscht.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount}>
                    Fortfahren
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </aside>

        <main className="md:col-span-3">
          <h1 className="mb-6 text-2xl font-bold">Daten ändern</h1>
          <Form {...profileForm}>
            <form
              onSubmit={profileForm.handleSubmit(onProfileSubmit)}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField
                  control={profileForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vorname</FormLabel>
                      <FormControl>
                        <Input {...field} readOnly className="bg-muted/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nachname</FormLabel>
                      <FormControl>
                        <Input {...field} readOnly className="bg-muted/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
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
                  control={profileForm.control}
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
                        control={profileForm.control}
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
                                      ? field.onChange([
                                          ...(field.value || []),
                                          position,
                                        ])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== position
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {position}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>

                <FormField
                  control={profileForm.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Geschlecht</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={member?.gender}
                        key={member?.gender}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Geschlecht auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="weiblich">weiblich</SelectItem>
                          <SelectItem value="männlich">männlich</SelectItem>
                          <SelectItem value="divers (Damenteam)">
                            divers (Damenteam)
                          </SelectItem>
                          <SelectItem value="divers (Herrenteam)">
                            divers (herrenteam)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
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
                  <FormLabel>E-Mail</FormLabel>
                  <FormControl>
                    <Input
                      readOnly
                      value={userProfile?.email || ''}
                      className="bg-muted/50"
                    />
                  </FormControl>
                </FormItem>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={profileForm.formState.isSubmitting}
                >
                  {profileForm.formState.isSubmitting && (
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

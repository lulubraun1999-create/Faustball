
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
import { doc, setDoc, writeBatch } from 'firebase/firestore';
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
import { Loader2, ShieldQuestion } from 'lucide-react';
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
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

const profileFormSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().optional(),
  location: z.string().optional(),
  birthday: z.string().optional(),
  position: z.array(z.enum(['Abwehr', 'Zuspiel', 'Angriff'])).optional().default([]),
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
  const { user: authUser, userProfile, isUserLoading, forceRefresh, isAdmin } = useUser();
  
  const [isMakingAdmin, setIsMakingAdmin] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [noAdminExists, setNoAdminExists] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);

  // States for account deletion
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [passwordForDelete, setPasswordForDelete] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);


  const memberDocRef = useMemoFirebase(() => {
    if (!firestore || !authUser) return null;
    return doc(firestore, 'members', authUser.uid);
  }, [firestore, authUser]);

  const { data: member, isLoading: isMemberDocLoading } =
    useDoc<MemberProfile>(memberDocRef);
    
  useEffect(() => {
    if (isUserLoading) return; // Wait until user auth state is resolved

    const checkAdminExistence = async () => {
      setIsCheckingAdmin(true);
      try {
        const { firebaseApp } = initializeFirebase();
        const functions = getFunctions(firebaseApp);
        const anyAdminExistsFn = httpsCallable(functions, 'anyAdminExists');
        const result = await anyAdminExistsFn();
        setNoAdminExists(!(result.data as { isAdminPresent: boolean }).isAdminPresent);
      } catch (error) {
        console.error("Error checking for admin existence:", error);
        // Assume an admin exists to be on the safe side, hiding the button.
        setNoAdminExists(false); 
      } finally {
        setIsCheckingAdmin(false);
      }
    };

    checkAdminExistence();
  }, [isUserLoading]);


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

  const onProfileSubmit = async (data: ProfileFormValues) => {
    if (!memberDocRef || !authUser) return;

    const memberData: Partial<MemberProfile> = {
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
    const credential = EmailAuthProvider.credential(authUser.email!, password);
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
      setIsPasswordOpen(false);
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
      setIsEmailOpen(false);
      emailForm.reset();
    }
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
      router.push('/login');
    }
  };
  
  const handleMakeAdmin = async () => {
    if (!authUser) return;
    setIsMakingAdmin(true);
    try {
      const { firebaseApp } = initializeFirebase();
      const functions = getFunctions(firebaseApp);
      const setAdminRole = httpsCallable(functions, 'setAdminRole');

      // For becoming the first admin, we don't need to pass a UID.
      // The function will use the caller's UID.
      await setAdminRole();
      
      toast({
        title: 'Admin-Status erteilt',
        description: 'Sie sind jetzt ein Administrator. Die neuen Rechte sind in Kürze aktiv.',
      });

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler beim Zuweisen der Admin-Rolle',
        description: error.message || 'Ein unbekannter Fehler ist aufgetreten.',
      });
    } finally {
      setIsMakingAdmin(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!authUser || !firestore || !passwordForDelete) {
        toast({
            variant: 'destructive',
            title: 'Fehler',
            description: 'Passwort ist erforderlich.'
        });
        return;
    }
    
    setIsDeleting(true);
    
    try {
        await reauthenticate(passwordForDelete);

        const batch = writeBatch(firestore);
        const userDocRef = doc(firestore, 'users', authUser.uid);
        const memberDocRef = doc(firestore, 'members', authUser.uid);
        
        batch.delete(userDocRef);
        batch.delete(memberDocRef);

        await batch.commit();
        await deleteUser(authUser);

        toast({
            title: 'Konto gelöscht',
            description: 'Ihr Konto wurde dauerhaft gelöscht.',
        });
        
        setIsDeleteConfirmOpen(false);
        setPasswordForDelete('');
        router.push('/login');

    } catch (error: any) {
        let description = 'Ein Fehler ist aufgetreten.';
        if (error.code === 'auth/wrong-password') {
            description = 'Das eingegebene Passwort ist falsch.';
        } else if (error.code === 'auth/requires-recent-login') {
            description = 'Diese Aktion erfordert eine kürzliche Anmeldung. Bitte loggen Sie sich erneut ein und versuchen Sie es noch einmal.';
        }
        toast({
            variant: 'destructive',
            title: 'Fehler beim Löschen des Kontos',
            description: description,
        });
    } finally {
        setIsDeleting(false);
    }
  };

  const isLoading = isUserLoading || isMemberDocLoading || isCheckingAdmin;

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const positionOptions = ['Abwehr', 'Zuspiel', 'Angriff'] as const;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
        <aside className="md:col-span-1">
          <h2 className="mb-4 text-xl font-semibold">Menü</h2>
          <nav className="flex flex-col space-y-2">
            <Button variant="ghost" className="justify-start text-left">
              Daten ändern
            </Button>
            <Button variant="ghost" className="justify-start text-left" onClick={() => setIsPasswordOpen(!isPasswordOpen)}>
              Passwort ändern
            </Button>
            <Button variant="ghost" className="justify-start text-left" onClick={() => setIsEmailOpen(!isEmailOpen)}>
              E-Mail ändern
            </Button>

            <Button
              variant="ghost"
              onClick={handleLogout}
              className="justify-start text-left"
            >
              Logout
            </Button>
          </nav>
            
          {!isAdmin && noAdminExists && (
            <div className="mt-8 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                <ShieldQuestion className="h-5 w-5" />
                Admin-Status
              </h3>
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                Es existiert noch kein Administrator. Werden Sie der erste, um alle Funktionen freizuschalten.
              </p>
              <Button
                onClick={handleMakeAdmin}
                disabled={isMakingAdmin}
                className="mt-4 w-full"
              >
                {isMakingAdmin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Erster Admin werden
              </Button>
            </div>
          )}

          <div className="mt-8 rounded-lg border border-destructive/50 p-4">
            <h3 className="font-semibold">Konto löschen</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Achtung: Diese Aktion ist dauerhaft und kann nicht rückgängig
              gemacht werden.
            </p>
            <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="mt-4 w-full">
                  Konto dauerhaft löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sind Sie absolut sicher?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Diese Aktion kann nicht rückgängig gemacht werden. Um fortzufahren, geben Sie bitte Ihr Passwort ein.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="password-for-delete">Passwort</Label>
                    <Input 
                        id="password-for-delete"
                        type="password"
                        value={passwordForDelete}
                        onChange={(e) => setPasswordForDelete(e.target.value)}
                        placeholder="••••••••"
                    />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setPasswordForDelete('')}>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount} disabled={isDeleting || !passwordForDelete}>
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Konto endgültig löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </aside>

        <main className="md:col-span-3 space-y-8">
          <div>
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
                      {positionOptions.map((position) => (
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
                          value={field.value ?? ''}
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
                              divers (Herrenteam)
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
          </div>

          <Collapsible open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
            <CollapsibleContent>
              <Card className="mt-8">
                <CardContent className="pt-6">
                  <h2 className="text-xl font-semibold mb-4">Neues Passwort festlegen</h2>
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
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setIsPasswordOpen(false)}>
                          Abbrechen
                        </Button>
                        <Button
                          type="submit"
                          disabled={passwordForm.formState.isSubmitting}
                        >
                          {passwordForm.formState.isSubmitting && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Passwort Speichern
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
          
          <Collapsible open={isEmailOpen} onOpenChange={setIsEmailOpen}>
            <CollapsibleContent>
              <Card className="mt-8">
                <CardContent className="pt-6">
                  <h2 className="text-xl font-semibold mb-4">E-Mail-Adresse ändern</h2>
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
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setIsEmailOpen(false)}>
                          Abbrechen
                        </Button>
                        <Button
                          type="submit"
                          disabled={emailForm.formState.isSubmitting}
                        >
                          {emailForm.formState.isSubmitting && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Bestätigungs-E-Mail senden
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

        </main>
      </div>
    </div>
  );
}


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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { doc, setDoc, writeBatch, getDoc } from 'firebase/firestore';
import {
  updatePassword,
  verifyBeforeUpdateEmail,
  signOut,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { MemberProfile } from '@/lib/types';
import { Loader2, ShieldQuestion } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';

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
    newPassword: z.string().min(6, 'Das neue Passwort muss mindestens 6 Zeichen lang sein.'),
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

const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Passwort ist zur Bestätigung erforderlich.'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type PasswordFormValues = z.infer<typeof passwordFormSchema>;
type EmailFormValues = z.infer<typeof emailFormSchema>;
type DeleteAccountFormValues = z.infer<typeof deleteAccountSchema>;

export default function ProfileEditPage() {
  const router = useRouter();
  const { toast } = useToast();
  const firestore = useFirestore();
  const auth = useAuth();
  const { user: authUser, userProfile, isUserLoading, forceRefresh, isAdmin } = useUser();

  const [isMakingAdmin, setIsMakingAdmin] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [noAdminExists, setNoAdminExists] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);

  const memberDocRef = useMemoFirebase(() => {
    if (!firestore || !authUser) return null;
    return doc(firestore, 'members', authUser.uid);
  }, [firestore, authUser]);

  const { data: member, isLoading: isMemberDocLoading } = useDoc<MemberProfile>(memberDocRef);

  useEffect(() => {
    if (isUserLoading) return;

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

  const deleteAccountForm = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: {
      password: '',
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
    if (!auth || !auth.currentUser) {
      throw new Error('Benutzer nicht authentifiziert oder E-Mail fehlt.');
    }
    const credential = EmailAuthProvider.credential(auth.currentUser.email!, password);
    await reauthenticateWithCredential(auth.currentUser, credential);
  };

  const onPasswordChange = async (data: PasswordFormValues) => {
    if (!auth.currentUser) return;
    try {
      await reauthenticate(data.currentPassword);
      await updatePassword(auth.currentUser, data.newPassword);
      toast({
        title: 'Passwort erfolgreich geändert',
        description: 'Sie werden nun ausgeloggt. Bitte melden Sie sich mit Ihrem neuen Passwort an.',
      });
      await handleLogout();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler beim Ändern des Passworts',
        description:
          error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential'
            ? 'Das aktuelle Passwort ist falsch.'
            : 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
      });
    } finally {
      setIsPasswordOpen(false);
      passwordForm.reset();
    }
  };

  const onEmailChange = async (data: EmailFormValues) => {
    const userDocRef = firestore ? doc(firestore, 'users', auth.currentUser!.uid) : null;
    if (!auth.currentUser || !userDocRef) return;

    try {
      await reauthenticate(data.currentPassword);
      await verifyBeforeUpdateEmail(auth.currentUser, data.newEmail);

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
          error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential'
            ? 'Das aktuelle Passwort ist falsch.'
            : 'Diese E-Mail wird bereits verwendet oder ein anderer Fehler ist aufgetreten.',
      });
    } finally {
      setIsEmailOpen(false);
      emailForm.reset();
    }
  };

  const handleDeleteAccount = async (data: DeleteAccountFormValues) => {
    if (!auth || !auth.currentUser || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Fehler',
        description: 'Benutzer ist nicht korrekt angemeldet.',
      });
      return;
    }
    const currentUser = auth.currentUser;
    try {
      // 1. Re-authenticate user
      const credential = EmailAuthProvider.credential(currentUser.email!, data.password);
      await reauthenticateWithCredential(currentUser, credential);

      // 2. Get team memberships before deleting data
      const memberDocRef = doc(firestore, 'members', currentUser.uid);
      const memberDocSnap = await getDoc(memberDocRef);
      const memberTeams = (memberDocSnap.data() as MemberProfile)?.teams || [];

      // 3. Delete all user-related Firestore data in a batch
      const userDocRef = doc(firestore, 'users', currentUser.uid);
      const batch = writeBatch(firestore);

      batch.delete(userDocRef);
      batch.delete(memberDocRef);
      
      // Also delete from all denormalized group member lists
      if (memberTeams.length > 0) {
        memberTeams.forEach(teamId => {
          const groupMemberDocRef = doc(firestore, 'groups', teamId, 'members', currentUser.uid);
          batch.delete(groupMemberDocRef);
        });
      }

      await batch.commit();

      // 4. Delete Auth user
      await deleteUser(currentUser);

      toast({
        title: 'Konto gelöscht',
        description: 'Ihr Konto wurde vollständig entfernt.',
      });
      router.push('/login');
    } catch (error: any) {
      console.error('Delete error:', error);
      let errorMessage = 'Ein Fehler ist aufgetreten. Das Konto konnte nicht gelöscht werden.';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'Das eingegebene Passwort ist falsch.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'Ihre Anmeldung ist zu alt. Bitte loggen Sie sich erneut ein und versuchen Sie es dann erneut.';
      }
      toast({
        variant: 'destructive',
        title: 'Fehler beim Löschen',
        description: errorMessage,
      });
    } finally {
      setIsDeleteOpen(false);
      deleteAccountForm.reset();
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

      await setAdminRole();

      toast({
        title: 'Admin-Status erteilt',
        description:
          'Sie sind jetzt Administrator. Die neuen Rechte werden in Kürze aktiv.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler beim Admin-Assign',
        description: error.message || 'Ein unbekannter Fehler ist aufgetreten.',
      });
    } finally {
      setIsMakingAdmin(false);
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
            <Button
              variant="ghost"
              className="justify-start text-left"
              onClick={() => setIsPasswordOpen(!isPasswordOpen)}
            >
              Passwort ändern
            </Button>
            <Button
              variant="ghost"
              className="justify-start text-left"
              onClick={() => setIsEmailOpen(!isEmailOpen)}
            >
              E-Mail ändern
            </Button>

            <Button
              variant="ghost"
              onClick={handleLogout}
              className="justify-start text-left"
            >
              Logout
            </Button>

            {/* DELETE ACCOUNT */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="w-full justify-start text-left">
                  Konto dauerhaft löschen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Konto endgültig löschen?</DialogTitle>
                  <DialogDescription>
                    Diese Aktion kann NICHT rückgängig gemacht werden.
                    Bitte geben Sie Ihr Passwort zur Bestätigung ein.
                  </DialogDescription>
                </DialogHeader>

                <Form {...deleteAccountForm}>
                  <form
                    onSubmit={deleteAccountForm.handleSubmit(handleDeleteAccount)}
                    className="space-y-4 pt-4"
                  >
                    <FormField
                      control={deleteAccountForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Passwort</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setIsDeleteOpen(false)}
                      >
                        Abbrechen
                      </Button>
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={deleteAccountForm.formState.isSubmitting}
                      >
                        {deleteAccountForm.formState.isSubmitting && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Endgültig löschen
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            {/* ADMIN BLOCK */}
            {!isAdmin && noAdminExists && (
              <div className="mt-8 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                <h3 className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                  <ShieldQuestion className="h-5 w-5" />
                  Admin-Status
                </h3>
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                  Es gibt noch keinen Admin. Werden Sie der erste.
                </p>
                <Button onClick={handleMakeAdmin} disabled={isMakingAdmin} className="mt-4 w-full">
                  {isMakingAdmin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Erster Admin werden
                </Button>
              </div>
            )}
          </nav>
        </aside>

        {/* MAIN */}
        <main className="md:col-span-3 space-y-8">
          {/* PROFILE FORM */}
          <div>
            <h1 className="mb-6 text-2xl font-bold">Daten ändern</h1>

            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-8">
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
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(position)}
                                  onCheckedChange={(checked) => {
                                    checked
                                      ? field.onChange([...(field.value || []), position])
                                      : field.onChange(
                                          field.value?.filter((p: any) => p !== position)
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal">{position}</FormLabel>
                            </FormItem>
                          )}
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
                        <Select onValueChange={field.onChange} value={field.value ?? ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Geschlecht auswählen" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="weiblich">weiblich</SelectItem>
                            <SelectItem value="männlich">männlich</SelectItem>
                            <SelectItem value="divers (Damenteam)">divers (Damenteam)</SelectItem>
                            <SelectItem value="divers (Herrenteam)">divers (Herrenteam)</SelectItem>
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
                      <Input readOnly value={userProfile?.email || ''} className="bg-muted/50" />
                    </FormControl>
                  </FormItem>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                    {profileForm.formState.isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Speichern
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          {/* PASSWORD */}
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
                            <FormLabel>Passwort bestätigen</FormLabel>
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
                        <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                          {passwordForm.formState.isSubmitting && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Passwort speichern
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* EMAIL CHANGE */}
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
                              <Input type="email" placeholder="neue.email@beispiel.de" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => setIsEmailOpen(false)}>
                          Abbrechen
                        </Button>
                        <Button type="submit" disabled={emailForm.formState.isSubmitting}>
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useFirestore, useUser, updateDocumentNonBlocking } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  updatePassword,
  updateEmail,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import type { UserProfile } from "@/lib/types";

// Schema for ProfileForm
const profileFormSchema = z.object({
  phoneNumber: z.string().optional(),
  location: z.string().optional(),
  position: z.enum(["Abwehr", "Zuspiel", "Angriff"]).optional(),
  birthday: z.string().optional(),
  gender: z
    .enum(["männlich", "weiblich", "divers (damenteam)", "divers (herrenteam)"])
    .optional(),
});

export function ProfileForm() {
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
  });

  useEffect(() => {
    async function fetchUserProfile() {
      if (user && firestore) {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const fullProfile = {
            id: user.uid,
            name: `${userData.firstName} ${userData.lastName}`,
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: user.email || '',
            ...userData,
          };
          setUserProfile(fullProfile);
          form.reset({
            phoneNumber: fullProfile.phone,
            ...fullProfile,
          });
        }
      }
    }
    fetchUserProfile();
  }, [user, firestore, form]);


  const onSubmit = async (values: z.infer<typeof profileFormSchema>) => {
    if (!user || !firestore) return;
    setIsLoading(true);
    try {
      const userDocRef = doc(firestore, "users", user.uid);
      const dataToUpdate = {
        phone: values.phoneNumber,
        location: values.location,
        position: values.position,
        birthday: values.birthday,
        gender: values.gender,
      }
      await updateDocumentNonBlocking(userDocRef, dataToUpdate);
      
      toast({
        title: "Profil aktualisiert",
        description: "Ihre Daten wurden erfolgreich gespeichert.",
      });
    } catch (error) {
       toast({
        variant: "destructive",
        title: "Fehler",
        description: "Profil konnte nicht aktualisiert werden.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isUserLoading || !userProfile) {
    return <Loader2 className="h-8 w-8 animate-spin text-primary" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormItem>
                <FormLabel>Vorname</FormLabel>
                <Input value={userProfile.firstName} disabled />
            </FormItem>
            <FormItem>
                <FormLabel>Nachname</FormLabel>
                <Input value={userProfile.lastName} disabled />
            </FormItem>
        </div>
        <FormField
          control={form.control}
          name="phoneNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefonnummer</FormLabel>
              <FormControl>
                <Input placeholder="Ihre Telefonnummer" {...field} />
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
                <Input placeholder="Ihr Wohnort" {...field} />
              </FormControl>
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
        <FormField
          control={form.control}
          name="position"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Position</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Wählen Sie Ihre Position" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Abwehr">Abwehr</SelectItem>
                  <SelectItem value="Zuspiel">Zuspiel</SelectItem>
                  <SelectItem value="Angriff">Angriff</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Geschlecht</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Wählen Sie Ihr Geschlecht" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="männlich">Männlich</SelectItem>
                  <SelectItem value="weiblich">Weiblich</SelectItem>
                  <SelectItem value="divers (damenteam)">Divers (Damenteam)</SelectItem>
                  <SelectItem value="divers (herrenteam)">Divers (Herrenteam)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormItem>
            <FormLabel>E-Mail</FormLabel>
            <Input value={userProfile.email} disabled />
            <FormDescription>Um Ihre E-Mail zu ändern, gehen Sie zum entsprechenden Menüpunkt.</FormDescription>
        </FormItem>
        <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
        </Button>
      </form>
    </Form>
  );
}

// Schema for PasswordForm
const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Aktuelles Passwort ist erforderlich."),
    newPassword: z.string().min(8, "Neues Passwort muss mindestens 8 Zeichen haben."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Die neuen Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  });

export function PasswordForm() {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof passwordFormSchema>>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: z.infer<typeof passwordFormSchema>) => {
    if (!user || !user.email) return;

    setIsLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, values.currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, values.newPassword);
      
      toast({ title: "Passwort geändert", description: "Bitte melden Sie sich mit Ihrem neuen Passwort an." });
      router.push("/login");

    } catch (error) {
       toast({ variant: "destructive", title: "Fehler", description: "Das aktuelle Passwort ist nicht korrekt oder es ist ein Fehler aufgetreten." });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
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
          control={form.control}
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
          control={form.control}
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
        <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Passwort ändern
        </Button>
      </form>
    </Form>
  );
}

// Schema for EmailForm
const emailFormSchema = z.object({
  newEmail: z.string().email("Ungültige E-Mail-Adresse."),
  password: z.string().min(1, "Passwort ist erforderlich."),
});

export function EmailForm() {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof emailFormSchema>>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { newEmail: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof emailFormSchema>) => {
    if (!user || !user.email) return;

    setIsLoading(true);
    try {
        const credential = EmailAuthProvider.credential(user.email, values.password);
        await reauthenticateWithCredential(user, credential);
        await updateEmail(user, values.newEmail);

        toast({ title: "E-Mail geändert", description: "Eine Bestätigungs-E-Mail wurde gesendet. Bitte melden Sie sich erneut an." });
        router.push("/login");

    } catch (error) {
        toast({ variant: "destructive", title: "Fehler", description: "Das Passwort ist nicht korrekt oder die E-Mail wird bereits verwendet." });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="newEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Neue E-Mail-Adresse</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Aktuelles Passwort</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormDescription>
                Zur Bestätigung Ihrer Identität.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            E-Mail ändern
        </Button>
      </form>
    </Form>
  );
}

export function DeleteAccountSection() {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useUser();

  const handleDelete = async () => {
    if (!user) return;
    try {
      await deleteUser(user);
      toast({
        title: "Konto gelöscht",
        description: "Ihr Konto wurde dauerhaft entfernt.",
      });
      router.push("/login");
    } catch (error) {
       toast({
        variant: "destructive",
        title: "Fehler beim Löschen des Kontos",
        description: "Bitte melden Sie sich erneut an und versuchen Sie es erneut.",
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-destructive">
        Diese Aktion kann nicht rückgängig gemacht werden. Alle Ihre Daten werden
        endgültig gelöscht.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Konto löschen</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sind Sie absolut sicher?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie Ihr Konto wirklich dauerhaft löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Ja, Konto löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

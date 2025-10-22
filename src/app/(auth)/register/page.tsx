"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  getAuth,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useFirestore, errorEmitter, FirestorePermissionError } from "@/firebase";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const formSchema = z
  .object({
    firstName: z.string().min(1, { message: "Vorname ist erforderlich." }),
    lastName: z.string().min(1, { message: "Nachname ist erforderlich." }),
    email: z.string().email({ message: "Ungültige E-Mail-Adresse." }),
    password: z
      .string()
      .min(8, { message: "Das Passwort muss mindestens 8 Zeichen lang sein." }),
    confirmPassword: z.string(),
    registrationCode: z
      .string()
      .min(1, { message: "Registrierungscode ist erforderlich." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Die Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.registrationCode === "Ellaisttoll", {
    message: "Ungültiger Registrierungscode.",
    path: ["registrationCode"],
  });

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const auth = getAuth();
  const firestore = useFirestore();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      registrationCode: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );
      const user = userCredential.user;

      const userDocData = {
        id: user.uid,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        registrationCode: values.registrationCode,
        emailVerified: user.emailVerified,
      };

      const userProfileData = {
        id: user.uid,
        userId: user.uid,
      };

      const userDocRef = doc(firestore, "users", user.uid);
      const profileDocRef = doc(firestore, "users", user.uid, "profile", user.uid);

      setDoc(userDocRef, userDocData).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: userDocRef.path,
          operation: 'create',
          requestResourceData: userDocData
        }));
      });

      setDoc(profileDocRef, userProfileData).catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: profileDocRef.path,
          operation: 'create',
          requestResourceData: userProfileData
        }));
      });

      toast({
        title: "Registrierung erfolgreich",
        description: "Ihr Konto wurde erstellt. Sie können sich jetzt anmelden.",
      });
      router.push("/login");
    } catch (error: any) {
      let description = "Ein unerwarteter Fehler ist aufgetreten.";
      if (error.code === "auth/email-already-in-use") {
        description = "Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.";
      }
      toast({
        variant: "destructive",
        title: "Registrierung fehlgeschlagen",
        description,
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline">Konto erstellen</CardTitle>
          <CardDescription>
            Füllen Sie das Formular aus, um dem Team beizutreten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="flex space-x-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem className="w-1/2">
                      <FormLabel>Vorname</FormLabel>
                      <FormControl>
                        <Input placeholder="Max" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem className="w-1/2">
                      <FormLabel>Nachname</FormLabel>
                      <FormControl>
                        <Input placeholder="Mustermann" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-Mail</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="deine.email@example.com"
                        {...field}
                        type="email"
                      />
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
                    <FormLabel>Passwort</FormLabel>
                    <FormControl>
                      <Input placeholder="••••••••" {...field} type="password" />
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
                    <FormLabel>Passwort bestätigen</FormLabel>
                    <FormControl>
                      <Input placeholder="••••••••" {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="registrationCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registrierungscode</FormLabel>
                    <FormControl>
                      <Input placeholder="Code" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Registrieren
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <div className="text-sm text-muted-foreground">
            Haben Sie bereits ein Konto?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Anmelden
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}


'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, writeBatch } from 'firebase/firestore';

const registerSchema = z.object({
  firstName: z.string().min(1, { message: 'Vorname ist erforderlich.' }),
  lastName: z.string().min(1, { message: 'Nachname ist erforderlich.' }),
  email: z.string().email({ message: 'Ungültige E-Mail-Adresse.' }),
  password: z.string().min(6, { message: 'Das Passwort muss mindestens 6 Zeichen lang sein.' }),
  registrationCode: z.string().refine(code => code === 'Ellaisttoll', {
    message: 'Ungültiger Registrierungscode.',
  }),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      registrationCode: '',
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    if (!auth || !firestore) {
      toast({
        variant: 'destructive',
        title: 'Authentifizierungs-Service nicht verfügbar',
        description: 'Bitte versuchen Sie es später erneut.',
      });
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;

      await sendEmailVerification(user);

      const batch = writeBatch(firestore);

      const userDocRef = doc(firestore, 'users', user.uid);
      const userData = {
        id: user.uid,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        role: 'user' as const,
        firstLoginComplete: false,
      };
      batch.set(userDocRef, userData);
      
      const memberDocRef = doc(firestore, 'members', user.uid);
      const memberData = {
          userId: user.uid,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
      };
      batch.set(memberDocRef, memberData);
      
      await batch.commit();


      toast({
        title: 'Registrierung fast abgeschlossen',
        description: 'Wir haben Ihnen eine Bestätigungs-E-Mail gesendet. Bitte überprüfen Sie Ihr Postfach.',
      });
      router.push('/auth/verify-email');

    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        toast({
          variant: 'destructive',
          title: 'Fehler bei der Registrierung',
          description: (
            <>
              Diese E-Mail-Adresse wird bereits verwendet. Bitte{' '}
              <Link href="/login" className="underline">
                melden Sie sich an
              </Link>
              .
            </>
          ),
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Fehler bei der Registrierung',
          description: error.message,
        });
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline">REGISTRIEREN</CardTitle>
          <CardDescription>
            Erstelle ein Konto, um loszulegen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="flex space-x-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>VORNAME</FormLabel>
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
                    <FormItem className="flex-1">
                      <FormLabel>NACHNAME</FormLabel>
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
                    <FormLabel>E-MAIL</FormLabel>
                    <FormControl>
                      <Input placeholder="max.mustermann@mail.de" {...field} />
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
                    <FormLabel>PASSWORT</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
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
                    <FormLabel>REGISTRIERUNGSCODE</FormLabel>
                    <FormControl>
                      <Input placeholder="Registrierungscode" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Registrieren...' : 'REGISTRIEREN'}
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
            Du hast bereits ein Konto?{' '}
            <Link href="/login" className="underline">
              Anmelden
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

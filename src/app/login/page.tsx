
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
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

const loginSchema = z.object({
  email: z.string().email({ message: 'Ungültige E-Mail-Adresse.' }),
  password: z.string().min(1, { message: 'Passwort ist erforderlich.' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuth();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    if (!auth) {
      toast({
        variant: 'destructive',
        title: 'Authentifizierungs-Service nicht verfügbar',
        description: 'Bitte versuchen Sie es später erneut.',
      });
      return;
    }
    try {
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      
      if (!userCredential.user.emailVerified) {
        toast({
          variant: 'destructive',
          title: 'E-Mail nicht verifiziert',
          description: 'Bitte bestätigen Sie Ihre E-Mail-Adresse, bevor Sie sich anmelden. Überprüfen Sie Ihr Postfach.',
        });
        // Optionally sign out the user if you don't want them to be in a semi-logged-in state
        await auth.signOut();
        return;
      }
      
      toast({
        title: 'Anmeldung erfolgreich',
        description: 'Willkommen zurück!',
      });
      router.push('/dashboard');

    } catch (error: any) {
      let description = 'Ein unbekannter Fehler ist aufgetreten.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        description = 'Die eingegebenen Anmeldedaten sind ungültig. Bitte überprüfen Sie Ihre E-Mail und Ihr Passwort.';
      } else {
        description = error.message;
      }
      toast({
        variant: 'destructive',
        title: 'Fehler bei der Anmeldung',
        description: description,
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline">ANMELDEN</CardTitle>
          <CardDescription>
            Melde dich bei deinem Konto an, um fortzufahren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Anmelden...' : 'ANMELDEN'}
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
            Noch kein Konto?{' '}
            <Link href="/register" className="underline">
              Registrieren
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

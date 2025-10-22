
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { MailCheck } from 'lucide-react';

export default function VerifyEmailPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="mt-4 text-2xl font-headline">Bestätigen Sie Ihre E-Mail</CardTitle>
          <CardDescription>
            Wir haben Ihnen einen Bestätigungslink an Ihre E-Mail-Adresse gesendet. Bitte klicken Sie auf den Link, um Ihr Konto zu aktivieren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-sm text-muted-foreground">
            Nachdem Sie Ihre E-Mail-Adresse bestätigt haben, können Sie sich anmelden.
          </p>
          <Button onClick={() => router.push('/login')} className="w-full">
            Zurück zum Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/components/ui/use-toast";

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

const formSchema = z.object({
  email: z.string().email({ message: "Ungültige E-Mail-Adresse." }),
  password: z.string().min(1, { message: "Passwort ist erforderlich." }),
});

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      const users = JSON.parse(localStorage.getItem("faustapp_users") || "[]");
      const user = users.find(
        (u: any) => u.email === values.email && u.password === values.password
      );

      if (user) {
        localStorage.setItem("faustapp_user", JSON.stringify(user));
        toast({
          title: "Anmeldung erfolgreich",
          description: "Willkommen zurück!",
        });
        if (user.isFirstLogin) {
          const updatedUser = { ...user, isFirstLogin: false };
          const updatedUsers = users.map((u: any) => u.id === user.id ? updatedUser : u);
          localStorage.setItem("faustapp_users", JSON.stringify(updatedUsers));
          localStorage.setItem("faustapp_user", JSON.stringify(updatedUser));
          router.push("/profile");
        } else {
          router.push("/dashboard");
        }
      } else {
        toast({
          variant: "destructive",
          title: "Anmeldung fehlgeschlagen",
          description: "Ungültige E-Mail-Adresse oder falsches Passwort.",
        });
        setIsLoading(false);
      }
    }, 1000);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline">Willkommen zurück</CardTitle>
          <CardDescription>
            Melden Sie sich an, um auf Ihr Konto zuzugreifen.
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
                    <FormLabel>E-Mail</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="deine.email@example.com"
                        {...field}
                        type="email"
                        autoComplete="email"
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
                      <Input
                        placeholder="••••••••"
                        {...field}
                        type="password"
                        autoComplete="current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Anmelden
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
          <div className="text-sm">
            <Link
              href="#"
              className="font-medium text-primary hover:underline"
            >
              Passwort vergessen?
            </Link>
          </div>
          <div className="text-sm text-muted-foreground">
            Noch kein Konto?{" "}
            <Link
              href="/register"
              className="font-medium text-primary hover:underline"
            >
              Registrieren
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

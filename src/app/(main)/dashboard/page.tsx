"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, MessageSquare, Shield } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlaceHolderImages } from "@/lib/placeholder-images";

export default function DashboardPage() {
  const heroImage = PlaceHolderImages.find((img) => img.id === "dashboard-hero");

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="space-y-8">
        <Card className="overflow-hidden">
          <CardHeader className="p-0">
            <div className="relative h-48 w-full sm:h-64">
              {heroImage && (
                <Image
                  src={heroImage.imageUrl}
                  alt={heroImage.description}
                  layout="fill"
                  objectFit="cover"
                  className="bg-muted"
                  data-ai-hint={heroImage.imageHint}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6">
                <h1 className="font-headline text-3xl font-bold text-white md:text-4xl">
                  Willkommen!
                </h1>
                <p className="mt-2 text-lg text-gray-200">
                  Dein zentraler Hub für alles rund um Faustball.
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-6 w-6 text-primary" />
                <span>Kalender</span>
              </CardTitle>
              <CardDescription>
                Überprüfe anstehende Spiele, Trainingseinheiten und Events.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="rounded-lg bg-muted p-4 text-center">
                 <p className="font-semibold">Nächstes Spiel: Sonntag, 14:00</p>
                 <p className="text-sm text-muted-foreground">gegen TV Eibach 03</p>
              </div>
            </CardContent>
            <CardContent>
              <Link href="/kalender">
                <Button className="w-full">
                  Zum Kalender <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                <span>Team-Chat</span>
              </CardTitle>
              <CardDescription>
                Kommuniziere mit deinen Teamkollegen in Echtzeit.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="rounded-lg bg-muted p-4">
                 <p className="text-sm"><span className="font-semibold">Trainer:</span> Denkt an die Trikots für Sonntag!</p>
                 <p className="mt-2 text-sm text-right"><span className="font-semibold">Du:</span> Verstanden!</p>
              </div>
            </CardContent>
            <CardContent>
              <Link href="/chat">
                <Button className="w-full">
                  Chat öffnen <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <span>Verwaltung</span>
              </CardTitle>
              <CardDescription>
                Verwalte Mitglieder, Umfragen, Finanzen und mehr.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="rounded-lg bg-muted p-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex justify-between"><span>Mitglieder:</span> <span className="font-semibold">23 Aktiv</span></li>
                  <li className="flex justify-between"><span>Aktive Umfragen:</span> <span className="font-semibold">2</span></li>
                  <li className="flex justify-between"><span>Mannschaftskasse:</span> <span className="font-semibold">458,50 €</span></li>
                </ul>
              </div>
            </CardContent>
            <CardContent>
              <Link href="/verwaltung/mitglieder">
                <Button className="w-full">
                  Zur Verwaltung <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}

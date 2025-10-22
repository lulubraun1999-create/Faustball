"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { User, Mail, Phone, Cake, MapPin, Shield } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function ProfilePage() {
  // Mock user for display purposes
  const user: UserProfile = {
    id: "1",
    name: "Max Mustermann",
    firstName: "Max",
    lastName: "Mustermann",
    email: "max.mustermann@example.com",
    role: "user",
    phone: "0123 4567890",
    birthday: "15. August 1995",
    location: "Leverkusen",
    position: "Angriff",
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="flex flex-col items-center text-center space-y-4 p-6 bg-muted/30 sm:flex-row sm:text-left sm:space-y-0 sm:space-x-6">
          <Avatar className="h-32 w-32 border-4 border-background text-4xl">
            <AvatarFallback>
              {user.firstName?.charAt(0)}
              {user.lastName?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <CardTitle className="text-3xl font-headline">{user.name}</CardTitle>
            <CardDescription className="text-lg text-muted-foreground">
              {user.position}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Persönliche Informationen</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-center">
                  <Mail className="w-5 h-5 mr-3 text-primary" />
                  <span>{user.email}</span>
                </li>
                <li className="flex items-center">
                  <Phone className="w-5 h-5 mr-3 text-primary" />
                  <span>{user.phone}</span>
                </li>
                <li className="flex items-center">
                  <Cake className="w-5 h-5 mr-3 text-primary" />
                  <span>{user.birthday}</span>
                </li>
                <li className="flex items-center">
                  <MapPin className="w-5 h-5 mr-3 text-primary" />
                  <span>{user.location}</span>
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Team Informationen</h3>
              <ul className="space-y-3 text-muted-foreground">
                <li className="flex items-center">
                  <Shield className="w-5 h-5 mr-3 text-primary" />
                  <span>Rolle: {user.role === 'admin' ? 'Administrator' : 'Benutzer'}</span>
                </li>
                {/* Add more team info here */}
              </ul>
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <Link href="/profile/edit">
              <Button>Profil bearbeiten</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Instagram, Shield } from "lucide-react";
import { UserNav } from "./user-nav";
import { ThemeToggle } from "./theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";
import { useUser } from "@/firebase";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import type { UserProfile } from "@/lib/types";

export function MainHeader() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function fetchUserProfile() {
      if (user && firestore) {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const profileDocRef = doc(firestore, `users/${user.uid}/profile/${user.uid}`);
          const profileDocSnap = await getDoc(profileDocRef);
          
          let profileData = {};
          if (profileDocSnap.exists()) {
            profileData = profileDocSnap.data();
          }

          setUserProfile({
            id: user.uid,
            name: `${userData.firstName} ${userData.lastName}`,
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: user.email || '',
            avatar: user.photoURL || undefined,
            role: 'user', // Replace with actual role from DB if available
            ...profileData
          });
        }
      }
    }
    fetchUserProfile();
  }, [user, firestore]);

  const adminPages = [
    { href: "/verwaltung/termine-bearbeiten", label: "Termine bearbeiten" },
    { href: "/verwaltung/gruppen-bearbeiten", label: "Gruppe bearbeiten" },
    { href: "/verwaltung/mitglieder-bearbeiten", label: "Mitglieder bearbeiten" },
    { href: "/verwaltung/umfragen-bearbeiten", label: "Umfrage bearbeiten" },
    { href: "/verwaltung/news-bearbeiten", label: "News bearbeiten" },
    { href: "/verwaltung/mannschaftskasse-bearbeiten", label: "Mannschaftskasse bearbeiten" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <div className="mr-4 hidden md:flex">
          <Link href="/dashboard" className="mr-6 flex items-center space-x-2">
            <span className="font-bold sm:inline-block font-headline">
              TSV Bayer Leverkusen
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link
              href="/kalender"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Kalender
            </Link>
            <Link
              href="/chat"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Chat
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="px-2 lg:px-3 text-foreground/60 hover:text-foreground/80">
                  Verwaltung
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem asChild>
                  <Link href="/verwaltung/termine">Termine</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/verwaltung/gruppen">Gruppen</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/verwaltung/mitglieder">Mitglieder</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/verwaltung/umfragen">Umfragen</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/verwaltung/news">News</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/verwaltung/mannschaftskasse">Mannschaftskasse</Link>
                </DropdownMenuItem>
                {userProfile?.role === "admin" && (
                  <>
                    <DropdownMenuSeparator />
                    {adminPages.map((page) => (
                      <DropdownMenuItem key={page.href} asChild>
                        <Link href={page.href}>{page.label}</Link>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2">
          <a
            href="https://www.instagram.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="icon">
              <Instagram className="h-5 w-5" />
              <span className="sr-only">Instagram</span>
            </Button>
          </a>
          <ThemeToggle />
          {userProfile && <UserNav user={userProfile} />}
        </div>
      </div>
    </header>
  );
}

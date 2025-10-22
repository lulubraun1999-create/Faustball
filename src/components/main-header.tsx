"use client";

import Link from "next/link";
import { Instagram, User as UserIcon } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import type { UserProfile } from "@/lib/types";

export function MainHeader() {
  const profileAvatar = PlaceHolderImages.find(
    (img) => img.id === "profile-avatar-1"
  );
  
  // Mock user for display purposes
  const user: UserProfile = {
    id: "1",
    name: "Max Mustermann",
    firstName: "Max",
    lastName: "Mustermann",
    email: "max.mustermann@example.com",
    role: "user",
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center px-4">
        <div className="flex flex-1 items-center justify-start">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <span className="font-bold sm:inline-block font-headline">
              TSV Bayer Leverkusen
            </span>
          </Link>
        </div>

        <nav className="hidden md:flex flex-1 items-center justify-center space-x-6 text-sm font-medium">
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
              <Button
                variant="ghost"
                className="px-2 lg:px-3 text-foreground/60 hover:text-foreground/80"
              >
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
                <Link href="/verwaltung/mannschaftskasse">
                  Mannschaftskasse
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
        
        <div className="flex flex-1 items-center justify-end space-x-2">
          <a
            href="https://www.instagram.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="icon">
              <Instagram className="h-5 w-5 text-foreground/60 hover:text-foreground/80 dark:text-foreground/80 dark:hover:text-foreground" />
              <span className="sr-only">Instagram</span>
            </Button>
          </a>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-8 w-8 rounded-full"
              >
                <Avatar className="h-8 w-8">
                  {profileAvatar && (
                    <AvatarImage
                      src={profileAvatar.imageUrl}
                      alt={user.name}
                    />
                  )}
                  <AvatarFallback>
                    {user.firstName?.charAt(0)}
                    {user.lastName?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {user.name}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Profileinstellungen</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

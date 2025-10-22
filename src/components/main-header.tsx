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
import { useEffect, useState } from "react";
import type { User } from "@/lib/types";

export function MainHeader() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("faustapp_user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

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
                {user?.role === "admin" && (
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
          {user && <UserNav user={user} />}
        </div>
      </div>
    </header>
  );
}

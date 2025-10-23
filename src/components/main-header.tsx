
"use client";

import Link from "next/link";
import { Instagram, LogOut, User as UserIcon } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth, useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import dynamic from 'next/dynamic';
import type { UserProfile } from "@/lib/types";
import { doc } from "firebase/firestore";

const VerwaltungDropdown = dynamic(() => import('./verwaltung-dropdown').then(mod => mod.VerwaltungDropdown), { ssr: false });


export function MainHeader() {
  const { user: authUser } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const firestore = useFirestore();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !authUser) return null;
    return doc(firestore, 'users', authUser.uid);
  }, [firestore, authUser]);

  const { data: userProfile } = useDoc<UserProfile>(userDocRef);


  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
    }
    router.push("/login");
  };

  const name = userProfile?.firstName && userProfile?.lastName ? `${userProfile.firstName} ${userProfile.lastName}` : authUser?.email;
  const initials = userProfile?.firstName?.charAt(0) + (userProfile?.lastName?.charAt(0) || '');


  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        
        <div className="flex items-center">
          <Link href="/dashboard" className="flex items-center space-x-2">
            <span className="font-bold sm:inline-block font-headline">
              TSV Bayer Leverkusen
            </span>
          </Link>
        </div>

        <nav className="flex items-center justify-center">
          <div className="flex items-center space-x-6 text-sm font-medium">
            <Link
              href="/dashboard"
              className="transition-colors hover:text-foreground/80 text-foreground"
            >
              Aktuelles
            </Link>
            <Link
              href="/chat"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Chat
            </Link>
            <VerwaltungDropdown />
          </div>
        </nav>
        
        <div className="flex items-center justify-end space-x-2">
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
          {authUser && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {initials || authUser.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {name}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {authUser.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile/edit">
                    <UserIcon className="mr-2 h-4 w-4" />
                    <span>Profileinstellungen</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Abmelden</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        
      </div>
    </header>
  );
}

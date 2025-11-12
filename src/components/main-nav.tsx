
'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { VerwaltungDropdown } from "./verwaltung-dropdown";

export function MainNav() {
  const pathname = usePathname();
  
  return (
    <nav className="flex items-center space-x-6 text-sm font-medium">
      <Link
        href="/dashboard"
        className={cn("transition-colors hover:text-foreground/80", 
          pathname.startsWith('/dashboard') ? "text-foreground" : "text-foreground/60"
        )}
      >
        Dashboard
      </Link>
      <Link
        href="/kalender"
        className={cn("transition-colors hover:text-foreground/80", 
          pathname.startsWith('/kalender') ? "text-foreground" : "text-foreground/60"
        )}
      >
        Kalender
      </Link>
      <VerwaltungDropdown />
    </nav>
  );
}

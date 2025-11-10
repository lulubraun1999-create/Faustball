
"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";
import { useUser } from "@/firebase";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function VerwaltungDropdown() {
  const { isAdmin, isUserLoading } = useUser();
  const [isClient, setIsClient] = useState(false);
  const pathname = usePathname();

  // This ensures the component only renders on the client after hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  const isVerwaltungActive = pathname.startsWith('/verwaltung') && !pathname.startsWith('/verwaltung/termine');

  // Do not render anything on the server or during the initial client render
  // to avoid hydration mismatch. The useEffect above will trigger a re-render
  // on the client, at which point the menu will appear.
  if (!isClient) {
    return null;
  }
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn("px-2 lg:px-3 hover:text-foreground/80", 
             isVerwaltungActive ? "text-foreground" : "text-foreground/60"
          )}
        >
          Verwaltung
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link href="/verwaltung/gruppen">Mannschaften</Link>
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
        
        {isUserLoading ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Lade Admin-Status...</span>
            </DropdownMenuItem>
          </>
        ) : isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span>Admin</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem asChild>
                  <Link href="/verwaltung/gruppen-bearbeiten">Mannschaften bearbeiten</Link>
                </DropdownMenuItem>
                 <DropdownMenuItem asChild>
                  <Link href="/verwaltung/mitglieder-bearbeiten">Mitglieder bearbeiten</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/verwaltung/umfragen-bearbeiten">Umfragen bearbeiten</Link>
                </DropdownMenuItem>
                 <DropdownMenuItem asChild>
                  <Link href="/verwaltung/news-bearbeiten">News bearbeiten</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/verwaltung/mannschaftskasse-bearbeiten">Mannschaftskasse bearbeiten</Link>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

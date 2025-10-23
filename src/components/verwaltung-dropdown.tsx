
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

export function VerwaltungDropdown() {
  const { isAdmin, isUserLoading } = useUser();

  return (
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
         <DropdownMenuItem asChild>
          <Link href="/verwaltung/abwesenheiten">Abwesenheiten</Link>
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
                  <Link href="/verwaltung/termine-bearbeiten">Termine bearbeiten</Link>
                </DropdownMenuItem>
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

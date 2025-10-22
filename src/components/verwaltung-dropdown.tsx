"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "./ui/button";

export function VerwaltungDropdown() {
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
  );
}
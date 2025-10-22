"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { view: "data", label: "Daten ändern" },
  { view: "password", label: "Passwort ändern" },
  { view: "email", label: "E-Mail ändern" },
  { view: "delete", label: "Konto löschen" },
];

export function ProfileSidebarNav() {
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") || "data";

  return (
    <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1">
      {navItems.map((item) => (
        <Link key={item.view} href={`/profile?view=${item.view}`} legacyBehavior>
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start",
              currentView === item.view
                ? "bg-muted hover:bg-muted"
                : "hover:bg-transparent hover:underline"
            )}
          >
            {item.label}
          </Button>
        </Link>
      ))}
    </nav>
  );
}

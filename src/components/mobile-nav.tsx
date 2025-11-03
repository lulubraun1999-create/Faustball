
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, Volleyball } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VerwaltungDropdown } from './verwaltung-dropdown';

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className="px-0 text-base hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="pr-0">
        <Link
            href="/dashboard"
            className="flex items-center"
            onClick={() => setOpen(false)}
        >
          <Volleyball className="h-5 w-5 mr-2" />
          <span className="font-bold">TSV Bayer Leverkusen</span>
        </Link>
        <div className="my-4 h-[calc(100vh-8rem)] pb-10 pl-6">
            <div className="flex flex-col space-y-3">
                 <Link
                    href="/kalender"
                    className="text-muted-foreground"
                    onClick={() => setOpen(false)}
                >
                    Kalender
                </Link>
                 <Link
                    href="/verwaltung/termine"
                    className="text-muted-foreground"
                    onClick={() => setOpen(false)}
                >
                    Termine
                </Link>
                {/* We can't use the dropdown directly here, so we recreate the links */}
                 <div className="flex flex-col space-y-3 pt-6">
                    <h4 className="font-medium">Verwaltung</h4>
                     <Link href="/verwaltung/gruppen" className="text-muted-foreground/70" onClick={() => setOpen(false)}>Mannschaften</Link>
                     <Link href="/verwaltung/mitglieder" className="text-muted-foreground/70" onClick={() => setOpen(false)}>Mitglieder</Link>
                     <Link href="/verwaltung/umfragen" className="text-muted-foreground/70" onClick={() => setOpen(false)}>Umfragen</Link>
                     <Link href="/verwaltung/news" className="text-muted-foreground/70" onClick={() => setOpen(false)}>News</Link>
                     <Link href="/verwaltung/mannschaftskasse" className="text-muted-foreground/70" onClick={() => setOpen(false)}>Mannschaftskasse</Link>
                </div>
            </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

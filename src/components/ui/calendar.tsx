"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarProps = {
  /** Ausgewähltes Datum (optional) */
  selected?: Date;
  /** Callback, wenn ein Datum gewählt wird */
  onSelect?: (date: Date | undefined) => void;
  /** Optional: Überschrift über dem Kalender */
  title?: string;
  /** Optional: zusätzliche CSS-Klassen */
  className?: string;
  /** Alles andere einfach durchreichen (damit TypeScript nicht meckert) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

/**
 * Sehr einfacher Kalender-Stub, der nur ein Datum wählt.
 * Er ersetzt den ursprünglichen react-day-picker-basierten Kalender,
 * damit der Build ohne das Paket `react-day-picker` durchläuft.
 */
export function Calendar(props: CalendarProps) {
  const { selected, onSelect, title, className, ...rest } = props;

  const [internalDate, setInternalDate] = React.useState<Date | undefined>(
    selected
  );

  React.useEffect(() => {
    setInternalDate(selected);
  }, [selected]);

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    if (!value) {
      setInternalDate(undefined);
      onSelect?.(undefined);
      return;
    }
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      setInternalDate(d);
      onSelect?.(d);
    }
  };

  // Für das native <input type="date" /> im Format YYYY-MM-DD
  const toInputValue = (date?: Date) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border p-3",
        className
      )}
      {...rest}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {title ?? "Datum auswählen"}
        </span>
        <div className="flex gap-1">
          {/* Platzhalter-Buttons nur optisch – ohne Logik */}
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
            aria-label="Vorheriger Tag"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
            aria-label="Nächster Tag"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <input
        type="date"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        value={toInputValue(internalDate)}
        onChange={handleChange}
      />
    </div>
  );
}

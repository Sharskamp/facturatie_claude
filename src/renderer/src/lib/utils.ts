import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBedrag(bedrag: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(bedrag);
}

export function formatDatum(datum: Date | string): string {
  return format(new Date(datum), "dd-MM-yyyy", { locale: nl });
}

export function formatDatumLang(datum: Date | string): string {
  return format(new Date(datum), "d MMMM yyyy", { locale: nl });
}

export function formatDatumRelief(datum: Date | string): string {
  return formatDistanceToNow(new Date(datum), { addSuffix: true, locale: nl });
}

export function berekenBtw(bedrag: number, percentage: number): number {
  return (bedrag * percentage) / 100;
}

export function berekenRegel(
  prijs: number,
  aantal: number,
  btwPercentage: number,
  kortingPercentage: number = 0
): { netto: number; btw: number; totaal: number } {
  const brutoBedrag = prijs * aantal;
  const kortingBedrag = (brutoBedrag * kortingPercentage) / 100;
  const netto = brutoBedrag - kortingBedrag;
  const btw = berekenBtw(netto, btwPercentage);
  return { netto, btw, totaal: netto + btw };
}

export function statusKleur(status: string): string {
  const kleuren: Record<string, string> = {
    CONCEPT: "bg-gray-100 text-gray-700",
    VERZONDEN: "bg-blue-100 text-blue-700",
    BETAALD: "bg-green-100 text-green-700",
    VERLOPEN: "bg-red-100 text-red-700",
    GEANNULEERD: "bg-gray-100 text-gray-500",
    CREDITNOTA: "bg-orange-100 text-orange-700",
    GEACCEPTEERD: "bg-green-100 text-green-700",
    AFGEWEZEN: "bg-red-100 text-red-700",
  };
  return kleuren[status] ?? "bg-gray-100 text-gray-700";
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    CONCEPT: "Concept",
    VERZONDEN: "Verzonden",
    BETAALD: "Betaald",
    VERLOPEN: "Verlopen",
    GEANNULEERD: "Geannuleerd",
    CREDITNOTA: "Creditnota",
    GEACCEPTEERD: "Geaccepteerd",
    AFGEWEZEN: "Afgewezen",
  };
  return labels[status] ?? status;
}

export function genereerFactuurNummer(prefix: string, volgNummer: number, jaar?: number): string {
  const huidigJaar = jaar ?? new Date().getFullYear();
  return `${prefix}${huidigJaar}-${String(volgNummer).padStart(4, "0")}`;
}

export function berekenVervaldatum(dagen: number = 30): Date {
  const datum = new Date();
  datum.setDate(datum.getDate() + dagen);
  return datum;
}

import { formatBedrag, formatDatum } from "@/lib/utils";
import { genereerSepaQrDataUrl } from "@/lib/factuur-qr";

export interface FactuurHtmlInstellingen {
  factuurHtmlTemplate?: string | null;
  layoutToonQrCode?: boolean;
  naam?: string;
  bedrijfsnaam?: string;
  adres?: string;
  postcode?: string;
  stad?: string;
  email?: string;
  telefoon?: string;
  website?: string;
  kvkNummer?: string;
  btwNummer?: string;
  iban?: string;
  logoBase64?: string;
  korActief?: boolean;
}

export interface FactuurHtmlRegel {
  omschrijving: string;
  aantal: number;
  eenheid?: string | null;
  prijs: number;
  totaal: number;
  kortingPercentage?: number;
}

export interface FactuurHtmlKlant {
  naam: string;
  bedrijf?: string | null;
  adres?: string | null;
  postcode?: string | null;
  stad?: string | null;
  btwNummer?: string | null;
}

export interface FactuurHtmlFactuur {
  nummer: string;
  datum: string | Date;
  vervaldatum: string | Date;
  subtotaal: number;
  kortingBedrag: number;
  btwBedrag: number;
  totaal: number;
  totaalKortingBedrag?: number;
  notities?: string | null;
  betalingsCondities?: string | null;
  regels: FactuurHtmlRegel[];
  klant: FactuurHtmlKlant;
}

export async function bouwFactuurHtml({
  factuur,
  instellingen,
}: {
  factuur: FactuurHtmlFactuur;
  instellingen: FactuurHtmlInstellingen;
}) {
  const template = instellingen.factuurHtmlTemplate?.trim();
  if (!template) return "";

  const grossSubtotaal = factuur.regels.reduce((acc, r) => acc + r.prijs * r.aantal, 0);
  const regelKortingTotaal = factuur.regels.reduce((acc, r) => acc + r.prijs * r.aantal * (r.kortingPercentage ?? 0) / 100, 0);
  const effectieveKorting = regelKortingTotaal + factuur.kortingBedrag + (factuur.totaalKortingBedrag ?? 0);
  const effectiefPct = grossSubtotaal > 0.005 ? Math.round(effectieveKorting / grossSubtotaal * 1000) / 10 : 0;
  const pctStr = effectiefPct > 0
    ? ` (${Number.isInteger(effectiefPct) ? effectiefPct : effectiefPct.toFixed(1).replace(".", ",")}%)`
    : "";
  const kortingLabel = `Korting${pctStr}`;

  const toonRegelKorting = factuur.regels.some((regel) => (regel.kortingPercentage ?? 0) > 0);
  const regelsHtml = toonRegelKorting
    ? `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:10px 12px;border-bottom:1px solid #ddd">Omschrijving</th><th style="text-align:center;padding:10px 12px;border-bottom:1px solid #ddd">Aantal</th><th style="text-align:right;padding:10px 12px;border-bottom:1px solid #ddd">Prijs</th><th style="text-align:right;padding:10px 12px;border-bottom:1px solid #ddd">Korting</th><th style="text-align:right;padding:10px 12px;border-bottom:1px solid #ddd">Totaal</th></tr></thead><tbody>${factuur.regels.map((regel) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #eee">${regel.omschrijving}${regel.eenheid ? ` / ${regel.eenheid}` : ""}</td><td style="text-align:center;padding:10px 12px;border-bottom:1px solid #eee">${regel.aantal}</td><td style="text-align:right;padding:10px 12px;border-bottom:1px solid #eee">${formatBedrag(regel.prijs)}</td><td style="text-align:right;padding:10px 12px;border-bottom:1px solid #eee">${(regel.kortingPercentage ?? 0) > 0 ? `${regel.kortingPercentage}%` : "-"}</td><td style="text-align:right;padding:10px 12px;border-bottom:1px solid #eee">${formatBedrag(regel.totaal)}</td></tr>`).join("")}</tbody></table>`
    : `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:10px 12px;border-bottom:1px solid #ddd">Omschrijving</th><th style="text-align:center;padding:10px 12px;border-bottom:1px solid #ddd">Aantal</th><th style="text-align:right;padding:10px 12px;border-bottom:1px solid #ddd">Prijs</th><th style="text-align:right;padding:10px 12px;border-bottom:1px solid #ddd">Totaal</th></tr></thead><tbody>${factuur.regels.map((regel) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #eee">${regel.omschrijving}${regel.eenheid ? ` / ${regel.eenheid}` : ""}</td><td style="text-align:center;padding:10px 12px;border-bottom:1px solid #eee">${regel.aantal}</td><td style="text-align:right;padding:10px 12px;border-bottom:1px solid #eee">${formatBedrag(regel.prijs)}</td><td style="text-align:right;padding:10px 12px;border-bottom:1px solid #eee">${formatBedrag(regel.totaal)}</td></tr>`).join("")}</tbody></table>`;

  const qrNodig = template.includes("{{betaalQrCode}}") || template.includes("{{betaalQrCodeClass}}");
  const betaalQrCode = instellingen.layoutToonQrCode !== false && qrNodig
    ? await genereerSepaQrDataUrl({
        iban: instellingen.iban,
        ontvanger: instellingen.bedrijfsnaam ?? instellingen.naam ?? "",
        bedrag: factuur.totaal,
        kenmerk: factuur.nummer,
        omschrijving: `Factuur ${factuur.nummer}`,
      })
    : "";

  const vars: Record<string, string> = {
    bedrijfsnaam: instellingen.bedrijfsnaam ?? instellingen.naam ?? "",
    bedrijfAdres: instellingen.adres ?? "",
    bedrijfPostcode: instellingen.postcode ?? "",
    bedrijfStad: instellingen.stad ?? "",
    bedrijfEmail: instellingen.email ?? "",
    bedrijfTelefoon: instellingen.telefoon ?? "",
    bedrijfWebsite: instellingen.website ?? "",
    kvkNummer: instellingen.kvkNummer ?? "",
    btwNummer: instellingen.btwNummer ?? "",
    iban: instellingen.iban ?? "",
    logo: instellingen.logoBase64 ? `<img src="${instellingen.logoBase64}" style="max-height:80px" />` : "",
    factuurNummer: factuur.nummer,
    factuurDatum: formatDatum(factuur.datum),
    vervaldatum: formatDatum(factuur.vervaldatum),
    notities: factuur.notities ?? "",
    betalingsCondities: factuur.betalingsCondities ?? "",
    klantNaam: factuur.klant.naam,
    klantBedrijf: factuur.klant.bedrijf ?? "",
    klantAdres: factuur.klant.adres ?? "",
    klantPostcode: factuur.klant.postcode ?? "",
    klantStad: factuur.klant.stad ?? "",
    klantBtwNummer: factuur.klant.btwNummer ?? "",
    subtotaal: formatBedrag(grossSubtotaal),
    kortingBedrag: formatBedrag(effectieveKorting),
    btwBedrag: formatBedrag(factuur.btwBedrag),
    totaalBedrag: formatBedrag(factuur.totaal),
    kortingLabel,
    kortingClass: effectieveKorting > 0.005 ? "" : "hidden",
    btwClass: factuur.btwBedrag > 0 ? "" : "hidden",
    betaalQrCodeClass: betaalQrCode ? "" : "hidden",
    korClass: instellingen.korActief ? "" : "hidden",
    betaalQrCode: betaalQrCode ? `<img src="${betaalQrCode}" alt="SEPA betaal QR-code voor factuur ${factuur.nummer}" style="width:128px;height:128px;display:block" />` : "",
    regelsHtml,
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, CheckCircle, AlertCircle, Loader2,
  Upload, FileText, Download, Info,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatBedrag } from "@/lib/utils";

interface Klant {
  id: string;
  naam: string;
  bedrijf?: string | null;
  email?: string | null;
  adres?: string | null;
  postcode?: string | null;
  stad?: string | null;
}

interface Regel {
  id: string;
  omschrijving: string;
  aantal: number;
  prijs: number;
  btwPercentage: number;
  kortingPercentage: number;
  totaal: number;
}

interface CsvRij {
  _id: string;
  nummer: string;
  klantNaam: string;
  klantId: string;
  datum: string;
  vervaldatum: string;
  subtotaal: string;
  btwBedrag: string;
  totaal: string;
  status: string;
  notities: string;
  fout?: string;
  // PDF scan velden
  bronBestand?: string;
  bronNaam?: string;
  scanStatus?: "wacht" | "bezig" | "klaar" | "fout";
  scanFout?: string;
  klantEmail?: string;
  klantAdres?: string;
  isNieuweKlant?: boolean;
  nieuweKlantAanmaken?: boolean;
  geextraheerdRegels?: Array<{ omschrijving: string; bedrag: number; aantal: number; totaal: number }>;
  scanWaarschuwingen?: string[];
  duplicateMelding?: string;
}

interface GekozenBestand {
  pad: string;
  naam: string;
}

interface ScanPdfResultaat {
  succes: boolean;
  fout?: string;
  pad?: string;
  naam?: string;
  nummer?: string | null;
  klantNaam?: string | null;
  klantEmail?: string | null;
  klantAdres?: string | null;
  datum?: string | null;
  vervaldatum?: string | null;
  subtotaal?: number | null;
  btwBedrag?: number | null;
  totaal?: number | null;
  status?: string | null;
  notities?: string | null;
  omschrijving?: string | null;
  regels?: Array<{ omschrijving: string; bedrag: number; aantal: number; totaal: number }>;
  warnings?: string[];
  duplicate?: { id: string; label: string; type: string } | null;
  importStatus?: "pending" | "processing" | "parsed" | "needs_review" | "failed" | "imported";
}

function vandaagString() {
  return new Date().toISOString().split("T")[0];
}

function berekenRegelTotaal(r: Regel): number {
  const bruto = r.prijs * r.aantal;
  const korting = (bruto * r.kortingPercentage) / 100;
  const netto = bruto - korting;
  const btw = (netto * r.btwPercentage) / 100;
  return netto + btw;
}

function nieuwRegel(): Regel {
  return {
    id: crypto.randomUUID(), omschrijving: "", aantal: 1,
    prijs: 0, btwPercentage: 21, kortingPercentage: 0, totaal: 0,
  };
}

function parseerCsv(tekst: string): { headers: string[]; rijen: string[][] } {
  const regels = tekst.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(r => r.trim());
  const scheidingsteken = regels[0].includes(";") ? ";" : ",";
  const splitRij = (r: string) => r.split(scheidingsteken).map(v => v.trim().replace(/^"|"$/g, ""));
  const headers = splitRij(regels[0]).map(h => h.toLowerCase().replace(/\s+/g, ""));
  const rijen = regels.slice(1).map(splitRij);
  return { headers, rijen };
}

function kolomWaarde(rij: string[], headers: string[], ...namen: string[]): string {
  for (const naam of namen) {
    const idx = headers.indexOf(naam);
    if (idx >= 0 && rij[idx]) return rij[idx].trim();
  }
  return "";
}

function parseBedragInput(waarde: string): number {
  return parseFloat((waarde || "0").replace(",", ".")) || 0;
}

function bedragVoorInput(waarde: number | null | undefined): string {
  return Number.isFinite(waarde ?? NaN) ? String(Number(waarde).toFixed(2)) : "0.00";
}

function splitsKlantAdres(adres?: string | null): { adres?: string; postcode?: string; stad?: string } {
  const regels = (adres ?? "").split(/\r?\n|,/).map(r => r.trim()).filter(Boolean);
  if (regels.length === 0) return {};

  const postcodeIndex = regels.findIndex(r => /\b\d{4}\s?[A-Z]{2}\b/i.test(r));
  if (postcodeIndex >= 0) {
    const match = regels[postcodeIndex].match(/\b(\d{4}\s?[A-Z]{2})\b\s*(.*)$/i);
    return {
      adres: regels.filter((_, i) => i !== postcodeIndex).join(", ") || undefined,
      postcode: match?.[1]?.toUpperCase(),
      stad: match?.[2]?.trim() || undefined,
    };
  }

  return { adres: regels.join(", ") };
}

const VOORBEELD_CSV = `nummer;klant;datum;vervaldatum;totaal;btw_bedrag;subtotaal;status;notities
F2023-001;Acme BV;2023-01-15;2023-02-14;1210.00;210.00;1000.00;BETAALD;
F2023-002;Klant Naam;2023-02-01;2023-03-03;605.00;105.00;500.00;BETAALD;
F2023-003;Ander Bedrijf;2023-03-10;2023-04-09;363.00;63.00;300.00;VERZONDEN;`;


export default function FactuurImportHistorischPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modus, setModus] = useState<"handmatig" | "bulk" | "pdf">("handmatig");

  // ── Klanten (gedeeld) ─────────────────────────────────────
  const [klanten, setKlanten] = useState<Klant[]>([]);
  useEffect(() => {
    window.api.klanten.list().then((data: unknown) => {
      setKlanten(Array.isArray(data) ? (data as Klant[]) : []);
    }).catch(() => {});
  }, []);

  // ── Handmatig modus ───────────────────────────────────────
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [nummer, setNummer] = useState("");
  const [klantId, setKlantId] = useState("");
  const [datum, setDatum] = useState(vandaagString());
  const [vervaldatum, setVervaldatum] = useState(vandaagString());
  const [status, setStatus] = useState("BETAALD");
  const [verzondenOp, setVerzondenOp] = useState("");
  const [betaaldOp, setBetaaldOp] = useState(vandaagString());
  const [notities, setNotities] = useState("");
  const [betalingsCondities, setBetalingsCondities] = useState("");
  const [btwVerlegd, setBtwVerlegd] = useState(false);
  const [handmatigBedrag, setHandmatigBedrag] = useState(false);
  const [regels, setRegels] = useState<Regel[]>([nieuwRegel()]);
  const [handSubtotaal, setHandSubtotaal] = useState("");
  const [handBtwBedrag, setHandBtwBedrag] = useState("");
  const [handTotaal, setHandTotaal] = useState("");
  const updateRegel = (id: string, veld: keyof Regel, waarde: string | number) => {
    setRegels(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [veld]: waarde };
      updated.totaal = berekenRegelTotaal(updated);
      return updated;
    }));
  };

  const berekendeSubtotaal = regels.reduce((s, r) => {
    const bruto = r.prijs * r.aantal;
    return s + (bruto - (bruto * r.kortingPercentage) / 100);
  }, 0);
  const berekendeBtw = btwVerlegd ? 0 : regels.reduce((s, r) => {
    const bruto = r.prijs * r.aantal;
    const netto = bruto - (bruto * r.kortingPercentage) / 100;
    return s + (netto * r.btwPercentage) / 100;
  }, 0);
  const berekendeTotal = berekendeSubtotaal + berekendeBtw;

  const importeer = async () => {
    if (!nummer.trim()) { setFout("Factuurnummer is verplicht"); return; }
    if (!klantId) { setFout("Selecteer een klant"); return; }
    if (!datum || !vervaldatum) { setFout("Datums zijn verplicht"); return; }
    setLaden(true); setFout(null);
    try {
      const submitSubtotaal = handmatigBedrag ? parseFloat(handSubtotaal) || berekendeSubtotaal : berekendeSubtotaal;
      const submitBtw = handmatigBedrag ? parseFloat(handBtwBedrag) || berekendeBtw : berekendeBtw;
      const submitTotaal = handmatigBedrag ? parseFloat(handTotaal) || berekendeTotal : berekendeTotal;
      const result = await (window.api.facturen as unknown as { importeerHistorisch: (d: unknown) => Promise<{ id: string; nummer: string }> }).importeerHistorisch({
        nummer: nummer.trim(), klantId, datum, vervaldatum, status,
        subtotaal: submitSubtotaal, btwBedrag: submitBtw, totaal: submitTotaal,
        notities: notities || undefined, betalingsCondities: betalingsCondities || undefined,
        btwVerlegd, verzondenOp: verzondenOp || undefined,
        betaaldOp: status === "BETAALD" ? (betaaldOp || datum) : undefined,
        handmatigBedrag,
        regels: regels.map(r => ({
          omschrijving: r.omschrijving || "(geen omschrijving)", aantal: r.aantal,
          prijs: r.prijs, btwPercentage: r.btwPercentage, kortingPercentage: r.kortingPercentage, totaal: r.totaal,
        })),
      });
      setSucces(`Factuur ${result.nummer} succesvol geïmporteerd!`);
      setTimeout(() => navigate(`/facturen/${result.id}`), 2000);
    } catch (e: unknown) {
      setFout(e instanceof Error ? e.message : "Import mislukt");
    } finally { setLaden(false); }
  };

  // ── Bulk CSV modus ────────────────────────────────────────
  const [csvRijen, setCsvRijen] = useState<CsvRij[]>([]);
  const [csvFout, setCsvFout] = useState<string | null>(null);
  const [bulkLaden, setBulkLaden] = useState(false);
  const [bulkResultaat, setBulkResultaat] = useState<{ succes: number; fouten: string[] } | null>(null);
  const [bulkStatusKiezer, setBulkStatusKiezer] = useState("BETAALD");
  const [pdfRijen, setPdfRijen] = useState<CsvRij[]>([]);
  const [pdfFout, setPdfFout] = useState<string | null>(null);
  const [pdfLaden, setPdfLaden] = useState(false);
  const [pdfImportLaden, setPdfImportLaden] = useState(false);
  const [pdfResultaat, setPdfResultaat] = useState<{ succes: number; fouten: string[] } | null>(null);

  function verwerkCsvBestand(bestand: File) {
    setCsvFout(null); setBulkResultaat(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const tekst = e.target?.result as string;
        const { headers, rijen } = parseerCsv(tekst);
        const verwerkt: CsvRij[] = rijen
          .filter(r => r.some(v => v))
          .map(rij => {
            const nrWaarde = kolomWaarde(rij, headers, "nummer", "factuurnummer", "invoice_number");
            const klantNaam = kolomWaarde(rij, headers, "klant", "klantnaam", "client", "naam");
            const datumWaarde = kolomWaarde(rij, headers, "datum", "factuurdatum", "date", "invoice_date");
            const vervalWaarde = kolomWaarde(rij, headers, "vervaldatum", "verval", "due_date", "duedate");
            const totaalWaarde = kolomWaarde(rij, headers, "totaal", "total", "totaalbedrag", "amount");
            const btwWaarde = kolomWaarde(rij, headers, "btw_bedrag", "btw", "tax", "btwbedrag", "vat");
            const subWaarde = kolomWaarde(rij, headers, "subtotaal", "subtotal", "netto");
            const statusWaarde = kolomWaarde(rij, headers, "status").toUpperCase() || "BETAALD";
            const notitiesWaarde = kolomWaarde(rij, headers, "notities", "notes", "opmerkingen");

            const gevondenKlant = klanten.find(k =>
              k.naam.toLowerCase() === klantNaam.toLowerCase() ||
              (k.bedrijf ?? "").toLowerCase() === klantNaam.toLowerCase()
            );

            const totaalNum = parseFloat(totaalWaarde.replace(",", ".")) || 0;
            const btwNum = parseFloat(btwWaarde.replace(",", ".")) || 0;
            const subNum = parseFloat(subWaarde.replace(",", ".")) || (totaalNum - btwNum);

            return {
              _id: crypto.randomUUID(),
              nummer: nrWaarde,
              klantNaam,
              klantId: gevondenKlant?.id ?? "",
              datum: datumWaarde,
              vervaldatum: vervalWaarde,
              subtotaal: subNum.toFixed(2),
              btwBedrag: btwNum.toFixed(2),
              totaal: totaalNum.toFixed(2),
              status: ["BETAALD","VERZONDEN","VERLOPEN","CONCEPT","GEANNULEERD"].includes(statusWaarde) ? statusWaarde : "BETAALD",
              notities: notitiesWaarde,
              fout: !nrWaarde ? "Nummer ontbreekt" : !datumWaarde ? "Datum ontbreekt" : undefined,
            };
          });
        if (verwerkt.length === 0) { setCsvFout("Geen rijen gevonden in het CSV-bestand."); return; }
        setCsvRijen(verwerkt);
      } catch { setCsvFout("Kon het CSV-bestand niet lezen. Controleer het formaat."); }
    };
    reader.readAsText(bestand, "UTF-8");
  }

  function updateCsvRij(id: string, veld: keyof CsvRij, waarde: string) {
    setCsvRijen(prev => prev.map(r => r._id === id ? { ...r, [veld]: waarde, fout: undefined } : r));
  }

  function updatePdfRij(id: string, veld: keyof CsvRij, waarde: string | boolean) {
    setPdfRijen(prev => prev.map(r => r._id === id ? { ...r, [veld]: waarde as never, fout: undefined } : r));
  }

  function matchKlant(naam?: string | null, email?: string | null): Klant | undefined {
    const naamNorm = (naam ?? "").trim().toLowerCase();
    const emailNorm = (email ?? "").trim().toLowerCase();
    return klanten.find(k => {
      const klantNaam = k.naam.toLowerCase();
      const bedrijf = (k.bedrijf ?? "").toLowerCase();
      const klantEmail = (k.email ?? "").toLowerCase();
      return Boolean(
        (emailNorm && klantEmail === emailNorm) ||
        (naamNorm && (klantNaam === naamNorm || bedrijf === naamNorm))
      );
    });
  }

  function rijUitScan(bestand: GekozenBestand, scan: ScanPdfResultaat): CsvRij {
    const totaal = scan.totaal ?? 0;
    const btw = scan.btwBedrag ?? 0;
    const subtotaal = scan.subtotaal ?? (totaal - btw);
    const klant = matchKlant(scan.klantNaam, scan.klantEmail);
    const nummerUitNaam = bestand.naam.replace(/\.[^.]+$/, "");

    return {
      _id: crypto.randomUUID(),
      nummer: scan.nummer ?? nummerUitNaam,
      klantNaam: scan.klantNaam ?? "",
      klantId: klant?.id ?? "",
      datum: scan.datum ?? vandaagString(),
      vervaldatum: scan.vervaldatum ?? scan.datum ?? vandaagString(),
      subtotaal: bedragVoorInput(subtotaal),
      btwBedrag: bedragVoorInput(btw),
      totaal: bedragVoorInput(totaal),
      status: scan.status ?? "BETAALD",
      notities: scan.notities ?? scan.omschrijving ?? "",
      bronBestand: bestand.pad,
      bronNaam: bestand.naam,
      scanStatus: "klaar",
      klantEmail: scan.klantEmail ?? "",
      klantAdres: scan.klantAdres ?? "",
      isNieuweKlant: !klant,
      nieuweKlantAanmaken: !klant,
      geextraheerdRegels: scan.regels ?? [],
      scanWaarschuwingen: scan.warnings ?? [],
      duplicateMelding: scan.duplicate?.label,
      fout: scan.duplicate?.label ?? (!scan.nummer ? "Factuurnummer controleren" : !scan.datum ? "Factuurdatum controleren" : scan.importStatus === "needs_review" ? (scan.warnings?.[0] ?? "Controleer de herkende gegevens") : undefined),
    };
  }

  async function scanPdfBestanden() {
    if (pdfLaden) return;
    setPdfFout(null);
    setPdfResultaat(null);
    const api = window.api.facturen as unknown as {
      kiesBestanden: () => Promise<GekozenBestand[]>;
      scanPdfLokaal: (pad: string) => Promise<ScanPdfResultaat>;
    };

    const bestanden = await api.kiesBestanden();
    if (!bestanden.length) return;

    const startRijen: CsvRij[] = bestanden.map(bestand => ({
      _id: crypto.randomUUID(),
      nummer: bestand.naam.replace(/\.[^.]+$/, ""),
      klantNaam: "",
      klantId: "",
      datum: vandaagString(),
      vervaldatum: vandaagString(),
      subtotaal: "0.00",
      btwBedrag: "0.00",
      totaal: "0.00",
      status: "BETAALD",
      notities: "",
      bronBestand: bestand.pad,
      bronNaam: bestand.naam,
      scanStatus: "wacht",
      nieuweKlantAanmaken: false,
    }));

    setPdfRijen(prev => [...prev, ...startRijen]);
    setPdfLaden(true);

    for (let i = 0; i < bestanden.length; i++) {
      const bestand = bestanden[i];
      const rijId = startRijen[i]._id;
      setPdfRijen(prev => prev.map(r => r._id === rijId ? { ...r, scanStatus: "bezig", scanFout: undefined } : r));

      try {
        const scan = await api.scanPdfLokaal(bestand.pad);
        if (!scan.succes) {
          setPdfRijen(prev => prev.map(r => r._id === rijId ? {
            ...r,
            scanStatus: "fout",
            scanFout: scan.fout ?? "Scan mislukt",
          } : r));
          continue;
        }

        const gescand = rijUitScan(bestand, scan);
        setPdfRijen(prev => prev.map(r => r._id === rijId ? { ...gescand, _id: rijId } : r));
      } catch (e: unknown) {
        setPdfRijen(prev => prev.map(r => r._id === rijId ? {
          ...r,
          scanStatus: "fout",
          scanFout: e instanceof Error ? e.message : "Scan mislukt",
        } : r));
      }
    }

    setPdfLaden(false);
  }

  async function importeerAlles() {
    const ongeldig = csvRijen.filter(r => !r.nummer || !r.klantId || !r.datum || !r.vervaldatum);
    if (ongeldig.length > 0) {
      setCsvFout(`${ongeldig.length} rijen zijn nog niet volledig ingevuld (nummer, klant en datums zijn verplicht).`);
      return;
    }
    setBulkLaden(true); setCsvFout(null);
    const importFn = (window.api.facturen as unknown as { importeerHistorisch: (d: unknown) => Promise<{ id: string; nummer: string }> }).importeerHistorisch;
    let succesCount = 0;
    const fouten: string[] = [];

    for (const rij of csvRijen) {
      try {
        const totaal = parseFloat(rij.totaal) || 0;
        const btw = parseFloat(rij.btwBedrag) || 0;
        const sub = parseFloat(rij.subtotaal) || (totaal - btw);
        await importFn({
          nummer: rij.nummer, klantId: rij.klantId,
          datum: rij.datum, vervaldatum: rij.vervaldatum, status: rij.status,
          subtotaal: sub, btwBedrag: btw, totaal, handmatigBedrag: true,
          notities: rij.notities || undefined,
          betaaldOp: rij.status === "BETAALD" ? rij.datum : undefined,
          regels: [{ omschrijving: `Factuur ${rij.nummer}`, aantal: 1, prijs: sub, btwPercentage: sub > 0 ? (btw / sub) * 100 : 0, kortingPercentage: 0, totaal }],
        });
        succesCount++;
      } catch (e: unknown) {
        fouten.push(`${rij.nummer}: ${e instanceof Error ? e.message : "mislukt"}`);
      }
    }

    setBulkLaden(false);
    setBulkResultaat({ succes: succesCount, fouten });
    if (fouten.length === 0) setCsvRijen([]);
  }

  async function zorgVoorPdfKlant(rij: CsvRij): Promise<string> {
    if (rij.klantId) return rij.klantId;
    if (!rij.nieuweKlantAanmaken) {
      throw new Error("Kies een klant of vink 'nieuwe klant aanmaken' aan.");
    }

    const naam = rij.klantNaam.trim();
    if (!naam) throw new Error("Klantnaam ontbreekt.");

    const adresVelden = splitsKlantAdres(rij.klantAdres);
    const nieuweKlant = await window.api.klanten.create({
      naam,
      email: rij.klantEmail?.trim() || undefined,
      ...adresVelden,
      land: "Nederland",
      taal: "nl",
    }) as Klant;

    setKlanten(prev => [...prev, nieuweKlant].sort((a, b) => a.naam.localeCompare(b.naam)));
    setPdfRijen(prev => prev.map(r => r._id === rij._id ? {
      ...r,
      klantId: nieuweKlant.id,
      isNieuweKlant: false,
      nieuweKlantAanmaken: false,
    } : r));

    return nieuweKlant.id;
  }

  async function importeerPdfRijen() {
    const rijen = pdfRijen.filter(r => r.scanStatus !== "fout");
    if (rijen.length === 0) {
      setPdfFout("Er zijn geen gescande PDF-facturen klaar om te importeren.");
      return;
    }

    setPdfImportLaden(true);
    setPdfFout(null);
    setPdfResultaat(null);

    const importFn = (window.api.facturen as unknown as { importeerHistorisch: (d: unknown) => Promise<{ id: string; nummer: string }> }).importeerHistorisch;
    const fouten: string[] = [];
    const foutenPerRij = new Map<string, string>();
    const geimporteerd = new Set<string>();
    let succesCount = 0;

    for (const rij of rijen) {
      try {
        if (!rij.nummer || !rij.datum || !rij.vervaldatum) {
          throw new Error("Factuurnummer, factuurdatum en vervaldatum zijn verplicht.");
        }

        const klantIdVoorImport = await zorgVoorPdfKlant(rij);
        const totaal = parseBedragInput(rij.totaal);
        const btw = parseBedragInput(rij.btwBedrag);
        const subtotaal = parseBedragInput(rij.subtotaal) || (totaal - btw);
        const btwPercentage = subtotaal > 0 && btw > 0 ? (btw / subtotaal) * 100 : 0;
        const regels = rij.geextraheerdRegels?.length
          ? rij.geextraheerdRegels.map(regel => {
              const aantal = regel.aantal || 1;
              const regelTotaal = regel.totaal || regel.bedrag || 0;
              return {
                omschrijving: regel.omschrijving || `Factuur ${rij.nummer}`,
                aantal,
                prijs: aantal > 0 ? (regel.bedrag || regelTotaal) / aantal : regelTotaal,
                btwPercentage: 0,
                kortingPercentage: 0,
                totaal: regelTotaal,
              };
            })
          : [{
              omschrijving: rij.notities || `Factuur ${rij.nummer}`,
              aantal: 1,
              prijs: subtotaal,
              btwPercentage,
              kortingPercentage: 0,
              totaal,
            }];

        await importFn({
          nummer: rij.nummer,
          klantId: klantIdVoorImport,
          datum: rij.datum,
          vervaldatum: rij.vervaldatum,
          status: rij.status,
          subtotaal,
          btwBedrag: btw,
          totaal,
          handmatigBedrag: true,
          notities: rij.notities || undefined,
          bronBestandPad: rij.bronBestand,
          verzondenOp: rij.status !== "CONCEPT" ? rij.datum : undefined,
          betaaldOp: rij.status === "BETAALD" ? rij.datum : undefined,
          regels,
        });

        succesCount++;
        geimporteerd.add(rij._id);
      } catch (e: unknown) {
        const melding = e instanceof Error ? e.message : "Import mislukt";
        fouten.push(`${rij.nummer || rij.bronNaam || "PDF"}: ${melding}`);
        foutenPerRij.set(rij._id, melding);
      }
    }

    setPdfRijen(prev => prev
      .filter(r => !geimporteerd.has(r._id))
      .map(r => foutenPerRij.has(r._id) ? { ...r, fout: foutenPerRij.get(r._id) } : r));
    setPdfResultaat({ succes: succesCount, fouten });
    setPdfImportLaden(false);
  }

  const MODI = [
    { id: "handmatig" as const, label: "Eén factuur" },
    { id: "bulk" as const, label: "Bulk via CSV" },
    { id: "pdf" as const, label: "PDF-facturen" },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Historische facturen importeren"
        subtitel="Voeg eerder verstuurde facturen toe aan je administratie"
        acties={
          <Button variant="outline" onClick={() => navigate("/facturen")}>
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Button>
        }
      />

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">

        {/* Modus kiezer */}
        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
          {MODI.map(m => (
            <button
              key={m.id}
              onClick={() => setModus(m.id)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                modus === m.id
                  ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* ── HANDMATIG ── */}
        {modus === "handmatig" && (
          <>
            {fout && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />{fout}
              </div>
            )}
            {succes && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 shrink-0" />{succes}
              </div>
            )}
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">Let op: historisch importeren</p>
              <p>Deze factuur wordt gemarkeerd als historisch. Gebruik dit voor facturen die al eerder zijn verstuurd en eventueel betaald.</p>
            </div>

            <Card>
              <CardHeader><CardTitle>Factuurgegevens</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Factuurnummer *" value={nummer} onChange={e => setNummer(e.target.value)} placeholder="F2023-0001" />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Klant *</label>
                    <select value={klantId} onChange={e => setKlantId(e.target.value)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Selecteer klant...</option>
                      {klanten.map(k => <option key={k.id} value={k.id}>{k.bedrijf ?? k.naam}</option>)}
                    </select>
                  </div>
                  <Input label="Factuurdatum *" type="date" value={datum} onChange={e => setDatum(e.target.value)} />
                  <Input label="Vervaldatum *" type="date" value={vervaldatum} onChange={e => setVervaldatum(e.target.value)} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                    <select value={status} onChange={e => setStatus(e.target.value)} className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="BETAALD">Betaald</option>
                      <option value="VERZONDEN">Verzonden (onbetaald)</option>
                      <option value="VERLOPEN">Verlopen</option>
                      <option value="CONCEPT">Concept</option>
                    </select>
                  </div>
                  <Input label="Verzenddatum" type="date" value={verzondenOp} onChange={e => setVerzondenOp(e.target.value)} />
                  {status === "BETAALD" && <Input label="Betaald op" type="date" value={betaaldOp} onChange={e => setBetaaldOp(e.target.value)} />}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={btwVerlegd} onChange={e => setBtwVerlegd(e.target.checked)} className="h-4 w-4 text-indigo-600 rounded" />
                  <span className="text-sm text-gray-700">BTW verlegd</span>
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notities</label>
                  <textarea rows={2} value={notities} onChange={e => setNotities(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div><CardTitle>Factuurregels</CardTitle><CardDescription>Vul de regels in of gebruik één samenvattingsregel</CardDescription></div>
                  <Button size="sm" variant="outline" onClick={() => setRegels(prev => [...prev, nieuwRegel()])}>
                    <Plus className="h-4 w-4" />Regel toevoegen
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {regels.map((regel, idx) => (
                    <div key={regel.id} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Omschrijving</label>}
                        <input type="text" value={regel.omschrijving} onChange={e => updateRegel(regel.id, "omschrijving", e.target.value)} placeholder="Omschrijving" className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="col-span-1">
                        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Aantal</label>}
                        <input type="number" min="0.01" step="0.01" value={regel.aantal} onChange={e => updateRegel(regel.id, "aantal", parseFloat(e.target.value) || 1)} className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Prijs (€)</label>}
                        <input type="number" min="0" step="0.01" value={regel.prijs} onChange={e => updateRegel(regel.id, "prijs", parseFloat(e.target.value) || 0)} className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">BTW %</label>}
                        <select value={regel.btwPercentage} onChange={e => updateRegel(regel.id, "btwPercentage", parseFloat(e.target.value))} disabled={btwVerlegd} className="w-full h-9 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100">
                          <option value={0}>0%</option><option value={9}>9%</option><option value={21}>21%</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Totaal</label>}
                        <div className="h-9 flex items-center px-3 text-sm font-medium text-gray-900 bg-gray-50 rounded-lg border border-gray-200">{formatBedrag(berekenRegelTotaal(regel))}</div>
                      </div>
                      <div className="col-span-1">
                        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">&nbsp;</label>}
                        <button onClick={() => setRegels(prev => prev.filter(r => r.id !== regel.id))} disabled={regels.length === 1} className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 disabled:opacity-30">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Totalen</CardTitle>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox" checked={handmatigBedrag} onChange={e => {
                      setHandmatigBedrag(e.target.checked);
                      if (e.target.checked) { setHandSubtotaal(berekendeSubtotaal.toFixed(2)); setHandBtwBedrag(berekendeBtw.toFixed(2)); setHandTotaal(berekendeTotal.toFixed(2)); }
                    }} className="h-4 w-4 text-indigo-600 rounded" />
                    Handmatige bedragen overschrijven
                  </label>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-w-xs ml-auto space-y-2">
                  {handmatigBedrag ? (
                    <>
                      <div className="flex items-center gap-3 justify-between"><span className="text-sm text-gray-500">Subtotaal</span><input type="number" step="0.01" value={handSubtotaal} onChange={e => setHandSubtotaal(e.target.value)} className="w-32 h-9 rounded-lg border border-gray-300 px-3 text-sm text-right" /></div>
                      <div className="flex items-center gap-3 justify-between"><span className="text-sm text-gray-500">BTW bedrag</span><input type="number" step="0.01" value={handBtwBedrag} onChange={e => setHandBtwBedrag(e.target.value)} className="w-32 h-9 rounded-lg border border-gray-300 px-3 text-sm text-right" /></div>
                      <div className="flex items-center gap-3 justify-between border-t-2 border-gray-900 pt-2"><span className="font-bold text-gray-900">Totaal</span><input type="number" step="0.01" value={handTotaal} onChange={e => setHandTotaal(e.target.value)} className="w-32 h-9 rounded-lg border border-gray-300 px-3 text-sm text-right font-bold" /></div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotaal</span><span>{formatBedrag(berekendeSubtotaal)}</span></div>
                      {!btwVerlegd && <div className="flex justify-between text-sm"><span className="text-gray-500">BTW</span><span>{formatBedrag(berekendeBtw)}</span></div>}
                      <div className="flex justify-between pt-2 border-t-2 border-gray-900"><span className="font-bold">Totaal</span><span className="font-bold">{formatBedrag(berekendeTotal)}</span></div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => navigate("/facturen")}>Annuleren</Button>
              <Button onClick={importeer} loading={laden}>
                <CheckCircle className="h-4 w-4" />Factuur importeren
              </Button>
            </div>
          </>
        )}

        {/* ── BULK CSV ── */}
        {modus === "bulk" && (
          <div className="space-y-6">
            {csvFout && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />{csvFout}
              </div>
            )}

            {bulkResultaat && (
              <div className={`rounded-lg border px-4 py-4 text-sm space-y-2 ${bulkResultaat.fouten.length === 0 ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                <p className="font-semibold flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  {bulkResultaat.succes} factuur{bulkResultaat.succes !== 1 ? "en" : ""} succesvol geïmporteerd
                </p>
                {bulkResultaat.fouten.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    {bulkResultaat.fouten.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
                {bulkResultaat.fouten.length === 0 && (
                  <Button size="sm" variant="outline" onClick={() => navigate("/facturen")}>Ga naar facturen</Button>
                )}
              </div>
            )}

            {csvRijen.length === 0 && !bulkResultaat && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />CSV-bestand uploaden</CardTitle>
                    <CardDescription>Upload een CSV met je historische facturen. Kolommen worden automatisch herkend.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) verwerkCsvBestand(f); }}
                      className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors"
                    >
                      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-700">Klik of sleep een CSV-bestand hier</p>
                      <p className="text-xs text-gray-500 mt-1">UTF-8 encoded, komma of puntkomma als scheidingsteken</p>
                      <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) verwerkCsvBestand(f); }} />
                    </div>

                    <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5"><Info className="h-3.5 w-3.5" />Verwachte kolomnamen (hoofdlettergevoeloos)</p>
                        <button
                          onClick={() => {
                            const blob = new Blob([VOORBEELD_CSV], { type: "text/csv;charset=utf-8;" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a"); a.href = url; a.download = "voorbeeld-import.csv"; a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          <Download className="h-3.5 w-3.5" />Voorbeeldbestand
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 font-mono">
                        {[
                          ["nummer", "Factuurnummer (verplicht)"],
                          ["klant", "Klantnaam of bedrijf (verplicht)"],
                          ["datum", "Factuurdatum YYYY-MM-DD (verplicht)"],
                          ["vervaldatum", "Vervaldatum YYYY-MM-DD (verplicht)"],
                          ["totaal", "Totaalbedrag incl. BTW"],
                          ["btw_bedrag", "BTW-bedrag"],
                          ["subtotaal", "Bedrag excl. BTW"],
                          ["status", "BETAALD / VERZONDEN / VERLOPEN"],
                          ["notities", "Optionele notities"],
                        ].map(([col, uitleg]) => (
                          <div key={col} className="flex gap-2">
                            <span className="text-indigo-700 shrink-0">{col}</span>
                            <span className="text-gray-400 font-sans">{uitleg}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {csvRijen.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{csvRijen.length} facturen gevonden</h3>
                    <p className="text-sm text-gray-500">Controleer de gegevens en koppel de klant aan elke factuur.</p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
                      <span className="text-xs text-gray-500 whitespace-nowrap">Alles op:</span>
                      <select
                        value={bulkStatusKiezer}
                        onChange={e => setBulkStatusKiezer(e.target.value)}
                        className="h-7 rounded border-0 bg-transparent text-sm focus:outline-none focus:ring-0"
                      >
                        <option value="BETAALD">Betaald</option>
                        <option value="VERZONDEN">Verzonden</option>
                        <option value="VERLOPEN">Verlopen</option>
                        <option value="CONCEPT">Concept</option>
                      </select>
                      <Button size="sm" variant="outline" onClick={() => setCsvRijen(prev => prev.map(r => ({ ...r, status: bulkStatusKiezer })))}>
                        Toepassen
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setCsvRijen([]); setBulkResultaat(null); }}>
                      Ander bestand
                    </Button>
                    <Button onClick={importeerAlles} loading={bulkLaden}>
                      <CheckCircle className="h-4 w-4" />
                      Importeer {csvRijen.length} facturen
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {csvRijen.map((rij) => {
                    const heeftFout = !rij.nummer || !rij.klantId || !rij.datum || !rij.vervaldatum;
                    return (
                      <div key={rij._id} className={`rounded-xl border p-4 space-y-3 ${heeftFout ? "border-amber-300 bg-amber-50/40" : "border-gray-200 bg-white"}`}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Factuurnummer *</label>
                            <input value={rij.nummer} onChange={e => updateCsvRij(rij._id, "nummer", e.target.value)} className={`w-full h-8 rounded-lg border px-3 text-sm ${!rij.nummer ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500`} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Klant * {rij.klantNaam && <span className="text-gray-400">— {rij.klantNaam}</span>}
                            </label>
                            <select value={rij.klantId} onChange={e => updateCsvRij(rij._id, "klantId", e.target.value)} className={`w-full h-8 rounded-lg border px-2 text-sm ${!rij.klantId ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500`}>
                              <option value="">— kies klant —</option>
                              {klanten.map(k => <option key={k.id} value={k.id}>{k.bedrijf ?? k.naam}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Factuurdatum *</label>
                            <input type="date" value={rij.datum} onChange={e => updateCsvRij(rij._id, "datum", e.target.value)} className={`w-full h-8 rounded-lg border px-3 text-sm ${!rij.datum ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500`} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Vervaldatum *</label>
                            <input type="date" value={rij.vervaldatum} onChange={e => updateCsvRij(rij._id, "vervaldatum", e.target.value)} className={`w-full h-8 rounded-lg border px-3 text-sm ${!rij.vervaldatum ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500`} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Totaal (incl. BTW)</label>
                            <div className="relative"><span className="absolute left-2.5 top-1.5 text-xs text-gray-400">€</span><input type="number" step="0.01" value={rij.totaal} onChange={e => updateCsvRij(rij._id, "totaal", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 pl-6 pr-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" /></div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">BTW-bedrag</label>
                            <div className="relative"><span className="absolute left-2.5 top-1.5 text-xs text-gray-400">€</span><input type="number" step="0.01" value={rij.btwBedrag} onChange={e => updateCsvRij(rij._id, "btwBedrag", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 pl-6 pr-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" /></div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Status</label>
                            <select value={rij.status} onChange={e => updateCsvRij(rij._id, "status", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                              <option value="BETAALD">Betaald</option>
                              <option value="VERZONDEN">Verzonden</option>
                              <option value="VERLOPEN">Verlopen</option>
                              <option value="CONCEPT">Concept</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">Notities</label>
                            <input value={rij.notities} onChange={e => updateCsvRij(rij._id, "notities", e.target.value)} placeholder="Optioneel" className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={importeerAlles} loading={bulkLaden} size="lg">
                    <CheckCircle className="h-4 w-4" />
                    Importeer {csvRijen.length} facturen
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PDF FACTUREN */}
        {modus === "pdf" && (
          <div className="space-y-6">
            {pdfFout && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />{pdfFout}
              </div>
            )}

            {pdfResultaat && (
              <div className={`rounded-lg border px-4 py-4 text-sm space-y-2 ${pdfResultaat.fouten.length === 0 ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                <p className="font-semibold flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  {pdfResultaat.succes} factuur{pdfResultaat.succes !== 1 ? "en" : ""} succesvol geimporteerd
                </p>
                {pdfResultaat.fouten.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    {pdfResultaat.fouten.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
                {pdfResultaat.fouten.length === 0 && pdfRijen.length === 0 && (
                  <Button size="sm" variant="outline" onClick={() => navigate("/facturen")}>Ga naar facturen</Button>
                )}
              </div>
            )}

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />PDF-facturen inlezen</CardTitle>
                    <CardDescription>Selecteer een of meerdere PDF-facturen. Tekstlagen worden direct gelezen; gescande PDF's gaan via lokale OCR.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pdfRijen.length > 0 && (
                      <Button variant="outline" onClick={() => { setPdfRijen([]); setPdfResultaat(null); }} disabled={pdfLaden || pdfImportLaden}>
                        Lijst leegmaken
                      </Button>
                    )}
                    <Button variant="outline" onClick={scanPdfBestanden} loading={pdfLaden} disabled={pdfLaden || pdfImportLaden}>
                      <Upload className="h-4 w-4" />
                      PDF kiezen
                    </Button>
                    {pdfRijen.length > 0 && (
                      <Button onClick={importeerPdfRijen} loading={pdfImportLaden} disabled={pdfLaden || pdfImportLaden}>
                        <CheckCircle className="h-4 w-4" />
                        Importeer {pdfRijen.filter(r => r.scanStatus !== "fout").length} facturen
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {pdfRijen.length === 0 && (
                <CardContent>
                  <div
                    onClick={scanPdfBestanden}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors"
                  >
                    <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700">Klik om PDF-facturen te selecteren</p>
                    <p className="text-xs text-gray-500 mt-1">Je kunt meerdere bestanden tegelijk kiezen. De gegevens blijven corrigeerbaar voor import.</p>
                  </div>
                </CardContent>
              )}
            </Card>

            {pdfRijen.length > 0 && (
              <div className="space-y-3">
                {pdfRijen.map(rij => {
                  const isBezig = rij.scanStatus === "wacht" || rij.scanStatus === "bezig";
                  const mistKlant = !rij.klantId && !rij.nieuweKlantAanmaken;
                  const heeftFout = rij.scanStatus === "fout" || !rij.nummer || !rij.datum || !rij.vervaldatum || mistKlant || Boolean(rij.fout);
                  const statusTekst = rij.scanStatus === "bezig" ? "Bezig" : rij.scanStatus === "wacht" ? "Wacht" : rij.scanStatus === "fout" ? "Fout" : "Klaar";
                  const statusClass = rij.scanStatus === "fout"
                    ? "bg-red-50 text-red-700 border-red-200"
                    : rij.scanStatus === "klaar"
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-gray-50 text-gray-600 border-gray-200";

                  return (
                    <div key={rij._id} className={`rounded-xl border p-4 space-y-4 ${heeftFout ? "border-amber-300 bg-amber-50/40" : "border-gray-200 bg-white"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">{rij.bronNaam ?? rij.nummer}</p>
                          <p className="text-xs text-gray-500 break-all">{rij.bronBestand}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass}`}>
                            {rij.scanStatus === "bezig" && <Loader2 className="h-3 w-3 animate-spin" />}
                            {statusTekst}
                          </span>
                          <button
                            onClick={() => setPdfRijen(prev => prev.filter(r => r._id !== rij._id))}
                            className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {(rij.scanFout || rij.fout) && (
                        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                          {rij.scanFout || rij.fout}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Factuurnummer *</label>
                          <input value={rij.nummer} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "nummer", e.target.value)} className={`w-full h-8 rounded-lg border px-3 text-sm ${!rij.nummer ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100`} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Factuurdatum *</label>
                          <input type="date" value={rij.datum} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "datum", e.target.value)} className={`w-full h-8 rounded-lg border px-3 text-sm ${!rij.datum ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100`} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Vervaldatum *</label>
                          <input type="date" value={rij.vervaldatum} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "vervaldatum", e.target.value)} className={`w-full h-8 rounded-lg border px-3 text-sm ${!rij.vervaldatum ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100`} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Status</label>
                          <select value={rij.status} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "status", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100">
                            <option value="BETAALD">Betaald</option>
                            <option value="VERZONDEN">Verzonden</option>
                            <option value="VERLOPEN">Verlopen</option>
                            <option value="CONCEPT">Concept</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">
                            Klant * {rij.klantNaam && <span className="text-gray-400">- gevonden: {rij.klantNaam}</span>}
                          </label>
                          <select
                            value={rij.klantId}
                            disabled={isBezig}
                            onChange={e => {
                              const gekozenKlantId = e.target.value;
                              setPdfRijen(prev => prev.map(r => r._id === rij._id ? {
                                ...r,
                                klantId: gekozenKlantId,
                                nieuweKlantAanmaken: gekozenKlantId ? false : r.nieuweKlantAanmaken,
                                fout: undefined,
                              } : r));
                            }}
                            className={`w-full h-8 rounded-lg border px-2 text-sm ${mistKlant ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100`}
                          >
                            <option value="">Kies bestaande klant...</option>
                            {klanten.map(k => <option key={k.id} value={k.id}>{k.bedrijf ?? k.naam}</option>)}
                          </select>
                        </div>
                        <label className="flex items-end gap-2 text-sm text-gray-700 pb-1">
                          <input
                            type="checkbox"
                            checked={Boolean(rij.nieuweKlantAanmaken)}
                            disabled={isBezig || Boolean(rij.klantId)}
                            onChange={e => updatePdfRij(rij._id, "nieuweKlantAanmaken", e.target.checked)}
                            className="h-4 w-4 text-indigo-600 rounded"
                          />
                          Nieuwe klant aanmaken
                        </label>
                      </div>

                      {rij.nieuweKlantAanmaken && !rij.klantId && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Nieuwe klantnaam *</label>
                            <input value={rij.klantNaam} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "klantNaam", e.target.value)} className={`w-full h-8 rounded-lg border px-3 text-sm ${!rij.klantNaam ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100`} />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">E-mail</label>
                            <input value={rij.klantEmail ?? ""} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "klantEmail", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Adres</label>
                            <input value={rij.klantAdres ?? ""} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "klantAdres", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100" />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Subtotaal</label>
                          <input type="number" step="0.01" value={rij.subtotaal} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "subtotaal", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">BTW-bedrag</label>
                          <input type="number" step="0.01" value={rij.btwBedrag} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "btwBedrag", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Totaal</label>
                          <input type="number" step="0.01" value={rij.totaal} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "totaal", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm text-right font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100" />
                        </div>
                        <div className="text-xs text-gray-500">
                          {rij.geextraheerdRegels?.length
                            ? `${rij.geextraheerdRegels.length} factuurregel${rij.geextraheerdRegels.length !== 1 ? "s" : ""} herkend`
                            : "Geen losse factuurregels herkend"}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Notities / omschrijving</label>
                        <input value={rij.notities} disabled={isBezig} onChange={e => updatePdfRij(rij._id, "notities", e.target.value)} placeholder="Optioneel" className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100" />
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-end pt-2">
                  <Button onClick={importeerPdfRijen} loading={pdfImportLaden} disabled={pdfLaden || pdfImportLaden} size="lg">
                    <CheckCircle className="h-4 w-4" />
                    Importeer {pdfRijen.filter(r => r.scanStatus !== "fout").length} facturen
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

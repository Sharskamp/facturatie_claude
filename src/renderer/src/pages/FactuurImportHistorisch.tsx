import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, CheckCircle, AlertCircle, Loader2,
  Upload, FileText, Download, Info, ScanLine, UserPlus, X, RefreshCw, Cpu, Cloud,
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

const VOORBEELD_CSV = `nummer;klant;datum;vervaldatum;totaal;btw_bedrag;subtotaal;status;notities
F2023-001;Acme BV;2023-01-15;2023-02-14;1210.00;210.00;1000.00;BETAALD;
F2023-002;Klant Naam;2023-02-01;2023-03-03;605.00;105.00;500.00;BETAALD;
F2023-003;Ander Bedrijf;2023-03-10;2023-04-09;363.00;63.00;300.00;VERZONDEN;`;

const SCAN_STATUSLABELS: Record<string, string> = {
  wacht: "Wacht...",
  bezig: "Scannen...",
  klaar: "Gescand",
  fout: "Fout",
};

export default function FactuurImportHistorischPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
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

  // ── PDF scan modus ────────────────────────────────────────
  const [scanEngine, setScanEngine] = useState<"ai" | "lokaal">("lokaal");
  const [pdfRijen, setPdfRijen] = useState<CsvRij[]>([]);
  const [pdfFout, setPdfFout] = useState<string | null>(null);
  const [pdfScanBezig, setPdfScanBezig] = useState(false);
  const [pdfImportResultaat, setPdfImportResultaat] = useState<{ succes: number; fouten: string[] } | null>(null);
  const scanningRef = useRef(false);

  function voegPdfBestandenToe(paden: string[]) {
    const nieuw: CsvRij[] = paden.map(pad => ({
      _id: crypto.randomUUID(),
      nummer: "",
      klantNaam: "",
      klantId: "",
      datum: vandaagString(),
      vervaldatum: vandaagString(),
      subtotaal: "0.00",
      btwBedrag: "0.00",
      totaal: "0.00",
      status: "BETAALD",
      notities: "",
      bronBestand: pad,
      bronNaam: pad.split(/[\\/]/).pop() ?? pad,
      scanStatus: "wacht",
      isNieuweKlant: false,
      nieuweKlantAanmaken: true,
    }));
    setPdfRijen(prev => [...prev, ...nieuw]);
  }

  const startScannen = useCallback(async (rijen: CsvRij[]) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setPdfScanBezig(true);

    for (const rij of rijen) {
      if (rij.scanStatus !== "wacht") continue;

      setPdfRijen(prev => prev.map(r => r._id === rij._id ? { ...r, scanStatus: "bezig" } : r));

      try {
        const scanFn = scanEngine === "lokaal"
          ? window.api.facturen.scanPdfLokaal
          : window.api.facturen.scanPdf;
        const resultaat = await scanFn({ pad: rij.bronBestand! });

        if (resultaat.error) throw new Error(resultaat.error);

        const klantNaam = resultaat.klantNaam ?? "";
        const gevondenKlant = klantNaam
          ? klanten.find(k =>
              k.naam.toLowerCase() === klantNaam.toLowerCase() ||
              (k.bedrijf ?? "").toLowerCase() === klantNaam.toLowerCase()
            )
          : undefined;

        const totaal = resultaat.totaal ?? 0;
        const btw = resultaat.btwBedrag ?? 0;
        const sub = resultaat.subtotaal ?? (totaal - btw);

        setPdfRijen(prev => prev.map(r => r._id === rij._id ? {
          ...r,
          scanStatus: "klaar",
          nummer: resultaat.nummer ?? "",
          klantNaam,
          klantId: gevondenKlant?.id ?? "",
          klantEmail: resultaat.klantEmail ?? "",
          klantAdres: resultaat.klantAdres ?? "",
          datum: resultaat.datum ?? vandaagString(),
          vervaldatum: resultaat.vervaldatum ?? vandaagString(),
          subtotaal: sub.toFixed(2),
          btwBedrag: btw.toFixed(2),
          totaal: totaal.toFixed(2),
          status: resultaat.status ?? "BETAALD",
          notities: resultaat.notities ?? "",
          isNieuweKlant: !!klantNaam && !gevondenKlant,
          nieuweKlantAanmaken: !!klantNaam && !gevondenKlant,
          geextraheerdRegels: ('regels' in resultaat && Array.isArray(resultaat.regels)) ? resultaat.regels : undefined,
        } : r));
      } catch (e: unknown) {
        setPdfRijen(prev => prev.map(r => r._id === rij._id ? {
          ...r,
          scanStatus: "fout",
          scanFout: e instanceof Error ? e.message : "Scan mislukt",
        } : r));
      }
    }

    scanningRef.current = false;
    setPdfScanBezig(false);
  }, [klanten, scanEngine]);

  useEffect(() => {
    const teScanner = pdfRijen.filter(r => r.scanStatus === "wacht");
    if (teScanner.length > 0 && !scanningRef.current) {
      startScannen(pdfRijen);
    }
  }, [pdfRijen, startScannen]);

  function updatePdfRij(id: string, veld: keyof CsvRij, waarde: string | boolean) {
    setPdfRijen(prev => prev.map(r => r._id === id ? { ...r, [veld]: waarde } : r));
  }

  function herScanRij(id: string) {
    setPdfRijen(prev => prev.map(r => r._id === id ? { ...r, scanStatus: "wacht", scanFout: undefined } : r));
  }

  async function importeerPdfFacturen() {
    const teImporteren = pdfRijen.filter(r => r.scanStatus === "klaar");
    const klantOntbreekt = (r: CsvRij) =>
      !r.klantId && !(r.isNieuweKlant && r.nieuweKlantAanmaken && r.klantNaam);
    const ongeldig = teImporteren.filter(r => !r.nummer || klantOntbreekt(r) || !r.datum);
    if (ongeldig.length > 0) {
      setPdfFout(`${ongeldig.length} facturen zijn niet volledig (nummer, klant en datum zijn verplicht).`);
      return;
    }

    setBulkLaden(true); setPdfFout(null);
    const importFn = (window.api.facturen as unknown as { importeerHistorisch: (d: unknown) => Promise<{ id: string; nummer: string }> }).importeerHistorisch;
    let succesCount = 0;
    const fouten: string[] = [];

    for (const rij of teImporteren) {
      try {
        let effectiefKlantId = rij.klantId;

        // Nieuwe klant aanmaken indien gewenst
        if (rij.isNieuweKlant && rij.nieuweKlantAanmaken && rij.klantNaam && !rij.klantId) {
          const nieuweKlant = await window.api.klanten.create({
            naam: rij.klantNaam,
            email: rij.klantEmail || undefined,
            adres: rij.klantAdres || undefined,
          }) as Klant;
          effectiefKlantId = nieuweKlant.id;
          setKlanten(prev => [...prev, nieuweKlant]);
        }

        if (!effectiefKlantId) {
          fouten.push(`${rij.nummer || rij.bronNaam}: geen klant gekoppeld`);
          continue;
        }

        const totaal = parseFloat(rij.totaal) || 0;
        const btw = parseFloat(rij.btwBedrag) || 0;
        const sub = parseFloat(rij.subtotaal) || (totaal - btw);

        const importRegels = rij.geextraheerdRegels && rij.geextraheerdRegels.length > 0
          ? rij.geextraheerdRegels.map(gr => ({
              omschrijving: gr.omschrijving,
              aantal: gr.aantal,
              prijs: gr.bedrag,
              btwPercentage: 0,
              kortingPercentage: 0,
              totaal: gr.totaal,
            }))
          : [{ omschrijving: `Factuur ${rij.nummer}`, aantal: 1, prijs: sub, btwPercentage: sub > 0 ? (btw / sub) * 100 : 0, kortingPercentage: 0, totaal }];

        await importFn({
          nummer: rij.nummer, klantId: effectiefKlantId,
          datum: rij.datum, vervaldatum: rij.vervaldatum, status: rij.status,
          subtotaal: sub, btwBedrag: btw, totaal, handmatigBedrag: true,
          notities: rij.notities || undefined,
          betaaldOp: rij.status === "BETAALD" ? rij.datum : undefined,
          regels: importRegels,
        });
        succesCount++;
      } catch (e: unknown) {
        fouten.push(`${rij.nummer || rij.bronNaam}: ${e instanceof Error ? e.message : "mislukt"}`);
      }
    }

    setBulkLaden(false);
    setPdfImportResultaat({ succes: succesCount, fouten });
    if (fouten.length === 0) setPdfRijen([]);
  }

  async function kiesBestandenViaPicker() {
    try {
      const paden = await window.api.facturen.kiesBestanden();
      if (paden && paden.length > 0) voegPdfBestandenToe(paden);
    } catch { /* gebruiker annuleerde */ }
  }

  const MODI = [
    { id: "handmatig" as const, label: "Eén factuur" },
    { id: "bulk" as const, label: "Bulk via CSV" },
    { id: "pdf" as const, label: "Bulk via PDF/scan" },
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
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{csvRijen.length} facturen gevonden</h3>
                    <p className="text-sm text-gray-500">Controleer de gegevens en koppel de klant aan elke factuur.</p>
                  </div>
                  <div className="flex gap-2">
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

        {/* ── BULK PDF / SCAN ── */}
        {modus === "pdf" && (
          <div className="space-y-6">
            {pdfFout && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />{pdfFout}
              </div>
            )}

            {pdfImportResultaat && (
              <div className={`rounded-lg border px-4 py-4 text-sm space-y-2 ${pdfImportResultaat.fouten.length === 0 ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                <p className="font-semibold flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  {pdfImportResultaat.succes} factuur{pdfImportResultaat.succes !== 1 ? "en" : ""} succesvol geïmporteerd
                </p>
                {pdfImportResultaat.fouten.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    {pdfImportResultaat.fouten.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
                {pdfImportResultaat.fouten.length === 0 && (
                  <Button size="sm" variant="outline" onClick={() => navigate("/facturen")}>Ga naar facturen</Button>
                )}
              </div>
            )}

            {/* Scan engine kiezer */}
            <div className="flex gap-3 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
              <button
                onClick={() => setScanEngine("lokaal")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  scanEngine === "lokaal"
                    ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Cpu className="h-4 w-4" />
                Lokaal (PaddleOCR)
              </button>
              <button
                onClick={() => setScanEngine("ai")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  scanEngine === "ai"
                    ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Cloud className="h-4 w-4" />
                Claude AI (cloud)
              </button>
            </div>

            {/* Info banner */}
            <div className={`rounded-lg border p-4 text-sm flex gap-3 ${
              scanEngine === "lokaal"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-indigo-50 border-indigo-200 text-indigo-800"
            }`}>
              {scanEngine === "lokaal" ? <Cpu className="h-5 w-5 shrink-0 mt-0.5" /> : <ScanLine className="h-5 w-5 shrink-0 mt-0.5" />}
              <div>
                {scanEngine === "lokaal" ? (
                  <>
                    <p className="font-semibold">Lokale OCR — geen internet nodig</p>
                    <p className="mt-0.5 opacity-80">PaddleOCR draait volledig lokaal via ONNX Runtime, ondersteunt Nederlands en herkent tabellen in facturen en bonnen. Werkt op Windows en Mac. Eerste scan duurt ~2-3s (model laden), daarna &lt;1s per pagina.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">Claude AI-scan (vereist API-sleutel)</p>
                    <p className="mt-0.5 opacity-80">Bestanden worden naar de Claude API gestuurd. Hogere nauwkeurigheid, maar vereist internetverbinding en API-sleutel in Instellingen.</p>
                  </>
                )}
              </div>
            </div>

            {/* Upload zone */}
            <Card>
              <CardContent className="pt-6">
                <div
                  onClick={kiesBestandenViaPicker}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const paden: string[] = [];
                    Array.from(e.dataTransfer.files).forEach(f => {
                      if (/\.(pdf|jpg|jpeg|png|webp)$/i.test(f.name)) paden.push((f as File & { path?: string }).path ?? f.name);
                    });
                    if (paden.length > 0) voegPdfBestandenToe(paden);
                  }}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-colors"
                >
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700">Klik of sleep PDF/afbeeldingen hier</p>
                  <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG of WEBP — meerdere bestanden tegelijk mogelijk</p>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    multiple
                    className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files ?? []);
                      const paden = files.map(f => (f as File & { path?: string }).path ?? f.name).filter(Boolean);
                      if (paden.length > 0) voegPdfBestandenToe(paden);
                      e.target.value = "";
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Scan wachtrij + review */}
            {pdfRijen.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {pdfRijen.length} bestand{pdfRijen.length !== 1 ? "en" : ""}
                      {pdfScanBezig && <span className="ml-2 text-sm text-indigo-600 font-normal flex items-center gap-1 inline-flex"><Loader2 className="h-3.5 w-3.5 animate-spin" />Scannen...</span>}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {pdfRijen.filter(r => r.scanStatus === "klaar").length} gescand &middot;&nbsp;
                      {pdfRijen.filter(r => r.scanStatus === "wacht" || r.scanStatus === "bezig").length} wacht &middot;&nbsp;
                      {pdfRijen.filter(r => r.scanStatus === "fout").length} fout
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setPdfRijen([]); setPdfImportResultaat(null); setPdfFout(null); }}>
                      <X className="h-4 w-4" />Wissen
                    </Button>
                    {pdfRijen.some(r => r.scanStatus === "klaar") && (
                      <Button onClick={importeerPdfFacturen} loading={bulkLaden} disabled={pdfScanBezig}>
                        <CheckCircle className="h-4 w-4" />
                        Importeer {pdfRijen.filter(r => r.scanStatus === "klaar").length} facturen
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {pdfRijen.map((rij) => (
                    <div
                      key={rij._id}
                      className={`rounded-xl border p-4 space-y-3 ${
                        rij.scanStatus === "fout" ? "border-red-300 bg-red-50/40 dark:bg-red-950/20" :
                        rij.scanStatus === "bezig" ? "border-indigo-300 bg-indigo-50/40 dark:bg-indigo-950/20" :
                        rij.scanStatus === "wacht" ? "border-gray-200 bg-gray-50/60" :
                        (!rij.nummer || (!rij.klantId && !(rij.isNieuweKlant && rij.nieuweKlantAanmaken))) ? "border-amber-300 bg-amber-50/40" :
                        "border-gray-200 bg-white dark:bg-gray-800"
                      }`}
                    >
                      {/* Header rij */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{rij.bronNaam}</span>
                          {/* Scan status badge */}
                          <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            rij.scanStatus === "bezig" ? "bg-indigo-100 text-indigo-700" :
                            rij.scanStatus === "klaar" ? "bg-green-100 text-green-700" :
                            rij.scanStatus === "fout" ? "bg-red-100 text-red-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            {rij.scanStatus === "bezig" && <Loader2 className="h-3 w-3 animate-spin" />}
                            {rij.scanStatus === "klaar" && <CheckCircle className="h-3 w-3" />}
                            {rij.scanStatus === "fout" && <AlertCircle className="h-3 w-3" />}
                            {SCAN_STATUSLABELS[rij.scanStatus ?? "wacht"]}
                          </span>
                          {/* Nieuwe klant badge */}
                          {rij.isNieuweKlant && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              <UserPlus className="h-3 w-3" />Nieuwe klant
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {rij.scanStatus === "fout" && (
                            <button onClick={() => herScanRij(rij._id)} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50" title="Opnieuw scannen">
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          )}
                          <button onClick={() => setPdfRijen(prev => prev.filter(r => r._id !== rij._id))} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50" title="Verwijderen">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Scan fout */}
                      {rij.scanStatus === "fout" && rij.scanFout && (
                        <p className="text-xs text-red-600">{rij.scanFout}</p>
                      )}

                      {/* Bezig indicator */}
                      {rij.scanStatus === "bezig" && (
                        <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full animate-pulse w-2/3" />
                        </div>
                      )}

                      {/* Bewerkvelden (zichtbaar als klaar) */}
                      {rij.scanStatus === "klaar" && (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Factuurnummer *</label>
                              <input value={rij.nummer} onChange={e => updatePdfRij(rij._id, "nummer", e.target.value)} className={`w-full h-8 rounded-lg border px-3 text-sm ${!rij.nummer ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500`} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Factuurdatum *</label>
                              <input type="date" value={rij.datum} onChange={e => updatePdfRij(rij._id, "datum", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Vervaldatum</label>
                              <input type="date" value={rij.vervaldatum} onChange={e => updatePdfRij(rij._id, "vervaldatum", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Status</label>
                              <select value={rij.status} onChange={e => updatePdfRij(rij._id, "status", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                                <option value="BETAALD">Betaald</option>
                                <option value="VERZONDEN">Verzonden</option>
                                <option value="VERLOPEN">Verlopen</option>
                                <option value="CONCEPT">Concept</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Totaal (incl. BTW)</label>
                              <div className="relative"><span className="absolute left-2.5 top-1.5 text-xs text-gray-400">€</span><input type="number" step="0.01" value={rij.totaal} onChange={e => updatePdfRij(rij._id, "totaal", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 pl-6 pr-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" /></div>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">BTW-bedrag</label>
                              <div className="relative"><span className="absolute left-2.5 top-1.5 text-xs text-gray-400">€</span><input type="number" step="0.01" value={rij.btwBedrag} onChange={e => updatePdfRij(rij._id, "btwBedrag", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 pl-6 pr-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500" /></div>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-gray-500 mb-1">Notities</label>
                              <input value={rij.notities} onChange={e => updatePdfRij(rij._id, "notities", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                            </div>
                          </div>

                          {/* Productregels */}
                          {rij.geextraheerdRegels && rij.geextraheerdRegels.length > 0 ? (
                            <div>
                              <label className="block text-xs text-gray-500 mb-1.5">
                                Productregels ({rij.geextraheerdRegels.length})
                              </label>
                              <div className="rounded-lg border border-gray-200 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="text-left px-3 py-1.5 text-gray-500 font-medium">Omschrijving</th>
                                      <th className="text-right px-3 py-1.5 text-gray-500 font-medium w-14">Aantal</th>
                                      <th className="text-right px-3 py-1.5 text-gray-500 font-medium w-22">Stukprijs</th>
                                      <th className="text-right px-3 py-1.5 text-gray-500 font-medium w-22">Totaal</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {rij.geextraheerdRegels.map((regel, i) => (
                                      <tr key={i} className="bg-white">
                                        <td className="px-3 py-1.5 text-gray-700">{regel.omschrijving}</td>
                                        <td className="px-3 py-1.5 text-right text-gray-600">{regel.aantal}</td>
                                        <td className="px-3 py-1.5 text-right text-gray-600">€ {regel.bedrag.toFixed(2)}</td>
                                        <td className="px-3 py-1.5 text-right font-medium text-gray-800">€ {regel.totaal.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic">
                              Geen productregels herkend — wordt als samenvatting geïmporteerd.
                            </p>
                          )}

                          {/* Klant sectie */}
                          {rij.isNieuweKlant ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                                  <UserPlus className="h-3.5 w-3.5" />Nieuwe klant: {rij.klantNaam}
                                </span>
                                <label className="flex items-center gap-1.5 text-xs text-amber-800 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={rij.nieuweKlantAanmaken ?? true}
                                    onChange={e => updatePdfRij(rij._id, "nieuweKlantAanmaken", e.target.checked)}
                                    className="h-3.5 w-3.5 text-amber-600 rounded"
                                  />
                                  Nieuwe klant aanmaken
                                </label>
                              </div>
                              {rij.nieuweKlantAanmaken ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">Naam *</label>
                                    <input value={rij.klantNaam} onChange={e => updatePdfRij(rij._id, "klantNaam", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">E-mailadres</label>
                                    <input type="email" value={rij.klantEmail ?? ""} onChange={e => updatePdfRij(rij._id, "klantEmail", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">Adres</label>
                                    <input value={rij.klantAdres ?? ""} onChange={e => updatePdfRij(rij._id, "klantAdres", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Koppel aan bestaande klant</label>
                                  <select value={rij.klantId} onChange={e => updatePdfRij(rij._id, "klantId", e.target.value)} className="w-full h-8 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                                    <option value="">— kies klant —</option>
                                    {klanten.map(k => <option key={k.id} value={k.id}>{k.bedrijf ?? k.naam}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">
                                Klant * {rij.klantNaam && <span className="text-gray-400">— herkend: {rij.klantNaam}</span>}
                              </label>
                              <select value={rij.klantId} onChange={e => updatePdfRij(rij._id, "klantId", e.target.value)} className={`w-full h-8 rounded-lg border px-2 text-sm ${!rij.klantId ? "border-red-300 bg-red-50" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-indigo-500`}>
                                <option value="">— kies klant —</option>
                                {klanten.map(k => <option key={k.id} value={k.id}>{k.bedrijf ?? k.naam}</option>)}
                              </select>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {pdfRijen.some(r => r.scanStatus === "klaar") && (
                  <div className="flex justify-end pt-2">
                    <Button onClick={importeerPdfFacturen} loading={bulkLaden} disabled={pdfScanBezig} size="lg">
                      <CheckCircle className="h-4 w-4" />
                      Importeer {pdfRijen.filter(r => r.scanStatus === "klaar").length} facturen
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

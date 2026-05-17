import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { Printer, TrendingUp, TrendingDown, Minus, Loader2, FileDown, Calculator } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBedrag, formatDatum } from "@/lib/utils";

function downloadCsv(rows: Record<string, unknown>[], bestandsnaam: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => String(r[h] ?? "")).join(";"))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bestandsnaam.replace(".xlsx", ".csv");
  a.click();
  URL.revokeObjectURL(url);
}

type Tab = "btw" | "winstverlies" | "factuurstatus" | "btwAangifte" | "balans" | "debiteuren" | "cashflow" | "inkomensschatting";

interface FactuurRegel {
  id: string;
  omschrijving: string;
  aantal: number;
  eenheid?: string | null;
  prijs: number;
  btwPercentage: number;
  kortingPercentage: number;
  totaal: number;
}

interface Factuur {
  id: string;
  factuurNummer?: string;
  nummer?: string;
  status: string;
  totaal: number;
  subtotaal: number;
  btwBedrag: number;
  btwVerlegd?: boolean;
  vervaldatum?: string;
  verzondDatum?: string;
  datum?: string;
  aangemaakt?: string;
  klant?: { naam: string; bedrijf?: string | null } | null;
  regels?: FactuurRegel[];
}

interface InkomenRecord {
  id: string;
  datum: string;
  bedrag: number;
  omschrijving: string;
}

interface UitgaveRecord {
  id: string;
  datum: string;
  bedrag: number;
  btw: number;
  btwBedrag?: number;
  btwPercentage: number;
  omschrijving: string;
  totaal?: number;
}

const TAB_LABELS: Record<Tab, string> = {
  btw: "BTW Overzicht",
  winstverlies: "Winst & Verlies",
  factuurstatus: "Facturen Status",
  btwAangifte: "BTW-aangifte",
  balans: "Balans",
  debiteuren: "Debiteurenanalyse",
  cashflow: "Cashflow",
  inkomensschatting: "Inkomensschatting",
};

const KWARTALEN = ["Q1", "Q2", "Q3", "Q4"];
const MAANDEN = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

const PIE_KLEUREN: Record<string, string> = {
  CONCEPT: "#94a3b8",
  VERZONDEN: "#6366f1",
  BETAALD: "#22c55e",
  VERLOPEN: "#ef4444",
  GEANNULEERD: "#d1d5db",
  CREDITNOTA: "#f97316",
};

const STATUS_LABELS: Record<string, string> = {
  CONCEPT: "Concept",
  VERZONDEN: "Verzonden",
  BETAALD: "Betaald",
  VERLOPEN: "Verlopen",
  GEANNULEERD: "Geannuleerd",
  CREDITNOTA: "Creditnota",
};

function huidigKwartaal(): string {
  const m = new Date().getMonth();
  return `Q${Math.floor(m / 3) + 1}`;
}

const euroFormatter = (value: unknown) => formatBedrag(Number(value));

// Helper: get factuurNummer regardless of field name
function getFactuurNummer(f: Factuur): string {
  return f.factuurNummer ?? f.nummer ?? "—";
}

// Helper: get factuur date
function getFactuurDatum(f: Factuur): string | undefined {
  return f.datum ?? f.aangemaakt;
}

function InkomensSchatting() {
  const [omzet, setOmzet] = useState(0);
  const [kosten, setKosten] = useState(0);
  const [zelfstandigenaftrek, setZelfstandigenaftrek] = useState(3750); // 2025 bedrag
  const [startersaftrek, setStartersaftrek] = useState(0);

  const brutoWinst = Math.max(0, omzet - kosten);
  const fiscaleWinst = Math.max(0, brutoWinst - zelfstandigenaftrek - startersaftrek);
  const mkbVrijstelling = fiscaleWinst * 0.127;
  const belastbaarInkomen = Math.max(0, fiscaleWinst - mkbVrijstelling);

  // IB 2025 schijven (box 1)
  const ib1 = Math.min(belastbaarInkomen, 75518) * 0.3697;
  const ib2 = Math.max(0, belastbaarInkomen - 75518) * 0.495;
  const ibTotaal = ib1 + ib2;

  // Algemene heffingskorting (2025 ~€3068, afgebouwd boven €24813)
  const ahk = belastbaarInkomen <= 24813
    ? 3068
    : Math.max(0, 3068 - (belastbaarInkomen - 24813) * 0.06392);

  // Arbeidskorting (simpel, max ~€5158)
  const arbeidskorting = Math.min(5158, belastbaarInkomen * 0.08);

  const nettoIB = Math.max(0, ibTotaal - ahk - arbeidskorting);

  // ZVW premie (5.32% over max €71628 grondslag = max ~€3809)
  const zvwGrondslag = Math.min(brutoWinst, 71628);
  const zvwPremie = zvwGrondslag * 0.0532;

  const nettoInkomen = belastbaarInkomen + mkbVrijstelling + zelfstandigenaftrek + startersaftrek - nettoIB - zvwPremie;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Verwachte omzet (excl. BTW)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
            <input
              type="number"
              min="0"
              step="100"
              value={omzet}
              onChange={(e) => setOmzet(parseFloat(e.target.value) || 0)}
              className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Verwachte zakelijke kosten</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
            <input
              type="number"
              min="0"
              step="100"
              value={kosten}
              onChange={(e) => setKosten(parseFloat(e.target.value) || 0)}
              className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Zelfstandigenaftrek (2025)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
            <input
              type="number"
              min="0"
              value={zelfstandigenaftrek}
              onChange={(e) => setZelfstandigenaftrek(parseFloat(e.target.value) || 0)}
              className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Startersaftrek (optioneel)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
            <input
              type="number"
              min="0"
              value={startersaftrek}
              onChange={(e) => setStartersaftrek(parseFloat(e.target.value) || 0)}
              className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-gray-900 mb-4">Berekening</h3>
        {[
          { label: 'Bruto winst', waarde: brutoWinst, bold: false },
          { label: `Zelfstandigenaftrek`, waarde: -zelfstandigenaftrek, bold: false },
          { label: `Startersaftrek`, waarde: -startersaftrek, bold: false, hide: startersaftrek === 0 },
          { label: 'Fiscale winst', waarde: fiscaleWinst, bold: false },
          { label: 'MKB-winstvrijstelling (12,7%)', waarde: -mkbVrijstelling, bold: false },
          { label: 'Belastbaar inkomen', waarde: belastbaarInkomen, bold: true },
          { label: 'Inkomstenbelasting (IB)', waarde: -nettoIB, bold: false },
          { label: 'ZVW-premie (5,32%)', waarde: -zvwPremie, bold: false },
          { label: '≈ Netto inkomen', waarde: nettoInkomen, bold: true },
        ].filter(r => !(r as { hide?: boolean }).hide).map(({ label, waarde, bold }) => (
          <div key={label} className={`flex justify-between text-sm ${bold ? 'font-bold text-gray-900 border-t border-gray-200 pt-3 mt-2' : 'text-gray-600'}`}>
            <span>{label}</span>
            <span className={waarde < 0 ? 'text-red-600' : waarde > 0 && bold ? 'text-green-700' : ''}>
              {waarde < 0 ? '-' : ''}{new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Math.abs(waarde))}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400">
        * Dit is een globale schatting op basis van belastingtarieven 2025. Geen belastingadvies. Raadpleeg een boekhouder voor uw aangifte.
      </p>
    </div>
  );
}

export default function RapportenPagina() {
  const [actieveTab, setActieveTab] = useState<Tab>("btw");
  const [facturen, setFacturen] = useState<Factuur[]>([]);
  const [inkomens, setInkomens] = useState<InkomenRecord[]>([]);
  const [uitgaven, setUitgaven] = useState<UitgaveRecord[]>([]);
  const [laden, setLaden] = useState(true);

  // BTW selectors
  const [btwKwartaal, setBtwKwartaal] = useState(huidigKwartaal());
  const [btwJaar, setBtwJaar] = useState(String(new Date().getFullYear()));

  // W&V selectors
  const [wvPeriode, setWvPeriode] = useState<"maand" | "kwartaal" | "jaar">("maand");
  const [wvJaar, setWvJaar] = useState(String(new Date().getFullYear()));

  // BTW-aangifte selectors
  const [aangiftePeriode, setAangiftePeriode] = useState<string>(`${huidigKwartaal()}_${new Date().getFullYear()}`);

  const haalDataOp = useCallback(async () => {
    setLaden(true);
    try {
      const [fData, iData, uData] = await Promise.all([
        window.api.facturen.list(),
        window.api.inkomen.list(),
        window.api.uitgaven.list(),
      ]);
      setFacturen(Array.isArray(fData) ? fData : (fData as any).facturen ?? []);
      setInkomens(Array.isArray(iData) ? iData : (iData as any).inkomens ?? []);
      setUitgaven(Array.isArray(uData) ? uData : (uData as any).uitgaven ?? []);
    } catch {
      // stil falen
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    haalDataOp();
  }, [haalDataOp]);

  // ─── BTW berekeningen ───────────────────────────────────────────────────────
  const kwartaalMaanden: Record<string, number[]> = {
    Q1: [0, 1, 2], Q2: [3, 4, 5], Q3: [6, 7, 8], Q4: [9, 10, 11],
  };

  const btwMaanden = kwartaalMaanden[btwKwartaal] ?? [];
  const jaar = parseInt(btwJaar);

  const inkomensInKwartaal = inkomens.filter((i) => {
    const d = new Date(i.datum);
    return d.getFullYear() === jaar && btwMaanden.includes(d.getMonth());
  });

  const uitgavenInKwartaal = uitgaven.filter((u) => {
    const d = new Date(u.datum);
    return d.getFullYear() === jaar && btwMaanden.includes(d.getMonth());
  });

  // Omzet BTW (te betalen) — berekend op inkomsten (21%)
  const omzetBtw21 = inkomensInKwartaal.reduce((s, i) => s + i.bedrag * 0.21, 0);
  const omzetBtw9 = inkomensInKwartaal.reduce((s, i) => s + i.bedrag * 0.09, 0);
  // Inkoop BTW per tarief
  const inkoopBtw21 = uitgavenInKwartaal.filter((u) => u.btwPercentage === 21).reduce((s, u) => s + u.btw, 0);
  const inkoopBtw9 = uitgavenInKwartaal.filter((u) => u.btwPercentage === 9).reduce((s, u) => s + u.btw, 0);
  const totaalOmzetBtw = uitgavenInKwartaal.reduce((s, u) => s + u.btw, 0); // werkelijk BTW op inkoop
  const totaalInkomstBtw = inkomensInKwartaal.reduce((s, i) => s + i.bedrag * 0.21, 0);
  const btwSaldo = totaalInkomstBtw - totaalOmzetBtw;

  const btwTarieven = [
    { tarief: "21%", omzet: omzetBtw21, inkoop: inkoopBtw21, saldo: omzetBtw21 - inkoopBtw21 },
    { tarief: "9%", omzet: omzetBtw9, inkoop: inkoopBtw9, saldo: omzetBtw9 - inkoopBtw9 },
    { tarief: "0%", omzet: 0, inkoop: 0, saldo: 0 },
  ];

  // ─── Winst & Verlies berekeningen ──────────────────────────────────────────
  const wvJaarNum = parseInt(wvJaar);

  const wvData = MAANDEN.map((naam, idx) => {
    const omzet = inkomens
      .filter((i) => {
        const d = new Date(i.datum);
        return d.getFullYear() === wvJaarNum && d.getMonth() === idx;
      })
      .reduce((s, i) => s + i.bedrag, 0);
    const kosten = uitgaven
      .filter((u) => {
        const d = new Date(u.datum);
        return d.getFullYear() === wvJaarNum && d.getMonth() === idx;
      })
      .reduce((s, u) => s + u.bedrag, 0);
    return { naam, omzet, kosten, winst: omzet - kosten };
  });

  const wvGekwartaald = KWARTALEN.map((kw) => {
    const maanden = kwartaalMaanden[kw];
    const omzet = wvData.filter((_, i) => maanden.includes(i)).reduce((s, m) => s + m.omzet, 0);
    const kosten = wvData.filter((_, i) => maanden.includes(i)).reduce((s, m) => s + m.kosten, 0);
    return { naam: kw, omzet, kosten, winst: omzet - kosten };
  });

  const wvJaarTotaal = [
    {
      naam: wvJaar,
      omzet: wvData.reduce((s, m) => s + m.omzet, 0),
      kosten: wvData.reduce((s, m) => s + m.kosten, 0),
      winst: wvData.reduce((s, m) => s + m.winst, 0),
    },
  ];

  const grafiekData = wvPeriode === "maand" ? wvData : wvPeriode === "kwartaal" ? wvGekwartaald : wvJaarTotaal;
  const tabelData = wvPeriode === "maand" ? wvData : wvPeriode === "kwartaal" ? wvGekwartaald : wvJaarTotaal;

  const totaalOmzet = wvData.reduce((s, m) => s + m.omzet, 0);
  const totaalKosten = wvData.reduce((s, m) => s + m.kosten, 0);
  const totaalWinst = totaalOmzet - totaalKosten;

  // ─── Factuurstatus berekeningen ─────────────────────────────────────────────
  const statusGroepen = facturen.reduce<Record<string, { aantal: number; totaal: number }>>((acc, f) => {
    if (!acc[f.status]) acc[f.status] = { aantal: 0, totaal: 0 };
    acc[f.status].aantal++;
    acc[f.status].totaal += f.totaal;
    return acc;
  }, {});

  const pieData = Object.entries(statusGroepen).map(([status, data]) => ({
    name: STATUS_LABELS[status] ?? status,
    value: data.totaal,
    status,
  }));

  // Aging report (verlopen facturen)
  const nu = new Date();
  const verlopen = facturen.filter((f) => f.status === "VERLOPEN" || f.status === "VERZONDEN");
  const aging = { "0-30": 0, "31-60": 0, "60+": 0 };
  verlopen.forEach((f) => {
    const vervaldatum = f.vervaldatum ? new Date(f.vervaldatum) : new Date(f.aangemaakt ?? new Date());
    const dagenOverdue = Math.floor((nu.getTime() - vervaldatum.getTime()) / 86400000);
    if (dagenOverdue <= 0) return;
    if (dagenOverdue <= 30) aging["0-30"] += f.totaal;
    else if (dagenOverdue <= 60) aging["31-60"] += f.totaal;
    else aging["60+"] += f.totaal;
  });

  const jaarOpties = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  // ─── BTW-aangifte berekeningen ─────────────────────────────────────────────
  // Build period options: quarters for past 5 years + current year + whole year options
  const aangiftePeriodeOpties: { waarde: string; label: string }[] = [];
  const huidigJaar = new Date().getFullYear();
  for (let y = huidigJaar; y >= huidigJaar - 4; y--) {
    aangiftePeriodeOpties.push({ waarde: `jaar_${y}`, label: `Heel jaar ${y}` });
    for (const kw of [...KWARTALEN].reverse()) {
      aangiftePeriodeOpties.push({ waarde: `${kw}_${y}`, label: `${kw} ${y}` });
    }
  }

  // Parse selected period
  const aangiftePeriodeParts = aangiftePeriode.split("_");
  const aangifteIsJaar = aangiftePeriodeParts[0] === "jaar";
  const aangifteJaar = parseInt(aangiftePeriodeParts[aangiftePeriodeParts.length - 1]);
  const aangifteKwartaal = aangifteIsJaar ? null : aangiftePeriodeParts[0];
  const aangifteMaanden: number[] = aangifteIsJaar
    ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    : kwartaalMaanden[aangifteKwartaal ?? "Q1"] ?? [];

  const facturenInPeriode = facturen.filter((f) => {
    const datumStr = f.datum ?? f.aangemaakt;
    if (!datumStr) return false;
    const d = new Date(datumStr);
    return d.getFullYear() === aangifteJaar && aangifteMaanden.includes(d.getMonth());
  });

  const uitgavenInPeriode = uitgaven.filter((u) => {
    const d = new Date(u.datum);
    return d.getFullYear() === aangifteJaar && aangifteMaanden.includes(d.getMonth());
  });

  // Rubriek 1a: 21% non-reversed invoices
  const facturen21 = facturenInPeriode.filter((f) => !f.btwVerlegd && f.regels?.some((r) => r.btwPercentage === 21));
  const rubriek1aOmzet = facturen21.reduce((s, f) => {
    const netto = f.regels
      ? f.regels.filter((r) => r.btwPercentage === 21).reduce((rs, r) => rs + r.totaal / (1 + r.btwPercentage / 100), 0)
      : f.subtotaal;
    return s + netto;
  }, 0);
  const rubriek1aBtw = facturen21.reduce((s, f) => {
    if (f.regels) {
      return s + f.regels.filter((r) => r.btwPercentage === 21).reduce((rs, r) => {
        const netto = r.totaal / (1 + r.btwPercentage / 100);
        return rs + netto * 0.21;
      }, 0);
    }
    return s + f.btwBedrag;
  }, 0);

  // Rubriek 1b: 9% non-reversed invoices
  const facturen9 = facturenInPeriode.filter((f) => !f.btwVerlegd && f.regels?.some((r) => r.btwPercentage === 9));
  const rubriek1bOmzet = facturen9.reduce((s, f) => {
    const netto = f.regels
      ? f.regels.filter((r) => r.btwPercentage === 9).reduce((rs, r) => rs + r.totaal / (1 + r.btwPercentage / 100), 0)
      : f.subtotaal;
    return s + netto;
  }, 0);
  const rubriek1bBtw = facturen9.reduce((s, f) => {
    if (f.regels) {
      return s + f.regels.filter((r) => r.btwPercentage === 9).reduce((rs, r) => {
        const netto = r.totaal / (1 + r.btwPercentage / 100);
        return rs + netto * 0.09;
      }, 0);
    }
    return s + f.btwBedrag;
  }, 0);

  // Rubriek 1d: 0% invoices
  const facturen0 = facturenInPeriode.filter((f) => !f.btwVerlegd && (!f.regels || f.regels.every((r) => r.btwPercentage === 0)));
  const rubriek1dOmzet = facturen0.reduce((s, f) => s + f.subtotaal, 0);

  // Rubriek 5b: voorbelasting (inkoop-BTW)
  const rubriek5b = uitgavenInPeriode.reduce((s, u) => s + (u.btw ?? u.btwBedrag ?? 0), 0);

  // Totaal BTW verschuldigd: 1a + 1b - 5b
  const totaalBtwVerschuldigd = rubriek1aBtw + rubriek1bBtw - rubriek5b;

  const aangifteRubrieken = [
    { nummer: "1a", omschrijving: "Leveringen/diensten belast met 21%", bedrag: rubriek1aOmzet, btw: rubriek1aBtw },
    { nummer: "1b", omschrijving: "Leveringen/diensten belast met 9%", bedrag: rubriek1bOmzet, btw: rubriek1bBtw },
    { nummer: "1d", omschrijving: "Leveringen/diensten belast met 0%", bedrag: rubriek1dOmzet, btw: null },
    { nummer: "1e", omschrijving: "Vrijgestelde leveringen/diensten", bedrag: 0, btw: null },
    { nummer: "5b", omschrijving: "Voorbelasting (inkoop-BTW)", bedrag: null, btw: rubriek5b },
  ];

  // ─── Balans berekeningen ────────────────────────────────────────────────────
  const openFacturen = facturen.filter((f) => f.status === "VERZONDEN" || f.status === "VERLOPEN");
  const debiteuren = openFacturen.reduce((s, f) => s + f.totaal, 0);

  const totaalBetaaldInkomen = inkomens.reduce((s, i) => s + i.bedrag, 0);
  const totaalUitgavenBedrag = uitgaven.reduce((s, u) => s + u.bedrag, 0);
  const liquideMiddelen = Math.max(0, totaalBetaaldInkomen - totaalUitgavenBedrag);

  const activaVasteActiva = 0; // vasteActiva API not available

  const totalActiva = debiteuren + liquideMiddelen + activaVasteActiva;

  // BTW-schuld this quarter
  const btwSchuld = Math.max(0, totaalBtwVerschuldigd);

  // Crediteuren: uitgaven last 30 days
  const dertigDagenGeleden = new Date();
  dertigDagenGeleden.setDate(dertigDagenGeleden.getDate() - 30);
  const crediteuren = uitgaven
    .filter((u) => new Date(u.datum) >= dertigDagenGeleden)
    .reduce((s, u) => s + u.bedrag, 0);

  const passivaSubtotaal = btwSchuld + crediteuren;
  const eigenVermogen = totalActiva - passivaSubtotaal;

  // ─── Debiteurenanalyse berekeningen ────────────────────────────────────────
  const openFacturenMetDatum = openFacturen.map((f) => {
    const vervaldatum = f.vervaldatum ? new Date(f.vervaldatum) : null;
    const dagenTeLaat = vervaldatum
      ? Math.floor((nu.getTime() - vervaldatum.getTime()) / 86400000)
      : 0;
    return { ...f, dagenTeLaat, vervaldatumDate: vervaldatum };
  });

  // Sort by days overdue descending
  const gesorteerdeDebiteuren = [...openFacturenMetDatum].sort((a, b) => b.dagenTeLaat - a.dagenTeLaat);

  const agingBuckets = [
    {
      label: "Niet verlopen",
      min: -Infinity,
      max: 0,
      kleur: "bg-green-50 border-green-200",
      tekstKleur: "text-green-700",
      rijKleur: "",
    },
    {
      label: "1–30 dagen te laat",
      min: 1,
      max: 30,
      kleur: "bg-yellow-50 border-yellow-200",
      tekstKleur: "text-yellow-700",
      rijKleur: "bg-yellow-50",
    },
    {
      label: "31–60 dagen te laat",
      min: 31,
      max: 60,
      kleur: "bg-orange-50 border-orange-200",
      tekstKleur: "text-orange-700",
      rijKleur: "bg-orange-50",
    },
    {
      label: "61–90 dagen te laat",
      min: 61,
      max: 90,
      kleur: "bg-red-50 border-red-200",
      tekstKleur: "text-red-700",
      rijKleur: "bg-red-50",
    },
    {
      label: "90+ dagen te laat",
      min: 91,
      max: Infinity,
      kleur: "bg-red-100 border-red-400",
      tekstKleur: "text-red-900",
      rijKleur: "bg-red-100",
    },
  ];

  const agingBucketData = agingBuckets.map((bucket) => {
    const items = openFacturenMetDatum.filter((f) => {
      if (bucket.max === 0) return f.dagenTeLaat <= 0;
      return f.dagenTeLaat >= bucket.min && f.dagenTeLaat <= bucket.max;
    });
    return {
      ...bucket,
      aantal: items.length,
      totaal: items.reduce((s, f) => s + f.totaal, 0),
    };
  });

  function rijKleurVoorDagen(dagen: number): string {
    if (dagen <= 0) return "";
    if (dagen <= 30) return "bg-yellow-50";
    if (dagen <= 60) return "bg-orange-50";
    if (dagen <= 90) return "bg-red-50";
    return "bg-red-100";
  }

  const totaalOpenstaand = openFacturen.reduce((s, f) => s + f.totaal, 0);

  // ─── Cashflow berekeningen ──────────────────────────────────────────────────
  const vandaag = new Date();
  // Build 7 months: this month + next 6
  const cashflowMaanden = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(vandaag.getFullYear(), vandaag.getMonth() + i, 1);
    return { jaar: d.getFullYear(), maand: d.getMonth(), label: MAANDEN[d.getMonth()] };
  });

  // Expected income: sum of open invoices by vervaldatum month
  const verwachtInkomen = cashflowMaanden.map(({ jaar: y, maand: m }) => {
    return openFacturen
      .filter((f) => {
        if (!f.vervaldatum) return false;
        const d = new Date(f.vervaldatum);
        return d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((s, f) => s + f.totaal, 0);
  });

  // Average expenses: last 3 months
  const drieMandenGeleden = new Date(vandaag.getFullYear(), vandaag.getMonth() - 3, 1);
  const recenteUitgaven = uitgaven.filter((u) => new Date(u.datum) >= drieMandenGeleden);
  const gemiddeldeUitgaven = recenteUitgaven.length > 0
    ? recenteUitgaven.reduce((s, u) => s + u.bedrag, 0) / 3
    : 0;

  const cashflowGrafiekData = cashflowMaanden.map(({ label }, i) => ({
    naam: label,
    inkomen: verwachtInkomen[i],
    uitgaven: gemiddeldeUitgaven,
    netto: verwachtInkomen[i] - gemiddeldeUitgaven,
  }));

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Rapporten"
        subtitel="Financieel overzicht en analyses"
        acties={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Afdrukken
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Tab navigatie */}
        <div className="flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActieveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                actieveTab === tab
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {laden && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <span className="ml-3 text-gray-500">Gegevens laden...</span>
          </div>
        )}

        {!laden && (
          <>
            {/* ── BTW Overzicht ── */}
            {actieveTab === "btw" && (
              <div className="space-y-6">
                {/* Selectors */}
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex flex-wrap gap-3 items-center">
                    <Select value={btwKwartaal} onValueChange={setBtwKwartaal}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KWARTALEN.map((kw) => (
                          <SelectItem key={kw} value={kw}>{kw}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={btwJaar} onValueChange={setBtwJaar}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {jaarOpties.map((j) => (
                          <SelectItem key={j} value={j}>{j}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-gray-500">
                      {btwKwartaal} {btwJaar} — BTW aangifte periode
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadCsv(
                        btwTarieven.map((r) => ({
                          Tarief: r.tarief,
                          "Omzet BTW": r.omzet,
                          "Inkoop BTW": r.inkoop,
                          Saldo: r.saldo,
                        })),
                        "btw-overzicht.xlsx"
                      )
                    }
                  >
                    <FileDown className="h-4 w-4" />
                    Exporteer Excel
                  </Button>
                </div>

                {/* Samenvatting */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="border-blue-200 bg-blue-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-blue-700">Omzet BTW (te betalen)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-blue-900">{formatBedrag(totaalInkomstBtw)}</p>
                      <p className="text-xs text-blue-600 mt-1">Over inkomsten {btwKwartaal} {btwJaar}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-green-200 bg-green-50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-green-700">Inkoop BTW (terug te vragen)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-green-900">{formatBedrag(totaalOmzetBtw)}</p>
                      <p className="text-xs text-green-600 mt-1">Over zakelijke kosten</p>
                    </CardContent>
                  </Card>
                  <Card className={`border-2 ${btwSaldo > 0 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className={`text-sm font-medium ${btwSaldo > 0 ? "text-red-700" : "text-green-700"}`}>
                        Saldo (BTW afdracht)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={`text-2xl font-bold ${btwSaldo > 0 ? "text-red-900" : "text-green-900"}`}>
                        {formatBedrag(Math.abs(btwSaldo))}
                      </p>
                      <p className={`text-xs mt-1 ${btwSaldo > 0 ? "text-red-600" : "text-green-600"}`}>
                        {btwSaldo > 0 ? "Te betalen aan Belastingdienst" : "Terug te ontvangen"}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Breakdown per tarief */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Uitsplitsing per BTW-tarief</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>BTW tarief</TableHead>
                          <TableHead className="text-right">Omzet BTW</TableHead>
                          <TableHead className="text-right">Inkoop BTW</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {btwTarieven.map((r) => (
                          <TableRow key={r.tarief}>
                            <TableCell className="font-medium">{r.tarief}</TableCell>
                            <TableCell className="text-right text-blue-700">{formatBedrag(r.omzet)}</TableCell>
                            <TableCell className="text-right text-green-700">{formatBedrag(r.inkoop)}</TableCell>
                            <TableCell className={`text-right font-semibold ${r.saldo > 0 ? "text-red-700" : "text-green-700"}`}>
                              {formatBedrag(r.saldo)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 border-gray-300">
                          <TableCell className="font-bold">Totaal</TableCell>
                          <TableCell className="text-right font-bold text-blue-700">
                            {formatBedrag(btwTarieven.reduce((s, r) => s + r.omzet, 0))}
                          </TableCell>
                          <TableCell className="text-right font-bold text-green-700">
                            {formatBedrag(btwTarieven.reduce((s, r) => s + r.inkoop, 0))}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${btwSaldo > 0 ? "text-red-700" : "text-green-700"}`}>
                            {formatBedrag(btwSaldo)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Winst & Verlies ── */}
            {actieveTab === "winstverlies" && (
              <div className="space-y-6">
                {/* Selectors */}
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex flex-wrap gap-3 items-center">
                    <Select value={wvPeriode} onValueChange={(v) => setWvPeriode(v as typeof wvPeriode)}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="maand">Per maand</SelectItem>
                        <SelectItem value="kwartaal">Per kwartaal</SelectItem>
                        <SelectItem value="jaar">Jaar totaal</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={wvJaar} onValueChange={setWvJaar}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {jaarOpties.map((j) => (
                          <SelectItem key={j} value={j}>{j}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadCsv(
                        tabelData.map((r) => ({
                          Periode: r.naam,
                          Omzet: r.omzet,
                          Kosten: r.kosten,
                          Winst: r.winst,
                        })),
                        "winst-verlies.xlsx"
                      )
                    }
                  >
                    <FileDown className="h-4 w-4" />
                    Exporteer Excel
                  </Button>
                </div>

                {/* Totalen */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        Totale omzet
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-gray-900">{formatBedrag(totaalOmzet)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                        <TrendingDown className="h-4 w-4 text-red-500" />
                        Totale kosten
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold text-gray-900">{formatBedrag(totaalKosten)}</p>
                    </CardContent>
                  </Card>
                  <Card className={`border-2 ${totaalWinst >= 0 ? "border-green-200" : "border-red-200"}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                        <Minus className="h-4 w-4" />
                        Netto winst
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={`text-2xl font-bold ${totaalWinst >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {formatBedrag(totaalWinst)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Grafiek */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Omzet vs Kosten — {wvJaar}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={grafiekData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="naam" tick={{ fontSize: 12 }} />
                          <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={euroFormatter} />
                          <Legend />
                          <Bar dataKey="omzet" name="Omzet" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="kosten" name="Kosten" fill="#f87171" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Netto winst lijn */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Netto winst trend</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={grafiekData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="naam" tick={{ fontSize: 12 }} />
                          <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={euroFormatter} />
                          <Line
                            type="monotone"
                            dataKey="winst"
                            name="Netto winst"
                            stroke="#22c55e"
                            strokeWidth={2}
                            dot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabel uitsplitsing */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Uitsplitsing per {wvPeriode}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Periode</TableHead>
                          <TableHead className="text-right">Omzet</TableHead>
                          <TableHead className="text-right">Kosten</TableHead>
                          <TableHead className="text-right">Winst</TableHead>
                          <TableHead className="text-right">Marge</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tabelData.map((rij) => {
                          const marge = rij.omzet > 0 ? (rij.winst / rij.omzet) * 100 : 0;
                          return (
                            <TableRow key={rij.naam}>
                              <TableCell className="font-medium">{rij.naam}</TableCell>
                              <TableCell className="text-right text-indigo-700">{formatBedrag(rij.omzet)}</TableCell>
                              <TableCell className="text-right text-red-600">{formatBedrag(rij.kosten)}</TableCell>
                              <TableCell className={`text-right font-semibold ${rij.winst >= 0 ? "text-green-700" : "text-red-700"}`}>
                                {formatBedrag(rij.winst)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant={marge >= 30 ? "success" : marge >= 0 ? "warning" : "danger"}>
                                  {marge.toFixed(1)}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Facturen Status ── */}
            {actieveTab === "factuurstatus" && (
              <div className="space-y-6">
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadCsv(
                        Object.entries(statusGroepen).map(([status, data]) => ({
                          Status: STATUS_LABELS[status] ?? status,
                          Aantal: data.aantal,
                          Totaal: data.totaal,
                        })),
                        "facturen-status.xlsx"
                      )
                    }
                  >
                    <FileDown className="h-4 w-4" />
                    Exporteer Excel
                  </Button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Pie chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Verdeling per status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={3}
                              dataKey="value"
                              label={({ name, percent }: { name?: string; percent?: number }) =>
                                `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                              }
                              labelLine={false}
                            >
                              {pieData.map((entry, index) => (
                                <Cell
                                  key={index}
                                  fill={PIE_KLEUREN[entry.status] ?? "#94a3b8"}
                                />
                              ))}
                            </Pie>
                            <Tooltip formatter={euroFormatter} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Openstaande bedragen per status */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Bedragen per status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">Aantal</TableHead>
                            <TableHead className="text-right">Totaal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(statusGroepen).map(([status, data]) => (
                            <TableRow key={status}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: PIE_KLEUREN[status] ?? "#94a3b8" }}
                                  />
                                  {STATUS_LABELS[status] ?? status}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">{data.aantal}</TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatBedrag(data.totaal)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                {/* Aging rapport */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Openstaande debiteuren (aging rapport)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-medium text-amber-700">0 – 30 dagen</p>
                        <p className="text-2xl font-bold text-amber-900 mt-1">{formatBedrag(aging["0-30"])}</p>
                        <p className="text-xs text-amber-600 mt-1">Licht achterstallig</p>
                      </div>
                      <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                        <p className="text-sm font-medium text-orange-700">31 – 60 dagen</p>
                        <p className="text-2xl font-bold text-orange-900 mt-1">{formatBedrag(aging["31-60"])}</p>
                        <p className="text-xs text-orange-600 mt-1">Actie aanbevolen</p>
                      </div>
                      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                        <p className="text-sm font-medium text-red-700">60+ dagen</p>
                        <p className="text-2xl font-bold text-red-900 mt-1">{formatBedrag(aging["60+"])}</p>
                        <p className="text-xs text-red-600 mt-1">Dringend actie vereist</p>
                      </div>
                    </div>

                    {/* Verlopen facturen tabel */}
                    {verlopen.length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Openstaande facturen</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Factuur</TableHead>
                              <TableHead>Klant</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Vervaldatum</TableHead>
                              <TableHead className="text-right">Bedrag</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {verlopen.slice(0, 10).map((f) => {
                              const vervaldatum = f.vervaldatum ? new Date(f.vervaldatum) : null;
                              const dagenOverdue = vervaldatum
                                ? Math.floor((nu.getTime() - vervaldatum.getTime()) / 86400000)
                                : 0;
                              return (
                                <TableRow key={f.id}>
                                  <TableCell className="font-medium">{getFactuurNummer(f)}</TableCell>
                                  <TableCell className="text-gray-500">{f.klant?.naam ?? "—"}</TableCell>
                                  <TableCell>
                                    <Badge variant={f.status === "VERLOPEN" ? "danger" : "info"}>
                                      {STATUS_LABELS[f.status]}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-gray-500">
                                    {vervaldatum
                                      ? vervaldatum.toLocaleDateString("nl-NL")
                                      : "—"}
                                    {dagenOverdue > 0 && (
                                      <span className="text-xs text-red-500 ml-1">
                                        (+{dagenOverdue}d)
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {formatBedrag(f.totaal)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── BTW-aangifte ── */}
            {actieveTab === "btwAangifte" && (
              <div className="space-y-6">
                {/* Period selector */}
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex flex-wrap gap-3 items-center">
                    <Select value={aangiftePeriode} onValueChange={setAangiftePeriode}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {aangiftePeriodeOpties.map((opt) => (
                          <SelectItem key={opt.waarde} value={opt.waarde}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={() => window.print()}>
                      <Printer className="h-4 w-4 mr-2" />
                      Exporteer als PDF
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadCsv(
                        aangifteRubrieken.map((r) => ({
                          Rubriek: r.nummer,
                          Omschrijving: r.omschrijving,
                          "Bedrag (excl. BTW)": r.bedrag ?? "",
                          "BTW-bedrag": r.btw ?? "",
                        })),
                        "btw-aangifte.xlsx"
                      )
                    }
                  >
                    <FileDown className="h-4 w-4" />
                    Exporteer Excel
                  </Button>
                </div>

                {/* Rubrieken tabel */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      BTW-aangifte voorbereiding — {aangifteIsJaar ? `Heel jaar ${aangifteJaar}` : `${aangifteKwartaal} ${aangifteJaar}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Rubriek</TableHead>
                          <TableHead>Omschrijving</TableHead>
                          <TableHead className="text-right">Bedrag (excl. BTW)</TableHead>
                          <TableHead className="text-right">BTW-bedrag</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {aangifteRubrieken.map((r) => (
                          <TableRow key={r.nummer}>
                            <TableCell className="font-bold text-indigo-700">{r.nummer}</TableCell>
                            <TableCell>{r.omschrijving}</TableCell>
                            <TableCell className="text-right">
                              {r.bedrag !== null ? formatBedrag(r.bedrag) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {r.btw !== null ? formatBedrag(r.btw) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Saldo box */}
                <div
                  className={`rounded-xl border-2 p-6 text-center ${
                    totaalBtwVerschuldigd > 0
                      ? "border-red-300 bg-red-50"
                      : "border-green-300 bg-green-50"
                  }`}
                >
                  <p className={`text-lg font-semibold ${totaalBtwVerschuldigd > 0 ? "text-red-700" : "text-green-700"}`}>
                    {totaalBtwVerschuldigd > 0 ? "Te betalen" : "Te vorderen"}
                  </p>
                  <p className={`text-4xl font-bold mt-2 ${totaalBtwVerschuldigd > 0 ? "text-red-900" : "text-green-900"}`}>
                    {formatBedrag(Math.abs(totaalBtwVerschuldigd))}
                  </p>
                  <p className={`text-sm mt-2 ${totaalBtwVerschuldigd > 0 ? "text-red-600" : "text-green-600"}`}>
                    {totaalBtwVerschuldigd > 0
                      ? "Dit bedrag dient u af te dragen aan de Belastingdienst"
                      : "Dit bedrag kunt u terugvragen van de Belastingdienst"}
                  </p>
                </div>

                {/* Note */}
                <p className="text-sm text-gray-500 italic">
                  Dit overzicht is ter voorbereiding op uw BTW-aangifte via het Mijn Belastingdienst Zakelijk portaal.
                </p>
              </div>
            )}

            {/* ── Balans ── */}
            {actieveTab === "balans" && (
              <div className="space-y-6">
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadCsv(
                        [
                          { Post: "Debiteuren (openstaande facturen)", Bedrag: debiteuren, Categorie: "Activa" },
                          { Post: "Liquide middelen (schatting)", Bedrag: liquideMiddelen, Categorie: "Activa" },
                          { Post: "Vaste activa (boekwaarde)", Bedrag: activaVasteActiva, Categorie: "Activa" },
                          { Post: "BTW-schuld (huidig kwartaal)", Bedrag: btwSchuld, Categorie: "Passiva" },
                          { Post: "Crediteuren (afgelopen 30 dagen)", Bedrag: crediteuren, Categorie: "Passiva" },
                          { Post: "Eigen vermogen", Bedrag: eigenVermogen, Categorie: "Passiva" },
                        ],
                        "balans.xlsx"
                      )
                    }
                  >
                    <FileDown className="h-4 w-4" />
                    Exporteer Excel
                  </Button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Activa */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-bold text-gray-800">Activa</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Post</TableHead>
                            <TableHead className="text-right">Bedrag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Debiteuren (openstaande facturen)</TableCell>
                            <TableCell className="text-right">{formatBedrag(debiteuren)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Liquide middelen (schatting)</TableCell>
                            <TableCell className="text-right">{formatBedrag(liquideMiddelen)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Vaste activa (boekwaarde)</TableCell>
                            <TableCell className="text-right">{formatBedrag(activaVasteActiva)}</TableCell>
                          </TableRow>
                          <TableRow className="border-t-2 border-gray-300 font-bold bg-gray-50">
                            <TableCell className="font-bold">Totaal activa</TableCell>
                            <TableCell className="text-right font-bold">{formatBedrag(totalActiva)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Passiva */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-bold text-gray-800">Passiva</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Post</TableHead>
                            <TableHead className="text-right">Bedrag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">BTW-schuld (huidig kwartaal)</TableCell>
                            <TableCell className="text-right">{formatBedrag(btwSchuld)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Crediteuren (afgelopen 30 dagen)</TableCell>
                            <TableCell className="text-right">{formatBedrag(crediteuren)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-indigo-700">Eigen vermogen</TableCell>
                            <TableCell className={`text-right font-semibold ${eigenVermogen >= 0 ? "text-green-700" : "text-red-700"}`}>
                              {formatBedrag(eigenVermogen)}
                            </TableCell>
                          </TableRow>
                          <TableRow className="border-t-2 border-gray-300 font-bold bg-gray-50">
                            <TableCell className="font-bold">Totaal passiva</TableCell>
                            <TableCell className="text-right font-bold">{formatBedrag(totalActiva)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                {/* Footer */}
                <div className="text-center text-sm text-gray-500 border-t pt-4">
                  <p className="font-medium">Balans per {nu.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}</p>
                  <p className="italic mt-1">
                    Dit is een vereenvoudigde balans. Raadpleeg uw accountant voor een volledige jaarrekening.
                  </p>
                </div>
              </div>
            )}

            {/* ── Debiteurenanalyse ── */}
            {actieveTab === "debiteuren" && (
              <div className="space-y-6">
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadCsv(
                        gesorteerdeDebiteuren.map((f) => ({
                          Factuurnummer: getFactuurNummer(f),
                          Klant: f.klant?.naam ?? "—",
                          Datum: getFactuurDatum(f) ?? "—",
                          Vervaldatum: f.vervaldatumDate ? f.vervaldatumDate.toLocaleDateString("nl-NL") : "—",
                          Totaal: f.totaal,
                          "Dagen te laat": f.dagenTeLaat,
                        })),
                        "debiteuren.xlsx"
                      )
                    }
                  >
                    <FileDown className="h-4 w-4" />
                    Exporteer Excel
                  </Button>
                </div>
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {agingBucketData.map((bucket) => (
                    <div key={bucket.label} className={`rounded-lg border p-4 ${bucket.kleur}`}>
                      <p className={`text-xs font-medium ${bucket.tekstKleur}`}>{bucket.label}</p>
                      <p className={`text-xl font-bold mt-1 ${bucket.tekstKleur}`}>{formatBedrag(bucket.totaal)}</p>
                      <p className={`text-xs mt-1 ${bucket.tekstKleur}`}>{bucket.aantal} factuur{bucket.aantal !== 1 ? "en" : ""}</p>
                    </div>
                  ))}
                </div>

                {/* Table */}
                {gesorteerdeDebiteuren.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-gray-400">
                      Geen openstaande facturen gevonden.
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Openstaande facturen — gesorteerd op achterstand</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nummer</TableHead>
                            <TableHead>Klant</TableHead>
                            <TableHead>Datum</TableHead>
                            <TableHead>Vervaldatum</TableHead>
                            <TableHead className="text-right">Totaal</TableHead>
                            <TableHead className="text-right">Dagen te laat</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {gesorteerdeDebiteuren.map((f) => (
                            <TableRow key={f.id} className={rijKleurVoorDagen(f.dagenTeLaat)}>
                              <TableCell className="font-medium">{getFactuurNummer(f)}</TableCell>
                              <TableCell>{f.klant?.naam ?? "—"}</TableCell>
                              <TableCell className="text-gray-500">
                                {getFactuurDatum(f) ? formatDatum(getFactuurDatum(f)!) : "—"}
                              </TableCell>
                              <TableCell className="text-gray-500">
                                {f.vervaldatumDate ? formatDatum(f.vervaldatumDate) : "—"}
                              </TableCell>
                              <TableCell className="text-right font-semibold">{formatBedrag(f.totaal)}</TableCell>
                              <TableCell className="text-right">
                                {f.dagenTeLaat > 0 ? (
                                  <Badge variant={f.dagenTeLaat > 90 ? "danger" : f.dagenTeLaat > 60 ? "danger" : f.dagenTeLaat > 30 ? "warning" : "warning"}>
                                    {f.dagenTeLaat}d
                                  </Badge>
                                ) : (
                                  <Badge variant="success">Op tijd</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                            <TableCell colSpan={4} className="font-bold">Totaal openstaand</TableCell>
                            <TableCell className="text-right font-bold">{formatBedrag(totaalOpenstaand)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* ── Cashflow ── */}
            {actieveTab === "cashflow" && (
              <div className="space-y-6">
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadCsv(
                        cashflowGrafiekData.map((r) => ({
                          Maand: r.naam,
                          "Verwacht inkomen": r.inkomen,
                          "Verwachte uitgaven": r.uitgaven,
                          "Netto cashflow": r.netto,
                        })),
                        "cashflow.xlsx"
                      )
                    }
                  >
                    <FileDown className="h-4 w-4" />
                    Exporteer Excel
                  </Button>
                </div>
                {/* Bar chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Verwachte cashflow — komende 7 maanden</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={cashflowGrafiekData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="naam" tick={{ fontSize: 12 }} />
                          <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={euroFormatter} />
                          <Legend />
                          <Bar dataKey="inkomen" name="Verwacht inkomen" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="uitgaven" name="Verwachte uitgaven" fill="#f87171" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabel */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Cashflow overzicht per maand</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Maand</TableHead>
                          <TableHead className="text-right">Verwacht inkomen</TableHead>
                          <TableHead className="text-right">Verwachte uitgaven</TableHead>
                          <TableHead className="text-right">Netto cashflow</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cashflowGrafiekData.map((rij) => (
                          <TableRow key={rij.naam}>
                            <TableCell className="font-medium">{rij.naam}</TableCell>
                            <TableCell className="text-right text-indigo-700">{formatBedrag(rij.inkomen)}</TableCell>
                            <TableCell className="text-right text-red-600">{formatBedrag(rij.uitgaven)}</TableCell>
                            <TableCell className={`text-right font-semibold ${rij.netto >= 0 ? "text-green-700" : "text-red-700"}`}>
                              {formatBedrag(rij.netto)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                          <TableCell className="font-bold">Totaal</TableCell>
                          <TableCell className="text-right font-bold text-indigo-700">
                            {formatBedrag(cashflowGrafiekData.reduce((s, r) => s + r.inkomen, 0))}
                          </TableCell>
                          <TableCell className="text-right font-bold text-red-600">
                            {formatBedrag(cashflowGrafiekData.reduce((s, r) => s + r.uitgaven, 0))}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${cashflowGrafiekData.reduce((s, r) => s + r.netto, 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                            {formatBedrag(cashflowGrafiekData.reduce((s, r) => s + r.netto, 0))}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Note */}
                <p className="text-sm text-gray-500 italic">
                  Gebaseerd op openstaande facturen en gemiddelde uitgaven van de afgelopen 3 maanden.
                </p>
              </div>
            )}

            {/* ── Inkomensschatting ── */}
            {actieveTab === "inkomensschatting" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Inkomensschatting ZZP/Freelancer {new Date().getFullYear()}
                  </CardTitle>
                  <CardDescription>
                    Voer je verwachte omzet en kosten in voor een ruwe netto inkomenschatting. Geen belastingadvies.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <InkomensSchatting />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

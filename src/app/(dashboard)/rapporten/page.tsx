"use client";

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
import { Printer, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatBedrag } from "@/lib/utils";

type Tab = "btw" | "winstverlies" | "factuurstatus";

interface Factuur {
  id: string;
  factuurNummer: string;
  status: string;
  totaal: number;
  vervaldatum?: string;
  verzondDatum?: string;
  aangemaakt: string;
  klant?: { naam: string } | null;
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
  btwPercentage: number;
  omschrijving: string;
}

const TAB_LABELS: Record<Tab, string> = {
  btw: "BTW Overzicht",
  winstverlies: "Winst & Verlies",
  factuurstatus: "Facturen Status",
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

  const haalDataOp = useCallback(async () => {
    setLaden(true);
    try {
      const [fRes, iRes, uRes] = await Promise.all([
        fetch("/api/facturen"),
        fetch("/api/inkomen"),
        fetch("/api/uitgaven"),
      ]);
      const [fData, iData, uData] = await Promise.all([
        fRes.json(),
        iRes.json(),
        uRes.json(),
      ]);
      setFacturen(Array.isArray(fData) ? fData : fData.facturen ?? []);
      setInkomens(Array.isArray(iData) ? iData : iData.inkomens ?? []);
      setUitgaven(Array.isArray(uData) ? uData : uData.uitgaven ?? []);
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

  const wvGekwartaald = KWARTALEN.map((kw, qi) => {
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
    const vervaldatum = f.vervaldatum ? new Date(f.vervaldatum) : new Date(f.aangemaakt);
    const dagenOverdue = Math.floor((nu.getTime() - vervaldatum.getTime()) / 86400000);
    if (dagenOverdue <= 0) return;
    if (dagenOverdue <= 30) aging["0-30"] += f.totaal;
    else if (dagenOverdue <= 60) aging["31-60"] += f.totaal;
    else aging["60+"] += f.totaal;
  });

  const jaarOpties = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

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
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
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

        {/* ── BTW Overzicht ── */}
        {actieveTab === "btw" && (
          <div className="space-y-6">
            {/* Selectors */}
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
                              <TableCell className="font-medium">{f.factuurNummer}</TableCell>
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
      </div>
    </div>
  );
}

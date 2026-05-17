import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
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
} from "recharts";
import { TrendingUp, AlertCircle, TrendingDown, Activity, ArrowRight, Loader2, TriangleAlert, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/layout/header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBedrag, formatDatum, statusKleur, statusLabel } from "@/lib/utils";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { nl } from "date-fns/locale";

interface Factuur {
  id: string;
  nummer: string;
  datum: string;
  vervaldatum: string;
  totaal: number;
  subtotaal: number;
  btwBedrag: number;
  status: string;
  klant: { id: string; naam: string; bedrijf?: string | null };
}

interface Inkomen {
  id: string;
  bedrag: number;
  datum: string;
}

interface Categorie {
  id: string;
  naam: string;
  kleur?: string | null;
}

interface Uitgave {
  id: string;
  bedrag: number;
  datum: string;
  categorieId?: string | null;
  categorie?: Categorie | null;
}

interface MaandData {
  maand: string;
  omzet: number;
}

interface Instellingen {
  korActief?: boolean;
  korWaarschuwing?: boolean;
  korDrempel?: number;
}

function TrendBadge({ trend }: { trend: number }) {
  const afgerond = Math.round(trend * 10) / 10;
  if (afgerond === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        = 0%
      </span>
    );
  }
  if (afgerond > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        ▲ {afgerond.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      ▼ {Math.abs(afgerond).toFixed(1)}%
    </span>
  );
}

function StatCard({
  titel,
  waarde,
  icon: Icon,
  kleur,
  sub,
  laden,
  trend,
}: {
  titel: string;
  waarde: string;
  icon: React.ElementType;
  kleur: string;
  sub?: string;
  laden: boolean;
  trend?: number;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500">{titel}</p>
            {laden ? (
              <div className="flex items-center gap-2 mt-2">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <span className="text-gray-400 text-sm">Laden...</span>
              </div>
            ) : (
              <p className="text-2xl font-bold text-gray-900 mt-1">{waarde}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {sub && !laden && <p className="text-xs text-gray-400">{sub}</p>}
              {trend !== undefined && !laden && <TrendBadge trend={trend} />}
            </div>
          </div>
          <div className={`flex items-center justify-center h-11 w-11 rounded-xl ${kleur}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Stable date constants computed once per module load (refresh resets them, which is fine)
const nu = new Date();
const beginMaand = startOfMonth(nu);
const eindeMaand = endOfMonth(nu);
const beginVorigeMaand = startOfMonth(subMonths(nu, 1));
const eindeVorigeMaand = endOfMonth(subMonths(nu, 1));
const jaarBegin = new Date(nu.getFullYear(), 0, 1);
const jaarEinde = new Date(nu.getFullYear(), 11, 31, 23, 59, 59);

const PIE_KLEUREN = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

export default function Dashboard() {
  const navigate = useNavigate();
  const [facturen, setFacturen] = useState<Factuur[]>([]);
  const [inkomen, setInkomen] = useState<Inkomen[]>([]);
  const [uitgaven, setUitgaven] = useState<Uitgave[]>([]);
  const [instellingen, setInstellingen] = useState<Instellingen>({});
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    async function laadData() {
      try {
        const [facturenData, inkomenData, uitgavenData, instellingenData] = await Promise.all([
          window.api.facturen.list(),
          window.api.inkomen.list(),
          window.api.uitgaven.list(),
          window.api.instellingen.get(),
        ]);
        setFacturen(Array.isArray(facturenData) ? facturenData as Factuur[] : []);
        setInkomen(Array.isArray(inkomenData) ? inkomenData as Inkomen[] : []);
        setUitgaven(Array.isArray(uitgavenData) ? uitgavenData as Uitgave[] : []);
        setInstellingen(instellingenData as Instellingen ?? {});
      } catch (e) {
        console.error("Fout bij laden dashboard:", e);
      } finally {
        setLaden(false);
      }
    }
    laadData();
  }, []);

  const omzetDezeMaand = useMemo(
    () =>
      facturen
        .filter((f) => {
          const d = new Date(f.datum);
          return (
            (f.status === "BETAALD" || f.status === "VERZONDEN") &&
            d >= beginMaand &&
            d <= eindeMaand
          );
        })
        .reduce((s, f) => s + f.totaal, 0),
    [facturen]
  );

  const omzetVorigeMaand = useMemo(
    () =>
      facturen
        .filter((f) => {
          const d = new Date(f.datum);
          return (
            (f.status === "BETAALD" || f.status === "VERZONDEN") &&
            d >= beginVorigeMaand &&
            d <= eindeVorigeMaand
          );
        })
        .reduce((s, f) => s + f.totaal, 0),
    [facturen]
  );

  const trendOmzet = useMemo(
    () => ((omzetDezeMaand - omzetVorigeMaand) / (omzetVorigeMaand || 1)) * 100,
    [omzetDezeMaand, omzetVorigeMaand]
  );

  const openstaand = useMemo(
    () =>
      facturen
        .filter((f) => f.status === "VERZONDEN" || f.status === "VERLOPEN")
        .reduce((s, f) => s + f.totaal, 0),
    [facturen]
  );

  const uitgavenDezeMaand = useMemo(
    () =>
      uitgaven
        .filter((u) => {
          const d = new Date(u.datum);
          return d >= beginMaand && d <= eindeMaand;
        })
        .reduce((s, u) => s + u.bedrag, 0),
    [uitgaven]
  );

  const uitgavenVorigeMaand = useMemo(
    () =>
      uitgaven
        .filter((u) => {
          const d = new Date(u.datum);
          return d >= beginVorigeMaand && d <= eindeVorigeMaand;
        })
        .reduce((s, u) => s + u.bedrag, 0),
    [uitgaven]
  );

  const trendUitgaven = useMemo(
    () => ((uitgavenDezeMaand - uitgavenVorigeMaand) / (uitgavenVorigeMaand || 1)) * 100,
    [uitgavenDezeMaand, uitgavenVorigeMaand]
  );

  const nettoResultaat = useMemo(
    () => omzetDezeMaand - uitgavenDezeMaand,
    [omzetDezeMaand, uitgavenDezeMaand]
  );

  // Uitgaven per categorie (deze maand)
  const categorieData = useMemo(() => {
    const groepen = uitgaven
      .filter((u) => {
        const d = new Date(u.datum);
        return d >= beginMaand && d <= eindeMaand;
      })
      .reduce<Record<string, { naam: string; bedrag: number; kleur?: string | null }>>((acc, u) => {
        const catId = u.categorieId ?? "__geen__";
        const naam = u.categorie?.naam ?? "Zonder categorie";
        const kleur = u.categorie?.kleur ?? null;
        if (!acc[catId]) {
          acc[catId] = { naam, bedrag: 0, kleur };
        }
        acc[catId].bedrag += u.bedrag;
        return acc;
      }, {});
    return Object.values(groepen).filter((g) => g.bedrag > 0);
  }, [uitgaven]);

  const maandGrafiek = useMemo<MaandData[]>(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const maand = subMonths(nu, 5 - i);
        const begin = startOfMonth(maand);
        const einde = endOfMonth(maand);
        const omzet = facturen
          .filter((f) => {
            const d = new Date(f.datum);
            return f.status === "BETAALD" && d >= begin && d <= einde;
          })
          .reduce((s, f) => s + f.totaal, 0);
        return {
          maand: format(maand, "MMM", { locale: nl }),
          omzet,
        };
      }),
    [facturen]
  );

  // KOR drempel berekening
  const korDrempel = instellingen.korDrempel ?? 20000;

  const jaaromzet = useMemo(
    () =>
      facturen
        .filter((f) => {
          const d = new Date(f.datum);
          return (f.status === "BETAALD" || f.status === "VERZONDEN") && d >= jaarBegin && d <= jaarEinde;
        })
        .reduce((s, f) => s + f.subtotaal, 0),
    [facturen]
  );

  const korPercentage = useMemo(
    () => (korDrempel > 0 ? (jaaromzet / korDrempel) * 100 : 0),
    [jaaromzet, korDrempel]
  );

  const toonKorWaarschuwing = instellingen.korActief && instellingen.korWaarschuwing && korPercentage >= 80;

  const recenteFacturen = useMemo(
    () =>
      [...facturen]
        .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
        .slice(0, 5),
    [facturen]
  );

  const aankomendBetalingen = useMemo(
    () =>
      facturen
        .filter((f) => f.status === "VERZONDEN")
        .sort(
          (a, b) =>
            new Date(a.vervaldatum).getTime() - new Date(b.vervaldatum).getTime()
        )
        .slice(0, 5),
    [facturen]
  );

  return (
    <div>
      <Header
        titel="Dashboard"
        subtitel={`Overzicht voor ${format(nu, "MMMM yyyy", { locale: nl })}`}
      />

      <div className="p-6 space-y-6">
        {/* KOR drempelwaarschuwing */}
        {toonKorWaarschuwing && !laden && (
          <div
            className={`flex items-start gap-3 rounded-xl border px-5 py-4 ${
              korPercentage > 100
                ? "bg-red-50 border-red-300 text-red-800"
                : korPercentage >= 90
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
          >
            <TriangleAlert className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">
                {korPercentage > 100
                  ? "Je jaaromzet heeft de KOR-drempel overschreden!"
                  : korPercentage >= 90
                  ? `Waarschuwing: je jaaromzet is bijna €${korDrempel.toLocaleString("nl-NL")} (KOR-grens)`
                  : `Let op: je omzet nadert de KOR-drempel van €${korDrempel.toLocaleString("nl-NL")}`}
              </p>
              <p className="text-sm mt-0.5">
                Huidige jaaromzet: <span className="font-semibold">{formatBedrag(jaaromzet)}</span>
                {" "}({korPercentage.toFixed(1)}% van de drempel)
              </p>
            </div>
          </div>
        )}

        {!laden && facturen.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50 p-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
              <Building2 className="h-8 w-8 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Welkom bij Streamline Facturatie</h2>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              Begin met het aanmaken van je eerste klant en factuur. Alle financiële statistieken worden hier weergegeven zodra je gegevens hebt.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={() => navigate('/klanten')}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:border-indigo-300 hover:text-indigo-700 transition-colors font-medium text-sm"
              >
                Klant aanmaken →
              </button>
              <button
                onClick={() => navigate('/facturen/nieuw')}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium text-sm"
              >
                Eerste factuur aanmaken →
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            titel="Omzet deze maand"
            waarde={formatBedrag(omzetDezeMaand)}
            icon={TrendingUp}
            kleur="bg-indigo-100 text-indigo-700"
            laden={laden}
            trend={trendOmzet}
          />
          <StatCard
            titel="Openstaand"
            waarde={formatBedrag(openstaand)}
            icon={AlertCircle}
            kleur="bg-blue-100 text-blue-700"
            sub={`${facturen.filter((f) => f.status === "VERZONDEN" || f.status === "VERLOPEN").length} facturen`}
            laden={laden}
          />
          <StatCard
            titel="Uitgaven deze maand"
            waarde={formatBedrag(uitgavenDezeMaand)}
            icon={TrendingDown}
            kleur="bg-red-100 text-red-700"
            laden={laden}
            trend={trendUitgaven}
          />
          <StatCard
            titel="Netto resultaat"
            waarde={formatBedrag(nettoResultaat)}
            icon={Activity}
            kleur={nettoResultaat >= 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}
            laden={laden}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Omzet per maand</CardTitle>
              <CardDescription>Betaalde facturen — afgelopen 6 maanden</CardDescription>
            </CardHeader>
            <CardContent>
              {laden ? (
                <div className="flex items-center justify-center h-56">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={maandGrafiek} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="maand"
                      tick={{ fontSize: 12, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value) => [formatBedrag(Number(value)), "Omzet"]}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "13px",
                      }}
                    />
                    <Bar dataKey="omzet" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Aankomende betalingen</CardTitle>
                <Link
                  to="/facturen?status=VERZONDEN"
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                >
                  Alles <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {laden ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                </div>
              ) : aankomendBetalingen.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  Geen openstaande betalingen
                </p>
              ) : (
                aankomendBetalingen.map((f) => {
                  const verloopt = new Date(f.vervaldatum) < nu;
                  return (
                    <Link
                      key={f.id}
                      to={`/facturen/${f.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {f.klant.bedrijf ?? f.klant.naam}
                        </p>
                        <p className="text-xs text-gray-400">
                          {verloopt ? (
                            <span className="text-red-500">Verlopen {formatDatum(f.vervaldatum)}</span>
                          ) : (
                            <>Vervalt {formatDatum(f.vervaldatum)}</>
                          )}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 ml-3 shrink-0">
                        {formatBedrag(f.totaal)}
                      </span>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {categorieData.length > 0 && !laden && (
          <Card>
            <CardHeader>
              <CardTitle>Uitgaven per categorie</CardTitle>
              <CardDescription>Verdeling uitgaven deze maand</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={categorieData}
                    dataKey="bedrag"
                    nameKey="naam"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ naam, percent }) =>
                      `${naam} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {categorieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.kleur ?? PIE_KLEUREN[index % PIE_KLEUREN.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatBedrag(Number(value)), "Bedrag"]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      fontSize: "13px",
                    }}
                  />
                  <Legend
                    formatter={(value) => (
                      <span style={{ fontSize: "13px", color: "#475569" }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recente facturen</CardTitle>
                <CardDescription>Laatste 5 facturen</CardDescription>
              </div>
              <Link
                to="/facturen"
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
              >
                Alle facturen <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {laden ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
              </div>
            ) : recenteFacturen.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">Nog geen facturen</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nummer</TableHead>
                    <TableHead>Klant</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Vervaldatum</TableHead>
                    <TableHead className="text-right">Totaal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recenteFacturen.map((f) => (
                    <TableRow
                      key={f.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/facturen/${f.id}`)}
                    >
                      <TableCell className="font-mono text-sm font-medium text-indigo-700">
                        {f.nummer}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{f.klant.naam}</p>
                          {f.klant.bedrijf && (
                            <p className="text-xs text-gray-400">{f.klant.bedrijf}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-500">{formatDatum(f.datum)}</TableCell>
                      <TableCell className="text-gray-500">{formatDatum(f.vervaldatum)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatBedrag(f.totaal)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusKleur(f.status)}`}
                        >
                          {statusLabel(f.status)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
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
} from "recharts";
import { TrendingUp, AlertCircle, TrendingDown, Activity, ArrowRight, Loader2 } from "lucide-react";
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

interface Uitgave {
  id: string;
  bedrag: number;
  datum: string;
}

interface MaandData {
  maand: string;
  omzet: number;
}

function StatCard({
  titel,
  waarde,
  icon: Icon,
  kleur,
  sub,
  laden,
}: {
  titel: string;
  waarde: string;
  icon: React.ElementType;
  kleur: string;
  sub?: string;
  laden: boolean;
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
            {sub && !laden && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
          </div>
          <div className={`flex items-center justify-center h-11 w-11 rounded-xl ${kleur}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [facturen, setFacturen] = useState<Factuur[]>([]);
  const [inkomen, setInkomen] = useState<Inkomen[]>([]);
  const [uitgaven, setUitgaven] = useState<Uitgave[]>([]);
  const [laden, setLaden] = useState(true);

  useEffect(() => {
    async function laadData() {
      try {
        const [facturenData, inkomenData, uitgavenData] = await Promise.all([
          window.api.facturen.list(),
          window.api.inkomen.list(),
          window.api.uitgaven.list(),
        ]);
        setFacturen(Array.isArray(facturenData) ? facturenData as Factuur[] : []);
        setInkomen(Array.isArray(inkomenData) ? inkomenData as Inkomen[] : []);
        setUitgaven(Array.isArray(uitgavenData) ? uitgavenData as Uitgave[] : []);
      } catch (e) {
        console.error("Fout bij laden dashboard:", e);
      } finally {
        setLaden(false);
      }
    }
    laadData();
  }, []);

  const nu = new Date();
  const beginMaand = startOfMonth(nu);
  const eindeMaand = endOfMonth(nu);

  const omzetDezeMaand = facturen
    .filter((f) => {
      const d = new Date(f.datum);
      return (
        (f.status === "BETAALD" || f.status === "VERZONDEN") &&
        d >= beginMaand &&
        d <= eindeMaand
      );
    })
    .reduce((s, f) => s + f.totaal, 0);

  const openstaand = facturen
    .filter((f) => f.status === "VERZONDEN" || f.status === "VERLOPEN")
    .reduce((s, f) => s + f.totaal, 0);

  const uitgavenDezeMaand = uitgaven
    .filter((u) => {
      const d = new Date(u.datum);
      return d >= beginMaand && d <= eindeMaand;
    })
    .reduce((s, u) => s + u.bedrag, 0);

  const nettoResultaat = omzetDezeMaand - uitgavenDezeMaand;

  const maandGrafiek: MaandData[] = Array.from({ length: 6 }, (_, i) => {
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
  });

  const recenteFacturen = [...facturen]
    .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
    .slice(0, 5);

  const aankomendBetalingen = facturen
    .filter((f) => f.status === "VERZONDEN")
    .sort(
      (a, b) =>
        new Date(a.vervaldatum).getTime() - new Date(b.vervaldatum).getTime()
    )
    .slice(0, 5);

  return (
    <div>
      <Header
        titel="Dashboard"
        subtitel={`Overzicht voor ${format(nu, "MMMM yyyy", { locale: nl })}`}
      />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            titel="Omzet deze maand"
            waarde={formatBedrag(omzetDezeMaand)}
            icon={TrendingUp}
            kleur="bg-indigo-100 text-indigo-700"
            laden={laden}
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

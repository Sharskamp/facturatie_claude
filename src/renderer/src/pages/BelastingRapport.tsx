import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, TrendingDown, Calculator, Clock, Car, Wallet, Download, CheckCircle, XCircle } from "lucide-react";
import { formatBedrag } from "@/lib/utils";

interface BtwKwartaal {
  kwartaal: number;
  btwOmzet: number;
  btwInkoop: number;
  saldo: number;
}

interface KostenCategorie {
  categorie: string;
  bedrag: number;
  btw: number;
}

interface Jaaroverzicht {
  jaar: number;
  omzet: number;
  btwOmzet: number;
  kosten: number;
  btwInkoop: number;
  afschrijvingen: number;
  kmVergoeding: number;
  winst: number;
  btwTeBetalen: number;
  kiaWaardigeInvesteringen: number;
  kiaAftrek: number;
  urenTotaal: number;
  urencriteriumGehaald: boolean;
  bijtelling: number;
  priveStortingen: number;
  priveOnttrekkingen: number;
  btwPerKwartaal: BtwKwartaal[];
  kostenPerCategorie: KostenCategorie[];
}

export default function BelastingRapport() {
  const [jaar, setJaar] = useState(new Date().getFullYear());
  const [rapport, setRapport] = useState<Jaaroverzicht | null>(null);
  const [loading, setLoading] = useState(true);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setFout(null);
    window.api.belasting.jaaroverzicht(jaar)
      .then(data => setRapport(data as Jaaroverzicht))
      .catch(e => {
        console.error(e);
        setFout("Kon het rapport niet laden.");
      })
      .finally(() => setLoading(false));
  }, [jaar]);

  function exporteerCsv() {
    if (!rapport) return;
    const regels: string[] = [
      "Belastingrapport " + rapport.jaar,
      "",
      "WINST & VERLIES",
      `Omzet (excl. BTW),${rapport.omzet.toFixed(2)}`,
      `Kosten,${(-rapport.kosten).toFixed(2)}`,
      `Afschrijvingen,${(-rapport.afschrijvingen).toFixed(2)}`,
      `KM-vergoeding,${(-rapport.kmVergoeding).toFixed(2)}`,
      `Bijtelling auto,${rapport.bijtelling.toFixed(2)}`,
      `Winst,${rapport.winst.toFixed(2)}`,
      "",
      "BTW",
      `BTW omzet,${rapport.btwOmzet.toFixed(2)}`,
      `BTW inkoop,${(-rapport.btwInkoop).toFixed(2)}`,
      `BTW te betalen,${rapport.btwTeBetalen.toFixed(2)}`,
      "",
      "KWARTAALOVERZICHT BTW",
      "Kwartaal,BTW omzet,BTW inkoop,Saldo",
      ...rapport.btwPerKwartaal.map(q =>
        `Q${q.kwartaal},${q.btwOmzet.toFixed(2)},${q.btwInkoop.toFixed(2)},${q.saldo.toFixed(2)}`
      ),
      "",
      "KOSTEN PER CATEGORIE",
      "Categorie,Bedrag excl BTW,BTW",
      ...rapport.kostenPerCategorie.map(k =>
        `${k.categorie},${k.bedrag.toFixed(2)},${k.btw.toFixed(2)}`
      ),
      "",
      "AFTREKPOSTEN",
      `KIA-waardige investeringen,${rapport.kiaWaardigeInvesteringen.toFixed(2)}`,
      `KIA aftrek (28%),${rapport.kiaAftrek.toFixed(2)}`,
      `Uren totaal,${rapport.urenTotaal}`,
      `Urencriterium gehaald,${rapport.urencriteriumGehaald ? "Ja" : "Nee"}`,
      "",
      "PRIVEREKENING",
      `Stortingen,${rapport.priveStortingen.toFixed(2)}`,
      `Onttrekkingen,${rapport.priveOnttrekkingen.toFixed(2)}`,
    ];
    const csv = regels.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `belastingrapport_${rapport.jaar}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const jaren = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="flex flex-col h-full">
      <Header title="Belastingrapport" />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Jaar:</label>
            <select
              value={jaar}
              onChange={e => setJaar(Number(e.target.value))}
              className="border rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800"
            >
              {jaren.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          {rapport && (
            <Button variant="outline" size="sm" onClick={exporteerCsv}>
              <Download className="h-4 w-4 mr-2" /> Exporteer CSV
            </Button>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        )}

        {fout && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4">{fout}</div>
        )}

        {rapport && !loading && (
          <>
            {/* Winst & Verlies */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-indigo-500" />
                  Winst & Verlies {jaar}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Omzet (excl. BTW)</p>
                    <p className="text-xl font-bold text-green-600">{formatBedrag(rapport.omzet)}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Kosten</p>
                    <p className="text-xl font-bold text-red-600">-{formatBedrag(rapport.kosten)}</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Afschrijvingen</p>
                    <p className="text-xl font-bold text-orange-600">-{formatBedrag(rapport.afschrijvingen)}</p>
                  </div>
                  <div className={`${rapport.winst >= 0 ? "bg-indigo-50 dark:bg-indigo-900/20" : "bg-red-50 dark:bg-red-900/20"} rounded-lg p-4`}>
                    <p className="text-xs text-gray-500 mb-1">Winst vóór belasting</p>
                    <p className={`text-xl font-bold ${rapport.winst >= 0 ? "text-indigo-600" : "text-red-600"}`}>
                      {formatBedrag(rapport.winst)}
                    </p>
                  </div>
                </div>
                {(rapport.kmVergoeding > 0 || rapport.bijtelling > 0) && (
                  <div className="border-t pt-3 grid grid-cols-2 gap-4 text-sm">
                    {rapport.kmVergoeding > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">KM-vergoeding (aftrek)</span>
                        <span className="text-red-600">-{formatBedrag(rapport.kmVergoeding)}</span>
                      </div>
                    )}
                    {rapport.bijtelling > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Auto bijtelling (optelling)</span>
                        <span className="text-orange-600">+{formatBedrag(rapport.bijtelling)}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* BTW */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  BTW overzicht {jaar}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500">BTW ontvangen (omzet)</p>
                    <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{formatBedrag(rapport.btwOmzet)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">BTW betaald (inkoop)</p>
                    <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">-{formatBedrag(rapport.btwInkoop)}</p>
                  </div>
                  <div className={`${rapport.btwTeBetalen >= 0 ? "text-red-600" : "text-green-600"}`}>
                    <p className="text-xs text-gray-500">Te betalen aan Belastingdienst</p>
                    <p className="text-lg font-semibold">{formatBedrag(rapport.btwTeBetalen)}</p>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">Per kwartaal</p>
                  <div className="grid grid-cols-4 gap-3">
                    {rapport.btwPerKwartaal.map(q => (
                      <div key={q.kwartaal} className="bg-gray-50 dark:bg-gray-800 rounded p-3">
                        <p className="text-xs font-medium text-gray-500">Q{q.kwartaal}</p>
                        <p className="text-xs text-green-600 mt-1">+{formatBedrag(q.btwOmzet)}</p>
                        <p className="text-xs text-red-600">-{formatBedrag(q.btwInkoop)}</p>
                        <p className={`text-sm font-semibold mt-1 ${q.saldo >= 0 ? "text-red-600" : "text-green-600"}`}>
                          {formatBedrag(q.saldo)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Aftrekposten */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* KIA */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingDown className="h-5 w-5 text-purple-500" />
                    KIA (Kleinschaligheidsinvesteringsaftrek)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">KIA-waardige investeringen</span>
                    <span className="font-medium">{formatBedrag(rapport.kiaWaardigeInvesteringen)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">KIA aftrek (28%)</span>
                    <span className="font-semibold text-green-600">-{formatBedrag(rapport.kiaAftrek)}</span>
                  </div>
                  {rapport.kiaWaardigeInvesteringen < 2800 && (
                    <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                      Minimumdrempel: investeringen moeten &gt; €2.800 zijn voor KIA.
                    </p>
                  )}
                  {rapport.kiaWaardigeInvesteringen > 69765 && (
                    <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                      Boven degressiepunt: KIA kan lager uitvallen. Raadpleeg je boekhouder.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Urencriterium */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="h-5 w-5 text-orange-500" />
                    Urencriterium
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Geregistreerde uren {jaar}</span>
                    <span className="font-semibold text-lg">{rapport.urenTotaal} uur</span>
                  </div>
                  <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${rapport.urencriteriumGehaald ? "bg-green-500" : "bg-indigo-500"}`}
                      style={{ width: `${Math.min(100, (rapport.urenTotaal / 1225) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{rapport.urenTotaal} uur</span>
                    <span>1.225 uur</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {rapport.urencriteriumGehaald ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-600 font-medium">Gehaald! Recht op zelfstandigenaftrek</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-400" />
                        <span className="text-sm text-red-500">
                          Nog {1225 - rapport.urenTotaal} uur nodig voor zelfstandigenaftrek
                        </span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Auto bijtelling */}
              {rapport.bijtelling > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Car className="h-5 w-5 text-gray-500" />
                      Auto bijtelling
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Bijtelling (toevoeging winst)</span>
                      <span className="font-semibold text-orange-600">+{formatBedrag(rapport.bijtelling)}</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      Gebaseerd op cataloguswaarde en bijtellingspercentage in Instellingen → Auto.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Privé transacties */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wallet className="h-5 w-5 text-teal-500" />
                    Privé transacties
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Stortingen (privé → zaak)</span>
                    <span className="font-medium text-green-600">+{formatBedrag(rapport.priveStortingen)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Onttrekkingen (zaak → privé)</span>
                    <span className="font-medium text-red-600">-{formatBedrag(rapport.priveOnttrekkingen)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-medium">
                    <span>Netto privévermogen</span>
                    <span className={rapport.priveStortingen - rapport.priveOnttrekkingen >= 0 ? "text-green-600" : "text-red-600"}>
                      {formatBedrag(rapport.priveStortingen - rapport.priveOnttrekkingen)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Kosten per categorie */}
            {rapport.kostenPerCategorie.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Kosten per categorie</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {rapport.kostenPerCategorie
                      .sort((a, b) => b.bedrag - a.bedrag)
                      .map(k => (
                        <div key={k.categorie} className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-0.5">
                              <span className="text-gray-700 dark:text-gray-300">{k.categorie}</span>
                              <span className="font-medium">{formatBedrag(k.bedrag)}</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-400 rounded-full"
                                style={{
                                  width: `${Math.min(100, (k.bedrag / Math.max(...rapport.kostenPerCategorie.map(x => x.bedrag))) * 100)}%`
                                }}
                              />
                            </div>
                          </div>
                          {k.btw > 0 && (
                            <span className="text-xs text-gray-400">BTW: {formatBedrag(k.btw)}</span>
                          )}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

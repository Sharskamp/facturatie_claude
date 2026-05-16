import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  Trash2,
  ArrowLeft,
  Loader2,
  Save,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBedrag, berekenVervaldatum } from "@/lib/utils";

interface Klant {
  id: string;
  naam: string;
  bedrijf?: string | null;
  email?: string | null;
}

interface Regel {
  id: string; // lokale id voor React key
  omschrijving: string;
  aantal: number;
  eenheid: string;
  prijs: number;
  btwPercentage: number;
  kortingPercentage: number;
}

const BTW_TARIEVEN = [0, 9, 21];

const LEEG_REGEL = (): Regel => ({
  id: crypto.randomUUID(),
  omschrijving: "",
  aantal: 1,
  eenheid: "stuks",
  prijs: 0,
  btwPercentage: 21,
  kortingPercentage: 0,
});

function berekenRegelTotalen(
  regel: Regel,
  btwVerlegd: boolean
): { netto: number; btw: number; totaal: number } {
  const bruto = regel.prijs * regel.aantal;
  const korting = (bruto * regel.kortingPercentage) / 100;
  const netto = bruto - korting;
  const btw = btwVerlegd ? 0 : (netto * regel.btwPercentage) / 100;
  return { netto, btw, totaal: netto + btw };
}

function vandaagString() {
  return new Date().toISOString().split("T")[0];
}

function vervaldatumString(dagen = 30) {
  return berekenVervaldatum(dagen).toISOString().split("T")[0];
}

export default function NieuweFactuurPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initieleKlantId = searchParams.get("klantId") ?? "";

  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [klantLaden, setKlantLaden] = useState(true);
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [foutenVelden, setFoutenVelden] = useState<Record<string, string>>({});

  // Formuliervelden
  const [klantId, setKlantId] = useState(initieleKlantId);
  const [datum, setDatum] = useState(vandaagString());
  const [vervaldatum, setVervaldatum] = useState(vervaldatumString(30));
  const [btwVerlegd, setBtwVerlegd] = useState(false);
  const [kortingPercentage, setKortingPercentage] = useState(0);
  const [notities, setNotities] = useState("");
  const [betalingsCondities, setBetalingsCondities] = useState(
    "Betaling binnen 30 dagen na factuurdatum."
  );
  const [regels, setRegels] = useState<Regel[]>([LEEG_REGEL()]);
  const [geavanceerdOpen, setGeavanceerdOpen] = useState(false);
  const [terugkerend, setTerugkerend] = useState(false);
  const [terugkerendInterval, setTerugkerendInterval] = useState<"maandelijks" | "kwartaal" | "jaarlijks">("maandelijks");

  // Totaalkorting
  const [totaalKortingActief, setTotaalKortingActief] = useState(false);
  const [totaalKortingType, setTotaalKortingType] = useState<"percentage" | "vastBedrag">("percentage");
  const [totaalKortingPercentage, setTotaalKortingPercentage] = useState(0);
  const [totaalKortingVastBedrag, setTotaalKortingVastBedrag] = useState(0);

  // Factuurtaal
  const [taal, setTaal] = useState<"nl" | "en">("nl");

  const laadKlanten = useCallback(async () => {
    try {
      const data = await window.api.klanten.list();
      setKlanten(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Fout bij laden klanten:", e);
    } finally {
      setKlantLaden(false);
    }
  }, []);

  useEffect(() => {
    laadKlanten();
  }, [laadKlanten]);

  // Totaalberekeningen
  const totalen = useMemo(() => {
    let subtotaalBruto = 0;
    // Collect netto per BTW-tarief for proportional discount application
    const nettoPerTarief: Record<number, number> = {};

    for (const regel of regels) {
      const { netto } = berekenRegelTotalen(regel, btwVerlegd);
      subtotaalBruto += netto;
      if (!btwVerlegd) {
        nettoPerTarief[regel.btwPercentage] = (nettoPerTarief[regel.btwPercentage] ?? 0) + netto;
      }
    }

    // Totaalkorting berekening
    let kortingBedrag = 0;
    if (totaalKortingActief) {
      if (totaalKortingType === "percentage") {
        kortingBedrag = (subtotaalBruto * totaalKortingPercentage) / 100;
      } else {
        kortingBedrag = Math.min(totaalKortingVastBedrag, subtotaalBruto);
      }
    }

    const subtotaalNaKorting = subtotaalBruto - kortingBedrag;
    const kortingRatio = subtotaalBruto > 0 ? kortingBedrag / subtotaalBruto : 0;

    // BTW berekenen over bedrag NA korting, evenredig per tarief
    const btwPerTarief: Record<string, number> = {};
    let totaalBtw = 0;
    if (!btwVerlegd) {
      for (const [tarief, netto] of Object.entries(nettoPerTarief)) {
        const tariefNum = Number(tarief);
        const nettoNaKorting = netto * (1 - kortingRatio);
        const btw = (nettoNaKorting * tariefNum) / 100;
        if (btw > 0) {
          const key = `${tariefNum}%`;
          btwPerTarief[key] = (btwPerTarief[key] ?? 0) + btw;
          totaalBtw += btw;
        }
      }
    }

    const totaal = subtotaalNaKorting + totaalBtw;

    const totaalKortingResultaat =
      totaalKortingType === "percentage" ? totaalKortingPercentage : 0;
    const totaalKortingBedrag = kortingBedrag;

    return {
      subtotaalBruto,
      kortingBedrag,
      subtotaal: subtotaalNaKorting,
      totaalBtw,
      btwPerTarief,
      totaal,
      totaalKortingResultaat,
      totaalKortingBedrag,
    };
  }, [regels, btwVerlegd, totaalKortingActief, totaalKortingType, totaalKortingPercentage, totaalKortingVastBedrag]);

  function voegRegelToe() {
    setRegels((prev) => [...prev, LEEG_REGEL()]);
  }

  function verwijderRegel(id: string) {
    setRegels((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((r) => r.id !== id);
    });
  }

  function updateRegel<K extends keyof Regel>(id: string, veld: K, waarde: Regel[K]) {
    setRegels((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [veld]: waarde } : r))
    );
  }

  function valideer(): boolean {
    const fouten: Record<string, string> = {};
    if (!klantId) fouten.klantId = "Selecteer een klant";
    regels.forEach((r, i) => {
      if (!r.omschrijving.trim()) fouten[`regel-${i}-omschrijving`] = "Verplicht";
      if (r.prijs < 0) fouten[`regel-${i}-prijs`] = "Ongeldig";
    });
    setFoutenVelden(fouten);
    return Object.keys(fouten).length === 0;
  }

  async function slaOp(status: "CONCEPT" | "VERZONDEN") {
    if (!valideer()) return;
    setOpslaan(true);
    setFout(null);
    try {
      const payload = {
        klantId,
        datum,
        vervaldatum,
        btwVerlegd,
        kortingPercentage,
        notities: notities || null,
        betalingsCondities: betalingsCondities || null,
        regels: regels.map(({ id: _id, ...r }) => r),
        status,
        terugkerend,
        terugkerendInterval: terugkerend ? terugkerendInterval : null,
        totaalKorting: totaalKortingActief
          ? totaalKortingType === "percentage"
            ? totaalKortingPercentage
            : 0
          : 0,
        totaalKortingBedrag: totalen.totaalKortingBedrag,
        taal,
      };
      const factuur = await window.api.facturen.create(payload);

      if (status === "CONCEPT") {
        navigate(`/facturen/${factuur.id}`);
      } else {
        navigate(`/facturen/${factuur.id}?verstuur=1`);
      }
    } catch (e: unknown) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt");
      setOpslaan(false);
    }
  }

  const geselecteerdeKlant = klanten.find((k) => k.id === klantId);

  return (
    <div>
      <Header
        titel="Nieuwe factuur"
        subtitel="Maak een nieuwe factuur aan"
        acties={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/facturen")}
          >
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Button>
        }
      />

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {fout && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {fout}
          </div>
        )}

        {/* Klant en datums */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Klant */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-4">
              <CardTitle>Klantgegevens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Klant *
                </label>
                {klantLaden ? (
                  <div className="flex items-center gap-2 h-9">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-400">Klanten laden...</span>
                  </div>
                ) : (
                  <Select value={klantId} onValueChange={setKlantId}>
                    <SelectTrigger
                      fout={foutenVelden.klantId}
                    >
                      <SelectValue placeholder="Selecteer een klant..." />
                    </SelectTrigger>
                    <SelectContent>
                      {klanten.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.bedrijf ? `${k.bedrijf} (${k.naam})` : k.naam}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {foutenVelden.klantId && (
                  <p className="mt-1 text-xs text-red-600">{foutenVelden.klantId}</p>
                )}
              </div>

              {geselecteerdeKlant && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 space-y-1">
                  <p className="font-medium text-gray-900">
                    {geselecteerdeKlant.bedrijf ?? geselecteerdeKlant.naam}
                  </p>
                  {geselecteerdeKlant.bedrijf && (
                    <p className="text-gray-500">{geselecteerdeKlant.naam}</p>
                  )}
                  {geselecteerdeKlant.email && (
                    <p className="text-gray-500">{geselecteerdeKlant.email}</p>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/klanten/${geselecteerdeKlant.id}`)
                    }
                    className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mt-1"
                  >
                    Klantprofiel bekijken →
                  </button>
                </div>
              )}

              {klanten.length === 0 && !klantLaden && (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
                  <p className="text-sm text-gray-500">Nog geen klanten.</p>
                  <button
                    onClick={() => navigate("/klanten")}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                  >
                    Klant aanmaken →
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Datums en instellingen */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Factuurdetails</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Factuurdatum"
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
              />
              <Input
                label="Vervaldatum"
                type="date"
                value={vervaldatum}
                onChange={(e) => setVervaldatum(e.target.value)}
              />
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="btwVerlegd"
                  checked={btwVerlegd}
                  onChange={(e) => setBtwVerlegd(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor="btwVerlegd"
                  className="text-sm text-gray-700 cursor-pointer"
                >
                  BTW verlegd
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Regelitems */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Factuurregels</CardTitle>
              <Button variant="outline" size="sm" onClick={voegRegelToe}>
                <Plus className="h-4 w-4" />
                Regel toevoegen
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Tabelhoofden (verborgen op mobiel) */}
            <div className="hidden lg:grid lg:grid-cols-[1fr_80px_100px_110px_80px_80px_32px] gap-2 px-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Omschrijving
              </span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                Aantal
              </span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Eenheid
              </span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                Prijs (€)
              </span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                BTW%
              </span>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                Korting%
              </span>
              <span />
            </div>

            {regels.map((regel, index) => {
              const { netto } = berekenRegelTotalen(regel, btwVerlegd);
              return (
                <div
                  key={regel.id}
                  className="grid grid-cols-1 lg:grid-cols-[1fr_80px_100px_110px_80px_80px_32px] gap-2 p-3 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                      Omschrijving
                    </label>
                    <input
                      type="text"
                      value={regel.omschrijving}
                      onChange={(e) =>
                        updateRegel(regel.id, "omschrijving", e.target.value)
                      }
                      placeholder="Omschrijving van de dienst of product"
                      className={`flex h-9 w-full rounded-lg border bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent ${
                        foutenVelden[`regel-${index}-omschrijving`]
                          ? "border-red-400"
                          : "border-gray-300"
                      }`}
                    />
                    {foutenVelden[`regel-${index}-omschrijving`] && (
                      <p className="mt-0.5 text-xs text-red-600">
                        {foutenVelden[`regel-${index}-omschrijving`]}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                      Aantal
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={regel.aantal}
                      onChange={(e) =>
                        updateRegel(regel.id, "aantal", parseFloat(e.target.value) || 0)
                      }
                      className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                      Eenheid
                    </label>
                    <input
                      type="text"
                      value={regel.eenheid}
                      onChange={(e) =>
                        updateRegel(regel.id, "eenheid", e.target.value)
                      }
                      placeholder="stuks"
                      className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                      Prijs (€)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
                        €
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={regel.prijs}
                        onChange={(e) =>
                          updateRegel(
                            regel.id,
                            "prijs",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-2 py-1 text-sm text-gray-900 shadow-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                      BTW%
                    </label>
                    <select
                      value={regel.btwPercentage}
                      onChange={(e) =>
                        updateRegel(
                          regel.id,
                          "btwPercentage",
                          parseInt(e.target.value)
                        )
                      }
                      disabled={btwVerlegd}
                      className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {BTW_TARIEVEN.map((t) => (
                        <option key={t} value={t}>
                          {t}%
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                      Korting%
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={regel.kortingPercentage}
                        onChange={(e) =>
                          updateRegel(
                            regel.id,
                            "kortingPercentage",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-2 pr-6 py-1 text-sm text-gray-900 shadow-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="flex items-end justify-between lg:justify-center gap-2">
                    <span className="lg:hidden text-sm font-semibold text-gray-700">
                      {formatBedrag(netto)}
                    </span>
                    <button
                      type="button"
                      onClick={() => verwijderRegel(regel.id)}
                      disabled={regels.length === 1}
                      className="flex items-center justify-center h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Verwijder regel"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={voegRegelToe}
            >
              <Plus className="h-4 w-4" />
              Regel toevoegen
            </Button>
          </CardContent>
        </Card>

        {/* Totaalkorting & Factuurtaal */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Korting &amp; taal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Factuurtaal */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Factuurtaal
              </label>
              <Select value={taal} onValueChange={(v) => setTaal(v as "nl" | "en")}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nl">Nederlands</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Totaalkorting toggle */}
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Totaalkorting toepassen</p>
                <p className="text-xs text-gray-400">Korting op het totaalbedrag (BTW wordt berekend over het bedrag na korting)</p>
              </div>
              <button
                type="button"
                onClick={() => setTotaalKortingActief(!totaalKortingActief)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  totaalKortingActief ? "bg-indigo-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    totaalKortingActief ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {totaalKortingActief && (
              <div className="space-y-3 pl-1">
                {/* Radio: percentage of vast bedrag */}
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="totaalKortingType"
                      value="percentage"
                      checked={totaalKortingType === "percentage"}
                      onChange={() => setTotaalKortingType("percentage")}
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">Percentage</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="totaalKortingType"
                      value="vastBedrag"
                      checked={totaalKortingType === "vastBedrag"}
                      onChange={() => setTotaalKortingType("vastBedrag")}
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">Vast bedrag</span>
                  </label>
                </div>

                {totaalKortingType === "percentage" ? (
                  <div className="flex items-center gap-3">
                    <div className="relative w-36">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={totaalKortingPercentage}
                        onChange={(e) => setTotaalKortingPercentage(parseFloat(e.target.value) || 0)}
                        className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 pr-7 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">%</span>
                    </div>
                    {totalen.kortingBedrag > 0 && (
                      <span className="text-sm text-green-600 font-medium">
                        = -{new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(totalen.kortingBedrag)}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="relative w-36">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">€</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={totaalKortingVastBedrag}
                        onChange={(e) => setTotaalKortingVastBedrag(parseFloat(e.target.value) || 0)}
                        className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notities en betalingscondities */}
          <Card>
            <CardHeader className="pb-4">
              <button
                onClick={() => setGeavanceerdOpen((v) => !v)}
                className="flex items-center justify-between w-full text-left"
              >
                <CardTitle>Notities &amp; betalingscondities</CardTitle>
                {geavanceerdOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </CardHeader>
            {geavanceerdOpen && (
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notities
                  </label>
                  <Textarea
                    value={notities}
                    onChange={(e) => setNotities(e.target.value)}
                    placeholder="Interne notities, opmerkingen voor de klant..."
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Betalingscondities
                  </label>
                  <Textarea
                    value={betalingsCondities}
                    onChange={(e) => setBetalingsCondities(e.target.value)}
                    placeholder="Bijv. Betaling binnen 30 dagen na factuurdatum..."
                    rows={3}
                  />
                </div>
                {/* Terugkerende factuur */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Terugkerende factuur</p>
                      <p className="text-xs text-gray-400">Automatisch nieuwe factuur aanmaken op basis van interval</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTerugkerend(!terugkerend)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        terugkerend ? "bg-indigo-600" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          terugkerend ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                  {terugkerend && (
                    <Select
                      value={terugkerendInterval}
                      onValueChange={(v) => setTerugkerendInterval(v as typeof terugkerendInterval)}
                    >
                      <SelectTrigger label="Interval">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="maandelijks">Maandelijks</SelectItem>
                        <SelectItem value="kwartaal">Per kwartaal</SelectItem>
                        <SelectItem value="jaarlijks">Jaarlijks</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

              </CardContent>
            )}
          </Card>

          {/* Totaaloverzicht */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Totaaloverzicht</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotaal</span>
                  <span className="text-gray-900">
                    {formatBedrag(totalen.subtotaalBruto)}
                  </span>
                </div>

                {totalen.kortingBedrag > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      {totaalKortingActief && totaalKortingType === "percentage"
                        ? `Totaalkorting (${totaalKortingPercentage}%)`
                        : "Totaalkorting"}
                    </span>
                    <span className="text-green-600">
                      -{formatBedrag(totalen.kortingBedrag)}
                    </span>
                  </div>
                )}

                {totalen.kortingBedrag > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Netto</span>
                    <span className="text-gray-900">
                      {formatBedrag(totalen.subtotaal)}
                    </span>
                  </div>
                )}

                {btwVerlegd ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">BTW (verlegd)</span>
                    <span className="text-gray-400">€ 0,00</span>
                  </div>
                ) : (
                  Object.entries(totalen.btwPerTarief).map(([tarief, bedrag]) => (
                    <div key={tarief} className="flex justify-between text-sm">
                      <span className="text-gray-500">BTW {tarief}</span>
                      <span className="text-gray-900">
                        {formatBedrag(bedrag)}
                      </span>
                    </div>
                  ))
                )}

                <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-gray-900">
                  <span className="font-bold text-gray-900">Totaal</span>
                  <span className="font-bold text-gray-900 text-xl">
                    {formatBedrag(totalen.totaal)}
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <Button
                  className="w-full"
                  onClick={() => slaOp("CONCEPT")}
                  loading={opslaan}
                  variant="outline"
                >
                  <Save className="h-4 w-4" />
                  Opslaan als concept
                </Button>
                <Button
                  className="w-full"
                  onClick={() => slaOp("VERZONDEN")}
                  loading={opslaan}
                >
                  <Send className="h-4 w-4" />
                  Opslaan &amp; versturen
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

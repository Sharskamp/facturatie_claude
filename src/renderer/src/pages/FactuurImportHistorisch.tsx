import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatBedrag } from "@/lib/utils";

interface Klant {
  id: string;
  naam: string;
  bedrijf?: string | null;
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
    id: crypto.randomUUID(),
    omschrijving: "",
    aantal: 1,
    prijs: 0,
    btwPercentage: 21,
    kortingPercentage: 0,
    totaal: 0,
  };
}

export default function FactuurImportHistorischPage() {
  const navigate = useNavigate();
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  // Formuliervelden
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

  // Regels
  const [regels, setRegels] = useState<Regel[]>([nieuwRegel()]);

  // Handmatige bedragen (override)
  const [handSubtotaal, setHandSubtotaal] = useState("");
  const [handBtwBedrag, setHandBtwBedrag] = useState("");
  const [handTotaal, setHandTotaal] = useState("");

  useEffect(() => {
    window.api.klanten.list().then((data: unknown) => {
      setKlanten(Array.isArray(data) ? (data as Klant[]) : []);
    }).catch(() => {});
  }, []);

  const updateRegel = (id: string, veld: keyof Regel, waarde: string | number) => {
    setRegels((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [veld]: waarde };
        updated.totaal = berekenRegelTotaal(updated);
        return updated;
      })
    );
  };

  const voegRegelToe = () => setRegels((prev) => [...prev, nieuwRegel()]);
  const verwijderRegel = (id: string) => setRegels((prev) => prev.filter((r) => r.id !== id));

  const berekendeSubtotaal = regels.reduce((s, r) => {
    const bruto = r.prijs * r.aantal;
    const korting = (bruto * r.kortingPercentage) / 100;
    return s + (bruto - korting);
  }, 0);

  const berekendeBtw = btwVerlegd ? 0 : regels.reduce((s, r) => {
    const bruto = r.prijs * r.aantal;
    const korting = (bruto * r.kortingPercentage) / 100;
    const netto = bruto - korting;
    return s + (netto * r.btwPercentage) / 100;
  }, 0);

  const berekendeTotal = berekendeSubtotaal + berekendeBtw;

  const submitSubtotaal = handmatigBedrag ? parseFloat(handSubtotaal) || berekendeSubtotaal : berekendeSubtotaal;
  const submitBtw = handmatigBedrag ? parseFloat(handBtwBedrag) || berekendeBtw : berekendeBtw;
  const submitTotaal = handmatigBedrag ? parseFloat(handTotaal) || berekendeTotal : berekendeTotal;

  const importeer = async () => {
    if (!nummer.trim()) { setFout("Factuurnummer is verplicht"); return; }
    if (!klantId) { setFout("Selecteer een klant"); return; }
    if (!datum) { setFout("Factuurdatum is verplicht"); return; }
    if (!vervaldatum) { setFout("Vervaldatum is verplicht"); return; }
    if (regels.length === 0) { setFout("Voeg minimaal één regel toe"); return; }

    setLaden(true);
    setFout(null);
    try {
      const result = await (window.api.facturen as any).importeerHistorisch({
        nummer: nummer.trim(),
        klantId,
        datum,
        vervaldatum,
        status,
        subtotaal: submitSubtotaal,
        btwBedrag: submitBtw,
        totaal: submitTotaal,
        notities: notities || undefined,
        betalingsCondities: betalingsCondities || undefined,
        btwVerlegd,
        verzondenOp: verzondenOp || undefined,
        betaaldOp: status === "BETAALD" ? (betaaldOp || datum) : undefined,
        handmatigBedrag,
        regels: regels.map((r) => ({
          omschrijving: r.omschrijving || "(geen omschrijving)",
          aantal: r.aantal,
          prijs: r.prijs,
          btwPercentage: r.btwPercentage,
          kortingPercentage: r.kortingPercentage,
          totaal: r.totaal,
        })),
      });
      setSucces(`Factuur ${result.nummer} succesvol geïmporteerd!`);
      setTimeout(() => navigate(`/facturen/${result.id}`), 2000);
    } catch (e: unknown) {
      setFout(e instanceof Error ? e.message : "Import mislukt");
    } finally {
      setLaden(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Historische factuur importeren"
        subtitel="Voeg eerder verstuurde facturen handmatig toe"
        acties={
          <Button variant="outline" onClick={() => navigate("/facturen")}>
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Button>
        }
      />

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
        {fout && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {fout}
          </div>
        )}
        {succes && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {succes}
          </div>
        )}

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">Let op: historisch importeren</p>
          <p>Deze factuur wordt gemarkeerd als historisch. BTW wordt niet automatisch herberekend als je handmatige bedragen instelt. Gebruik dit voor facturen die al zijn verstuurd en eventueel betaald.</p>
        </div>

        {/* Factuurgegevens */}
        <Card>
          <CardHeader>
            <CardTitle>Factuurgegevens</CardTitle>
            <CardDescription>Basisinformatie van de historische factuur</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Factuurnummer *"
                value={nummer}
                onChange={(e) => setNummer(e.target.value)}
                placeholder="F2023-0001"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Klant *</label>
                <select
                  value={klantId}
                  onChange={(e) => setKlantId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecteer klant...</option>
                  {klanten.map((k) => (
                    <option key={k.id} value={k.id}>{k.bedrijf ?? k.naam}</option>
                  ))}
                </select>
              </div>
              <Input
                label="Factuurdatum *"
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
              />
              <Input
                label="Vervaldatum *"
                type="date"
                value={vervaldatum}
                onChange={(e) => setVervaldatum(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="BETAALD">Betaald</option>
                  <option value="VERZONDEN">Verzonden (onbetaald)</option>
                  <option value="VERLOPEN">Verlopen</option>
                  <option value="CONCEPT">Concept</option>
                  <option value="GEANNULEERD">Geannuleerd</option>
                </select>
              </div>
              <Input
                label="Verzenddatum"
                type="date"
                value={verzondenOp}
                onChange={(e) => setVerzondenOp(e.target.value)}
              />
              {status === "BETAALD" && (
                <Input
                  label="Betaald op"
                  type="date"
                  value={betaaldOp}
                  onChange={(e) => setBetaaldOp(e.target.value)}
                />
              )}
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={btwVerlegd}
                  onChange={(e) => setBtwVerlegd(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 rounded"
                />
                <span className="text-sm text-gray-700">BTW verlegd</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notities</label>
              <textarea
                rows={2}
                value={notities}
                onChange={(e) => setNotities(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Betalingscondities</label>
              <textarea
                rows={2}
                value={betalingsCondities}
                onChange={(e) => setBetalingsCondities(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </CardContent>
        </Card>

        {/* Regelitems */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Factuurregels</CardTitle>
                <CardDescription>Vul de regels in of vereenvoudig met één samenvattingsregel</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={voegRegelToe}>
                <Plus className="h-4 w-4" />
                Regel toevoegen
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {regels.map((regel, idx) => (
                <div key={regel.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Omschrijving</label>}
                    <input
                      type="text"
                      value={regel.omschrijving}
                      onChange={(e) => updateRegel(regel.id, "omschrijving", e.target.value)}
                      placeholder="Omschrijving"
                      className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-1">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Aantal</label>}
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={regel.aantal}
                      onChange={(e) => updateRegel(regel.id, "aantal", parseFloat(e.target.value) || 1)}
                      className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Prijs (€)</label>}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={regel.prijs}
                      onChange={(e) => updateRegel(regel.id, "prijs", parseFloat(e.target.value) || 0)}
                      className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">BTW %</label>}
                    <select
                      value={regel.btwPercentage}
                      onChange={(e) => updateRegel(regel.id, "btwPercentage", parseFloat(e.target.value))}
                      disabled={btwVerlegd}
                      className="w-full h-9 rounded-lg border border-gray-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                    >
                      <option value={0}>0%</option>
                      <option value={9}>9%</option>
                      <option value={21}>21%</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Totaal</label>}
                    <div className="h-9 flex items-center px-3 text-sm font-medium text-gray-900 bg-gray-50 rounded-lg border border-gray-200">
                      {formatBedrag(berekenRegelTotaal(regel))}
                    </div>
                  </div>
                  <div className="col-span-1">
                    {idx === 0 && <label className="block text-xs text-gray-500 mb-1">&nbsp;</label>}
                    <button
                      onClick={() => verwijderRegel(regel.id)}
                      disabled={regels.length === 1}
                      className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Totalen */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Totalen</CardTitle>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={handmatigBedrag}
                  onChange={(e) => {
                    setHandmatigBedrag(e.target.checked);
                    if (e.target.checked) {
                      setHandSubtotaal(berekendeSubtotaal.toFixed(2));
                      setHandBtwBedrag(berekendeBtw.toFixed(2));
                      setHandTotaal(berekendeTotal.toFixed(2));
                    }
                  }}
                  className="h-4 w-4 text-indigo-600 rounded"
                />
                Handmatige bedragen overschrijven
              </label>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs ml-auto space-y-2">
              {handmatigBedrag ? (
                <>
                  <div className="flex items-center gap-3 justify-between">
                    <span className="text-sm text-gray-500">Subtotaal</span>
                    <input
                      type="number"
                      step="0.01"
                      value={handSubtotaal}
                      onChange={(e) => setHandSubtotaal(e.target.value)}
                      className="w-32 h-9 rounded-lg border border-gray-300 px-3 text-sm text-right"
                    />
                  </div>
                  <div className="flex items-center gap-3 justify-between">
                    <span className="text-sm text-gray-500">BTW bedrag</span>
                    <input
                      type="number"
                      step="0.01"
                      value={handBtwBedrag}
                      onChange={(e) => setHandBtwBedrag(e.target.value)}
                      className="w-32 h-9 rounded-lg border border-gray-300 px-3 text-sm text-right"
                    />
                  </div>
                  <div className="flex items-center gap-3 justify-between border-t-2 border-gray-900 pt-2">
                    <span className="font-bold text-gray-900">Totaal</span>
                    <input
                      type="number"
                      step="0.01"
                      value={handTotaal}
                      onChange={(e) => setHandTotaal(e.target.value)}
                      className="w-32 h-9 rounded-lg border border-gray-300 px-3 text-sm text-right font-bold"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotaal</span>
                    <span>{formatBedrag(berekendeSubtotaal)}</span>
                  </div>
                  {!btwVerlegd && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">BTW</span>
                      <span>{formatBedrag(berekendeBtw)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t-2 border-gray-900">
                    <span className="font-bold">Totaal</span>
                    <span className="font-bold">{formatBedrag(berekendeTotal)}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Acties */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/facturen")}>
            Annuleren
          </Button>
          <Button onClick={importeer} loading={laden}>
            {laden ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Factuur importeren
          </Button>
        </div>
      </div>
    </div>
  );
}

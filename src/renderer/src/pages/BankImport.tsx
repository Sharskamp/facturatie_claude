import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle,
  Loader2,
  FileText,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Settings2,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBedrag, formatDatum } from "@/lib/utils";

type Bank = "abn" | "ing" | "rabobank" | "knab" | "camt" | "overig";
type Stap = 1 | 2 | 3 | 4 | "mapping";

interface Transactie {
  datum: string;
  omschrijving: string;
  bedrag: number;
  type: "inkomen" | "uitgave";
}

interface TransactieRij extends Transactie {
  geselecteerd: boolean;
  index: number;
}

interface KolomMapping {
  datum: number;
  omschrijving: number;
  bedrag: number;
  afBij: number;
  debitCredit: number;
}

const BANKEN: Array<{ id: Bank; naam: string; kleur: string; label?: string }> = [
  { id: "abn", naam: "ABN AMRO", kleur: "bg-yellow-400 text-yellow-900" },
  { id: "ing", naam: "ING", kleur: "bg-orange-500 text-white" },
  { id: "rabobank", naam: "Rabobank", kleur: "bg-red-600 text-white" },
  { id: "knab", naam: "Knab", kleur: "bg-blue-600 text-white" },
  { id: "camt", naam: "CAMT.053", kleur: "bg-emerald-600 text-white", label: "XML" },
  { id: "overig", naam: "Andere bank / CSV", kleur: "bg-gray-500 text-white" },
];

export default function BankImportPagina() {
  const navigate = useNavigate();
  const [stap, setStap] = useState<Stap>(1);
  const [geselecteerdeBank, setGeselecteerdeBank] = useState<Bank | null>(null);
  const [transacties, setTransacties] = useState<TransactieRij[]>([]);
  const [laden, setLaden] = useState(false);
  const [importLaden, setImportLaden] = useState(false);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [bestandPad, setBestandPad] = useState<string | null>(null);
  const [importResultaat, setImportResultaat] = useState<{ aangemaakt: number; autoGekoppeld: number } | null>(null);
  const [latesteDatum, setLatesteDatum] = useState<string | null>(null);
  const [oudeTransactiesAantal, setOudeTransactiesAantal] = useState<number>(0);

  // Handmatige mapping state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvAlleRijen, setCsvAlleRijen] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<KolomMapping>({ datum: -1, omschrijving: -1, bedrag: -1, afBij: -1, debitCredit: -1 });
  const [mappingFout, setMappingFout] = useState<string | null>(null);

  const toonMelding = (type: "succes" | "fout", tekst: string) => {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 5000);
  };

  const laadTransactiesMetDuplicaatCheck = async (rijen: TransactieRij[]) => {
    const { latesteDatum: ld } = await (window.api.bank as any).controleerDuplicaten() as { latesteDatum: string | null };
    setLatesteDatum(ld);
    if (ld) {
      const oudeRijen = rijen.filter(t => t.datum <= ld);
      setOudeTransactiesAantal(oudeRijen.length);
      const bijgewerkt = rijen.map(t => ({ ...t, geselecteerd: t.datum > ld }));
      setTransacties(bijgewerkt);
    } else {
      setOudeTransactiesAantal(0);
      setTransacties(rijen);
    }
  };

  const selecteerBestand = async () => {
    setLaden(true);
    try {
      const pad = await window.api.bank.openBestandDialog();
      if (!pad) { setLaden(false); return; }
      setBestandPad(pad);

      if (geselecteerdeBank === "overig") {
        // Lees ruwe CSV voor handmatige mapping
        const ruwe = await (window.api.bank as any).leesRuweData(pad);
        setCsvHeaders(ruwe.headers);
        setCsvPreview(ruwe.preview);
        setCsvAlleRijen(ruwe.alleRijen);
        setMapping({ datum: -1, omschrijving: -1, bedrag: -1, afBij: -1, debitCredit: -1 });
        setStap("mapping");
      } else if (geselecteerdeBank === "camt" || pad.toLowerCase().endsWith(".xml")) {
        const result = await window.api.bank.importeerCsv({ bank: "camt", filePath: pad });
        const data = (result as any).transacties ?? result;
        if (!Array.isArray(data) || data.length === 0) {
          toonMelding("fout", "Geen transacties gevonden in het CAMT.053 bestand. Controleer of het een geldig XML bankafschrift is.");
        } else {
          const rijen: TransactieRij[] = (data as Transactie[]).map((t, i) => ({ ...t, geselecteerd: true, index: i }));
          await laadTransactiesMetDuplicaatCheck(rijen);
          setStap(3);
        }
      } else {
        const result = await window.api.bank.importeerCsv({ bank: geselecteerdeBank!, filePath: pad });
        const data = (result as any).transacties ?? result;
        const autoHerkend = (result as any).autoHerkend !== false;

        if (!autoHerkend || !Array.isArray(data) || data.length === 0) {
          // Fallback naar handmatige mapping
          const ruwe = await (window.api.bank as any).leesRuweData(pad);
          setCsvHeaders(ruwe.headers);
          setCsvPreview(ruwe.preview);
          setCsvAlleRijen(ruwe.alleRijen);
          setMapping({ datum: -1, omschrijving: -1, bedrag: -1, afBij: -1, debitCredit: -1 });
          toonMelding("fout", "Automatische herkenning mislukt. Stel de kolomkoppeling handmatig in.");
          setStap("mapping");
        } else {
          const rijen: TransactieRij[] = (data as Transactie[]).map((t, i) => ({
            ...t, geselecteerd: true, index: i,
          }));
          await laadTransactiesMetDuplicaatCheck(rijen);
          setStap(3);
        }
      }
    } catch (e: unknown) {
      toonMelding("fout", `Fout bij lezen CSV: ${e instanceof Error ? e.message : "onbekende fout"}`);
    } finally {
      setLaden(false);
    }
  };

  const passeermapping = async () => {
    setMappingFout(null);
    if (mapping.datum < 0) { setMappingFout("Selecteer een kolom voor Datum"); return; }
    if (mapping.omschrijving < 0) { setMappingFout("Selecteer een kolom voor Omschrijving"); return; }
    if (mapping.bedrag < 0) { setMappingFout("Selecteer een kolom voor Bedrag"); return; }

    setLaden(true);
    try {
      const data = await (window.api.bank as any).importeerMetMapping({
        alleRijen: csvAlleRijen,
        mapping: {
          datum: mapping.datum,
          omschrijving: mapping.omschrijving,
          bedrag: mapping.bedrag,
          ...(mapping.afBij >= 0 ? { afBij: mapping.afBij } : {}),
          ...(mapping.debitCredit >= 0 ? { debitCredit: mapping.debitCredit } : {}),
        },
      });

      if (!Array.isArray(data) || data.length === 0) {
        setMappingFout("Geen geldige transacties gevonden met deze kolomkoppeling. Controleer of de kolommen correct zijn.");
        return;
      }

      const rijen: TransactieRij[] = (data as Transactie[]).map((t, i) => ({
        ...t, geselecteerd: true, index: i,
      }));
      await laadTransactiesMetDuplicaatCheck(rijen);
      setStap(3);
    } catch (e: unknown) {
      setMappingFout(`Fout: ${e instanceof Error ? e.message : "onbekend"}`);
    } finally {
      setLaden(false);
    }
  };

  const toggleSelectie = (index: number) => {
    setTransacties((prev) =>
      prev.map((t) => (t.index === index ? { ...t, geselecteerd: !t.geselecteerd } : t))
    );
  };

  const toggleAlles = () => {
    const alleGeselecteerd = transacties.every((t) => t.geselecteerd);
    setTransacties((prev) => prev.map((t) => ({ ...t, geselecteerd: !alleGeselecteerd })));
  };

  const importeerGeselecteerde = async () => {
    const geselecteerd = transacties.filter((t) => t.geselecteerd);
    if (geselecteerd.length === 0) { toonMelding("fout", "Selecteer minimaal één transactie"); return; }

    if (latesteDatum) {
      const oudeGeselecteerd = geselecteerd.filter(t => t.datum <= latesteDatum);
      if (oudeGeselecteerd.length > 0) {
        const bevestigd = confirm(
          `Je probeert ${oudeGeselecteerd.length} transacties te importeren die al verwerkt zijn (${latesteDatum}). Weet je zeker dat je dit wilt?`
        );
        if (!bevestigd) return;
      }
    }

    setImportLaden(true);
    let aangemaakt = 0;
    let autoGekoppeld = 0;
    try {
      for (const t of geselecteerd) {
        if (t.type === "inkomen") {
          const nieuw = await window.api.inkomen.create({
            datum: t.datum,
            omschrijving: t.omschrijving,
            bedrag: Math.abs(t.bedrag),
            bron: "Bankimport",
            geboektAlsOmzet: false,
            tegenrekeningNaam: (t as any).tegenrekeningNaam || undefined,
            tegenrekening: (t as any).tegenrekening || undefined,
            mutatiesoort: (t as any).mutatiesoort || undefined,
            mededelingen: (t as any).mededelingen || undefined,
            betalingskenmerk: (t as any).betalingskenmerk || undefined,
            saldoNaBoeking: (t as any).saldoNaBoeking || undefined,
          }) as { id: string };
          try {
            const match = await window.api.bank.zoekFactuurMatch({
              bedrag: Math.abs(t.bedrag),
              datum: t.datum,
              omschrijving: t.omschrijving,
              mededelingen: (t as any).mededelingen,
              betalingskenmerk: (t as any).betalingskenmerk,
            }) as { matchType: string; volledigeMatches: { id: string }[] };
            if (match.matchType === "volledig" && match.volledigeMatches.length === 1) {
              await window.api.bank.koppelAanFactuur({ inkomstenId: nieuw.id, factuurId: match.volledigeMatches[0].id });
              autoGekoppeld++;
            }
          } catch {
            // koppeling mislukt, geen probleem — inkomen is wel aangemaakt
          }
        } else {
          await window.api.uitgaven.create({
            datum: t.datum,
            omschrijving: t.omschrijving,
            bedrag: Math.abs(t.bedrag),
            btwPercentage: 0,
            btwBedrag: 0,
            zakelijk: true,
            zakelijkPercent: 100,
            tegenrekening: (t as any).tegenrekening || undefined,
          });
        }
        aangemaakt++;
      }
      setImportResultaat({ aangemaakt, autoGekoppeld });
      setStap(4);
    } catch (e: unknown) {
      toonMelding("fout", `Importeren mislukt: ${e instanceof Error ? e.message : "onbekend"}`);
    } finally {
      setImportLaden(false);
    }
  };

  const opnieuw = () => {
    setStap(1);
    setGeselecteerdeBank(null);
    setTransacties([]);
    setBestandPad(null);
    setImportResultaat(null);
    setMelding(null);
    setCsvHeaders([]);
    setCsvPreview([]);
    setCsvAlleRijen([]);
    setMapping({ datum: -1, omschrijving: -1, bedrag: -1, afBij: -1, debitCredit: -1 });
    setMappingFout(null);
    setLatesteDatum(null);
    setOudeTransactiesAantal(0);
  };

  const geselecteerdAantal = transacties.filter((t) => t.geselecteerd).length;

  const stapNummer = stap === "mapping" ? 2 : stap as number;

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Bankafschrift importeren"
        subtitel="Importeer transacties vanuit je bankafschrift"
      />

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
        {melding && (
          <div className={`rounded-lg px-4 py-3 text-sm font-medium flex items-center gap-2 ${
            melding.type === "succes"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}>
            {melding.type === "fout" ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle className="h-4 w-4 shrink-0" />}
            {melding.tekst}
          </div>
        )}

        {/* Stap indicator */}
        <div className="flex items-center gap-2 text-sm">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center font-semibold text-xs ${
                stapNummer === s ? "bg-indigo-600 text-white"
                  : stapNummer > s ? "bg-green-500 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}>
                {stapNummer > s ? <CheckCircle className="h-4 w-4" /> : s}
              </div>
              {s < 4 && <ArrowRight className="h-4 w-4 text-gray-300" />}
            </div>
          ))}
          <div className="ml-2 text-gray-500">
            {stap === 1 && "Selecteer bank"}
            {stap === 2 && "Selecteer bestand"}
            {stap === "mapping" && "Kolomkoppeling instellen"}
            {stap === 3 && "Controleer transacties"}
            {stap === 4 && "Importeren voltooid"}
          </div>
        </div>

        {/* Stap 1: Bank */}
        {stap === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Stap 1: Selecteer je bank</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {BANKEN.map((bank) => (
                  <button
                    key={bank.id}
                    onClick={() => { setGeselecteerdeBank(bank.id); setStap(2); }}
                    className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:shadow-md transition-all gap-3"
                  >
                    <div className={`h-12 w-12 rounded-full ${bank.kleur} flex items-center justify-center font-bold text-lg`}>
                      {bank.naam[0]}
                    </div>
                    <div className="text-center">
                      <span className="font-semibold text-gray-900 block">{bank.naam}</span>
                      {bank.id === "overig" && (
                        <span className="text-xs text-gray-400">Kolomkoppeling handmatig instellen</span>
                      )}
                      {bank.label && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">{bank.label}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stap 2: Bestand */}
        {stap === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>
                Stap 2: Selecteer CSV bestand
                {geselecteerdeBank && (
                  <span className="ml-2 text-base font-normal text-indigo-600">
                    ({BANKEN.find((b) => b.id === geselecteerdeBank)?.naam})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {geselecteerdeBank && geselecteerdeBank !== "overig" && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
                  <p className="font-medium mb-1">Instructies voor {BANKEN.find((b) => b.id === geselecteerdeBank)?.naam}:</p>
                  {geselecteerdeBank === "abn" && <p>Log in op Mijn ABN AMRO, ga naar Betaalpassen en download het CSV afschrift.</p>}
                  {geselecteerdeBank === "ing" && <p>Log in op Mijn ING, ga naar Rekeningen en kies &apos;Download transacties&apos; in CSV formaat.</p>}
                  {geselecteerdeBank === "rabobank" && <p>Log in op Rabobank, ga naar je rekening en exporteer als CSV.</p>}
                  {geselecteerdeBank === "knab" && <p>Log in op Knab, ga naar je rekening en exporteer als CSV.</p>}
                  {geselecteerdeBank === "camt" && <p>Download het CAMT.053 XML bankafschrift via uw internetbankieren. Dit formaat wordt aangeboden door de meeste Nederlandse banken (ING, Rabobank, ABN AMRO, Triodos, ASN, SNS, etc.).</p>}
                  {geselecteerdeBank !== "camt" && <p className="mt-2 text-blue-600 text-xs">Als het bestand niet automatisch herkend wordt, kun je daarna handmatig kolommen koppelen.</p>}
                </div>
              )}

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium mb-4">
                  {geselecteerdeBank === "camt" ? "Selecteer je CAMT.053 XML bankafschrift" : "Selecteer je CSV bankafschrift"}
                </p>
                <Button onClick={selecteerBestand} loading={laden}>
                  Bestand selecteren
                </Button>
              </div>

              <Button variant="outline" onClick={() => setStap(1)}>
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Handmatige kolomkoppeling */}
        {stap === "mapping" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-indigo-500" />
                  <CardTitle>Kolomkoppeling instellen</CardTitle>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Koppel de kolommen uit je CSV aan de juiste velden. Verplichte velden zijn gemarkeerd met *.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {mappingFout && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {mappingFout}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { veld: "datum" as const, label: "Datum *", verplicht: true },
                    { veld: "omschrijving" as const, label: "Omschrijving *", verplicht: true },
                    { veld: "bedrag" as const, label: "Bedrag *", verplicht: true },
                    { veld: "afBij" as const, label: "Af/Bij (debet/credit richting)", verplicht: false },
                    { veld: "debitCredit" as const, label: "Debit/Credit kolom", verplicht: false },
                  ].map(({ veld, label }) => (
                    <div key={veld}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                      <select
                        value={mapping[veld]}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [veld]: parseInt(e.target.value) }))}
                        className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value={-1}>— Niet gebruiken —</option>
                        {csvHeaders.map((h, i) => (
                          <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Preview */}
                {csvPreview.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Preview eerste regels:</p>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="text-xs w-full">
                        <thead>
                          <tr className="bg-gray-50">
                            {csvHeaders.map((h, i) => (
                              <th key={i} className="px-3 py-2 text-left font-semibold text-gray-600 border-b border-gray-200">
                                <div>{h || `Kolom ${i + 1}`}</div>
                                {Object.entries(mapping).some(([, v]) => v === i) && (
                                  <div className="text-indigo-500 text-xs font-normal mt-0.5">
                                    → {Object.entries(mapping).find(([, v]) => v === i)?.[0]}
                                  </div>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.map((rij, ri) => (
                            <tr key={ri} className="border-b border-gray-100">
                              {rij.map((cel, ci) => (
                                <td key={ci} className={`px-3 py-1.5 text-gray-700 max-w-[120px] truncate ${
                                  Object.values(mapping).includes(ci) ? "bg-indigo-50" : ""
                                }`}>
                                  {cel}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStap(2)}>
                    <ArrowLeft className="h-4 w-4" />
                    Terug
                  </Button>
                  <Button onClick={passeermapping} loading={laden}>
                    Transacties laden
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Stap 3: Transacties controleren */}
        {stap === 3 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    Stap 3: Controleer transacties
                    <span className="ml-2 text-base font-normal text-gray-500">
                      {transacties.length} gevonden
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{geselecteerdAantal} geselecteerd</span>
                    <button
                      onClick={toggleAlles}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {transacties.every((t) => t.geselecteerd) ? "Deselecteer alles" : "Selecteer alles"}
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {bestandPad && (
                  <div className="px-4 pb-2 text-xs text-gray-400 truncate">
                    Bestand: {bestandPad}
                  </div>
                )}
                {oudeTransactiesAantal > 0 && latesteDatum && (
                  <div className="mx-4 mb-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {oudeTransactiesAantal} transacties zijn al verwerkt (tot {latesteDatum}). Alleen nieuwe transacties zijn geselecteerd.
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={transacties.every((t) => t.geselecteerd)}
                          onChange={toggleAlles}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                        />
                      </TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                      <TableHead className="text-center">Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transacties.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-gray-400">
                          Geen transacties gevonden in dit bestand
                        </TableCell>
                      </TableRow>
                    ) : (
                      transacties.map((t) => (
                        <TableRow key={t.index} className={!t.geselecteerd ? "opacity-40" : ""}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={t.geselecteerd}
                              onChange={() => toggleSelectie(t.index)}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-gray-500 text-sm">
                            {(() => { try { return t.datum ? formatDatum(t.datum) : t.datum; } catch { return t.datum; } })()}
                          </TableCell>
                          <TableCell className="max-w-[250px] truncate text-sm">{t.omschrijving}</TableCell>
                          <TableCell className={`text-right font-semibold text-sm ${t.type === "inkomen" ? "text-green-700" : "text-red-700"}`}>
                            {t.type === "inkomen" ? "+" : "-"}{formatBedrag(Math.abs(t.bedrag))}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={t.type === "inkomen" ? "success" : "danger"}>
                              {t.type === "inkomen" ? "Inkomen" : "Uitgave"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStap(geselecteerdeBank === "overig" ? "mapping" : 2)}>
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Button>
              <Button onClick={importeerGeselecteerde} loading={importLaden} disabled={geselecteerdAantal === 0}>
                Importeer {geselecteerdAantal} transacties
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Stap 4: Voltooid */}
        {stap === 4 && importResultaat && (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Importeren voltooid!</h3>
                <p className="text-gray-600 mt-2">
                  <span className="font-semibold text-indigo-600">{importResultaat.aangemaakt}</span> transacties zijn succesvol geïmporteerd.
                </p>
                {importResultaat.autoGekoppeld > 0 && (
                  <p className="text-green-700 mt-1 text-sm">
                    <span className="font-semibold">{importResultaat.autoGekoppeld}</span> {importResultaat.autoGekoppeld === 1 ? "betaling is" : "betalingen zijn"} automatisch gekoppeld aan een openstaande factuur.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-3 pt-4">
                <Button variant="outline" onClick={opnieuw}>Nieuw importeren</Button>
                <Button variant="outline" onClick={() => navigate("/inkomen")}>Bekijk inkomen</Button>
                <Button variant="outline" onClick={() => navigate("/uitgaven")}>Bekijk uitgaven</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {laden && (stap === 2 || stap === "mapping") && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400 mr-2" />
            <span className="text-gray-600">CSV bestand verwerken...</span>
          </div>
        )}
      </div>
    </div>
  );
}

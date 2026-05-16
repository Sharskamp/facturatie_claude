import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle,
  Loader2,
  FileText,
  ArrowRight,
  ArrowLeft,
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

type Bank = "abn" | "ing" | "rabobank";
type Stap = 1 | 2 | 3 | 4;

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

const BANKEN: Array<{ id: Bank; naam: string; kleur: string }> = [
  { id: "abn", naam: "ABN AMRO", kleur: "bg-yellow-400 text-yellow-900" },
  { id: "ing", naam: "ING", kleur: "bg-orange-500 text-white" },
  { id: "rabobank", naam: "Rabobank", kleur: "bg-red-600 text-white" },
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
  const [importResultaat, setImportResultaat] = useState<{ aangemaakt: number } | null>(null);

  const toonMelding = (type: "succes" | "fout", tekst: string) => {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 5000);
  };

  const selecteerBestand = async () => {
    setLaden(true);
    try {
      const pad = await window.api.bank.openBestandDialog();
      if (!pad) {
        setLaden(false);
        return;
      }
      setBestandPad(pad);
      const data = await window.api.bank.importeerCsv({ bank: geselecteerdeBank!, filePath: pad });
      const rijen: TransactieRij[] = (data as Transactie[]).map((t, i) => ({
        ...t,
        geselecteerd: true,
        index: i,
      }));
      setTransacties(rijen);
      setStap(3);
    } catch {
      toonMelding("fout", "Fout bij lezen CSV bestand");
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
    if (geselecteerd.length === 0) {
      toonMelding("fout", "Selecteer minimaal één transactie");
      return;
    }
    setImportLaden(true);
    let aangemaakt = 0;
    try {
      for (const t of geselecteerd) {
        if (t.type === "inkomen") {
          await window.api.inkomen.create({
            datum: t.datum,
            omschrijving: t.omschrijving,
            bedrag: Math.abs(t.bedrag),
            bron: "Bankimport",
          });
        } else {
          await window.api.uitgaven.create({
            datum: t.datum,
            omschrijving: t.omschrijving,
            bedrag: Math.abs(t.bedrag),
            btwPercentage: 0,
            btwBedrag: 0,
            totaal: Math.abs(t.bedrag),
            zakelijk: true,
            zakelijkPercent: 100,
          });
        }
        aangemaakt++;
      }
      setImportResultaat({ aangemaakt });
      setStap(4);
    } catch {
      toonMelding("fout", "Importeren mislukt");
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
  };

  const geselecteerdAantal = transacties.filter((t) => t.geselecteerd).length;

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Bankafschrift importeren"
        subtitel="Importeer transacties vanuit je bankafschrift"
      />

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
        {melding && (
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              melding.type === "succes"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {melding.tekst}
          </div>
        )}

        {/* Stap indicator */}
        <div className="flex items-center gap-2 text-sm">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center font-semibold text-xs ${
                  stap === s
                    ? "bg-indigo-600 text-white"
                    : stap > s
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {stap > s ? <CheckCircle className="h-4 w-4" /> : s}
              </div>
              {s < 4 && <ArrowRight className="h-4 w-4 text-gray-300" />}
            </div>
          ))}
          <div className="ml-2 text-gray-500">
            {stap === 1 && "Selecteer bank"}
            {stap === 2 && "Selecteer bestand"}
            {stap === 3 && "Controleer transacties"}
            {stap === 4 && "Importeren voltooid"}
          </div>
        </div>

        {/* Stap 1: Selecteer bank */}
        {stap === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Stap 1: Selecteer je bank</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {BANKEN.map((bank) => (
                  <button
                    key={bank.id}
                    onClick={() => {
                      setGeselecteerdeBank(bank.id);
                      setStap(2);
                    }}
                    className="flex flex-col items-center justify-center p-8 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:shadow-md transition-all gap-3"
                  >
                    <div className={`h-12 w-12 rounded-full ${bank.kleur} flex items-center justify-center font-bold text-lg`}>
                      {bank.naam[0]}
                    </div>
                    <span className="font-semibold text-gray-900">{bank.naam}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stap 2: Selecteer bestand */}
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
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800">
                <p className="font-medium mb-1">Instructies voor {BANKEN.find((b) => b.id === geselecteerdeBank)?.naam}:</p>
                {geselecteerdeBank === "abn" && (
                  <p>Log in op Mijn ABN AMRO, ga naar Betaalpassen, kies je rekening en download het CSV afschrift.</p>
                )}
                {geselecteerdeBank === "ing" && (
                  <p>Log in op Mijn ING, ga naar Rekeningen, selecteer je rekening en kies &apos;Download transacties&apos; in CSV formaat.</p>
                )}
                {geselecteerdeBank === "rabobank" && (
                  <p>Log in op de Rabobank app of website, ga naar je rekening en exporteer de transacties als CSV bestand.</p>
                )}
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium mb-1">Selecteer je CSV bankafschrift</p>
                <p className="text-sm text-gray-400 mb-4">Klik op de knop hieronder om het bestand te kiezen</p>
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

        {/* Stap 3: Controleer transacties */}
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
                        <TableRow
                          key={t.index}
                          className={!t.geselecteerd ? "opacity-40" : ""}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={t.geselecteerd}
                              onChange={() => toggleSelectie(t.index)}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-gray-500 text-sm">
                            {t.datum ? formatDatum(t.datum) : t.datum}
                          </TableCell>
                          <TableCell className="max-w-[250px] truncate text-sm">
                            {t.omschrijving}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold text-sm ${
                              t.type === "inkomen" ? "text-green-700" : "text-red-700"
                            }`}
                          >
                            {t.type === "inkomen" ? "+" : "-"}
                            {formatBedrag(Math.abs(t.bedrag))}
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
              <Button variant="outline" onClick={() => setStap(2)}>
                <ArrowLeft className="h-4 w-4" />
                Terug
              </Button>
              <Button
                onClick={importeerGeselecteerde}
                loading={importLaden}
                disabled={geselecteerdAantal === 0}
              >
                Importeer {geselecteerdAantal} geselecteerde transacties
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
                  <span className="font-semibold text-indigo-600">{importResultaat.aangemaakt}</span> transacties
                  zijn succesvol geïmporteerd.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 pt-4">
                <Button variant="outline" onClick={opnieuw}>
                  Nieuw importeren
                </Button>
                <Button variant="outline" onClick={() => navigate("/inkomen")}>
                  Bekijk inkomen
                </Button>
                <Button variant="outline" onClick={() => navigate("/uitgaven")}>
                  Bekijk uitgaven
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {laden && stap === 2 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400 mr-2" />
            <span className="text-gray-600">CSV bestand verwerken...</span>
          </div>
        )}
      </div>
    </div>
  );
}

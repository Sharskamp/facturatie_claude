import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  Car,
  Loader2,
  MapPin,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBedrag, formatDatum } from "@/lib/utils";

interface Rit {
  id: string;
  datum: string;
  omschrijving: string;
  van: string;
  naar: string;
  kilometers: number;
  retour: boolean;
  zakelijk: boolean;
  notities?: string | null;
  vergoeding: number;
}

const huidigeMaand = () => {
  const nu = new Date();
  return { jaar: nu.getFullYear(), maand: nu.getMonth() };
};

const LEEG_FORMULIER = {
  datum: new Date().toISOString().split("T")[0],
  omschrijving: "",
  van: "",
  naar: "",
  kilometers: "",
  retour: false,
  zakelijk: true,
  notities: "",
};

export default function KilometerPagina() {
  const [ritten, setRitten] = useState<Rit[]>([]);
  const [laden, setLaden] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [opslaan, setOpslaan] = useState(false);
  const [formulier, setFormulier] = useState(LEEG_FORMULIER);

  const haalRittenOp = useCallback(async () => {
    try {
      const data = await window.api.ritten.list();
      setRitten(Array.isArray(data) ? data : []);
    } catch {
      toonMelding("fout", "Kon ritten niet laden");
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    haalRittenOp();
  }, [haalRittenOp]);

  const toonMelding = (type: "succes" | "fout", tekst: string) => {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 4000);
  };

  const resetFormulier = () => {
    setFormulier(LEEG_FORMULIER);
    setBewerkenId(null);
  };

  const openBewerken = (rit: Rit) => {
    setFormulier({
      datum: rit.datum.split("T")[0],
      omschrijving: rit.omschrijving,
      van: rit.van,
      naar: rit.naar,
      kilometers: String(rit.kilometers),
      retour: rit.retour,
      zakelijk: rit.zakelijk,
      notities: rit.notities ?? "",
    });
    setBewerkenId(rit.id);
    setModalOpen(true);
  };

  const slaOp = async () => {
    if (!formulier.omschrijving || !formulier.van || !formulier.naar || !formulier.kilometers) {
      toonMelding("fout", "Vul alle verplichte velden in");
      return;
    }
    setOpslaan(true);
    try {
      const payload = {
        datum: formulier.datum,
        omschrijving: formulier.omschrijving,
        van: formulier.van,
        naar: formulier.naar,
        kilometers: parseFloat(formulier.kilometers),
        retour: formulier.retour,
        zakelijk: formulier.zakelijk,
        notities: formulier.notities || null,
      };
      if (bewerkenId) {
        await window.api.ritten.update(bewerkenId, payload);
      } else {
        await window.api.ritten.create(payload);
      }
      toonMelding("succes", bewerkenId ? "Rit bijgewerkt" : "Rit toegevoegd");
      setModalOpen(false);
      resetFormulier();
      haalRittenOp();
    } catch {
      toonMelding("fout", "Opslaan mislukt");
    } finally {
      setOpslaan(false);
    }
  };

  const verwijder = async (id: string) => {
    if (!confirm("Weet je zeker dat je deze rit wilt verwijderen?")) return;
    try {
      await window.api.ritten.delete(id);
      toonMelding("succes", "Rit verwijderd");
      haalRittenOp();
    } catch {
      toonMelding("fout", "Verwijderen mislukt");
    }
  };

  const exporteerCsv = async () => {
    const headers = ["Datum", "Van", "Naar", "Kilometers", "Vergoeding (€)", "Zakelijk", "Omschrijving"];
    const rijen = ritten.map((r) => [
      new Date(r.datum).toLocaleDateString("nl-NL"),
      r.van,
      r.naar,
      String(r.kilometers),
      r.vergoeding.toFixed(2),
      r.zakelijk ? "Ja" : "Nee",
      r.omschrijving,
    ]);
    const csv = [headers, ...rijen].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    try {
      await window.api.ritten.exportCsv(csv);
      toonMelding("succes", "CSV geëxporteerd");
    } catch {
      toonMelding("fout", "Export mislukt");
    }
  };

  // Samenvatting deze maand
  const { jaar, maand } = huidigeMaand();
  const rittenDezeMaand = ritten.filter((r) => {
    const d = new Date(r.datum);
    return d.getFullYear() === jaar && d.getMonth() === maand;
  });
  const totaalKmMaand = rittenDezeMaand.reduce((s, r) => s + r.kilometers, 0);
  const totaalVergoedingMaand = rittenDezeMaand.reduce((s, r) => s + r.vergoeding, 0);

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Kilometerregistratie"
        subtitel="Bijhouden van zakelijke ritten"
        acties={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exporteerCsv}>
              <Download className="h-4 w-4" />
              Exporteer CSV
            </Button>
            <Button
              onClick={() => {
                resetFormulier();
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nieuwe rit
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-6">
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

        {/* Samenvatting deze maand */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <Car className="h-4 w-4" />
                Kilometers deze maand
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900">
                {totaalKmMaand.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km
              </p>
              <p className="text-xs text-gray-400 mt-1">{rittenDezeMaand.length} ritten</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Vergoeding deze maand</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-indigo-600">{formatBedrag(totaalVergoedingMaand)}</p>
              <p className="text-xs text-gray-400 mt-1">Op basis van € /km tarief</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Totaal ritten
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900">{ritten.length}</p>
              <p className="text-xs text-gray-400 mt-1">Alle registraties</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabel */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Omschrijving</TableHead>
                <TableHead className="text-right">Km</TableHead>
                <TableHead className="text-right">Vergoeding</TableHead>
                <TableHead className="text-center">Zakelijk</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {laden ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : ritten.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-400">
                    Geen ritten geregistreerd
                  </TableCell>
                </TableRow>
              ) : (
                ritten.map((rit) => (
                  <TableRow key={rit.id}>
                    <TableCell className="whitespace-nowrap text-gray-500">
                      {formatDatum(rit.datum)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <span className="font-medium text-gray-900">{rit.van}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-medium text-gray-900">{rit.naar}</span>
                        {rit.retour && (
                          <span className="ml-1 text-xs text-indigo-600 font-medium">(retour)</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-gray-600">
                      {rit.omschrijving}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {rit.kilometers.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km
                    </TableCell>
                    <TableCell className="text-right font-semibold text-indigo-700">
                      {formatBedrag(rit.vergoeding)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={rit.zakelijk ? "success" : "default"}>
                        {rit.zakelijk ? "Zakelijk" : "Privé"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openBewerken(rit)}
                          title="Bewerken"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => verwijder(rit.id)}
                          title="Verwijderen"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onOpenChange={(o) => {
          setModalOpen(o);
          if (!o) resetFormulier();
        }}
      >
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>{bewerkenId ? "Rit bewerken" : "Nieuwe rit"}</ModalTitle>
          </ModalHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Datum *"
                type="date"
                value={formulier.datum}
                onChange={(e) => setFormulier({ ...formulier, datum: e.target.value })}
              />
              <Input
                label="Kilometers *"
                type="number"
                step="0.1"
                min="0"
                value={formulier.kilometers}
                onChange={(e) => setFormulier({ ...formulier, kilometers: e.target.value })}
                placeholder="bijv. 25.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Van *"
                value={formulier.van}
                onChange={(e) => setFormulier({ ...formulier, van: e.target.value })}
                placeholder="Vertrekpunt"
              />
              <Input
                label="Naar *"
                value={formulier.naar}
                onChange={(e) => setFormulier({ ...formulier, naar: e.target.value })}
                placeholder="Bestemming"
              />
            </div>
            <Input
              label="Omschrijving *"
              value={formulier.omschrijving}
              onChange={(e) => setFormulier({ ...formulier, omschrijving: e.target.value })}
              placeholder="Bijv. Klantbezoek"
            />

            {/* Retour toggle */}
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Retour</p>
                <p className="text-xs text-gray-400">Verdubbelt het aantal kilometers</p>
              </div>
              <button
                type="button"
                onClick={() => setFormulier({ ...formulier, retour: !formulier.retour })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formulier.retour ? "bg-indigo-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    formulier.retour ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Zakelijk toggle */}
            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Zakelijk</p>
                <p className="text-xs text-gray-400">Is dit een zakelijke rit?</p>
              </div>
              <button
                type="button"
                onClick={() => setFormulier({ ...formulier, zakelijk: !formulier.zakelijk })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formulier.zakelijk ? "bg-indigo-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    formulier.zakelijk ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {formulier.retour && formulier.kilometers && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm text-indigo-800">
                Totaal:{" "}
                <span className="font-semibold">
                  {(parseFloat(formulier.kilometers) * 2).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km
                </span>{" "}
                (heen en terug)
              </div>
            )}

            <Textarea
              label="Notities"
              value={formulier.notities}
              onChange={(e) => setFormulier({ ...formulier, notities: e.target.value })}
              placeholder="Optionele notities..."
              rows={2}
            />
          </div>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={slaOp} loading={opslaan}>
              {bewerkenId ? "Opslaan" : "Toevoegen"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

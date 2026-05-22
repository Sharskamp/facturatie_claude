import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Building, Loader2, TrendingDown } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface VasteActivum {
  id: string;
  naam: string;
  aanschafDatum: string;
  aanschafWaarde: number;
  afschrijvingMethode: string;
  afschrijvingJaren: number;
  restwaarde: number;
  categorieNaam?: string | null;
  notities?: string | null;
  actief: boolean;
}

const LEEG_FORMULIER = {
  naam: "",
  aanschafDatum: new Date().toISOString().split("T")[0],
  aanschafWaarde: "",
  afschrijvingMethode: "lineair",
  afschrijvingJaren: "",
  restwaarde: "0",
  categorieNaam: "",
  notities: "",
};

function berekenBoekwaarde(activum: VasteActivum): number {
  const nu = new Date();
  const aanschaf = new Date(activum.aanschafDatum);
  const jarenVerlopen = (nu.getTime() - aanschaf.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  if (activum.afschrijvingMethode === "lineair") {
    const afschrijving =
      ((activum.aanschafWaarde - activum.restwaarde) / activum.afschrijvingJaren) * jarenVerlopen;
    return Math.max(activum.restwaarde, activum.aanschafWaarde - afschrijving);
  } else {
    // degressief
    const factor = 1 - 1 / activum.afschrijvingJaren;
    const boekwaarde = activum.aanschafWaarde * Math.pow(factor, jarenVerlopen);
    return Math.max(activum.restwaarde, boekwaarde);
  }
}

function berekenAfschrijvingDitJaar(activum: VasteActivum): number {
  const nu = new Date();
  const startJaar = new Date(nu.getFullYear(), 0, 1);
  const eindJaar = new Date(nu.getFullYear() + 1, 0, 1);

  const boekwaardeBegin = berekenBoekwaardeOp(activum, startJaar);
  const boekwaardeEind = berekenBoekwaardeOp(activum, eindJaar);

  return Math.max(0, boekwaardeBegin - boekwaardeEind);
}

function berekenBoekwaardeOp(activum: VasteActivum, peildatum: Date): number {
  const aanschaf = new Date(activum.aanschafDatum);
  if (peildatum <= aanschaf) return activum.aanschafWaarde;

  const jarenVerlopen =
    (peildatum.getTime() - aanschaf.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  if (activum.afschrijvingMethode === "lineair") {
    const afschrijving =
      ((activum.aanschafWaarde - activum.restwaarde) / activum.afschrijvingJaren) * jarenVerlopen;
    return Math.max(activum.restwaarde, activum.aanschafWaarde - afschrijving);
  } else {
    const factor = 1 - 1 / activum.afschrijvingJaren;
    const boekwaarde = activum.aanschafWaarde * Math.pow(factor, jarenVerlopen);
    return Math.max(activum.restwaarde, boekwaarde);
  }
}

export default function VasteActivaPage() {
  const [activa, setActiva] = useState<VasteActivum[]>([]);
  const [laden, setLaden] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [opslaan, setOpslaan] = useState(false);
  const [formulier, setFormulier] = useState(LEEG_FORMULIER);

  const haalActivaOp = useCallback(async () => {
    try {
      const data = await window.api.vasteActiva.list();
      setActiva(Array.isArray(data) ? (data as VasteActivum[]) : []);
    } catch {
      toonMelding("fout", "Kon vaste activa niet laden");
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    haalActivaOp();
  }, [haalActivaOp]);

  function toonMelding(type: "succes" | "fout", tekst: string) {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 4000);
  }

  function resetFormulier() {
    setFormulier(LEEG_FORMULIER);
    setBewerkenId(null);
  }

  function openBewerken(activum: VasteActivum) {
    setFormulier({
      naam: activum.naam,
      aanschafDatum: activum.aanschafDatum.split("T")[0],
      aanschafWaarde: String(activum.aanschafWaarde),
      afschrijvingMethode: activum.afschrijvingMethode,
      afschrijvingJaren: String(activum.afschrijvingJaren),
      restwaarde: String(activum.restwaarde),
      categorieNaam: activum.categorieNaam ?? "",
      notities: activum.notities ?? "",
    });
    setBewerkenId(activum.id);
    setModalOpen(true);
  }

  async function slaOp() {
    if (!formulier.naam || !formulier.aanschafDatum || !formulier.aanschafWaarde || !formulier.afschrijvingJaren) {
      toonMelding("fout", "Vul alle verplichte velden in");
      return;
    }
    setOpslaan(true);
    try {
      const payload = {
        naam: formulier.naam,
        aanschafDatum: formulier.aanschafDatum,
        aanschafWaarde: parseFloat(formulier.aanschafWaarde) || 0,
        afschrijvingMethode: formulier.afschrijvingMethode,
        afschrijvingJaren: parseInt(formulier.afschrijvingJaren) || 1,
        restwaarde: parseFloat(formulier.restwaarde) || 0,
        categorieNaam: formulier.categorieNaam || null,
        notities: formulier.notities || null,
      };
      if (bewerkenId) {
        await window.api.vasteActiva.update(bewerkenId, payload);
      } else {
        await window.api.vasteActiva.create(payload);
      }
      toonMelding("succes", bewerkenId ? "Activum bijgewerkt" : "Activum toegevoegd");
      setModalOpen(false);
      resetFormulier();
      haalActivaOp();
    } catch {
      toonMelding("fout", "Opslaan mislukt");
    } finally {
      setOpslaan(false);
    }
  }

  async function verwijder(id: string) {
    if (!confirm("Weet je zeker dat je dit activum wilt verwijderen?")) return;
    try {
      await window.api.vasteActiva.delete(id);
      toonMelding("succes", "Activum verwijderd");
      haalActivaOp();
    } catch {
      toonMelding("fout", "Verwijderen mislukt");
    }
  }

  // Samenvatting
  const totaalAanschafwaarde = activa.reduce((s, a) => s + a.aanschafWaarde, 0);
  const totaalBoekwaarde = activa.reduce((s, a) => s + berekenBoekwaarde(a), 0);
  const afschrijvingDitJaar = activa.reduce((s, a) => s + berekenAfschrijvingDitJaar(a), 0);

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Vaste activa"
        subtitel="Beheer je bedrijfsmiddelen en afschrijvingen"
        acties={
          <Button
            onClick={() => {
              resetFormulier();
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Activum toevoegen
          </Button>
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

        {/* Samenvatting cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <Building className="h-4 w-4" />
                Totaal aanschafwaarde
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900">{formatBedrag(totaalAanschafwaarde)}</p>
              <p className="text-xs text-gray-400 mt-1">{activa.length} activa</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Totale boekwaarde</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-indigo-600">{formatBedrag(totaalBoekwaarde)}</p>
              <p className="text-xs text-gray-400 mt-1">Huidige waarde</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Afschrijving dit jaar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">{formatBedrag(afschrijvingDitJaar)}</p>
              <p className="text-xs text-gray-400 mt-1">Kosten {new Date().getFullYear()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabel */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Categorie</TableHead>
                <TableHead>Aanschafdatum</TableHead>
                <TableHead className="text-right">Aanschafwaarde</TableHead>
                <TableHead className="text-right">Boekwaarde</TableHead>
                <TableHead className="text-right">Restwaarde</TableHead>
                <TableHead className="text-center">Methode</TableHead>
                <TableHead className="text-center">Jaren</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {laden ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : activa.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-gray-400">
                    <Building className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">Geen activa gevonden</p>
                    <p className="text-sm mt-1">Voeg je eerste bedrijfsmiddel toe</p>
                  </TableCell>
                </TableRow>
              ) : (
                activa.map((activum) => {
                  const boekwaarde = berekenBoekwaarde(activum);
                  return (
                    <TableRow key={activum.id}>
                      <TableCell className="font-medium text-gray-900">{activum.naam}</TableCell>
                      <TableCell className="text-gray-600 text-sm">
                        {activum.categorieNaam ?? <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell className="text-gray-600 whitespace-nowrap">
                        {formatDatum(activum.aanschafDatum)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatBedrag(activum.aanschafWaarde)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-indigo-700">
                        {formatBedrag(boekwaarde)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-gray-600">
                        {formatBedrag(activum.restwaarde)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                          {activum.afschrijvingMethode}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-gray-600">
                        {activum.afschrijvingJaren}j
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openBewerken(activum)}
                            title="Bewerken"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => verwijder(activum.id)}
                            title="Verwijderen"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
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
            <ModalTitle>{bewerkenId ? "Activum bewerken" : "Nieuw activum"}</ModalTitle>
          </ModalHeader>
          <div className="space-y-4">
            <Input
              label="Naam *"
              value={formulier.naam}
              onChange={(e) => setFormulier({ ...formulier, naam: e.target.value })}
              placeholder="Bijv. Laptop, Auto, Machine"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Aanschafdatum *"
                type="date"
                value={formulier.aanschafDatum}
                onChange={(e) => setFormulier({ ...formulier, aanschafDatum: e.target.value })}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Aanschafwaarde *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formulier.aanschafWaarde}
                    onChange={(e) => setFormulier({ ...formulier, aanschafWaarde: e.target.value })}
                    className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Afschrijvingsmethode
                </label>
                <select
                  value={formulier.afschrijvingMethode}
                  onChange={(e) => setFormulier({ ...formulier, afschrijvingMethode: e.target.value })}
                  className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <option value="lineair">Lineair</option>
                  <option value="degressief">Degressief</option>
                </select>
              </div>
              <Input
                label="Afschrijvingsjaren *"
                type="number"
                min="1"
                step="1"
                value={formulier.afschrijvingJaren}
                onChange={(e) => setFormulier({ ...formulier, afschrijvingJaren: e.target.value })}
                placeholder="Bijv. 5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Restwaarde</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formulier.restwaarde}
                    onChange={(e) => setFormulier({ ...formulier, restwaarde: e.target.value })}
                    className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <Input
                label="Categorie"
                value={formulier.categorieNaam}
                onChange={(e) => setFormulier({ ...formulier, categorieNaam: e.target.value })}
                placeholder="Bijv. ICT, Voertuig"
              />
            </div>
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

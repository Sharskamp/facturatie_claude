import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  Car,
  Loader2,
  MapPin,
  Receipt,
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
  gefactureerd: boolean;
  factuurId?: string | null;
}

interface Klant {
  id: string;
  naam: string;
  bedrijf?: string | null;
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

interface VasteRit {
  id: string;
  van: string;
  naar: string;
  omschrijving: string;
}

const VASTE_RITTEN_KEY = "km_vaste_ritten";

function laadVasteRitten(): VasteRit[] {
  try { return JSON.parse(localStorage.getItem(VASTE_RITTEN_KEY) ?? "[]"); } catch { return []; }
}
function slaVasteRittenOp(r: VasteRit[]) {
  localStorage.setItem(VASTE_RITTEN_KEY, JSON.stringify(r));
}

async function geocodeer(adres: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(adres)}&format=json&limit=1`, { headers: { "User-Agent": "AdminPro/1.0" } });
    const data = await r.json() as Array<{ lat: string; lon: string }>;
    if (!data[0]) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch { return null; }
}

async function berekenAfstand(van: string, naar: string): Promise<number | null> {
  const [p1, p2] = await Promise.all([geocodeer(van), geocodeer(naar)]);
  if (!p1 || !p2) return null;
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${p1.lon},${p1.lat};${p2.lon},${p2.lat}?overview=false`);
    const data = await r.json() as { routes?: Array<{ distance: number }> };
    if (!data.routes?.[0]) return null;
    return Math.round((data.routes[0].distance / 1000) * 10) / 10;
  } catch { return null; }
}

export default function KilometerPagina() {
  const navigate = useNavigate();
  const [ritten, setRitten] = useState<Rit[]>([]);
  const [laden, setLaden] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [opslaan, setOpslaan] = useState(false);
  const [formulier, setFormulier] = useState(LEEG_FORMULIER);
  const [kmVergoeding, setKmVergoeding] = useState<number>(0.23);
  const [geselecteerd, setGeselecteerd] = useState<string[]>([]);
  const [doorbelastenModal, setDoorbelastenModal] = useState(false);
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [geselecteerdeKlantId, setGeselecteerdeKlantId] = useState<string>("");
  const [doorbelasten, setDoorbelasten] = useState(false);
  const [vasteRitten, setVasteRitten] = useState<VasteRit[]>(() => laadVasteRitten());
  const [afstandLaden, setAfstandLaden] = useState(false);

  useEffect(() => {
    window.api.instellingen.get().then((data: any) => {
      if (data?.kmVergoeding != null) setKmVergoeding(data.kmVergoeding);
    }).catch(() => {});
  }, []);

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

  const toggleSelectie = (id: string) => {
    setGeselecteerd((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const openDoorbelastenModal = async () => {
    try {
      const data = await window.api.klanten.list();
      setKlanten(Array.isArray(data) ? data : []);
      setGeselecteerdeKlantId("");
      setDoorbelastenModal(true);
    } catch {
      toonMelding("fout", "Kon klanten niet laden");
    }
  };

  const bevestigDoorbelasten = async () => {
    if (!geselecteerdeKlantId) return;
    setDoorbelasten(true);
    try {
      const result = await window.api.ritten.doorbelasten({
        klantId: geselecteerdeKlantId,
        ritIds: geselecteerd,
      });
      setDoorbelastenModal(false);
      setGeselecteerd([]);
      await haalRittenOp();
      toonMelding("succes", `Factuur ${result.nummer} aangemaakt`);
      navigate(`/facturen/${result.id}`);
    } catch {
      toonMelding("fout", "Doorbelasten mislukt");
    } finally {
      setDoorbelasten(false);
    }
  };

  const resetFormulier = () => {
    setFormulier(LEEG_FORMULIER);
    setBewerkenId(null);
  };

  const slaVasteRitOp = () => {
    if (!formulier.van || !formulier.naar) return;
    const nieuw: VasteRit = { id: crypto.randomUUID(), van: formulier.van, naar: formulier.naar, omschrijving: formulier.omschrijving };
    const bijgewerkt = [...vasteRitten, nieuw];
    setVasteRitten(bijgewerkt);
    slaVasteRittenOp(bijgewerkt);
  };

  const verwijderVasteRit = (id: string) => {
    const bijgewerkt = vasteRitten.filter(r => r.id !== id);
    setVasteRitten(bijgewerkt);
    slaVasteRittenOp(bijgewerkt);
  };

  const selecteerVasteRit = (rit: VasteRit) => {
    setFormulier(f => ({ ...f, van: rit.van, naar: rit.naar, omschrijving: rit.omschrijving || f.omschrijving }));
  };

  const berekenKm = async () => {
    if (!formulier.van || !formulier.naar) return;
    setAfstandLaden(true);
    const km = await berekenAfstand(formulier.van, formulier.naar);
    setAfstandLaden(false);
    if (km !== null) {
      setFormulier(f => ({ ...f, kilometers: String(km) }));
    } else {
      toonMelding("fout", "Afstand kon niet worden berekend. Controleer de adressen.");
    }
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
              <p className="text-xs text-gray-400 mt-1">Op basis van € {kmVergoeding.toFixed(3)}/km</p>
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

        {/* Actie-bar selectie */}
        {geselecteerd.length > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
            <span className="text-sm font-medium text-indigo-800">
              {geselecteerd.length} rit{geselecteerd.length !== 1 ? "ten" : ""} geselecteerd
            </span>
            <Button size="sm" onClick={openDoorbelastenModal} className="gap-2">
              <Receipt className="h-4 w-4" />
              Doorbelasten naar klant
            </Button>
          </div>
        )}

        {/* Tabel */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
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
                  <TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : ritten.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-400">
                    Geen ritten geregistreerd
                  </TableCell>
                </TableRow>
              ) : (
                ritten.map((rit) => (
                  <TableRow
                    key={rit.id}
                    className={rit.gefactureerd ? "opacity-60" : undefined}
                  >
                    <TableCell>
                      {!rit.gefactureerd && (
                        <input
                          type="checkbox"
                          checked={geselecteerd.includes(rit.id)}
                          onChange={() => toggleSelectie(rit.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 cursor-pointer"
                        />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-gray-500">
                      {formatDatum(rit.datum)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <span className={`font-medium ${rit.gefactureerd ? "line-through text-gray-400" : "text-gray-900"}`}>{rit.van}</span>
                        <span className="text-gray-400">→</span>
                        <span className={`font-medium ${rit.gefactureerd ? "line-through text-gray-400" : "text-gray-900"}`}>{rit.naar}</span>
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
                      {rit.gefactureerd ? (
                        <Badge variant="default">Gefactureerd</Badge>
                      ) : (
                        <Badge variant={rit.zakelijk ? "success" : "default"}>
                          {rit.zakelijk ? "Zakelijk" : "Privé"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {rit.gefactureerd ? (
                          rit.factuurId && (
                            <button
                              onClick={() => navigate(`/facturen/${rit.factuurId}`)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              Bekijken
                            </button>
                          )
                        ) : (
                          <>
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
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Doorbelasten modal */}
      <Modal open={doorbelastenModal} onOpenChange={setDoorbelastenModal}>
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>Ritten doorbelasten naar klant</ModalTitle>
          </ModalHeader>
          <div className="space-y-4">
            {/* Klant selectie */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Klant *
              </label>
              <select
                value={geselecteerdeKlantId}
                onChange={(e) => setGeselecteerdeKlantId(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Selecteer een klant...</option>
                {klanten.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.naam}{k.bedrijf ? ` — ${k.bedrijf}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Overzicht geselecteerde ritten */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Geselecteerde ritten
              </p>
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {ritten
                  .filter((r) => geselecteerd.includes(r.id))
                  .map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-gray-700">
                        {r.van} → {r.naar}
                      </span>
                      <span className="font-mono font-medium text-gray-900">
                        {r.kilometers.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km
                      </span>
                    </div>
                  ))}
              </div>
              <div className="flex items-center justify-between mt-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-sm font-semibold text-indigo-800">
                <span>Totaal</span>
                <span>
                  {ritten
                    .filter((r) => geselecteerd.includes(r.id))
                    .reduce((s, r) => s + r.kilometers, 0)
                    .toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km
                </span>
              </div>
            </div>
          </div>
          <ModalFooter className="mt-6 gap-2">
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button
              onClick={bevestigDoorbelasten}
              disabled={!geselecteerdeKlantId || doorbelasten}
              className="gap-2"
            >
              {doorbelasten && <Loader2 className="h-4 w-4 animate-spin" />}
              Factuur aanmaken
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

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
            {/* Vaste ritten */}
            {vasteRitten.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Vaste ritten</p>
                <div className="flex flex-wrap gap-1.5">
                  {vasteRitten.map(r => (
                    <div key={r.id} className="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 pl-3 pr-1 py-1">
                      <button type="button" onClick={() => selecteerVasteRit(r)} className="text-xs text-indigo-700 font-medium hover:text-indigo-900">
                        {r.omschrijving || `${r.van} → ${r.naar}`}
                      </button>
                      <button type="button" onClick={() => verwijderVasteRit(r.id)} className="ml-1 h-4 w-4 flex items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-700">
                        <span className="text-[10px]">✕</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Datum *"
                type="date"
                value={formulier.datum}
                onChange={(e) => setFormulier({ ...formulier, datum: e.target.value })}
              />
              <div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
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
                  <button
                    type="button"
                    onClick={berekenKm}
                    disabled={afstandLaden || !formulier.van || !formulier.naar}
                    className="h-9 px-2 text-xs rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 whitespace-nowrap flex items-center gap-1"
                    title="Bereken kilometers via routeplanner"
                  >
                    {afstandLaden ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                    Bereken
                  </button>
                </div>
              </div>
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
            {formulier.van && formulier.naar && (
              <button
                type="button"
                onClick={slaVasteRitOp}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <span>+</span> Sla op als vaste rit
              </button>
            )}
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

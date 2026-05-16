import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Loader2,
  Users,
  FileText,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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

interface ContextMenu {
  x: number;
  y: number;
  klant: Klant;
}

interface Klant {
  id: string;
  naam: string;
  bedrijf?: string | null;
  email?: string | null;
  telefoon?: string | null;
  adres?: string | null;
  postcode?: string | null;
  stad?: string | null;
  land: string;
  kvkNummer?: string | null;
  btwNummer?: string | null;
  notities?: string | null;
  _count?: { facturen: number };
}

const LEEG_FORMULIER: Partial<Klant> = {
  naam: "",
  bedrijf: "",
  email: "",
  telefoon: "",
  adres: "",
  postcode: "",
  stad: "",
  land: "Nederland",
  kvkNummer: "",
  btwNummer: "",
  notities: "",
};

export default function KlantenPage() {
  const navigate = useNavigate();
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [laden, setLaden] = useState(true);
  const [zoekterm, setZoekterm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [verwijderModalOpen, setVerwijderModalOpen] = useState(false);
  const [geselecteerdeKlant, setGeselecteerdeKlant] = useState<Klant | null>(null);
  const [formulier, setFormulier] = useState<Partial<Klant>>(LEEG_FORMULIER);
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const laadKlanten = useCallback(async (zoek = "") => {
    try {
      const data = await window.api.klanten.list(zoek ? { zoek } : undefined);
      setKlanten(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Fout bij laden klanten:", e);
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    laadKlanten();
  }, [laadKlanten]);

  // Debounced zoeken
  useEffect(() => {
    const timer = setTimeout(() => laadKlanten(zoekterm), 300);
    return () => clearTimeout(timer);
  }, [zoekterm, laadKlanten]);

  // Sluit context menu bij klik buiten
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    if (contextMenu) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  function handleContextMenu(e: React.MouseEvent, klant: Klant) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, klant });
  }

  function openNieuw() {
    setGeselecteerdeKlant(null);
    setFormulier(LEEG_FORMULIER);
    setFout(null);
    setModalOpen(true);
  }

  function openBewerken(klant: Klant, e: React.MouseEvent) {
    e.stopPropagation();
    setGeselecteerdeKlant(klant);
    setFormulier({
      naam: klant.naam,
      bedrijf: klant.bedrijf ?? "",
      email: klant.email ?? "",
      telefoon: klant.telefoon ?? "",
      adres: klant.adres ?? "",
      postcode: klant.postcode ?? "",
      stad: klant.stad ?? "",
      land: klant.land,
      kvkNummer: klant.kvkNummer ?? "",
      btwNummer: klant.btwNummer ?? "",
      notities: klant.notities ?? "",
    });
    setFout(null);
    setModalOpen(true);
  }

  function openVerwijder(klant: Klant, e: React.MouseEvent) {
    e.stopPropagation();
    setGeselecteerdeKlant(klant);
    setVerwijderModalOpen(true);
  }

  async function slaOp() {
    if (!formulier.naam?.trim()) {
      setFout("Naam is verplicht");
      return;
    }
    setOpslaan(true);
    setFout(null);
    try {
      if (geselecteerdeKlant) {
        await window.api.klanten.update(geselecteerdeKlant.id, formulier);
      } else {
        await window.api.klanten.create(formulier);
      }
      setModalOpen(false);
      laadKlanten(zoekterm);
    } catch (e: unknown) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setOpslaan(false);
    }
  }

  async function verwijder() {
    if (!geselecteerdeKlant) return;
    try {
      await window.api.klanten.delete(geselecteerdeKlant.id);
      setVerwijderModalOpen(false);
      laadKlanten(zoekterm);
    } catch (e) {
      console.error("Fout bij verwijderen:", e);
    }
  }

  function updateFormulier(veld: keyof Klant, waarde: string) {
    setFormulier((prev) => ({ ...prev, [veld]: waarde }));
  }

  return (
    <div>
      <Header
        titel="Klanten"
        subtitel={`${klanten.length} klant${klanten.length !== 1 ? "en" : ""}`}
        acties={
          <Button onClick={openNieuw} className="gap-2">
            <Plus className="h-4 w-4" />
            Nieuwe klant
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Zoekbalk */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Zoek op naam, bedrijf of e-mail..."
              value={zoekterm}
              onChange={(e) => setZoekterm(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {laden ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              </div>
            ) : klanten.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Users className="h-12 w-12 text-gray-200 mb-3" />
                <p className="text-gray-500 font-medium">Geen klanten gevonden</p>
                <p className="text-sm text-gray-400 mt-1">
                  {zoekterm ? "Probeer een andere zoekterm" : "Voeg uw eerste klant toe"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead>Bedrijf</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Telefoon</TableHead>
                    <TableHead className="text-center">Facturen</TableHead>
                    <TableHead className="text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {klanten.map((klant) => (
                    <TableRow
                      key={klant.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/klanten/${klant.id}`)}
                      onContextMenu={(e) => handleContextMenu(e, klant)}
                    >
                      <TableCell className="font-medium text-gray-900">
                        {klant.naam}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {klant.bedrijf ?? "-"}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {klant.email ?? "-"}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {klant.telefoon ?? "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
                          {klant._count?.facturen ?? 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/klanten/${klant.id}`);
                            }}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Bekijken"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => openBewerken(klant, e)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Bewerken"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => openVerwijder(klant, e)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Verwijderen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[200px]"
        >
          <button
            onClick={() => {
              navigate(`/klanten/${contextMenu.klant.id}`);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <Eye className="h-4 w-4 text-gray-400" />
            Bekijk klant
          </button>
          <button
            onClick={() => {
              navigate(`/facturen/nieuw?klantId=${contextMenu.klant.id}`);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <FileText className="h-4 w-4 text-gray-400" />
            Nieuwe factuur voor klant
          </button>
          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={() => {
              openVerwijder(contextMenu.klant, { stopPropagation: () => {} } as React.MouseEvent);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Verwijderen
          </button>
        </div>
      )}

      {/* Klant aanmaken / bewerken modal */}
      <Modal open={modalOpen} onOpenChange={setModalOpen}>
        <ModalContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <ModalHeader>
            <ModalTitle>
              {geselecteerdeKlant ? "Klant bewerken" : "Nieuwe klant"}
            </ModalTitle>
          </ModalHeader>

          <div className="space-y-4">
            {fout && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {fout}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Naam *"
                value={formulier.naam ?? ""}
                onChange={(e) => updateFormulier("naam", e.target.value)}
                placeholder="Jan de Vries"
                fout={fout && !formulier.naam?.trim() ? "Verplicht" : undefined}
              />
              <Input
                label="Bedrijf"
                value={formulier.bedrijf ?? ""}
                onChange={(e) => updateFormulier("bedrijf", e.target.value)}
                placeholder="De Vries BV"
              />
              <Input
                label="E-mail"
                type="email"
                value={formulier.email ?? ""}
                onChange={(e) => updateFormulier("email", e.target.value)}
                placeholder="jan@devries.nl"
              />
              <Input
                label="Telefoon"
                value={formulier.telefoon ?? ""}
                onChange={(e) => updateFormulier("telefoon", e.target.value)}
                placeholder="+31 6 12345678"
              />
            </div>

            <Input
              label="Adres"
              value={formulier.adres ?? ""}
              onChange={(e) => updateFormulier("adres", e.target.value)}
              placeholder="Hoofdstraat 1"
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Input
                label="Postcode"
                value={formulier.postcode ?? ""}
                onChange={(e) => updateFormulier("postcode", e.target.value)}
                placeholder="1234 AB"
              />
              <Input
                label="Stad"
                value={formulier.stad ?? ""}
                onChange={(e) => updateFormulier("stad", e.target.value)}
                placeholder="Amsterdam"
              />
              <Input
                label="Land"
                value={formulier.land ?? "Nederland"}
                onChange={(e) => updateFormulier("land", e.target.value)}
                placeholder="Nederland"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="KVK-nummer"
                value={formulier.kvkNummer ?? ""}
                onChange={(e) => updateFormulier("kvkNummer", e.target.value)}
                placeholder="12345678"
              />
              <Input
                label="BTW-nummer"
                value={formulier.btwNummer ?? ""}
                onChange={(e) => updateFormulier("btwNummer", e.target.value)}
                placeholder="NL123456789B01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notities
              </label>
              <Textarea
                value={formulier.notities ?? ""}
                onChange={(e) => updateFormulier("notities", e.target.value)}
                placeholder="Interne notities over deze klant..."
                rows={3}
              />
            </div>
          </div>

          <ModalFooter className="mt-6 gap-2">
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={slaOp} disabled={opslaan} className="gap-2">
              {opslaan && <Loader2 className="h-4 w-4 animate-spin" />}
              {geselecteerdeKlant ? "Opslaan" : "Aanmaken"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Verwijder bevestiging modal */}
      <Modal open={verwijderModalOpen} onOpenChange={setVerwijderModalOpen}>
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle>Klant verwijderen</ModalTitle>
          </ModalHeader>
          <p className="text-sm text-gray-600">
            Weet u zeker dat u{" "}
            <span className="font-semibold">{geselecteerdeKlant?.naam}</span> wilt
            verwijderen? Dit kan niet ongedaan worden gemaakt.
          </p>
          <ModalFooter className="mt-4 gap-2">
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button
              variant="destructive"
              onClick={verwijder}
            >
              Verwijderen
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

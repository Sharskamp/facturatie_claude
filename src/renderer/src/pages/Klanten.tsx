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
  Archive,
  ArchiveRestore,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
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
  betaalTermijn?: number | null;
  taal?: string;
  actief: boolean;
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
  betaalTermijn: undefined,
  taal: "nl",
};

interface CsvKlantRij {
  _id: string;
  naam: string;
  bedrijf: string;
  email: string;
  telefoon: string;
  adres: string;
  postcode: string;
  stad: string;
  land: string;
  kvkNummer: string;
  btwNummer: string;
  iban: string;
  notities: string;
  fout?: string;
  geimporteerd?: boolean;
}

const VOORBEELD_CSV = `naam;bedrijf;email;telefoon;adres;postcode;stad;land;kvkNummer;btwNummer;iban;notities
Jan de Vries;De Vries BV;jan@devries.nl;+31612345678;Hoofdstraat 1;1234 AB;Amsterdam;Nederland;12345678;NL123456789B01;NL02ABNA0123456789;VIP klant
Petra Smit;;petra@smit.nl;0612345679;Kerkstraat 5;2345 BC;Rotterdam;Nederland;;;;Particulier`;

function parseerKlantenCsv(tekst: string): CsvKlantRij[] {
  const regels = tekst.split(/\r?\n/).filter((r) => r.trim());
  if (regels.length < 2) return [];
  const sep = regels[0].includes(";") ? ";" : ",";
  const headers = regels[0].split(sep).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  function kol(rij: string[], namen: string[]): string {
    for (const n of namen) {
      const idx = headers.indexOf(n);
      if (idx !== -1 && rij[idx] !== undefined) return rij[idx].trim().replace(/^["']|["']$/g, "");
    }
    return "";
  }

  return regels.slice(1).map((regel, i) => {
    const cellen = regel.split(sep);
    return {
      _id: String(i),
      naam: kol(cellen, ["naam", "name", "contactpersoon"]),
      bedrijf: kol(cellen, ["bedrijf", "company", "bedrijfsnaam"]),
      email: kol(cellen, ["email", "e-mail", "emailadres"]),
      telefoon: kol(cellen, ["telefoon", "phone", "tel", "mobiel"]),
      adres: kol(cellen, ["adres", "address", "straat"]),
      postcode: kol(cellen, ["postcode", "zip", "zipcode"]),
      stad: kol(cellen, ["stad", "city", "plaats"]),
      land: kol(cellen, ["land", "country"]) || "Nederland",
      kvkNummer: kol(cellen, ["kvknummer", "kvk", "kvk-nummer", "chamberofcommerce"]),
      btwNummer: kol(cellen, ["btwnummer", "btw", "btw-nummer", "vatnumber", "vat"]),
      iban: kol(cellen, ["iban", "rekeningnummer", "banknummer"]),
      notities: kol(cellen, ["notities", "notes", "opmerking", "opmerkingen"]),
    };
  }).filter((r) => r.naam.trim());
}

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

  // CSV import state
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvStap, setCsvStap] = useState<"upload" | "review" | "klaar">("upload");
  const [csvRijen, setCsvRijen] = useState<CsvKlantRij[]>([]);
  const [csvImportBezig, setCsvImportBezig] = useState(false);
  const [csvResultaat, setCsvResultaat] = useState<{ succes: number; fouten: number }>({ succes: 0, fouten: 0 });
  const [csvDragOver, setCsvDragOver] = useState(false);
  const csvBestandRef = useRef<HTMLInputElement>(null);

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
      betaalTermijn: klant.betaalTermijn ?? undefined,
      taal: klant.taal ?? "nl",
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

  async function archiveer(klant: Klant, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await window.api.klanten.archiveer(klant.id);
      laadKlanten(zoekterm);
    } catch (e) {
      console.error("Fout bij archiveren:", e);
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

  function openCsvImport() {
    setCsvStap("upload");
    setCsvRijen([]);
    setCsvResultaat({ succes: 0, fouten: 0 });
    setCsvModalOpen(true);
  }

  function verwerkCsvBestand(bestand: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const tekst = e.target?.result as string;
      const rijen = parseerKlantenCsv(tekst);
      if (rijen.length === 0) {
        alert("Geen geldige rijen gevonden. Controleer het CSV-formaat.");
        return;
      }
      setCsvRijen(rijen);
      setCsvStap("review");
    };
    reader.readAsText(bestand, "utf-8");
  }

  function handleCsvDrop(e: React.DragEvent) {
    e.preventDefault();
    setCsvDragOver(false);
    const bestand = e.dataTransfer.files[0];
    if (bestand) verwerkCsvBestand(bestand);
  }

  function handleCsvKiezen(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0];
    if (bestand) verwerkCsvBestand(bestand);
    e.target.value = "";
  }

  function downloadVoorbeeldCsv() {
    const blob = new Blob([VOORBEELD_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "voorbeeld-klanten.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importeerAlleKlanten() {
    setCsvImportBezig(true);
    let succes = 0;
    let fouten = 0;
    const bijgewerkt = csvRijen.map((r) => ({ ...r }));

    for (let i = 0; i < bijgewerkt.length; i++) {
      const rij = bijgewerkt[i];
      try {
        await window.api.klanten.create({
          naam: rij.naam,
          bedrijf: rij.bedrijf || null,
          email: rij.email || null,
          telefoon: rij.telefoon || null,
          adres: rij.adres || null,
          postcode: rij.postcode || null,
          stad: rij.stad || null,
          land: rij.land || "Nederland",
          kvkNummer: rij.kvkNummer || null,
          btwNummer: rij.btwNummer || null,
          notities: rij.notities || null,
        });
        bijgewerkt[i].geimporteerd = true;
        succes++;
      } catch (e: unknown) {
        bijgewerkt[i].fout = e instanceof Error ? e.message : "Mislukt";
        fouten++;
      }
      setCsvRijen([...bijgewerkt]);
    }

    setCsvResultaat({ succes, fouten });
    setCsvStap("klaar");
    setCsvImportBezig(false);
    laadKlanten(zoekterm);
  }

  return (
    <div>
      <Header
        titel="Klanten"
        subtitel={`${klanten.filter(k => k.actief).length} actieve klant${klanten.filter(k => k.actief).length !== 1 ? "en" : ""}`}
        acties={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openCsvImport} className="gap-2">
              <Upload className="h-4 w-4" />
              Importeer via CSV
            </Button>
            <Button onClick={openNieuw} className="gap-2">
              <Plus className="h-4 w-4" />
              Nieuwe klant
            </Button>
          </div>
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
                      className={`cursor-pointer ${!klant.actief ? "opacity-60 bg-gray-50" : ""}`}
                      onClick={() => navigate(`/klanten/${klant.id}`)}
                      onContextMenu={(e) => handleContextMenu(e, klant)}
                    >
                      <TableCell className="font-medium text-gray-900 max-w-[160px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{klant.naam}</span>
                          {!klant.actief && (
                            <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-normal shrink-0">
                              Gearchiveerd
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-500 max-w-[140px] truncate">
                        {klant.bedrijf ?? "-"}
                      </TableCell>
                      <TableCell className="text-gray-500 max-w-[160px] truncate">
                        {klant.email ?? "-"}
                      </TableCell>
                      <TableCell className="text-gray-500 max-w-[120px] truncate">
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
                            onClick={(e) => archiveer(klant, e)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              klant.actief
                                ? "text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                                : "text-amber-500 hover:text-green-600 hover:bg-green-50"
                            }`}
                            title={klant.actief ? "Archiveren" : "Herstel"}
                          >
                            {klant.actief ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
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
          <button
            onClick={() => {
              archiveer(contextMenu.klant, { stopPropagation: () => {} } as React.MouseEvent);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2"
          >
            <Archive className="h-4 w-4" />
            {contextMenu.klant.actief ? "Archiveren" : "Herstel klant"}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Betaaltermijn (dagen)"
                type="number"
                value={formulier.betaalTermijn ?? ""}
                onChange={(e) => updateFormulier("betaalTermijn", e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Standaard globaal"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Factuurtaal
                </label>
                <select
                  value={formulier.taal ?? "nl"}
                  onChange={(e) => updateFormulier("taal", e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="nl">Nederlands</option>
                  <option value="en">English</option>
                </select>
              </div>
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

      {/* CSV import modal */}
      <Modal open={csvModalOpen} onOpenChange={(open) => { if (!csvImportBezig) setCsvModalOpen(open); }}>
        <ModalContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <ModalHeader>
            <ModalTitle>Klanten importeren via CSV</ModalTitle>
          </ModalHeader>

          {csvStap === "upload" && (
            <div className="space-y-5">
              {/* Formaat uitleg */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
                <p className="text-sm font-semibold text-blue-800">Verwacht CSV-formaat</p>
                <p className="text-xs text-blue-700">
                  Gebruik een komma (<code>,</code>) of puntkomma (<code>;</code>) als scheidingsteken.
                  De eerste rij moet de kolomnamen bevatten. Alleen <strong>naam</strong> is verplicht.
                </p>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse w-full mt-2">
                    <thead>
                      <tr className="bg-blue-100">
                        {["naam *", "bedrijf", "email", "telefoon", "adres", "postcode", "stad", "land", "kvkNummer", "btwNummer", "iban", "notities"].map((k) => (
                          <th key={k} className="border border-blue-200 px-2 py-1 text-left text-blue-800 whitespace-nowrap">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white">
                        {["Jan de Vries", "De Vries BV", "jan@devries.nl", "+31612345678", "Hoofdstraat 1", "1234 AB", "Amsterdam", "Nederland", "12345678", "NL123456789B01", "NL02ABNA...", "VIP klant"].map((v, i) => (
                          <td key={i} className="border border-blue-200 px-2 py-1 text-blue-700 whitespace-nowrap">{v}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={downloadVoorbeeldCsv}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 underline mt-1"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download voorbeeldbestand
                </button>
              </div>

              {/* Upload area */}
              <div
                onDragOver={(e) => { e.preventDefault(); setCsvDragOver(true); }}
                onDragLeave={() => setCsvDragOver(false)}
                onDrop={handleCsvDrop}
                onClick={() => csvBestandRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  csvDragOver ? "border-indigo-400 bg-indigo-50" : "border-gray-300 hover:border-indigo-300 hover:bg-gray-50"
                }`}
              >
                <Upload className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-700">Sleep uw CSV-bestand hierheen</p>
                <p className="text-xs text-gray-400 mt-1">of klik om een bestand te kiezen</p>
                <input ref={csvBestandRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvKiezen} />
              </div>
            </div>
          )}

          {csvStap === "review" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  <strong>{csvRijen.length}</strong> klant{csvRijen.length !== 1 ? "en" : ""} gevonden. Controleer de gegevens en klik op Importeren.
                </p>
                <button
                  onClick={() => setCsvStap("upload")}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Ander bestand kiezen
                </button>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {["Naam", "Bedrijf", "E-mail", "Telefoon", "Adres", "Postcode", "Stad", "Land", "KVK", "BTW", "IBAN", "Notities"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-600 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRijen.map((rij) => (
                      <tr key={rij._id} className="border-b border-gray-100 hover:bg-gray-50">
                        {[rij.naam, rij.bedrijf, rij.email, rij.telefoon, rij.adres, rij.postcode, rij.stad, rij.land, rij.kvkNummer, rij.btwNummer, rij.iban, rij.notities].map((waarde, i) => (
                          <td key={i} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-[120px] truncate">
                            {waarde || <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ModalFooter className="gap-2 pt-0">
                <ModalClose asChild>
                  <Button variant="outline" disabled={csvImportBezig}>Annuleren</Button>
                </ModalClose>
                <Button onClick={importeerAlleKlanten} disabled={csvImportBezig} className="gap-2">
                  {csvImportBezig && <Loader2 className="h-4 w-4 animate-spin" />}
                  {csvImportBezig ? "Bezig met importeren..." : `${csvRijen.length} klanten importeren`}
                </Button>
              </ModalFooter>
            </div>
          )}

          {csvStap === "klaar" && (
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 rounded-lg bg-green-50 border border-green-200 p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
                  <div>
                    <p className="text-lg font-bold text-green-700">{csvResultaat.succes}</p>
                    <p className="text-sm text-green-600">Succesvol geïmporteerd</p>
                  </div>
                </div>
                {csvResultaat.fouten > 0 && (
                  <div className="flex-1 rounded-lg bg-red-50 border border-red-200 p-4 flex items-center gap-3">
                    <AlertCircle className="h-8 w-8 text-red-500 shrink-0" />
                    <div>
                      <p className="text-lg font-bold text-red-700">{csvResultaat.fouten}</p>
                      <p className="text-sm text-red-600">Mislukt</p>
                    </div>
                  </div>
                )}
              </div>

              {csvResultaat.fouten > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2 text-left text-gray-600 font-medium">Naam</th>
                        <th className="px-3 py-2 text-left text-gray-600 font-medium">Status</th>
                        <th className="px-3 py-2 text-left text-gray-600 font-medium">Fout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRijen.filter((r) => r.fout).map((rij) => (
                        <tr key={rij._id} className="border-b border-gray-100 bg-red-50">
                          <td className="px-3 py-2 font-medium text-gray-800">{rij.naam}</td>
                          <td className="px-3 py-2 text-red-600">Mislukt</td>
                          <td className="px-3 py-2 text-red-600">{rij.fout}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <ModalFooter className="gap-2 pt-0">
                <Button onClick={() => setCsvModalOpen(false)}>Sluiten</Button>
              </ModalFooter>
            </div>
          )}
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

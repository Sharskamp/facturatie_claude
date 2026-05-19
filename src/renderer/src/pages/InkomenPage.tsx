import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Link, TrendingUp, Unlink, Search, Loader2, BookOpen } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface Inkomen {
  id: string;
  datum: string;
  omschrijving: string;
  bron: string;
  bedrag: number;
  factuurId?: string | null;
  factuur?: { factuurNummer: string } | null;
  notities?: string | null;
  geboektAlsOmzet: boolean;
}

interface Factuur {
  id: string;
  factuurNummer: string;
  klant?: { naam: string } | null;
  totaal: number;
  status: string;
  vervaldatum?: string | null;
}

const BRON_OPTIES = ["Bank", "Contant", "PayPal", "iDEAL", "Overig"];

const huidigeMaand = () => {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}`;
};

export default function InkomenPagina() {
  const [inkomens, setInkomens] = useState<Inkomen[]>([]);
  const [facturen, setFacturen] = useState<Factuur[]>([]);
  const [laden, setLaden] = useState(true);
  const [maandFilter, setMaandFilter] = useState(huidigeMaand());
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [koppelModalOpen, setKoppelModalOpen] = useState(false);
  const [koppelInkomenId, setKoppelInkomenId] = useState<string | null>(null);
  const [koppelFactuurId, setKoppelFactuurId] = useState("");

  // Smart-match koppeling state
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchInkomen, setMatchInkomen] = useState<Inkomen | null>(null);
  const [matchResultaten, setMatchResultaten] = useState<Factuur[]>([]);
  const [matchLaden, setMatchLaden] = useState(false);
  const [matchGeselecteerdId, setMatchGeselecteerdId] = useState<string>("");

  const [formulier, setFormulier] = useState({
    datum: new Date().toISOString().split("T")[0],
    omschrijving: "",
    bedrag: "",
    bron: "Bank",
    factuurId: "",
    notities: "",
  });

  const haalInkomensOp = useCallback(async () => {
    try {
      const data = await window.api.inkomen.list({ maand: maandFilter });
      setInkomens(Array.isArray(data) ? data : (data as any).inkomens ?? []);
    } catch {
      toonMelding("fout", "Kon inkomens niet laden");
    } finally {
      setLaden(false);
    }
  }, [maandFilter]);

  const haalFacturenOp = useCallback(async () => {
    try {
      const data = await window.api.facturen.list({ status: "VERZONDEN" });
      setFacturen(Array.isArray(data) ? data : (data as any).facturen ?? []);
    } catch {
      // stil falen
    }
  }, []);

  useEffect(() => {
    haalInkomensOp();
    haalFacturenOp();
  }, [haalInkomensOp, haalFacturenOp]);

  const toonMelding = (type: "succes" | "fout", tekst: string) => {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 4000);
  };

  const resetFormulier = () => {
    setFormulier({
      datum: new Date().toISOString().split("T")[0],
      omschrijving: "",
      bedrag: "",
      bron: "Bank",
      factuurId: "",
      notities: "",
    });
    setBewerkenId(null);
  };

  const openBewerken = (inkomen: Inkomen) => {
    setFormulier({
      datum: inkomen.datum.split("T")[0],
      omschrijving: inkomen.omschrijving,
      bedrag: String(inkomen.bedrag),
      bron: inkomen.bron,
      factuurId: inkomen.factuurId ?? "",
      notities: inkomen.notities ?? "",
    });
    setBewerkenId(inkomen.id);
    setModalOpen(true);
  };

  const slaOp = async () => {
    if (!formulier.omschrijving || !formulier.bedrag) {
      toonMelding("fout", "Vul alle verplichte velden in");
      return;
    }
    const payload = {
      ...formulier,
      bedrag: parseFloat(formulier.bedrag),
      factuurId: formulier.factuurId || null,
      // Handmatig toegevoegde inkomsten tellen altijd mee als omzet
      ...(bewerkenId ? {} : { geboektAlsOmzet: true }),
    };
    try {
      if (bewerkenId) {
        await window.api.inkomen.update(bewerkenId, payload);
      } else {
        await window.api.inkomen.create(payload);
      }
      toonMelding("succes", bewerkenId ? "Inkomen bijgewerkt" : "Inkomen toegevoegd");
      setModalOpen(false);
      resetFormulier();
      haalInkomensOp();
    } catch {
      toonMelding("fout", "Opslaan mislukt");
    }
  };

  const verwijder = async (id: string) => {
    if (!confirm("Weet je zeker dat je dit inkomen wilt verwijderen?")) return;
    try {
      await window.api.inkomen.delete(id);
      toonMelding("succes", "Inkomen verwijderd");
      haalInkomensOp();
    } catch {
      toonMelding("fout", "Verwijderen mislukt");
    }
  };

  const openKoppel = (inkomenId: string) => {
    setKoppelInkomenId(inkomenId);
    setKoppelFactuurId("");
    setKoppelModalOpen(true);
  };

  const slaKoppelOp = async () => {
    if (!koppelInkomenId || !koppelFactuurId) return;
    try {
      await window.api.inkomen.update(koppelInkomenId, { factuurId: koppelFactuurId });
      toonMelding("succes", "Gekoppeld aan factuur");
      setKoppelModalOpen(false);
      haalInkomensOp();
    } catch {
      toonMelding("fout", "Koppelen mislukt");
    }
  };

  const ontkoppel = async (id: string) => {
    try {
      await window.api.inkomen.update(id, { factuurId: null });
      toonMelding("succes", "Ontkoppeld van factuur");
      haalInkomensOp();
    } catch {
      toonMelding("fout", "Verbindingsfout");
    }
  };

  const boekAlsOmzet = async (id: string) => {
    try {
      await window.api.inkomen.update(id, { geboektAlsOmzet: true });
      toonMelding("succes", "Geboekt als losse omzet");
      haalInkomensOp();
    } catch {
      toonMelding("fout", "Bijwerken mislukt");
    }
  };

  const openSmartKoppel = async (inkomen: Inkomen) => {
    setMatchInkomen(inkomen);
    setMatchGeselecteerdId("");
    setMatchResultaten([]);
    setMatchModalOpen(true);
    setMatchLaden(true);
    try {
      const resultaten = await window.api.bank.zoekFactuurMatch({ bedrag: inkomen.bedrag, datum: inkomen.datum });
      setMatchResultaten(Array.isArray(resultaten) ? (resultaten as Factuur[]) : []);
    } catch {
      setMatchResultaten([]);
    } finally {
      setMatchLaden(false);
    }
  };

  const koppelViaMatch = async () => {
    if (!matchInkomen || !matchGeselecteerdId) return;
    try {
      const resultaat = await window.api.bank.koppelAanFactuur({ inkomstenId: matchInkomen.id, factuurId: matchGeselecteerdId });
      const gevondenFactuur = matchResultaten.find((f) => f.id === matchGeselecteerdId);
      const nummer = resultaat.factuurNummer || gevondenFactuur?.factuurNummer || matchGeselecteerdId;
      toonMelding("succes", `Factuur ${nummer} gemarkeerd als betaald`);
      setMatchModalOpen(false);
      haalInkomensOp();
      haalFacturenOp();
    } catch {
      toonMelding("fout", "Koppelen mislukt");
    }
  };

  const totaalInkomen = inkomens.reduce((s, i) => s + i.bedrag, 0);
  const gekoppeld = inkomens.filter((i) => i.factuurId);
  const totaalGekoppeld = gekoppeld.reduce((s, i) => s + i.bedrag, 0);
  const totaalNietGekoppeld = totaalInkomen - totaalGekoppeld;
  const wachtOpKoppeling = inkomens.filter((i) => !i.factuurId && !i.geboektAlsOmzet && i.bron === "Bankimport");
  const totaalWachtOpKoppeling = wachtOpKoppeling.reduce((s, i) => s + i.bedrag, 0);

  const maandOpties = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Inkomen"
        subtitel="Beheer je inkomsten"
        acties={
          <Button
            onClick={() => {
              resetFormulier();
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Inkomen toevoegen
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

        {/* Uitleg */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          <p className="font-semibold mb-0.5">Betalingsontvangsten — niet automatisch omzet</p>
          <p className="text-blue-700">Bankimports worden <strong>alleen</strong> gebruikt om facturen als betaald te markeren. Omzet wordt berekend op basis van uitgestuurde facturen. Koppel elke bankbetaling aan een factuur, of boek hem als losse zakelijke omzet.</p>
        </div>

        {/* Samenvatting kaarten */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Totaal ontvangen</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900">{formatBedrag(totaalInkomen)}</p>
              <p className="text-xs text-gray-400 mt-1">{inkomens.length} registraties</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Gekoppeld aan factuur</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatBedrag(totaalGekoppeld)}</p>
              <p className="text-xs text-gray-400 mt-1">{gekoppeld.length} betalingen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Wacht op koppeling</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">{formatBedrag(totaalWachtOpKoppeling)}</p>
              <p className="text-xs text-gray-400 mt-1">{wachtOpKoppeling.length} bankbetalingen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Niet gekoppeld</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-600">{formatBedrag(totaalNietGekoppeld)}</p>
              <p className="text-xs text-gray-400 mt-1">{inkomens.length - gekoppeld.length} registraties</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <TrendingUp className="h-4 w-4 text-gray-400" />
          <Select value={maandFilter} onValueChange={setMaandFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {maandOpties.map((m) => (
                <SelectItem key={m} value={m}>
                  {new Date(m + "-01").toLocaleDateString("nl-NL", {
                    month: "long",
                    year: "numeric",
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabel */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Omschrijving</TableHead>
                <TableHead>Bron</TableHead>
                <TableHead className="text-right">Bedrag</TableHead>
                <TableHead>Factuur</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {laden ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-400">
                    Laden...
                  </TableCell>
                </TableRow>
              ) : inkomens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-400">
                    Geen inkomens gevonden voor deze maand
                  </TableCell>
                </TableRow>
              ) : (
                inkomens.map((inkomen) => (
                  <TableRow key={inkomen.id}>
                    <TableCell className="text-gray-500 whitespace-nowrap">
                      {formatDatum(inkomen.datum)}
                    </TableCell>
                    <TableCell className="font-medium">{inkomen.omschrijving}</TableCell>
                    <TableCell>
                      {inkomen.bron === "Bankimport" && !inkomen.factuurId && !inkomen.geboektAlsOmzet ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">Wacht op koppeling</Badge>
                      ) : inkomen.bron === "Bankimport" && inkomen.geboektAlsOmzet ? (
                        <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">Losse omzet</Badge>
                      ) : (
                        <Badge variant="default">{inkomen.bron}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-700">
                      {formatBedrag(inkomen.bedrag)}
                    </TableCell>
                    <TableCell>
                      {inkomen.factuur ? (
                        <span className="text-indigo-600 text-sm font-medium">
                          {inkomen.factuur.factuurNummer}
                        </span>
                      ) : inkomen.geboektAlsOmzet ? (
                        <span className="text-green-600 text-xs">Losse zakelijke omzet</span>
                      ) : (
                        <span className="text-gray-400 text-xs">Niet gekoppeld</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {inkomen.factuurId ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Ontkoppelen"
                            onClick={() => ontkoppel(inkomen.id)}
                          >
                            <Unlink className="h-4 w-4 text-gray-400" />
                          </Button>
                        ) : inkomen.bron === "Bankimport" && !inkomen.geboektAlsOmzet ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Koppel aan factuur"
                              onClick={() => openSmartKoppel(inkomen)}
                            >
                              <Link className="h-4 w-4 text-indigo-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Boek als losse zakelijke omzet"
                              onClick={() => boekAlsOmzet(inkomen.id)}
                            >
                              <BookOpen className="h-4 w-4 text-green-600" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Koppel aan factuur"
                            onClick={() => openSmartKoppel(inkomen)}
                          >
                            <Link className="h-4 w-4 text-indigo-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openBewerken(inkomen)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => verwijder(inkomen.id)}
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

      {/* Toevoegen / Bewerken Modal */}
      <Modal open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) resetFormulier(); }}>
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>{bewerkenId ? "Inkomen bewerken" : "Inkomen toevoegen"}</ModalTitle>
          </ModalHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Datum"
                type="date"
                value={formulier.datum}
                onChange={(e) => setFormulier({ ...formulier, datum: e.target.value })}
              />
              <Input
                label="Bedrag (€)"
                type="number"
                step="0.01"
                min="0"
                prefix="€"
                value={formulier.bedrag}
                onChange={(e) => setFormulier({ ...formulier, bedrag: e.target.value })}
              />
            </div>
            <Input
              label="Omschrijving"
              value={formulier.omschrijving}
              onChange={(e) => setFormulier({ ...formulier, omschrijving: e.target.value })}
              placeholder="Bijv. Betaling klant X"
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                value={formulier.bron}
                onValueChange={(v) => setFormulier({ ...formulier, bron: v })}
              >
                <SelectTrigger label="Bron">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRON_OPTIES.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={formulier.factuurId}
                onValueChange={(v) => setFormulier({ ...formulier, factuurId: v })}
              >
                <SelectTrigger label="Koppel aan factuur">
                  <SelectValue placeholder="Geen factuur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen factuur</SelectItem>
                  {facturen.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.factuurNummer} — {formatBedrag(f.totaal)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              label="Notities"
              value={formulier.notities}
              onChange={(e) => setFormulier({ ...formulier, notities: e.target.value })}
              placeholder="Optionele notities..."
              rows={3}
            />
          </div>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={slaOp}>
              {bewerkenId ? "Opslaan" : "Toevoegen"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Koppel Modal */}
      <Modal open={koppelModalOpen} onOpenChange={setKoppelModalOpen}>
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <ModalTitle>Koppel aan factuur</ModalTitle>
          </ModalHeader>
          <Select value={koppelFactuurId} onValueChange={setKoppelFactuurId}>
            <SelectTrigger label="Selecteer factuur">
              <SelectValue placeholder="Kies een factuur" />
            </SelectTrigger>
            <SelectContent>
              {facturen.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.factuurNummer}
                  {f.klant ? ` — ${f.klant.naam}` : ""} ({formatBedrag(f.totaal)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={slaKoppelOp} disabled={!koppelFactuurId}>
              Koppelen
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Smart Match Modal */}
      <Modal open={matchModalOpen} onOpenChange={setMatchModalOpen}>
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-indigo-500" />
              Koppel aan factuur
            </ModalTitle>
          </ModalHeader>
          {matchInkomen && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
                <p className="text-gray-500 mb-1">Inkomen</p>
                <p className="font-medium text-gray-900">{matchInkomen.omschrijving}</p>
                <p className="text-gray-500 mt-0.5">
                  {formatBedrag(matchInkomen.bedrag)} &middot; {formatDatum(matchInkomen.datum)}
                </p>
              </div>

              {matchLaden ? (
                <div className="flex items-center justify-center py-6 gap-2 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Zoeken naar overeenkomende facturen...</span>
                </div>
              ) : matchResultaten.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  Geen open facturen gevonden die overeenkomen met dit bedrag.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Gevonden facturen:</p>
                  {matchResultaten.map((f) => (
                    <label
                      key={f.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        matchGeselecteerdId === f.id
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="matchFactuur"
                        value={f.id}
                        checked={matchGeselecteerdId === f.id}
                        onChange={() => setMatchGeselecteerdId(f.id)}
                        className="mt-0.5 h-4 w-4 text-indigo-600 border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {f.factuurNummer}
                          {f.klant ? ` — ${f.klant.naam}` : ""}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatBedrag(f.totaal)}
                          {f.vervaldatum ? ` · Vervalt ${formatDatum(f.vervaldatum)}` : ""}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={koppelViaMatch} disabled={!matchGeselecteerdId || matchLaden}>
              Koppelen &amp; markeer als betaald
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

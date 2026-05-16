"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Link, TrendingUp, Unlink } from "lucide-react";
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
}

interface Factuur {
  id: string;
  factuurNummer: string;
  klant?: { naam: string } | null;
  totaal: number;
  status: string;
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
      const res = await fetch(`/api/inkomen?maand=${maandFilter}`);
      const data = await res.json();
      setInkomens(Array.isArray(data) ? data : data.inkomens ?? []);
    } catch {
      toonMelding("fout", "Kon inkomens niet laden");
    } finally {
      setLaden(false);
    }
  }, [maandFilter]);

  const haalFacturenOp = useCallback(async () => {
    try {
      const res = await fetch("/api/facturen?status=VERZONDEN");
      const data = await res.json();
      setFacturen(Array.isArray(data) ? data : data.facturen ?? []);
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
    };
    try {
      const res = bewerkenId
        ? await fetch(`/api/inkomen/${bewerkenId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/inkomen", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (res.ok) {
        toonMelding("succes", bewerkenId ? "Inkomen bijgewerkt" : "Inkomen toegevoegd");
        setModalOpen(false);
        resetFormulier();
        haalInkomensOp();
      } else {
        toonMelding("fout", "Opslaan mislukt");
      }
    } catch {
      toonMelding("fout", "Verbindingsfout");
    }
  };

  const verwijder = async (id: string) => {
    if (!confirm("Weet je zeker dat je dit inkomen wilt verwijderen?")) return;
    try {
      const res = await fetch(`/api/inkomen/${id}`, { method: "DELETE" });
      if (res.ok) {
        toonMelding("succes", "Inkomen verwijderd");
        haalInkomensOp();
      } else {
        toonMelding("fout", "Verwijderen mislukt");
      }
    } catch {
      toonMelding("fout", "Verbindingsfout");
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
      const res = await fetch(`/api/inkomen/${koppelInkomenId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factuurId: koppelFactuurId }),
      });
      if (res.ok) {
        toonMelding("succes", "Gekoppeld aan factuur");
        setKoppelModalOpen(false);
        haalInkomensOp();
      } else {
        toonMelding("fout", "Koppelen mislukt");
      }
    } catch {
      toonMelding("fout", "Verbindingsfout");
    }
  };

  const ontkoppel = async (id: string) => {
    try {
      const res = await fetch(`/api/inkomen/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factuurId: null }),
      });
      if (res.ok) {
        toonMelding("succes", "Ontkoppeld van factuur");
        haalInkomensOp();
      }
    } catch {
      toonMelding("fout", "Verbindingsfout");
    }
  };

  const totaalInkomen = inkomens.reduce((s, i) => s + i.bedrag, 0);
  const gekoppeld = inkomens.filter((i) => i.factuurId);
  const totaalGekoppeld = gekoppeld.reduce((s, i) => s + i.bedrag, 0);
  const totaalNietGekoppeld = totaalInkomen - totaalGekoppeld;

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

        {/* Samenvatting kaarten */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Totaal inkomen</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900">{formatBedrag(totaalInkomen)}</p>
              <p className="text-xs text-gray-400 mt-1">{inkomens.length} registraties deze maand</p>
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
              <CardTitle className="text-sm font-medium text-gray-500">Niet gekoppeld</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">{formatBedrag(totaalNietGekoppeld)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {inkomens.length - gekoppeld.length} registraties
              </p>
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
                      <Badge variant="default">{inkomen.bron}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-700">
                      {formatBedrag(inkomen.bedrag)}
                    </TableCell>
                    <TableCell>
                      {inkomen.factuur ? (
                        <a
                          href={`/facturen/${inkomen.factuurId}`}
                          className="text-indigo-600 hover:underline text-sm font-medium"
                        >
                          {inkomen.factuur.factuurNummer}
                        </a>
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
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Koppel aan factuur"
                            onClick={() => openKoppel(inkomen.id)}
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
    </div>
  );
}

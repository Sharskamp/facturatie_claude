import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  Loader2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import { formatBedrag } from "@/lib/utils";

interface Product {
  id: string;
  naam: string;
  omschrijving?: string | null;
  prijs: number;
  eenheid?: string | null;
  btwPercentage: number;
  actief: boolean;
  bijgewerkt?: string;
}

const EENHEDEN = ["stuks", "uur", "dag", "maand", "km", "kg", "m²", "project"];
const BTW_TARIEVEN = [21, 9, 0];

const LEEG_FORMULIER = {
  naam: "",
  omschrijving: "",
  prijs: "",
  eenheid: "stuks",
  btwPercentage: "21",
};

interface PrijsHistorieRegel {
  id: string;
  prijs: number;
  aangemaakt: string;
}

export default function ProductenPage() {
  const [producten, setProducten] = useState<Product[]>([]);
  const [laden, setLaden] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [opslaan, setOpslaan] = useState(false);
  const [formulier, setFormulier] = useState(LEEG_FORMULIER);
  const [prijsHistorie, setPrijsHistorie] = useState<PrijsHistorieRegel[]>([]);
  const [geselecteerdId, setGeselecteerdId] = useState<string | null>(null);
  const [historieCache, setHistorieCache] = useState<Record<string, PrijsHistorieRegel[]>>({});
  const [historieLoadt, setHistorieLoadt] = useState(false);

  const haalProductenOp = useCallback(async () => {
    try {
      const data = await window.api.producten.list();
      setProducten(Array.isArray(data) ? (data as Product[]) : []);
    } catch {
      toonMelding("fout", "Kon producten niet laden");
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    haalProductenOp();
  }, [haalProductenOp]);

  const toonMelding = (type: "succes" | "fout", tekst: string) => {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 4000);
  };

  const openBewerken = async (product: Product) => {
    setFormulier({
      naam: product.naam,
      omschrijving: product.omschrijving ?? "",
      prijs: String(product.prijs),
      eenheid: product.eenheid ?? "stuks",
      btwPercentage: String(product.btwPercentage),
    });
    setBewerkenId(product.id);
    setPrijsHistorie([]);
    setModalOpen(true);
    try {
      const historie = await window.api.producten.prijsHistorie(product.id);
      setPrijsHistorie(Array.isArray(historie) ? (historie as PrijsHistorieRegel[]) : []);
    } catch { /* stil falen */ }
  };

  const resetFormulier = () => {
    setFormulier(LEEG_FORMULIER);
    setBewerkenId(null);
    setPrijsHistorie([]);
  };

  const slaOp = async () => {
    if (!formulier.naam || !formulier.prijs) {
      toonMelding("fout", "Vul alle verplichte velden in");
      return;
    }
    setOpslaan(true);
    try {
      const payload = {
        naam: formulier.naam,
        omschrijving: formulier.omschrijving || null,
        prijs: parseFloat(formulier.prijs) || 0,
        eenheid: formulier.eenheid || null,
        btwPercentage: parseInt(formulier.btwPercentage),
      };
      if (bewerkenId) {
        await window.api.producten.update(bewerkenId, payload);
      } else {
        await window.api.producten.create(payload);
      }
      toonMelding("succes", bewerkenId ? "Product bijgewerkt" : "Product toegevoegd");
      setModalOpen(false);
      resetFormulier();
      haalProductenOp();
    } catch {
      toonMelding("fout", "Opslaan mislukt");
    } finally {
      setOpslaan(false);
    }
  };

  const verwijder = async (id: string) => {
    if (!confirm("Weet je zeker dat je dit product wilt verwijderen?")) return;
    try {
      await window.api.producten.delete(id);
      toonMelding("succes", "Product verwijderd");
      haalProductenOp();
    } catch {
      toonMelding("fout", "Verwijderen mislukt");
    }
  };

  const toggleHistorie = async (product: Product) => {
    if (geselecteerdId === product.id) {
      setGeselecteerdId(null);
      return;
    }
    setGeselecteerdId(product.id);
    if (historieCache[product.id]) return;
    setHistorieLoadt(true);
    try {
      const data = await window.api.producten.prijsHistorie(product.id);
      setHistorieCache((prev) => ({ ...prev, [product.id]: Array.isArray(data) ? (data as PrijsHistorieRegel[]) : [] }));
    } catch { /* stil */ } finally {
      setHistorieLoadt(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Producten & diensten"
        subtitel="Beheer je productcatalogus"
        acties={
          <Button
            onClick={() => {
              resetFormulier();
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Nieuw product
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

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Omschrijving</TableHead>
                <TableHead className="text-right">Prijs (excl. BTW)</TableHead>
                <TableHead className="text-center">BTW</TableHead>
                <TableHead className="text-center">Eenheid</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {laden ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : producten.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-gray-400">
                    <Package className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">Geen producten gevonden</p>
                    <p className="text-sm mt-1">Voeg je eerste product of dienst toe</p>
                  </TableCell>
                </TableRow>
              ) : (
                producten.map((product) => {
                  const geselecteerd = geselecteerdId === product.id;
                  const historie = historieCache[product.id] ?? [];
                  const volledigHistorie = [
                    { id: "__huidig__", prijs: product.prijs, aangemaakt: product.bijgewerkt ?? new Date().toISOString(), huidig: true },
                    ...historie.map((h) => ({ ...h, huidig: false })),
                  ];
                  return (
                    <>
                      <TableRow
                        key={product.id}
                        className="cursor-pointer select-none"
                        onClick={() => toggleHistorie(product)}
                      >
                        <TableCell className="font-medium text-gray-900">
                          <span className="flex items-center gap-1.5">
                            {geselecteerd
                              ? <ChevronUp className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                              : <ChevronDown className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
                            {product.naam}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-gray-600">
                          {product.omschrijving ?? <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-gray-900">
                          {formatBedrag(product.prijs)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700">
                            {product.btwPercentage}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-gray-600 text-sm">
                          {product.eenheid ?? <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openBewerken(product)}
                              title="Bewerken"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => verwijder(product.id)}
                              title="Verwijderen"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {geselecteerd && (
                        <TableRow key={`${product.id}-historie`} className="bg-gray-50/60 hover:bg-gray-50/60">
                          <TableCell colSpan={6} className="py-3 px-6">
                            {historieLoadt && historie.length === 0 ? (
                              <div className="flex items-center gap-2 text-sm text-gray-400 py-1">
                                <Loader2 className="h-4 w-4 animate-spin" /> Laden...
                              </div>
                            ) : volledigHistorie.length === 1 ? (
                              <p className="text-xs text-gray-400 py-1">Geen prijswijzigingen geregistreerd.</p>
                            ) : (
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Prijswijzigingen</p>
                                <div className="flex flex-col gap-0">
                                  {volledigHistorie.map((item, i) => {
                                    const volgende = volledigHistorie[i + 1];
                                    const verschil = volgende ? item.prijs - volgende.prijs : null;
                                    return (
                                      <div key={item.id} className="flex items-center gap-3">
                                        {/* Tijdlijn */}
                                        <div className="flex flex-col items-center w-5 shrink-0">
                                          <div className={`w-2.5 h-2.5 rounded-full border-2 ${item.huidig ? "bg-indigo-500 border-indigo-500" : "bg-white border-gray-300"}`} />
                                          {i < volledigHistorie.length - 1 && (
                                            <div className="w-px flex-1 bg-gray-200 my-0.5" style={{ minHeight: 18 }} />
                                          )}
                                        </div>
                                        {/* Inhoud */}
                                        <div className="flex items-center gap-3 py-1.5 min-w-0">
                                          <span className={`font-mono text-sm font-semibold ${item.huidig ? "text-indigo-700" : "text-gray-700"}`}>
                                            {formatBedrag(item.prijs)}
                                          </span>
                                          {item.huidig && (
                                            <span className="text-xs bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5 font-medium">huidig</span>
                                          )}
                                          {verschil !== null && (
                                            <span className={`flex items-center gap-0.5 text-xs font-medium ${verschil > 0 ? "text-emerald-600" : verschil < 0 ? "text-red-500" : "text-gray-400"}`}>
                                              {verschil > 0 ? <TrendingUp className="h-3 w-3" /> : verschil < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                              {verschil > 0 ? "+" : ""}{formatBedrag(Math.abs(verschil))}
                                            </span>
                                          )}
                                          <span className="text-xs text-gray-400 ml-1">
                                            {new Date(item.aangemaakt).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" })}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
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
            <ModalTitle>{bewerkenId ? "Product bewerken" : "Nieuw product"}</ModalTitle>
          </ModalHeader>
          <div className="space-y-4">
            <Input
              label="Naam *"
              value={formulier.naam}
              onChange={(e) => setFormulier({ ...formulier, naam: e.target.value })}
              placeholder="Bijv. Webdesign"
            />
            <Textarea
              label="Omschrijving"
              value={formulier.omschrijving}
              onChange={(e) => setFormulier({ ...formulier, omschrijving: e.target.value })}
              placeholder="Optionele omschrijving..."
              rows={2}
            />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Prijs (excl. BTW) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formulier.prijs}
                    onChange={(e) => setFormulier({ ...formulier, prijs: e.target.value })}
                    className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">BTW</label>
                <select
                  value={formulier.btwPercentage}
                  onChange={(e) => setFormulier({ ...formulier, btwPercentage: e.target.value })}
                  className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {BTW_TARIEVEN.map((t) => (
                    <option key={t} value={t}>{t}%</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Eenheid</label>
              <select
                value={formulier.eenheid}
                onChange={(e) => setFormulier({ ...formulier, eenheid: e.target.value })}
                className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {EENHEDEN.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
          </div>
          {bewerkenId && prijsHistorie.length > 0 && (
            <div className="px-6 pb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Prijsgeschiedenis</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {prijsHistorie.map((r) => (
                  <div key={r.id} className="flex justify-between text-xs text-gray-500 bg-gray-50 rounded px-3 py-1.5">
                    <span>{formatBedrag(r.prijs)}</span>
                    <span className="text-gray-400">
                      {new Date(r.aangemaakt).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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

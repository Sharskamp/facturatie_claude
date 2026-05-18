import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Receipt,
  Tag,
  Loader2,
  Filter,
  Upload,
  ScanLine,
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

interface Categorie {
  id: string;
  naam: string;
  kleur?: string | null;
  standaardBtwTarief?: number | null;
}

interface Uitgave {
  id: string;
  datum: string;
  omschrijving: string;
  leverancier?: string | null;
  bedrag: number;
  btwPercentage: number;
  btw: number;
  totaal: number;
  categorieId?: string | null;
  categorie?: Categorie | null;
  zakelijk: boolean;
  zakelijkPercent: number;
  notities?: string | null;
  bonBestand?: string | null;
}

const BTW_OPTIES = [
  { waarde: "21", label: "21% BTW" },
  { waarde: "9", label: "9% BTW" },
  { waarde: "0", label: "0% BTW" },
];

const CATEGORIE_KLEUREN: Record<string, string> = {
  "#ef4444": "danger",
  "#f97316": "warning",
  "#eab308": "warning",
  "#22c55e": "success",
  "#3b82f6": "info",
  "#8b5cf6": "default",
  "#ec4899": "danger",
};

function categorieBadgeVariant(kleur?: string | null): "default" | "success" | "warning" | "danger" | "info" {
  if (!kleur) return "default";
  const variant = CATEGORIE_KLEUREN[kleur.toLowerCase()];
  return (variant as "default" | "success" | "warning" | "danger" | "info") ?? "default";
}

const huidigeMaand = () => {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}`;
};

const LEEG_FORMULIER = {
  datum: new Date().toISOString().split("T")[0],
  omschrijving: "",
  bedrag: "",
  btwPercentage: "21",
  leverancier: "",
  categorieId: "",
  zakelijk: true,
  zakelijkPercent: 100,
  notities: "",
};

export default function UitgavenPagina() {
  const [uitgaven, setUitgaven] = useState<Uitgave[]>([]);
  const [categorieen, setCategorieen] = useState<Categorie[]>([]);
  const [laden, setLaden] = useState(true);
  const [maandFilter, setMaandFilter] = useState(huidigeMaand());
  const [categorieFilter, setCategorieFilter] = useState("alle");
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [opslaan, setOpslaan] = useState(false);

  const [formulier, setFormulier] = useState(LEEG_FORMULIER);
  const [huidigeBon, setHuidigeBon] = useState<string | null>(null);
  const [pendingBonPad, setPendingBonPad] = useState<string | null>(null);
  const [modalScanLaden, setModalScanLaden] = useState(false);
  // Scan-bon state: welke uitgave heeft net een bon gekregen en klaar is om te scannen
  const [bonScanInfo, setBonScanInfo] = useState<{ uitgaveId: string; bonPad: string } | null>(null);
  const [scanLaden, setScanLaden] = useState(false);

  const haalUitgavenOp = useCallback(async () => {
    try {
      const params: Record<string, string> = { maand: maandFilter };
      if (categorieFilter !== "alle") params.categorieId = categorieFilter;
      const data = await window.api.uitgaven.list(params);
      setUitgaven(Array.isArray(data) ? data : (data as any).uitgaven ?? []);
    } catch {
      toonMelding("fout", "Kon uitgaven niet laden");
    } finally {
      setLaden(false);
    }
  }, [maandFilter, categorieFilter]);

  const haalCategorieenOp = useCallback(async () => {
    try {
      const data = await window.api.categorien.list();
      setCategorieen(Array.isArray(data) ? data : (data as any).categorieen ?? []);
    } catch {
      // stil falen
    }
  }, []);

  useEffect(() => {
    haalUitgavenOp();
  }, [haalUitgavenOp]);

  useEffect(() => {
    haalCategorieenOp();
  }, [haalCategorieenOp]);

  const toonMelding = (type: "succes" | "fout", tekst: string) => {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 4000);
  };

  const resetFormulier = () => {
    setFormulier(LEEG_FORMULIER);
    setBewerkenId(null);
    setHuidigeBon(null);
    setPendingBonPad(null);
  };

  const openBewerken = (uitgave: Uitgave) => {
    setFormulier({
      datum: uitgave.datum.split("T")[0],
      omschrijving: uitgave.omschrijving,
      bedrag: String(uitgave.bedrag),
      btwPercentage: String(uitgave.btwPercentage),
      leverancier: uitgave.leverancier ?? "",
      categorieId: uitgave.categorieId ?? "",
      zakelijk: uitgave.zakelijk,
      zakelijkPercent: uitgave.zakelijkPercent,
      notities: uitgave.notities ?? "",
    });
    setHuidigeBon(uitgave.bonBestand ?? null);
    setBewerkenId(uitgave.id);
    setModalOpen(true);
  };

  const slaOp = async () => {
    if (!formulier.omschrijving || !formulier.bedrag) {
      toonMelding("fout", "Vul alle verplichte velden in");
      return;
    }
    const bedrag = parseFloat(formulier.bedrag);
    const btwPercentage = parseInt(formulier.btwPercentage);
    const btw = (bedrag * btwPercentage) / 100;
    const payload = {
      datum: formulier.datum,
      omschrijving: formulier.omschrijving,
      bedrag,
      btwPercentage,
      btw,
      totaal: bedrag + btw,
      leverancier: formulier.leverancier || null,
      categorieId: formulier.categorieId && formulier.categorieId !== "geen" ? formulier.categorieId : null,
      zakelijk: formulier.zakelijk,
      zakelijkPercent: formulier.zakelijkPercent,
      notities: formulier.notities || null,
    };
    setOpslaan(true);
    try {
      if (bewerkenId) {
        await window.api.uitgaven.update(bewerkenId, payload);
      } else {
        const nieuw = await window.api.uitgaven.create(payload) as { id: string };
        if (pendingBonPad && nieuw.id) {
          await window.api.uitgaven.update(nieuw.id, { bonBestand: pendingBonPad });
        }
      }
      toonMelding("succes", bewerkenId ? "Uitgave bijgewerkt" : "Uitgave toegevoegd");
      setModalOpen(false);
      resetFormulier();
      haalUitgavenOp();
    } catch {
      toonMelding("fout", "Opslaan mislukt");
    } finally {
      setOpslaan(false);
    }
  };

  const verwijder = async (id: string) => {
    if (!confirm("Weet je zeker dat je deze uitgave wilt verwijderen?")) return;
    try {
      await window.api.uitgaven.delete(id);
      toonMelding("succes", "Uitgave verwijderd");
      haalUitgavenOp();
    } catch {
      toonMelding("fout", "Verwijderen mislukt");
    }
  };

  const kiesBonHandler = async () => {
    if (bewerkenId) {
      const res = await window.api.uitgaven.uploadBon({ uitgaveId: bewerkenId }) as { succes: boolean; pad?: string };
      if (res.succes && res.pad) {
        setHuidigeBon(res.pad);
        haalUitgavenOp();
      }
    } else {
      const res = await window.api.uitgaven.kiesBon();
      if (res.succes && res.pad) {
        setPendingBonPad(res.pad);
      }
    }
  };

  const scanBonInModal = async () => {
    const bonPad = huidigeBon || pendingBonPad;
    if (!bonPad) return;
    setModalScanLaden(true);
    try {
      const res = await window.api.uitgaven.scanBon({ bonPad }) as {
        bedrag?: number | null;
        leverancier?: string | null;
        datum?: string | null;
        error?: string;
      };
      if (res.error) {
        toonMelding("fout", res.error);
      } else {
        setFormulier((prev) => ({
          ...prev,
          ...(res.bedrag != null ? { bedrag: String(res.bedrag) } : {}),
          ...(res.leverancier ? { leverancier: res.leverancier } : {}),
          ...(res.datum ? { datum: res.datum } : {}),
        }));
        toonMelding("succes", "Gegevens uitgelezen en ingevuld");
      }
    } catch {
      toonMelding("fout", "Scannen mislukt");
    } finally {
      setModalScanLaden(false);
    }
  };

  const totaalUitgaven = uitgaven.reduce((s, u) => s + u.bedrag, 0);
  const totaalBtw = uitgaven.reduce((s, u) => s + u.btw, 0);

  // Top 3 categorieën
  const perCategorie = uitgaven.reduce<Record<string, { naam: string; totaal: number; kleur?: string | null }>>((acc, u) => {
    const key = u.categorieId ?? "overig";
    const naam = u.categorie?.naam ?? "Overig";
    if (!acc[key]) acc[key] = { naam, totaal: 0, kleur: u.categorie?.kleur };
    acc[key].totaal += u.bedrag;
    return acc;
  }, {});
  const top3 = Object.values(perCategorie)
    .sort((a, b) => b.totaal - a.totaal)
    .slice(0, 3);

  const maandOpties = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const bedragAls = parseFloat(formulier.bedrag || "0");
  const btwAls = (bedragAls * parseInt(formulier.btwPercentage)) / 100;
  const totaalAls = bedragAls + btwAls;

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Uitgaven"
        subtitel="Beheer je bedrijfskosten"
        acties={
          <Button
            onClick={() => {
              resetFormulier();
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Uitgave toevoegen
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

        {/* Bon scan notificatie */}
        {bonScanInfo && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="text-sm text-indigo-800 font-medium">
                Bon opgeslagen. Wil je de gegevens automatisch uitlezen?
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                loading={scanLaden}
                onClick={async () => {
                  setScanLaden(true);
                  try {
                    const res = await window.api.uitgaven.scanBon({ bonPad: bonScanInfo.bonPad }) as {
                      bedrag?: number | null;
                      leverancier?: string | null;
                      datum?: string | null;
                      error?: string;
                    };
                    if (res.error) {
                      toonMelding("fout", res.error);
                    } else {
                      const updateData: Record<string, unknown> = {};
                      if (res.bedrag != null) updateData.bedrag = res.bedrag;
                      if (res.leverancier) updateData.leverancier = res.leverancier;
                      if (res.datum) updateData.datum = res.datum;
                      if (Object.keys(updateData).length > 0) {
                        await window.api.uitgaven.update(bonScanInfo.uitgaveId, updateData);
                        await haalUitgavenOp();
                        toonMelding("succes",
                          `Ingevuld: ${res.bedrag != null ? `€${res.bedrag}` : ""}${res.leverancier ? ` bij ${res.leverancier}` : ""}${res.datum ? ` op ${res.datum}` : ""}`
                        );
                      } else {
                        toonMelding("fout", "Geen gegevens herkend op de bon");
                      }
                    }
                  } catch {
                    toonMelding("fout", "Scannen mislukt");
                  } finally {
                    setScanLaden(false);
                    setBonScanInfo(null);
                  }
                }}
              >
                <ScanLine className="h-4 w-4" />
                Scannen
              </Button>
              <button
                className="text-sm text-indigo-400 hover:text-indigo-600"
                onClick={() => setBonScanInfo(null)}
              >
                Overslaan
              </button>
            </div>
          </div>
        )}

        {/* Samenvatting kaarten */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Totaal uitgaven
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900">{formatBedrag(totaalUitgaven)}</p>
              <p className="text-xs text-gray-400 mt-1">{uitgaven.length} registraties deze maand</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">BTW op inkoop</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{formatBedrag(totaalBtw)}</p>
              <p className="text-xs text-gray-400 mt-1">Terug te vragen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Top categorieën
              </CardTitle>
            </CardHeader>
            <CardContent>
              {top3.length === 0 ? (
                <p className="text-sm text-gray-400">Geen data</p>
              ) : (
                <div className="space-y-1">
                  {top3.map((cat) => (
                    <div key={cat.naam} className="flex justify-between items-center text-sm">
                      <span className="text-gray-600 truncate">{cat.naam}</span>
                      <span className="font-semibold text-gray-900 ml-2">{formatBedrag(cat.totaal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 text-gray-400" />
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
          <Select value={categorieFilter} onValueChange={setCategorieFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Alle categorieën" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle categorieën</SelectItem>
              {categorieen.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.naam}</SelectItem>
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
                <TableHead>Leverancier</TableHead>
                <TableHead>Categorie</TableHead>
                <TableHead className="text-right">Excl. BTW</TableHead>
                <TableHead className="text-right">BTW</TableHead>
                <TableHead className="text-right">Totaal</TableHead>
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
              ) : uitgaven.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-400">
                    Geen uitgaven gevonden voor deze periode
                  </TableCell>
                </TableRow>
              ) : (
                uitgaven.map((uitgave) => (
                  <TableRow key={uitgave.id}>
                    <TableCell className="text-gray-500 whitespace-nowrap">
                      {formatDatum(uitgave.datum)}
                    </TableCell>
                    <TableCell className="font-medium max-w-[180px] truncate">
                      {uitgave.omschrijving}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {uitgave.leverancier ?? <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell>
                      {uitgave.categorie ? (
                        <Badge variant={categorieBadgeVariant(uitgave.categorie.kleur)}>
                          {uitgave.categorie.naam}
                        </Badge>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatBedrag(uitgave.bedrag)}
                    </TableCell>
                    <TableCell className="text-right text-blue-600">
                      {formatBedrag(uitgave.btw)}
                      <span className="text-xs text-gray-400 ml-1">({uitgave.btwPercentage}%)</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-700">
                      {formatBedrag(uitgave.totaal)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={uitgave.bonBestand ? "Bon bekijken" : "Bon uploaden"}
                          onClick={async () => {
                            if (uitgave.bonBestand) {
                              await window.api.uitgaven.openBon({ pad: uitgave.bonBestand });
                            } else {
                              const res = await window.api.uitgaven.uploadBon({ uitgaveId: uitgave.id }) as { succes: boolean; pad?: string };
                              if (res.succes && res.pad) {
                                setBonScanInfo({ uitgaveId: uitgave.id, bonPad: res.pad });
                                haalUitgavenOp();
                              }
                            }
                          }}
                        >
                          <Upload className={`h-4 w-4 ${uitgave.bonBestand ? "text-indigo-500" : "text-gray-300"}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openBewerken(uitgave)}
                          title="Bewerken"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => verwijder(uitgave.id)}
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

      {/* Toevoegen / Bewerken Modal */}
      <Modal
        open={modalOpen}
        onOpenChange={(o) => {
          setModalOpen(o);
          if (!o) resetFormulier();
        }}
      >
        <ModalContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <ModalHeader>
            <ModalTitle>{bewerkenId ? "Uitgave bewerken" : "Uitgave toevoegen"}</ModalTitle>
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
                label="Bedrag (excl. BTW)"
                type="number"
                step="0.01"
                min="0"
                prefix="€"
                value={formulier.bedrag}
                onChange={(e) => setFormulier({ ...formulier, bedrag: e.target.value })}
              />
            </div>
            <Input
              label="Omschrijving *"
              value={formulier.omschrijving}
              onChange={(e) => setFormulier({ ...formulier, omschrijving: e.target.value })}
              placeholder="Bijv. Kantoorbenodigdheden"
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                value={formulier.btwPercentage}
                onValueChange={(v) => setFormulier({ ...formulier, btwPercentage: v })}
              >
                <SelectTrigger label="BTW percentage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BTW_OPTIES.map((o) => (
                    <SelectItem key={o.waarde} value={o.waarde}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={formulier.categorieId || "geen"}
                onValueChange={(v) => {
                  const catId = v === "geen" ? "" : v;
                  const cat = categorieen.find((c) => c.id === catId);
                  setFormulier((prev) => ({
                    ...prev,
                    categorieId: catId,
                    ...(cat?.standaardBtwTarief != null
                      ? { btwPercentage: String(cat.standaardBtwTarief) }
                      : {}),
                  }));
                }}
              >
                <SelectTrigger label="Categorie">
                  <SelectValue placeholder="Geen categorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen categorie</SelectItem>
                  {categorieen.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Leverancier"
              value={formulier.leverancier}
              onChange={(e) => setFormulier({ ...formulier, leverancier: e.target.value })}
              placeholder="Bijv. Bol.com"
            />

            {/* Zakelijk toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Zakelijk</label>
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
              {formulier.zakelijk && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zakelijk percentage: {formulier.zakelijkPercent}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={formulier.zakelijkPercent}
                    onChange={(e) =>
                      setFormulier({ ...formulier, zakelijkPercent: parseInt(e.target.value) })
                    }
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              )}
            </div>

            {/* BTW samenvatting */}
            {formulier.bedrag && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>Excl. BTW</span>
                  <span>{formatBedrag(bedragAls)}</span>
                </div>
                <div className="flex justify-between text-blue-600">
                  <span>BTW ({formulier.btwPercentage}%)</span>
                  <span>{formatBedrag(btwAls)}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1 mt-1">
                  <span>Totaal</span>
                  <span>{formatBedrag(totaalAls)}</span>
                </div>
              </div>
            )}

            <Textarea
              label="Notities"
              value={formulier.notities}
              onChange={(e) => setFormulier({ ...formulier, notities: e.target.value })}
              placeholder="Optionele notities..."
              rows={2}
            />

            {/* Bon uploaden (werkt voor zowel nieuwe als bestaande uitgaven) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bon / factuur</label>
              {(huidigeBon || pendingBonPad) ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Upload className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-sm text-green-800 truncate">
                        {(huidigeBon || pendingBonPad)!.split(/[/\\]/).pop()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {huidigeBon && (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => window.api.uitgaven.openBon({ pad: huidigeBon })}
                        >
                          Openen
                        </Button>
                      )}
                      <Button variant="outline" size="sm" type="button" onClick={kiesBonHandler}>
                        Vervangen
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    type="button"
                    loading={modalScanLaden}
                    onClick={scanBonInModal}
                  >
                    <ScanLine className="h-4 w-4 mr-1" />
                    Gegevens uitlezen met AI
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                  <Upload className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Bon of factuur bijvoegen</p>
                  <p className="text-xs text-gray-300 mt-1">PDF, JPG, PNG, WEBP</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    type="button"
                    onClick={kiesBonHandler}
                  >
                    Bestand kiezen
                  </Button>
                </div>
              )}
            </div>
          </div>
          <ModalFooter className="mt-2">
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

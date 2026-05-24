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
  Settings2,
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
  tegenrekening?: string | null;
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

const ALLE_UITGAVEN_VELDEN = [
  { id: 'datum', label: 'Datum', verplicht: true },
  { id: 'omschrijving', label: 'Omschrijving', verplicht: true },
  { id: 'bedrag', label: 'Excl. BTW', verplicht: true },
  { id: 'totaal', label: 'Totaal', verplicht: true },
  { id: 'leverancier', label: 'Leverancier' },
  { id: 'categorie', label: 'Categorie' },
  { id: 'btw', label: 'BTW' },
];

export default function UitgavenPagina() {
  const [uitgaven, setUitgaven] = useState<Uitgave[]>([]);
  const [categorieen, setCategorieen] = useState<Categorie[]>([]);
  const [laden, setLaden] = useState(true);
  const [maandFilter, setMaandFilter] = useState(huidigeMaand());
  const [categorieFilter, setCategorieFilter] = useState("alle");
  const [kolomFilters, setKolomFilters] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [opslaan, setOpslaan] = useState(false);
  const [uitgavenVelden, setUitgavenVelden] = useState<string[]>(ALLE_UITGAVEN_VELDEN.map(v => v.id));
  const [spaarIbans, setSpaarIbans] = useState<string[]>([]);
  const [verbergSpaarrekeningen, setVerbergSpaarrekeningen] = useState(true);

  const [categorieModalOpen, setCategorieModalOpen] = useState(false);
  const [nieuwCategorie, setNieuwCategorie] = useState({ naam: '', kleur: '#6366f1' });

  const [formulier, setFormulier] = useState(LEEG_FORMULIER);
  const [huidigeBon, setHuidigeBon] = useState<string | null>(null);
  const [pendingBonPad, setPendingBonPad] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<Uitgave | null>(null);
  const [scanBezig, setScanBezig] = useState(false);

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

  useEffect(() => {
    const laadVelden = () => {
      window.api.instellingen.get().then((inst: any) => {
        if (inst?.uitgavenWeergaveVelden) {
          try {
            const velden = JSON.parse(inst.uitgavenWeergaveVelden);
            if (Array.isArray(velden) && velden.length > 0) setUitgavenVelden(velden);
          } catch {}
        }
        if (inst?.spaarrekeningen) {
          try {
            const ibans = JSON.parse(inst.spaarrekeningen);
            if (Array.isArray(ibans)) setSpaarIbans(ibans);
          } catch {}
        }
      }).catch(() => {});
    };
    laadVelden();
    window.addEventListener('bankVeldenGewijzigd', laadVelden);
    return () => window.removeEventListener('bankVeldenGewijzigd', laadVelden);
  }, []);

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

  const openDetail = (item: Uitgave) => {
    setDetailItem(item);
    setDetailOpen(true);
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

  const scanBon = async () => {
    setScanBezig(true);
    try {
      const res = await window.api.scan.kiesEnScan();
      if (!res.succes) {
        if (res.fout) toonMelding("fout", `Scan mislukt: ${res.fout}`);
        return;
      }
      const v = res.velden!;
      let btwPercentage = 21;
      if (v.subtotaal != null && v.btwBedrag != null && v.subtotaal > 0) {
        const berekend = Math.round((v.btwBedrag / v.subtotaal) * 100);
        if (berekend <= 2) btwPercentage = 0;
        else if (berekend <= 14) btwPercentage = 9;
        else btwPercentage = 21;
      }
      resetFormulier();
      setFormulier({
        datum: v.datum ?? new Date().toISOString().split('T')[0],
        omschrijving: v.omschrijving ?? v.klantNaam ?? '',
        bedrag: v.subtotaal != null ? String(v.subtotaal) : (v.totaal != null ? String(v.totaal) : ''),
        btwPercentage: String(btwPercentage),
        leverancier: v.klantNaam ?? '',
        categorieId: '',
        zakelijk: true,
        zakelijkPercent: 100,
        notities: v.notities ?? '',
      });
      if (res.bonPad) setPendingBonPad(res.bonPad);
      setModalOpen(true);
    } catch {
      toonMelding("fout", "Scan mislukt");
    } finally {
      setScanBezig(false);
    }
  };

  const isSpaarUitgave = (u: Uitgave) => spaarIbans.some(s =>
    u.tegenrekening?.toUpperCase() === s.toUpperCase() ||
    (u.leverancier?.toLowerCase() === s.toLowerCase() && s.length > 0)
  );
  const bevat = (val: string | null | undefined, f: string) => !f || (val ?? "").toLowerCase().includes(f.toLowerCase());
  const zichtbareUitgaven = (verbergSpaarrekeningen ? uitgaven.filter(u => !isSpaarUitgave(u)) : uitgaven).filter(u =>
    bevat(u.datum, kolomFilters.datum ?? "") &&
    bevat(u.omschrijving, kolomFilters.omschrijving ?? "") &&
    bevat(u.leverancier, kolomFilters.leverancier ?? "") &&
    bevat(u.categorie?.naam, kolomFilters.categorie ?? "") &&
    bevat(String(u.bedrag), kolomFilters.bedrag ?? "") &&
    bevat(String(u.btw), kolomFilters.btw ?? "") &&
    bevat(String(u.totaal), kolomFilters.totaal ?? "")
  );
  const totaalUitgaven = zichtbareUitgaven.reduce((s, u) => s + u.bedrag, 0);
  const totaalBtw = zichtbareUitgaven.reduce((s, u) => s + u.btw, 0);

  // Top 3 categorieën
  const perCategorie = zichtbareUitgaven.reduce<Record<string, { naam: string; totaal: number; kleur?: string | null }>>((acc, u) => {
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={scanBon} disabled={scanBezig}>
              {scanBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              {scanBezig ? 'Scannen...' : 'Scan bon'}
            </Button>
            <Button
              onClick={() => {
                resetFormulier();
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Uitgave toevoegen
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
          <Button variant="outline" size="sm" onClick={() => setCategorieModalOpen(true)}>
            <Settings2 className="h-4 w-4 mr-1" />
            Categorieën beheren
          </Button>
          {spaarIbans.length > 0 && (
            <button
              type="button"
              onClick={() => setVerbergSpaarrekeningen(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                verbergSpaarrekeningen
                  ? 'bg-purple-600 border-purple-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-purple-400 hover:text-purple-600 dark:bg-gray-800 dark:border-gray-600'
              }`}
            >
              <span className={`inline-block w-8 h-4 rounded-full relative transition-colors ${verbergSpaarrekeningen ? 'bg-white/30' : 'bg-gray-200'}`}>
                <span
                  className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all duration-200"
                  style={{ left: verbergSpaarrekeningen ? '1rem' : '0.125rem' }}
                />
              </span>
              Spaarrekeningen verbergen
            </button>
          )}
        </div>

        {/* Tabel */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                {uitgavenVelden.includes('datum') && <TableHead>Datum</TableHead>}
                {uitgavenVelden.includes('omschrijving') && <TableHead>Omschrijving</TableHead>}
                {uitgavenVelden.includes('leverancier') && <TableHead>Leverancier</TableHead>}
                {uitgavenVelden.includes('categorie') && <TableHead>Categorie</TableHead>}
                {uitgavenVelden.includes('bedrag') && <TableHead className="text-right">Excl. BTW</TableHead>}
                {uitgavenVelden.includes('btw') && <TableHead className="text-right">BTW</TableHead>}
                {uitgavenVelden.includes('totaal') && <TableHead className="text-right">Totaal</TableHead>}
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
              <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                {uitgavenVelden.includes('datum') && <TableHead className="py-1"><input value={kolomFilters.datum ?? ""} onChange={e => setKolomFilters(p => ({ ...p, datum: e.target.value }))} placeholder="Bevat..." className="w-full h-6 text-xs rounded border border-gray-200 px-1.5 font-normal focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-700" /></TableHead>}
                {uitgavenVelden.includes('omschrijving') && <TableHead className="py-1"><input value={kolomFilters.omschrijving ?? ""} onChange={e => setKolomFilters(p => ({ ...p, omschrijving: e.target.value }))} placeholder="Bevat..." className="w-full h-6 text-xs rounded border border-gray-200 px-1.5 font-normal focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-700" /></TableHead>}
                {uitgavenVelden.includes('leverancier') && <TableHead className="py-1"><input value={kolomFilters.leverancier ?? ""} onChange={e => setKolomFilters(p => ({ ...p, leverancier: e.target.value }))} placeholder="Bevat..." className="w-full h-6 text-xs rounded border border-gray-200 px-1.5 font-normal focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-700" /></TableHead>}
                {uitgavenVelden.includes('categorie') && <TableHead className="py-1"><input value={kolomFilters.categorie ?? ""} onChange={e => setKolomFilters(p => ({ ...p, categorie: e.target.value }))} placeholder="Bevat..." className="w-full h-6 text-xs rounded border border-gray-200 px-1.5 font-normal focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-700" /></TableHead>}
                {uitgavenVelden.includes('bedrag') && <TableHead className="py-1"><input value={kolomFilters.bedrag ?? ""} onChange={e => setKolomFilters(p => ({ ...p, bedrag: e.target.value }))} placeholder="Bevat..." className="w-full h-6 text-xs rounded border border-gray-200 px-1.5 font-normal text-right focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-700" /></TableHead>}
                {uitgavenVelden.includes('btw') && <TableHead className="py-1"><input value={kolomFilters.btw ?? ""} onChange={e => setKolomFilters(p => ({ ...p, btw: e.target.value }))} placeholder="Bevat..." className="w-full h-6 text-xs rounded border border-gray-200 px-1.5 font-normal text-right focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-700" /></TableHead>}
                {uitgavenVelden.includes('totaal') && <TableHead className="py-1"><input value={kolomFilters.totaal ?? ""} onChange={e => setKolomFilters(p => ({ ...p, totaal: e.target.value }))} placeholder="Bevat..." className="w-full h-6 text-xs rounded border border-gray-200 px-1.5 font-normal text-right focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white dark:bg-gray-700" /></TableHead>}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {laden ? (
                <TableRow>
                  <TableCell colSpan={uitgavenVelden.length + 1} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : zichtbareUitgaven.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={uitgavenVelden.length + 1} className="text-center py-8 text-gray-400">
                    Geen uitgaven gevonden voor deze periode
                  </TableCell>
                </TableRow>
              ) : (
                zichtbareUitgaven.map((uitgave) => (
                  <TableRow key={uitgave.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40" onClick={() => openDetail(uitgave)}>
                    {uitgavenVelden.includes('datum') && (
                      <TableCell className="text-gray-500 whitespace-nowrap">
                        {formatDatum(uitgave.datum)}
                      </TableCell>
                    )}
                    {uitgavenVelden.includes('omschrijving') && (
                      <TableCell className="font-medium max-w-[180px] truncate">
                        {uitgave.omschrijving}
                      </TableCell>
                    )}
                    {uitgavenVelden.includes('leverancier') && (
                      <TableCell className="text-gray-500">
                        {uitgave.leverancier ?? <span className="text-gray-300">—</span>}
                      </TableCell>
                    )}
                    {uitgavenVelden.includes('categorie') && (
                      <TableCell>
                        {uitgave.categorie ? (
                          <Badge variant={categorieBadgeVariant(uitgave.categorie.kleur)}>
                            {uitgave.categorie.naam}
                          </Badge>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    {uitgavenVelden.includes('bedrag') && (
                      <TableCell className="text-right font-medium">
                        {formatBedrag(uitgave.bedrag)}
                      </TableCell>
                    )}
                    {uitgavenVelden.includes('btw') && (
                      <TableCell className="text-right text-blue-600">
                        {formatBedrag(uitgave.btw)}
                        <span className="text-xs text-gray-400 ml-1">({uitgave.btwPercentage}%)</span>
                      </TableCell>
                    )}
                    {uitgavenVelden.includes('totaal') && (
                      <TableCell className="text-right font-semibold text-red-700">
                        {formatBedrag(uitgave.totaal)}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
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

      {/* Detail Modal */}
      <Modal open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) setDetailItem(null); }}>
        <ModalContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {detailItem && (() => {
            return (
              <>
                <ModalHeader>
                  <ModalTitle>{detailItem.omschrijving}</ModalTitle>
                  <p className="text-sm text-gray-500 mt-0.5">{formatDatum(detailItem.datum)}</p>
                </ModalHeader>
                <div className="space-y-4">
                  {/* Bedragen */}
                  <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-2">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Excl. BTW</span>
                      <span>{formatBedrag(detailItem.bedrag)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-blue-600">
                      <span>BTW ({detailItem.btwPercentage}%)</span>
                      <span>{formatBedrag(detailItem.btw)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold text-red-700 border-t border-gray-200 pt-2 mt-1">
                      <span>Totaal</span>
                      <span>{formatBedrag(detailItem.totaal)}</span>
                    </div>
                  </div>

                  {/* Meta info */}
                  <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Informatie</p>
                    {detailItem.leverancier && (
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="text-gray-500">Leverancier</span>
                        <span className="text-gray-900 font-medium text-right">{detailItem.leverancier}</span>
                      </div>
                    )}
                    {detailItem.categorie && (
                      <div className="flex justify-between gap-2 text-sm items-center">
                        <span className="text-gray-500">Categorie</span>
                        <Badge variant={categorieBadgeVariant(detailItem.categorie.kleur)}>
                          {detailItem.categorie.naam}
                        </Badge>
                      </div>
                    )}
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="text-gray-500">Zakelijk</span>
                      <span className="text-gray-900 text-right">
                        {detailItem.zakelijk ? `Ja — ${detailItem.zakelijkPercent}%` : "Nee"}
                      </span>
                    </div>
                  </div>

                  {/* Notities */}
                  {detailItem.notities && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Notities</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailItem.notities}</p>
                    </div>
                  )}

                  {/* Bon */}
                  {detailItem.bonBestand && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Bon</p>
                      <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                        <span className="text-sm text-gray-700 truncate">
                          {detailItem.bonBestand.split(/[/\\]/).pop()}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.api.uitgaven.openBon({ pad: detailItem.bonBestand! })}
                        >
                          Openen
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <ModalFooter className="flex-wrap gap-2">
                  {!detailItem.bonBestand && (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const item = detailItem;
                        setDetailOpen(false);
                        setDetailItem(null);
                        const res = await window.api.uitgaven.uploadBon({ uitgaveId: item.id }) as { succes: boolean; pad?: string };
                        if (res.succes && res.pad) {
                          haalUitgavenOp();
                        }
                      }}
                    >
                      Bon uploaden
                    </Button>
                  )}
                  {detailItem.bonBestand && (
                    <Button
                      variant="outline"
                      onClick={() => window.api.uitgaven.openBon({ pad: detailItem.bonBestand! })}
                    >
                      Bon bekijken
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const item = detailItem;
                      setDetailOpen(false);
                      setDetailItem(null);
                      openBewerken(item);
                    }}
                  >
                    Bewerken
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => {
                      const item = detailItem;
                      setDetailOpen(false);
                      setDetailItem(null);
                      verwijder(item.id);
                    }}
                  >
                    Verwijderen
                  </Button>
                  <ModalClose asChild>
                    <Button variant="outline">Sluiten</Button>
                  </ModalClose>
                </ModalFooter>
              </>
            );
          })()}
        </ModalContent>
      </Modal>

      {/* Categorieën beheren Modal */}
      <Modal open={categorieModalOpen} onOpenChange={setCategorieModalOpen}>
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle>Categorieën beheren</ModalTitle>
          </ModalHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              {categorieen.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: cat.kleur ?? '#6366f1' }}
                    />
                    <span className="text-sm text-gray-800">{cat.naam}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Verwijderen"
                    onClick={async () => {
                      try {
                        await window.api.categorien.delete(cat.id);
                        await haalCategorieenOp();
                      } catch {
                        toonMelding("fout", "Kan categorie niet verwijderen (heeft nog gekoppelde uitgaven)");
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              ))}
              {categorieen.length === 0 && (
                <p className="text-sm text-gray-400">Geen categorieën aangemaakt.</p>
              )}
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Nieuwe categorie</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={nieuwCategorie.kleur}
                  onChange={(e) => setNieuwCategorie((prev) => ({ ...prev, kleur: e.target.value }))}
                  className="h-8 w-8 rounded border border-gray-200 cursor-pointer p-0.5"
                  title="Kies kleur"
                />
                <Input
                  placeholder="Naam categorie"
                  value={nieuwCategorie.naam}
                  onChange={(e) => setNieuwCategorie((prev) => ({ ...prev, naam: e.target.value }))}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && nieuwCategorie.naam.trim()) {
                      await window.api.categorien.create({ naam: nieuwCategorie.naam.trim(), kleur: nieuwCategorie.kleur });
                      setNieuwCategorie({ naam: '', kleur: '#6366f1' });
                      await haalCategorieenOp();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!nieuwCategorie.naam.trim()) return;
                    await window.api.categorien.create({ naam: nieuwCategorie.naam.trim(), kleur: nieuwCategorie.kleur });
                    setNieuwCategorie({ naam: '', kleur: '#6366f1' });
                    await haalCategorieenOp();
                  }}
                >
                  Toevoegen
                </Button>
              </div>
            </div>
          </div>
          <ModalFooter className="mt-2">
            <ModalClose asChild>
              <Button variant="outline">Sluiten</Button>
            </ModalClose>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

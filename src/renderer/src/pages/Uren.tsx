import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  Square,
  Clock,
  TrendingUp,
  Loader2,
  CheckCircle,
  Circle,
  FileText,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBedrag, formatDatum } from "@/lib/utils";

interface Klant {
  id: string;
  naam: string;
  bedrijf?: string | null;
}

interface UrenRegistratie {
  id: string;
  datum: string;
  projectNaam?: string | null;
  klantId?: string | null;
  omschrijving: string;
  startTijd: string;
  eindTijd?: string | null;
  duurMinuten: number;
  uurtarief?: number | null;
  bedrag?: number | null;
  gefactureerd: boolean;
}

const TIMER_KEY = "adminpro_timer_start";
const TIMER_PROJECT_KEY = "adminpro_timer_project";
const TIMER_KLANT_KEY = "adminpro_timer_klant";

function formatDuur(minuten: number): string {
  const uren = Math.floor(minuten / 60);
  const mins = minuten % 60;
  if (uren === 0) return `${mins}m`;
  if (mins === 0) return `${uren}u`;
  return `${uren}u ${mins}m`;
}

function formatTijd(datum: string): string {
  return new Date(datum).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLopendeTijd(seconden: number): string {
  const h = Math.floor(seconden / 3600);
  const m = Math.floor((seconden % 3600) / 60);
  const s = seconden % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const huidigWeek = () => {
  const nu = new Date();
  const dag = nu.getDay() || 7;
  const maandag = new Date(nu);
  maandag.setDate(nu.getDate() - dag + 1);
  return maandag.toISOString().split("T")[0];
};

const LEEG_FORMULIER = {
  omschrijving: "",
  klantId: "",
  projectNaam: "",
  startTijd: "",
  eindTijd: "",
  uurtarief: "",
  datum: new Date().toISOString().split("T")[0],
};

export default function UrenPagina() {
  const navigate = useNavigate();
  const [uren, setUren] = useState<UrenRegistratie[]>([]);
  const [laden, setLaden] = useState(true);
  const [weekStart, setWeekStart] = useState(huidigWeek());
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [opslaan, setOpslaan] = useState(false);
  const [formulier, setFormulier] = useState(LEEG_FORMULIER);

  // Uren → Factuur selectie
  const [geselecteerdeUren, setGeselecteerdeUren] = useState<Set<string>>(new Set());
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [factuurKlantId, setFactuurKlantId] = useState("");
  const [factuurLaden, setFactuurLaden] = useState(false);

  // Timer state
  const [timerActief, setTimerActief] = useState(false);
  const [timerSeconden, setTimerSeconden] = useState(0);
  const [timerProject, setTimerProject] = useState("");
  const [timerKlantId, setTimerKlantId] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialiseer timer vanuit localStorage
  useEffect(() => {
    const opgeslagenStart = localStorage.getItem(TIMER_KEY);
    const opgeslagenProject = localStorage.getItem(TIMER_PROJECT_KEY);
    const opgeslagenKlant = localStorage.getItem(TIMER_KLANT_KEY);
    if (opgeslagenStart) {
      const startMs = parseInt(opgeslagenStart);
      const verlopen = Math.floor((Date.now() - startMs) / 1000);
      setTimerActief(true);
      setTimerSeconden(verlopen);
      setTimerProject(opgeslagenProject ?? "");
      setTimerKlantId(opgeslagenKlant ?? "");
    }
  }, []);

  // Timer interval
  useEffect(() => {
    if (timerActief) {
      timerRef.current = setInterval(() => {
        const opgeslagenStart = localStorage.getItem(TIMER_KEY);
        if (opgeslagenStart) {
          const verlopen = Math.floor((Date.now() - parseInt(opgeslagenStart)) / 1000);
          setTimerSeconden(verlopen);
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerActief]);

  const startTimer = () => {
    const nu = Date.now();
    localStorage.setItem(TIMER_KEY, String(nu));
    localStorage.setItem(TIMER_PROJECT_KEY, timerProject);
    localStorage.setItem(TIMER_KLANT_KEY, timerKlantId);
    setTimerActief(true);
    setTimerSeconden(0);
  };

  const stopTimer = async () => {
    const opgeslagenStart = localStorage.getItem(TIMER_KEY);
    if (!opgeslagenStart) return;
    const startMs = parseInt(opgeslagenStart);
    const startDatum = new Date(startMs);
    const eindDatum = new Date();
    const duurMinuten = Math.round((eindDatum.getTime() - startDatum.getTime()) / 60000);

    localStorage.removeItem(TIMER_KEY);
    localStorage.removeItem(TIMER_PROJECT_KEY);
    localStorage.removeItem(TIMER_KLANT_KEY);
    setTimerActief(false);
    setTimerSeconden(0);

    if (duurMinuten < 1) {
      toonMelding("fout", "Timer was korter dan 1 minuut");
      return;
    }

    try {
      await window.api.uren.create({
        projectNaam: timerProject || null,
        omschrijving: timerProject ? `Gewerkt aan ${timerProject}` : "Timer registratie",
        datum: startDatum.toISOString().split("T")[0],
        klantId: timerKlantId || null,
        startTijd: startDatum.toISOString(),
        eindTijd: eindDatum.toISOString(),
        duurMinuten,
        gefactureerd: false,
      });
      toonMelding("succes", `Timer gestopt: ${formatDuur(duurMinuten)} geregistreerd`);
      haalUrenOp();
    } catch {
      toonMelding("fout", "Fout bij opslaan timer");
    }
  };

  const haalUrenOp = useCallback(async () => {
    try {
      const data = await window.api.uren.list({ week: weekStart });
      setUren(Array.isArray(data) ? data : (data as any).uren ?? []);
    } catch {
      toonMelding("fout", "Kon urenregistraties niet laden");
    } finally {
      setLaden(false);
    }
  }, [weekStart]);

  const haalKlantenOp = useCallback(async () => {
    try {
      const data = await window.api.klanten.list();
      setKlanten(Array.isArray(data) ? data : []);
    } catch {
      // stil falen
    }
  }, []);

  useEffect(() => {
    haalUrenOp();
  }, [haalUrenOp]);

  useEffect(() => {
    haalKlantenOp();
  }, [haalKlantenOp]);

  const toggleSelecteerUur = (id: string, gefactureerd: boolean) => {
    if (gefactureerd) return;
    setGeselecteerdeUren((prev) => {
      const nieuw = new Set(prev);
      if (nieuw.has(id)) nieuw.delete(id);
      else nieuw.add(id);
      return nieuw;
    });
  };

  const maakFactuurVanUren = async () => {
    if (geselecteerdeUren.size === 0 || !factuurKlantId) {
      toonMelding("fout", "Selecteer uren en een klant");
      return;
    }
    setFactuurLaden(true);
    try {
      const factuurId = await window.api.uren.factuurAanmaken({
        urenIds: Array.from(geselecteerdeUren),
        klantId: factuurKlantId,
      });
      setGeselecteerdeUren(new Set());
      setFactuurKlantId("");
      navigate(`/facturen/${factuurId}`);
    } catch {
      toonMelding("fout", "Kon factuur niet aanmaken");
    } finally {
      setFactuurLaden(false);
    }
  };

  const toonMelding = (type: "succes" | "fout", tekst: string) => {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 4000);
  };

  const resetFormulier = () => {
    setFormulier(LEEG_FORMULIER);
    setBewerkenId(null);
  };

  const openBewerken = (uur: UrenRegistratie) => {
    setFormulier({
      omschrijving: uur.omschrijving,
      klantId: uur.klantId ?? "",
      projectNaam: uur.projectNaam ?? "",
      startTijd: uur.startTijd ? new Date(uur.startTijd).toISOString().slice(0, 16) : "",
      eindTijd: uur.eindTijd ? new Date(uur.eindTijd).toISOString().slice(0, 16) : "",
      uurtarief: uur.uurtarief ? String(uur.uurtarief) : "",
      datum: uur.datum?.split("T")[0] ?? new Date().toISOString().split("T")[0],
    });
    setBewerkenId(uur.id);
    setModalOpen(true);
  };

  const slaOp = async () => {
    if (!formulier.omschrijving) {
      toonMelding("fout", "Omschrijving is verplicht");
      return;
    }
    const startTijd = formulier.startTijd ? new Date(formulier.startTijd) : null;
    const eindTijd = formulier.eindTijd ? new Date(formulier.eindTijd) : null;
    let duurMinuten = 0;
    if (startTijd && eindTijd) {
      duurMinuten = Math.round((eindTijd.getTime() - startTijd.getTime()) / 60000);
      if (duurMinuten < 0) {
        toonMelding("fout", "Eindtijd moet na starttijd liggen");
        return;
      }
    }
    const uurtarief = formulier.uurtarief ? parseFloat(formulier.uurtarief) : null;
    const bedrag = uurtarief && duurMinuten > 0 ? (duurMinuten / 60) * uurtarief : null;

    const payload = {
      omschrijving: formulier.omschrijving,
      klantId: formulier.klantId || null,
      projectNaam: formulier.projectNaam || null,
      startTijd: startTijd?.toISOString() ?? null,
      eindTijd: eindTijd?.toISOString() ?? null,
      duurMinuten,
      uurtarief,
      bedrag,
      gefactureerd: false,
    };
    setOpslaan(true);
    try {
      if (bewerkenId) {
        await window.api.uren.update(bewerkenId, payload);
      } else {
        await window.api.uren.create(payload);
      }
      toonMelding("succes", bewerkenId ? "Registratie bijgewerkt" : "Uren toegevoegd");
      setModalOpen(false);
      resetFormulier();
      haalUrenOp();
    } catch {
      toonMelding("fout", "Opslaan mislukt");
    } finally {
      setOpslaan(false);
    }
  };

  const verwijder = async (id: string) => {
    if (!confirm("Weet je zeker dat je deze registratie wilt verwijderen?")) return;
    try {
      await window.api.uren.delete(id);
      toonMelding("succes", "Registratie verwijderd");
      haalUrenOp();
    } catch {
      toonMelding("fout", "Verbindingsfout");
    }
  };

  const wisselGefactureerd = async (uur: UrenRegistratie) => {
    try {
      await window.api.uren.update(uur.id, { gefactureerd: !uur.gefactureerd });
      haalUrenOp();
    } catch {
      toonMelding("fout", "Bijwerken mislukt");
    }
  };

  // Berekeningen
  const totaalMinuten = uren.reduce((s, u) => s + u.duurMinuten, 0);
  const factureerbaar = uren.filter((u) => u.uurtarief && u.uurtarief > 0);
  const totaalFactureerbaarMinuten = factureerbaar.reduce((s, u) => s + u.duurMinuten, 0);
  const nogTeFactureren = factureerbaar.filter((u) => !u.gefactureerd);
  const totaalNogTeFactureren = nogTeFactureren.reduce((s, u) => s + (u.bedrag ?? 0), 0);

  // Week navigatie
  const vorigeWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d.toISOString().split("T")[0]);
  };
  const volgendeWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d.toISOString().split("T")[0]);
  };
  const weekEind = new Date(weekStart);
  weekEind.setDate(weekEind.getDate() + 6);
  const weekLabel = `${formatDatum(weekStart)} – ${formatDatum(weekEind.toISOString())}`;

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Urenregistratie"
        subtitel="Bijhouden van gewerkte uren"
        acties={
          <Button
            onClick={() => {
              resetFormulier();
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Uren toevoegen
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

        {/* Timer widget */}
        <Card className="border-indigo-200 bg-indigo-50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className={`h-3 w-3 rounded-full ${timerActief ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                <div className="flex-1">
                  <div className="text-2xl font-mono font-bold text-indigo-900 tabular-nums">
                    {formatLopendeTijd(timerSeconden)}
                  </div>
                  {timerActief && (
                    <p className="text-xs text-indigo-600 mt-0.5">Timer loopt...</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-1 flex-wrap">
                <input
                  type="text"
                  placeholder="Project of taaknaam..."
                  value={timerProject}
                  onChange={(e) => {
                    setTimerProject(e.target.value);
                    if (timerActief) localStorage.setItem(TIMER_PROJECT_KEY, e.target.value);
                  }}
                  disabled={timerActief}
                  className="flex-1 min-w-[140px] h-9 rounded-lg border border-indigo-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                />
                <select
                  value={timerKlantId}
                  onChange={(e) => {
                    setTimerKlantId(e.target.value);
                    if (timerActief) localStorage.setItem(TIMER_KLANT_KEY, e.target.value);
                  }}
                  disabled={timerActief}
                  className="h-9 rounded-lg border border-indigo-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                >
                  <option value="">Geen klant</option>
                  {klanten.map((k) => (
                    <option key={k.id} value={k.id}>{k.bedrijf ?? k.naam}</option>
                  ))}
                </select>
                {timerActief ? (
                  <Button variant="destructive" onClick={stopTimer} className="gap-2 shrink-0">
                    <Square className="h-4 w-4" />
                    Stoppen
                  </Button>
                ) : (
                  <Button onClick={startTimer} className="gap-2 shrink-0">
                    <Play className="h-4 w-4" />
                    Starten
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Samenvatting kaarten */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Totaal uren (week)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900">{formatDuur(totaalMinuten)}</p>
              <p className="text-xs text-gray-400 mt-1">{uren.length} registraties</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Factureerbare uren
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-indigo-600">{formatDuur(totaalFactureerbaarMinuten)}</p>
              <p className="text-xs text-gray-400 mt-1">{factureerbaar.length} registraties</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Nog te factureren</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">{formatBedrag(totaalNogTeFactureren)}</p>
              <p className="text-xs text-gray-400 mt-1">{nogTeFactureren.length} registraties</p>
            </CardContent>
          </Card>
        </div>

        {/* Week navigatie */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={vorigeWeek}>&larr; Vorige week</Button>
          <span className="text-sm text-gray-600 font-medium">{weekLabel}</span>
          <Button variant="outline" size="sm" onClick={volgendeWeek}>Volgende week &rarr;</Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart(huidigWeek())}
          >
            Huidige week
          </Button>
        </div>

        {/* Tabel */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Datum</TableHead>
                <TableHead>Project / Klant</TableHead>
                <TableHead>Omschrijving</TableHead>
                <TableHead>Tijden</TableHead>
                <TableHead className="text-right">Duur</TableHead>
                <TableHead className="text-right">Uurtarief</TableHead>
                <TableHead className="text-right">Bedrag</TableHead>
                <TableHead className="text-center">Gefactureerd</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {laden ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-indigo-400 mx-auto" />
                  </TableCell>
                </TableRow>
              ) : uren.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-gray-400">
                    Geen urenregistraties gevonden voor deze week
                  </TableCell>
                </TableRow>
              ) : (
                uren.map((uur) => (
                  <TableRow key={uur.id} className={geselecteerdeUren.has(uur.id) ? "bg-indigo-50" : ""}>
                    <TableCell>
                      {!uur.gefactureerd && (
                        <input
                          type="checkbox"
                          checked={geselecteerdeUren.has(uur.id)}
                          onChange={() => toggleSelecteerUur(uur.id, uur.gefactureerd)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                        />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-gray-500">
                      {formatDatum(uur.datum ?? uur.startTijd)}
                    </TableCell>
                    <TableCell>
                      {uur.projectNaam ? (
                        <div>
                          <p className="font-medium text-gray-900">{uur.projectNaam}</p>
                          {uur.klantId && <p className="text-xs text-gray-400">{uur.klantId}</p>}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{uur.omschrijving}</TableCell>
                    <TableCell className="text-gray-500 text-xs whitespace-nowrap">
                      {uur.startTijd ? formatTijd(uur.startTijd) : "—"}
                      {uur.eindTijd ? ` – ${formatTijd(uur.eindTijd)}` : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatDuur(uur.duurMinuten)}
                    </TableCell>
                    <TableCell className="text-right text-gray-500">
                      {uur.uurtarief ? formatBedrag(uur.uurtarief) : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-indigo-700">
                      {uur.bedrag ? formatBedrag(uur.bedrag) : <span className="text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => wisselGefactureerd(uur)}
                        className="mx-auto flex items-center justify-center"
                        title={uur.gefactureerd ? "Markeer als niet gefactureerd" : "Markeer als gefactureerd"}
                      >
                        {uur.gefactureerd ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-gray-300 hover:text-gray-400" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openBewerken(uur)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => verwijder(uur.id)}
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

        {/* Uren → Factuur actie-balk */}
        {geselecteerdeUren.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-indigo-200 rounded-xl shadow-xl px-5 py-3 flex items-center gap-4">
            <span className="text-sm font-medium text-indigo-700">
              {geselecteerdeUren.size} {geselecteerdeUren.size === 1 ? "registratie" : "registraties"} geselecteerd
            </span>
            <Select value={factuurKlantId} onValueChange={setFactuurKlantId}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="Selecteer klant..." />
              </SelectTrigger>
              <SelectContent>
                {klanten.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.bedrijf ?? k.naam}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={maakFactuurVanUren}
              loading={factuurLaden}
              disabled={!factuurKlantId}
            >
              <FileText className="h-4 w-4" />
              Maak factuur
            </Button>
            <button
              className="text-sm text-gray-400 hover:text-gray-600"
              onClick={() => setGeselecteerdeUren(new Set())}
            >
              Annuleren
            </button>
          </div>
        )}
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
            <ModalTitle>{bewerkenId ? "Registratie bewerken" : "Uren toevoegen"}</ModalTitle>
          </ModalHeader>
          <div className="space-y-4">
            <Input
              label="Omschrijving *"
              value={formulier.omschrijving}
              onChange={(e) => setFormulier({ ...formulier, omschrijving: e.target.value })}
              placeholder="Bijv. Vergadering met klant"
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                value={formulier.klantId || "geen"}
                onValueChange={(v) => setFormulier({ ...formulier, klantId: v === "geen" ? "" : v })}
              >
                <SelectTrigger label="Klant">
                  <SelectValue placeholder="Geen klant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen klant</SelectItem>
                  {klanten.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.bedrijf ?? k.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                label="Project"
                value={formulier.projectNaam}
                onChange={(e) => setFormulier({ ...formulier, projectNaam: e.target.value })}
                placeholder="Bijv. Website redesign"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Starttijd"
                type="datetime-local"
                value={formulier.startTijd}
                onChange={(e) => setFormulier({ ...formulier, startTijd: e.target.value })}
              />
              <Input
                label="Eindtijd"
                type="datetime-local"
                value={formulier.eindTijd}
                onChange={(e) => setFormulier({ ...formulier, eindTijd: e.target.value })}
              />
            </div>
            {formulier.startTijd && formulier.eindTijd && (
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm text-indigo-800">
                Duur:{" "}
                <span className="font-semibold">
                  {formatDuur(
                    Math.max(
                      0,
                      Math.round(
                        (new Date(formulier.eindTijd).getTime() -
                          new Date(formulier.startTijd).getTime()) /
                          60000
                      )
                    )
                  )}
                </span>
              </div>
            )}
            <Input
              label="Uurtarief (€)"
              type="number"
              step="0.01"
              min="0"
              prefix="€"
              value={formulier.uurtarief}
              onChange={(e) => setFormulier({ ...formulier, uurtarief: e.target.value })}
              placeholder="Bijv. 85.00"
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

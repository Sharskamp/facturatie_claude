import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Clock, MapPin, FileText,
  Loader2, AlertCircle, X, Plus, Trash2,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal, ModalContent, ModalTitle } from "@/components/ui/modal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Afspraak {
  id: string;
  samenvatting: string;
  omschrijving?: string;
  locatie?: string;
  start: string;
  einde: string;
  geheledag: boolean;
  kalenderId?: string;
  kalenderKleur?: string;
  isPrimair?: boolean;
}

interface Kalender {
  id: string;
  samenvatting: string;
  achtergrondKleur?: string;
  primair?: boolean;
}

interface FactuurRegel {
  omschrijving: string;
  aantal: number;
  eenheid: string;
  prijs: number;
  btwPercentage: number;
}

interface Klant {
  id: string;
  naam: string;
  bedrijf?: string | null;
}

type Weergave = "dag" | "week" | "maand";

// ── Constants ─────────────────────────────────────────────────────────────────

const PX_PER_HOUR = 64;
const MAANDEN = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
const WEEKDAGEN_KORT = ["Ma","Di","Wo","Do","Vr","Za","Zo"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ── Utilities ─────────────────────────────────────────────────────────────────

function getWeekStart(d: Date): Date {
  const dag = new Date(d);
  const dow = (dag.getDay() + 6) % 7;
  dag.setDate(dag.getDate() - dow);
  dag.setHours(0, 0, 0, 0);
  return dag;
}

function getMaandDagen(jaar: number, maand: number): Date[] {
  const eerste = new Date(jaar, maand, 1);
  const laatste = new Date(jaar, maand + 1, 0);
  const dagVanWeek = (eerste.getDay() + 6) % 7;
  const dagen: Date[] = [];
  for (let i = dagVanWeek - 1; i >= 0; i--) {
    const d = new Date(eerste); d.setDate(d.getDate() - i - 1); dagen.push(d);
  }
  for (let d = 1; d <= laatste.getDate(); d++) dagen.push(new Date(jaar, maand, d));
  while (dagen.length < 42) {
    const last = dagen[dagen.length - 1];
    const next = new Date(last); next.setDate(next.getDate() + 1); dagen.push(next);
  }
  return dagen;
}

function isSameDag(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dagSleutel(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function afspraakDagSleutel(start: string): string {
  return start.includes("T") ? start.split("T")[0] : start;
}

function formatTijd(s: string): string {
  if (!s) return "";
  return new Date(s).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function berekenPositie(start: string, einde: string): { top: number; height: number } {
  const s = new Date(start);
  const e = new Date(einde);
  const startMin = s.getHours() * 60 + s.getMinutes();
  let eindMin = e.getHours() * 60 + e.getMinutes();
  if (eindMin <= startMin) eindMin = startMin + 60;
  const top = (startMin / 60) * PX_PER_HOUR;
  const height = Math.max(((eindMin - startMin) / 60) * PX_PER_HOUR, 20);
  return { top, height };
}

function getAfspraakStijl(a: Afspraak): React.CSSProperties {
  if (!a.isPrimair) {
    return { backgroundColor: "#f3f4f6", borderLeft: "2px solid #d1d5db", color: "#6b7280" };
  }
  const kleur = a.kalenderKleur || "#4338ca";
  return { backgroundColor: kleur + "22", borderLeft: `2px solid ${kleur}`, color: kleur };
}

function getNavigatieLabel(weergave: Weergave, datum: Date): string {
  if (weergave === "dag") {
    return datum.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  if (weergave === "maand") {
    return datum.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  }
  const ma = getWeekStart(datum);
  const zo = new Date(ma); zo.setDate(zo.getDate() + 6);
  if (ma.getMonth() === zo.getMonth()) {
    return `${ma.getDate()} – ${zo.getDate()} ${zo.toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}`;
  }
  return `${ma.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – ${zo.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`;
}

function navigeer(weergave: Weergave, datum: Date, richting: -1 | 1): Date {
  const d = new Date(datum);
  if (weergave === "dag") d.setDate(d.getDate() + richting);
  else if (weergave === "week") d.setDate(d.getDate() + richting * 7);
  else d.setMonth(d.getMonth() + richting);
  return d;
}

// ── MiniKalender ──────────────────────────────────────────────────────────────

function MiniKalender({ geselecteerdeDatum, onDagKlik }: {
  geselecteerdeDatum: Date;
  onDagKlik: (d: Date) => void;
}) {
  const [miniJaar, setMiniJaar] = useState(geselecteerdeDatum.getFullYear());
  const [miniMaand, setMiniMaand] = useState(geselecteerdeDatum.getMonth());
  const vandaag = new Date();
  const dagen = getMaandDagen(miniJaar, miniMaand);

  return (
    <div className="w-52 shrink-0 select-none">
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={() => { const d = new Date(miniJaar, miniMaand - 1); setMiniJaar(d.getFullYear()); setMiniMaand(d.getMonth()); }}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
        ><ChevronLeft className="h-3.5 w-3.5" /></button>
        <span className="text-xs font-semibold text-gray-700 capitalize">{MAANDEN[miniMaand]} {miniJaar}</span>
        <button
          onClick={() => { const d = new Date(miniJaar, miniMaand + 1); setMiniJaar(d.getFullYear()); setMiniMaand(d.getMonth()); }}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
        ><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAGEN_KORT.map(d => (
          <span key={d} className="text-[9px] font-medium text-gray-400 py-0.5">{d}</span>
        ))}
        {dagen.map((dag, i) => {
          const isGeselecteerd = isSameDag(dag, geselecteerdeDatum);
          const isVandaag = isSameDag(dag, vandaag);
          const isDezeManad = dag.getMonth() === miniMaand;
          return (
            <button
              key={i}
              onClick={() => { onDagKlik(dag); setMiniJaar(dag.getFullYear()); setMiniMaand(dag.getMonth()); }}
              className={[
                "aspect-square text-[11px] flex items-center justify-center rounded-full mx-auto w-6 h-6",
                !isDezeManad ? "opacity-25" : "",
                isGeselecteerd ? "bg-indigo-600 text-white font-semibold" : isVandaag ? "text-indigo-600 font-bold" : "hover:bg-gray-100 text-gray-700",
              ].join(" ")}
            >{dag.getDate()}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── TijdGrid ──────────────────────────────────────────────────────────────────

function TijdGrid({ dagen, afspraken, onTijdKlik, onAfspraakKlik }: {
  dagen: Date[];
  afspraken: Afspraak[];
  onTijdKlik: (datum: Date, uur: number) => void;
  onAfspraakKlik: (a: Afspraak) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const vandaag = new Date();

  const [huidigeTijdPx, setHuidigeTijdPx] = useState(() => {
    const now = new Date();
    return (now.getHours() + now.getMinutes() / 60) * PX_PER_HOUR;
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, huidigeTijdPx - 200);
    }
    const iv = setInterval(() => {
      const now = new Date();
      setHuidigeTijdPx((now.getHours() + now.getMinutes() / 60) * PX_PER_HOUR);
    }, 60_000);
    return () => clearInterval(iv);
  }, []);

  const afsprakenPerDag = useMemo(() => {
    const map = new Map<string, Afspraak[]>();
    for (const dag of dagen) map.set(dagSleutel(dag), []);
    for (const a of afspraken) {
      if (a.geheledag) continue;
      const key = afspraakDagSleutel(a.start);
      if (map.has(key)) map.get(key)!.push(a);
    }
    return map;
  }, [dagen, afspraken]);

  const heleDagAfspraken = useMemo(() => afspraken.filter(a => a.geheledag), [afspraken]);
  const isVandaagInView = dagen.some(d => isSameDag(d, vandaag));

  return (
    <div className="flex flex-col flex-1 min-h-0 border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Hele dag rij */}
      {heleDagAfspraken.length > 0 && (
        <div className="flex border-b border-gray-100 shrink-0">
          <div className="w-14 shrink-0 border-r border-gray-100 py-1 flex items-center justify-end pr-2">
            <span className="text-[9px] text-gray-400 leading-none">hele dag</span>
          </div>
          <div className="flex-1 grid py-1 px-1 gap-0.5" style={{ gridTemplateColumns: `repeat(${dagen.length}, 1fr)` }}>
            {dagen.map(dag => {
              const key = dagSleutel(dag);
              return (
                <div key={key} className="space-y-0.5 min-w-0">
                  {heleDagAfspraken.filter(a => afspraakDagSleutel(a.start) === key).map(a => (
                    <button
                      key={a.id}
                      onClick={() => onAfspraakKlik(a)}
                      className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate font-medium"
                      style={getAfspraakStijl(a)}
                    >{a.samenvatting}</button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dag-headers (alleen bij week-weergave) */}
      {dagen.length > 1 && (
        <div className="flex border-b border-gray-100 shrink-0">
          <div className="w-14 shrink-0" />
          {dagen.map(dag => {
            const isVandaag = isSameDag(dag, vandaag);
            const dow = (dag.getDay() + 6) % 7;
            return (
              <div key={dagSleutel(dag)} className="flex-1 text-center py-2 border-l border-gray-100 first:border-l-0">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{WEEKDAGEN_KORT[dow]}</p>
                <p className={`text-sm font-semibold mt-0.5 h-7 w-7 flex items-center justify-center rounded-full mx-auto ${isVandaag ? "bg-indigo-600 text-white" : "text-gray-800"}`}>
                  {dag.getDate()}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollbaar tijdgrid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex relative" style={{ height: `${24 * PX_PER_HOUR}px` }}>
          {/* Uurlabels */}
          <div className="w-14 shrink-0 relative border-r border-gray-100">
            {HOURS.map(h => (
              <div key={h} className="absolute right-0 left-0 border-t border-gray-100" style={{ top: h * PX_PER_HOUR }}>
                {h > 0 && (
                  <span className="text-[10px] text-gray-400 absolute -top-2 right-2">{String(h).padStart(2,"0")}:00</span>
                )}
              </div>
            ))}
          </div>

          {/* Dag-kolommen */}
          {dagen.map(dag => {
            const key = dagSleutel(dag);
            const dagAfspraken = afsprakenPerDag.get(key) ?? [];
            const isVandaagKol = isSameDag(dag, vandaag);
            return (
              <div key={key} className="flex-1 relative border-l border-gray-100 first:border-l-0" style={{ minWidth: 0 }}>
                {/* Uurlijnen + klikgebied */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-gray-100 hover:bg-indigo-50/40 cursor-pointer transition-colors"
                    style={{ top: h * PX_PER_HOUR, height: PX_PER_HOUR }}
                    onClick={() => onTijdKlik(dag, h)}
                  />
                ))}

                {/* Huidige tijdlijn */}
                {isVandaagInView && isVandaagKol && (
                  <div className="absolute left-0 right-0 z-10 pointer-events-none flex items-center" style={{ top: huidigeTijdPx }}>
                    <div className="w-2 h-2 bg-red-500 rounded-full shrink-0" style={{ marginLeft: -4 }} />
                    <div className="flex-1 h-px bg-red-400" />
                  </div>
                )}

                {/* Afspraken */}
                {dagAfspraken.map(a => {
                  const { top, height } = berekenPositie(a.start, a.einde);
                  return (
                    <button
                      key={a.id}
                      onClick={(e) => { e.stopPropagation(); onAfspraakKlik(a); }}
                      className="absolute left-0.5 right-0.5 z-20 rounded overflow-hidden text-left leading-tight px-1 pt-0.5 text-[11px] font-medium"
                      style={{ top, height, ...getAfspraakStijl(a) }}
                      title={`${a.samenvatting}\n${formatTijd(a.start)} – ${formatTijd(a.einde)}`}
                    >
                      <span className="block truncate">{a.samenvatting}</span>
                      {height > 28 && <span className="block text-[10px] opacity-75">{formatTijd(a.start)} – {formatTijd(a.einde)}</span>}
                      {height > 44 && a.locatie && <span className="block text-[10px] opacity-60 truncate">📍 {a.locatie}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── MaandWeergave ─────────────────────────────────────────────────────────────

function MaandWeergave({ jaar, maand, afspraken, onDagKlik, onAfspraakKlik }: {
  jaar: number; maand: number; afspraken: Afspraak[];
  onDagKlik: (d: Date) => void;
  onAfspraakKlik: (a: Afspraak) => void;
}) {
  const vandaag = new Date();
  const dagen = getMaandDagen(jaar, maand);
  const afsprakenPerDag = useMemo(() => {
    const map = new Map<string, Afspraak[]>();
    for (const a of afspraken) {
      const key = afspraakDagSleutel(a.start);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [afspraken]);

  return (
    <Card className="flex-1 overflow-hidden border border-gray-200 rounded-xl">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAGEN_KORT.map(d => (
          <div key={d} className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: `repeat(6, minmax(80px, 1fr))` }}>
        {dagen.map((dag, i) => {
          const isHuidigeMaand = dag.getMonth() === maand;
          const isVandaag = isSameDag(dag, vandaag);
          const key = dagSleutel(dag);
          const dagAfspraken = afsprakenPerDag.get(key) ?? [];
          const max = 3;
          return (
            <div
              key={i}
              className={[
                "border-b border-r border-gray-100 p-1 min-h-[80px]",
                !isHuidigeMaand ? "bg-gray-50/60" : "bg-white",
                i % 7 === 6 ? "border-r-0" : "",
              ].join(" ")}
            >
              <div className="flex justify-between items-start mb-0.5">
                <button
                  onClick={() => onDagKlik(dag)}
                  className={[
                    "h-6 w-6 text-xs font-medium flex items-center justify-center rounded-full",
                    isVandaag ? "bg-indigo-600 text-white" : !isHuidigeMaand ? "text-gray-400" : "text-gray-700 hover:bg-gray-100",
                  ].join(" ")}
                >{dag.getDate()}</button>
              </div>
              <div className="space-y-0.5">
                {dagAfspraken.slice(0, max).map(a => (
                  <button
                    key={a.id}
                    onClick={(e) => { e.stopPropagation(); onAfspraakKlik(a); }}
                    className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate font-medium leading-tight"
                    style={getAfspraakStijl(a)}
                    title={a.samenvatting}
                  >
                    {!a.geheledag && <span className="opacity-75">{formatTijd(a.start)} </span>}
                    {a.samenvatting}
                  </button>
                ))}
                {dagAfspraken.length > max && (
                  <button
                    onClick={() => onDagKlik(dag)}
                    className="text-[10px] text-indigo-500 hover:text-indigo-700 pl-1"
                  >+{dagAfspraken.length - max} meer</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── AfspraakDetail ────────────────────────────────────────────────────────────

function AfspraakDetail({ afspraak, onSluit, onFacturenAangemaakt }: {
  afspraak: Afspraak;
  onSluit: () => void;
  onFacturenAangemaakt: (facturen: Array<{ id: string; nummer: string; klantNaam: string }>) => void;
}) {
  const [makenLaden, setMakenLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const maakFacturen = async () => {
    setMakenLaden(true);
    setFout(null);
    try {
      const res = await window.api.agenda.maakFacturenVanAfspraak({ eventId: afspraak.id });
      if (!res.succes || !res.facturen?.length) {
        setFout(res.fout ?? "Geen klanten gekoppeld aan deze afspraak.");
        return;
      }
      onSluit();
      onFacturenAangemaakt(res.facturen);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Aanmaken mislukt");
    } finally {
      setMakenLaden(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onSluit} />
      <div className="fixed z-50 bottom-6 right-6 bg-white rounded-xl shadow-2xl border border-gray-200 w-80 p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight">{afspraak.samenvatting}</h3>
          <button onClick={onSluit} className="text-gray-400 hover:text-gray-600 rounded p-0.5 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1.5 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-xs">
              {afspraak.geheledag
                ? `${new Date(afspraak.start).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })} — Hele dag`
                : `${new Date(afspraak.start).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })} ${formatTijd(afspraak.start)} – ${formatTijd(afspraak.einde)}`
              }
            </span>
          </div>
          {afspraak.locatie && (
            <div className="flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
              <span className="text-xs">{afspraak.locatie}</span>
            </div>
          )}
          {afspraak.omschrijving && (
            <div className="flex items-start gap-2">
              <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
              <span className="text-xs line-clamp-3">{afspraak.omschrijving}</span>
            </div>
          )}
        </div>
        {fout && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">{fout}</p>
        )}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <Button size="sm" className="w-full" loading={makenLaden} onClick={maakFacturen}>
            <FileText className="h-3.5 w-3.5" />
            Facturen aanmaken van afspraak
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Nieuw Afspraak Modal ───────────────────────────────────────────────────────

function NieuwAfspraakModal({ open, onOpenChange, kalenders, primaryKalenderId, klanten, voorafDatum, voorafUur, onOpgeslagen }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kalenders: Kalender[];
  primaryKalenderId: string;
  klanten: Klant[];
  voorafDatum: string;
  voorafUur: number;
  onOpgeslagen: () => void;
}) {
  const [klantIds, setKlantIds] = useState<string[]>([]);
  const [klantZoek, setKlantZoek] = useState("");
  const [locatie, setLocatie] = useState("");
  const [datum, setDatum] = useState(voorafDatum);
  const [geheledag, setGeheledag] = useState(false);
  const [startTijd, setStartTijd] = useState(`${String(voorafUur).padStart(2,"0")}:00`);
  const [eindTijd, setEindTijd] = useState(`${String(voorafUur + 1).padStart(2,"0")}:00`);
  const [kalenderId, setKalenderId] = useState(primaryKalenderId || "primary");
  const [regels, setRegels] = useState<FactuurRegel[]>([]);
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDatum(voorafDatum);
      setStartTijd(`${String(voorafUur).padStart(2,"0")}:00`);
      setEindTijd(`${String(Math.min(voorafUur + 1, 23)).padStart(2,"0")}:00`);
      setKalenderId(primaryKalenderId || "primary");
      setFout(null);
      setKlantIds([]);
      setKlantZoek("");
    }
  }, [open, voorafDatum, voorafUur, primaryKalenderId]);

  const toggleKlant = (id: string) =>
    setKlantIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const gefilterdKlanten = useMemo(() =>
    klanten.filter(k => {
      const q = klantZoek.toLowerCase();
      return !q || k.naam.toLowerCase().includes(q) || (k.bedrijf ?? "").toLowerCase().includes(q);
    }),
  [klanten, klantZoek]);

  const titelPreview = useMemo(() => {
    const parts: string[] = [];
    for (const id of klantIds) {
      const k = klanten.find(k => k.id === id);
      if (k) parts.push(k.bedrijf || k.naam);
    }
    if (locatie) parts.push(locatie);
    return parts.length > 0 ? parts.join(" – ") : "Afspraak";
  }, [klantIds, locatie, klanten]);

  const voegRegelToe = () => setRegels(r => [...r, { omschrijving: "", aantal: 1, eenheid: "uur", prijs: 0, btwPercentage: 21 }]);
  const verwijderRegel = (i: number) => setRegels(r => r.filter((_, j) => j !== i));
  const updateRegel = (i: number, veld: keyof FactuurRegel, waarde: string | number) =>
    setRegels(r => r.map((regel, j) => j === i ? { ...regel, [veld]: waarde } : regel));

  const slaOp = async () => {
    if (!datum) { setFout("Vul een datum in."); return; }
    setOpslaan(true);
    setFout(null);
    try {
      let startDatumTijd = datum;
      let eindDatumTijd = datum;
      if (!geheledag) {
        startDatumTijd = `${datum}T${startTijd}:00`;
        eindDatumTijd = `${datum}T${eindTijd}:00`;
      }
      await window.api.agenda.maakAfspraak({
        klantIds: klantIds.length > 0 ? klantIds : undefined,
        locatie: locatie || undefined,
        startDatumTijd,
        eindDatumTijd,
        geheledag,
        calendarId: kalenderId,
        regels: regels.length > 0 ? regels : undefined,
      });
      onOpgeslagen();
      onOpenChange(false);
      setKlantIds([]); setLocatie(""); setRegels([]);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setOpslaan(false);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-3xl p-0 overflow-hidden gap-0"
        style={{ display: "flex", flexDirection: "column", maxHeight: "90vh" }}
      >
        {/* Header — buiten scroll */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <ModalTitle>Nieuwe afspraak</ModalTitle>
        </div>

        {/* Scrollbaar formulier */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {/* Titel preview */}
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
            <p className="text-[10px] font-medium text-indigo-500 uppercase tracking-wide mb-0.5">Titel in Google Calendar</p>
            <p className="text-sm font-semibold text-indigo-900">{titelPreview}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Klanten (multi-select) */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Klanten (optioneel)
                {klantIds.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                    {klantIds.length}
                  </span>
                )}
              </label>
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <input
                  type="text"
                  value={klantZoek}
                  onChange={e => setKlantZoek(e.target.value)}
                  placeholder="Zoek klant..."
                  className="w-full h-8 px-3 text-xs border-b border-gray-200 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-indigo-400"
                />
                <div className="max-h-32 overflow-y-auto">
                  {gefilterdKlanten.length === 0 ? (
                    <p className="text-xs text-gray-400 px-3 py-2">Geen klanten gevonden</p>
                  ) : gefilterdKlanten.map(k => (
                    <label key={k.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={klantIds.includes(k.id)}
                        onChange={() => toggleKlant(k.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 shrink-0"
                      />
                      <span className="text-xs text-gray-800 truncate">
                        {k.bedrijf ? `${k.bedrijf} (${k.naam})` : k.naam}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {/* Locatie */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Locatie</label>
              <input
                type="text"
                value={locatie}
                onChange={e => setLocatie(e.target.value)}
                placeholder="Adres of naam"
                className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Datum */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Datum</label>
              <input
                type="date"
                value={datum}
                onChange={e => setDatum(e.target.value)}
                className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {/* Hele dag toggle */}
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={geheledag}
                  onChange={e => setGeheledag(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                />
                <span className="text-sm text-gray-700">Hele dag</span>
              </label>
            </div>
            {/* Kalender */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Agenda</label>
              <select
                value={kalenderId}
                onChange={e => setKalenderId(e.target.value)}
                className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {kalenders.length === 0
                  ? <option value="primary">Primaire agenda</option>
                  : kalenders.map(k => <option key={k.id} value={k.id}>{k.samenvatting}</option>)
                }
              </select>
            </div>
          </div>

          {!geheledag && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Begintijd</label>
                <input
                  type="time"
                  value={startTijd}
                  onChange={e => setStartTijd(e.target.value)}
                  className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Eindtijd</label>
                <input
                  type="time"
                  value={eindTijd}
                  onChange={e => setEindTijd(e.target.value)}
                  className="w-full h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Factuurregels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Factuurregels (optioneel, voor later)</label>
              <button
                onClick={voegRegelToe}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                <Plus className="h-3 w-3" /> Regel toevoegen
              </button>
            </div>
            {regels.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid text-[10px] font-medium text-gray-500 uppercase bg-gray-50 px-2 py-1.5" style={{ gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr auto" }}>
                  <span>Omschrijving</span><span>Aantal</span><span>Eenheid</span><span>Prijs</span><span>BTW%</span><span />
                </div>
                {regels.map((regel, i) => (
                  <div key={i} className="grid gap-1 px-2 py-1.5 border-t border-gray-100" style={{ gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr auto" }}>
                    <input
                      value={regel.omschrijving}
                      onChange={e => updateRegel(i, "omschrijving", e.target.value)}
                      placeholder="Omschrijving"
                      className="h-7 rounded border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <input
                      type="number"
                      value={regel.aantal}
                      onChange={e => updateRegel(i, "aantal", parseFloat(e.target.value) || 1)}
                      className="h-7 rounded border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <input
                      value={regel.eenheid}
                      onChange={e => updateRegel(i, "eenheid", e.target.value)}
                      placeholder="uur"
                      className="h-7 rounded border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={regel.prijs}
                      onChange={e => updateRegel(i, "prijs", parseFloat(e.target.value) || 0)}
                      className="h-7 rounded border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <select
                      value={regel.btwPercentage}
                      onChange={e => updateRegel(i, "btwPercentage", parseFloat(e.target.value))}
                      className="h-7 rounded border border-gray-200 px-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                    >
                      <option value={0}>0%</option>
                      <option value={9}>9%</option>
                      <option value={21}>21%</option>
                    </select>
                    <button onClick={() => verwijderRegel(i)} className="text-red-400 hover:text-red-600 p-0.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {fout && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" /> {fout}
            </div>
          )}
        </div>

        {/* Footer — buiten scroll */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex justify-end gap-2">
          <Button variant="outline" disabled={opslaan} onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={slaOp} disabled={opslaan}>
            {opslaan && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Afspraak aanmaken
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}

// ── Hoofd component ────────────────────────────────────────────────────────────

export default function AgendaPagina() {
  const navigate = useNavigate();
  const [weergave, setWeergave] = useState<Weergave>("maand");
  const [geselecteerdeDatum, setGeselecteerdeDatum] = useState(() => new Date());
  const [afspraken, setAfspraken] = useState<Afspraak[]>([]);
  const [kalenders, setKalenders] = useState<Kalender[]>([]);
  const [primaryKalenderId, setPrimaryKalenderId] = useState("primary");
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [googleNietGekoppeld, setGoogleNietGekoppeld] = useState(false);
  const [geselecteerdeAfspraak, setGeselecteerdeAfspraak] = useState<Afspraak | null>(null);
  const [factuurMelding, setFactuurMelding] = useState<Array<{ id: string; nummer: string; klantNaam: string }> | null>(null);
  const [nieuwAfspraakOpen, setNieuwAfspraakOpen] = useState(false);
  const [voorafDatum, setVoorafDatum] = useState(dagSleutel(new Date()));
  const [voorafUur, setVoorafUur] = useState(9);

  // Bereken datum-range op basis van weergave
  const { van, tot, weekDagen } = useMemo(() => {
    const d = geselecteerdeDatum;
    if (weergave === "dag") {
      const v = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return {
        van: v.toISOString(),
        tot: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString(),
        weekDagen: [v],
      };
    }
    if (weergave === "week") {
      const ma = getWeekStart(d);
      const zo = new Date(ma); zo.setDate(zo.getDate() + 6);
      const wDagen = Array.from({ length: 7 }, (_, i) => {
        const dag = new Date(ma); dag.setDate(dag.getDate() + i); return dag;
      });
      return {
        van: ma.toISOString(),
        tot: new Date(zo.getFullYear(), zo.getMonth(), zo.getDate(), 23, 59, 59).toISOString(),
        weekDagen: wDagen,
      };
    }
    return {
      van: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
      tot: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString(),
      weekDagen: [],
    };
  }, [weergave, geselecteerdeDatum]);

  const laadAfspraken = useCallback(async (v: string, t: string) => {
    setLaden(true);
    setFout(null);
    try {
      const data = await window.api.agenda.haalAfspraken({ van: v, tot: t }) as { afspraken?: Afspraak[]; fout?: string; googleNietGekoppeld?: boolean };
      if (data.googleNietGekoppeld) { setGoogleNietGekoppeld(true); setAfspraken([]); }
      else if (data.fout) { setFout(data.fout); setAfspraken([]); }
      else { setGoogleNietGekoppeld(false); setAfspraken(data.afspraken ?? []); }
    } catch { setFout("Kon agenda niet laden. Controleer je verbinding."); }
    finally { setLaden(false); }
  }, []);

  useEffect(() => { laadAfspraken(van, tot); }, [van, tot, laadAfspraken]);

  useEffect(() => {
    window.api.agenda.haalKalenders().then((d: unknown) => {
      const data = d as { kalenders?: Kalender[]; primaryKalenderId?: string };
      if (data.kalenders) setKalenders(data.kalenders);
      if (data.primaryKalenderId) setPrimaryKalenderId(data.primaryKalenderId);
    }).catch(() => {});
    window.api.klanten.list().then((d: unknown) => {
      setKlanten(Array.isArray(d) ? (d as Klant[]) : []);
    }).catch(() => {});
  }, []);

  const openNieuwAfspraak = (datum: Date, uur = 9) => {
    setVoorafDatum(dagSleutel(datum));
    setVoorafUur(uur);
    setNieuwAfspraakOpen(true);
  };

  const label = getNavigatieLabel(weergave, geselecteerdeDatum);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        titel="Agenda"
        subtitel="Google Calendar"
        acties={
          <div className="flex items-center gap-2">
            <Button onClick={() => openNieuwAfspraak(geselecteerdeDatum)}>
              <Plus className="h-4 w-4" /> Nieuwe afspraak
            </Button>
          </div>
        }
      />

      <div className="flex-1 flex flex-col p-4 gap-3 min-h-0 overflow-hidden">
        {/* Werkbalk */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Weergave-knoppen */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(["dag","week","maand"] as Weergave[]).map(v => (
              <button
                key={v}
                onClick={() => setWeergave(v)}
                className={[
                  "px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                  weergave === v ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50",
                ].join(" ")}
              >{v}</button>
            ))}
          </div>

          {/* Navigatie */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setGeselecteerdeDatum(navigeer(weergave, geselecteerdeDatum, -1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            ><ChevronLeft className="h-4 w-4" /></button>
            <button
              onClick={() => setGeselecteerdeDatum(new Date())}
              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600"
            >Vandaag</button>
            <button
              onClick={() => setGeselecteerdeDatum(navigeer(weergave, geselecteerdeDatum, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            ><ChevronRight className="h-4 w-4" /></button>
          </div>

          <h2 className="text-base font-semibold text-gray-900 capitalize">{label}</h2>

          {laden && <Loader2 className="h-4 w-4 animate-spin text-indigo-400 ml-auto" />}
        </div>

        {/* Meldingen */}
        {googleNietGekoppeld && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3 shrink-0">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800">Google Agenda niet gekoppeld. <button onClick={() => navigate("/instellingen")} className="underline font-medium">Ga naar instellingen</button></p>
          </div>
        )}
        {fout && !googleNietGekoppeld && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2 text-sm text-red-700 shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0" /> {fout}
          </div>
        )}

        {/* Dag-weergave: mini-kalender links + tijdgrid rechts */}
        {weergave === "dag" && !googleNietGekoppeld && (
          <div className="flex gap-4 flex-1 min-h-0">
            <div className="shrink-0 pt-1">
              <MiniKalender
                geselecteerdeDatum={geselecteerdeDatum}
                onDagKlik={d => setGeselecteerdeDatum(d)}
              />
            </div>
            {laden
              ? <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-300" /></div>
              : <TijdGrid
                  dagen={weekDagen}
                  afspraken={afspraken}
                  onTijdKlik={(datum, uur) => openNieuwAfspraak(datum, uur)}
                  onAfspraakKlik={a => setGeselecteerdeAfspraak(a)}
                />
            }
          </div>
        )}

        {/* Week-weergave */}
        {weergave === "week" && !googleNietGekoppeld && (
          laden
            ? <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-300" /></div>
            : <TijdGrid
                dagen={weekDagen}
                afspraken={afspraken}
                onTijdKlik={(datum, uur) => openNieuwAfspraak(datum, uur)}
                onAfspraakKlik={a => setGeselecteerdeAfspraak(a)}
              />
        )}

        {/* Maand-weergave */}
        {weergave === "maand" && !googleNietGekoppeld && (
          laden
            ? <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-300" /></div>
            : <MaandWeergave
                jaar={geselecteerdeDatum.getFullYear()}
                maand={geselecteerdeDatum.getMonth()}
                afspraken={afspraken}
                onDagKlik={d => { setGeselecteerdeDatum(d); setWeergave("dag"); }}
                onAfspraakKlik={a => setGeselecteerdeAfspraak(a)}
              />
        )}
      </div>

      {/* Facturen aangemaakt melding */}
      {factuurMelding && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 px-5 py-4 min-w-[300px] max-w-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-gray-900">
              {factuurMelding.length === 1 ? "Factuur aangemaakt" : `${factuurMelding.length} facturen aangemaakt`}
            </p>
            <button onClick={() => setFactuurMelding(null)} className="text-gray-400 hover:text-gray-600 shrink-0"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-1.5">
            {factuurMelding.map(f => (
              <div key={f.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{f.klantNaam}</span>
                <button
                  onClick={() => { setFactuurMelding(null); navigate(`/facturen/${f.id}`); }}
                  className="text-indigo-600 hover:text-indigo-800 font-medium text-xs"
                >
                  {f.nummer} →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Afspraak detail */}
      {geselecteerdeAfspraak && (
        <AfspraakDetail
          afspraak={geselecteerdeAfspraak}
          onSluit={() => setGeselecteerdeAfspraak(null)}
          onFacturenAangemaakt={facturen => setFactuurMelding(facturen)}
        />
      )}

      {/* Nieuwe afspraak modal */}
      <NieuwAfspraakModal
        open={nieuwAfspraakOpen}
        onOpenChange={setNieuwAfspraakOpen}
        kalenders={kalenders}
        primaryKalenderId={primaryKalenderId}
        klanten={klanten}
        voorafDatum={voorafDatum}
        voorafUur={voorafUur}
        onOpgeslagen={() => laadAfspraken(van, tot)}
      />
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  MapPin,
  FileText,
  ExternalLink,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";

interface Afspraak {
  id: string;
  samenvatting: string;
  omschrijving?: string;
  locatie?: string;
  start: string;
  einde: string;
  geheledag: boolean;
}

interface AgendaResponse {
  afspraken: Afspraak[];
  fout?: string;
  googleNietGekoppeld?: boolean;
}

interface Klant {
  id: string;
  naam: string;
  bedrijf?: string | null;
}

// Kleuren per dag van de week voor afspraken
const AFSPRAAK_KLEUREN = [
  "bg-indigo-100 text-indigo-800 border-l-2 border-indigo-400",
  "bg-green-100 text-green-800 border-l-2 border-green-400",
  "bg-amber-100 text-amber-800 border-l-2 border-amber-400",
  "bg-blue-100 text-blue-800 border-l-2 border-blue-400",
  "bg-purple-100 text-purple-800 border-l-2 border-purple-400",
  "bg-rose-100 text-rose-800 border-l-2 border-rose-400",
  "bg-teal-100 text-teal-800 border-l-2 border-teal-400",
];

function afspraakKleur(index: number): string {
  return AFSPRAAK_KLEUREN[index % AFSPRAAK_KLEUREN.length];
}

function formatTijd(datum: string, geheledag: boolean): string {
  if (geheledag) return "Hele dag";
  return new Date(datum).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMaandDagen(jaar: number, maand: number): Date[] {
  const eerste = new Date(jaar, maand, 1);
  const laatste = new Date(jaar, maand + 1, 0);

  // Maandag = start van week (NL)
  const dagVanWeek = (eerste.getDay() + 6) % 7; // 0=Ma, 6=Zo
  const dagen: Date[] = [];

  // Vul dagen van vorige maand
  for (let i = dagVanWeek - 1; i >= 0; i--) {
    const d = new Date(eerste);
    d.setDate(d.getDate() - i - 1);
    dagen.push(d);
  }
  // Huidige maand
  for (let d = 1; d <= laatste.getDate(); d++) {
    dagen.push(new Date(jaar, maand, d));
  }
  // Vul rijen compleet (6 weken = 42 dagen)
  while (dagen.length < 42) {
    const last = dagen[dagen.length - 1];
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    dagen.push(next);
  }
  return dagen;
}

function isSameDag(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

const WEEKDAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export default function AgendaPagina() {
  const navigate = useNavigate();
  const nu = new Date();
  const [jaar, setJaar] = useState(nu.getFullYear());
  const [maand, setMaand] = useState(nu.getMonth());
  const [afspraken, setAfspraken] = useState<Afspraak[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [googleNietGekoppeld, setGoogleNietGekoppeld] = useState(false);
  const [geselecteerdeAfspraak, setGeselecteerdeAfspraak] = useState<Afspraak | null>(null);
  const [popoverPositie, setPopoverPositie] = useState({ x: 0, y: 0 });

  // Uren toevoegen vanuit afspraak
  const [afspraakVoorUren, setAfspraakVoorUren] = useState<Afspraak | null>(null);
  const [urenKlantId, setUrenKlantId] = useState("");
  const [urenOpslaan, setUrenOpslaan] = useState(false);
  const [urenMelding, setUrenMelding] = useState<string | null>(null);
  const [klanten, setKlanten] = useState<Klant[]>([]);

  const haalAfsprakenOp = useCallback(async () => {
    setLaden(true);
    setFout(null);
    try {
      const data: AgendaResponse = await window.api.agenda.haalAfspraken();
      if (data.googleNietGekoppeld || (data.fout && data.fout.includes("niet gekoppeld"))) {
        setGoogleNietGekoppeld(true);
        setAfspraken([]);
      } else if (data.fout) {
        setFout(data.fout);
        setAfspraken([]);
      } else {
        setGoogleNietGekoppeld(false);
        setAfspraken(data.afspraken ?? []);
      }
    } catch {
      setFout("Kon agenda niet laden. Controleer je verbinding.");
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    haalAfsprakenOp();
  }, [haalAfsprakenOp]);

  useEffect(() => {
    window.api.klanten.list().then((data: unknown) => {
      setKlanten(Array.isArray(data) ? (data as Klant[]) : []);
    }).catch(() => {});
  }, []);

  const voegAfspraakToeAlsUren = async () => {
    if (!afspraakVoorUren) return;
    setUrenOpslaan(true);
    try {
      const start = new Date(afspraakVoorUren.start);
      const einde = afspraakVoorUren.einde
        ? new Date(afspraakVoorUren.einde)
        : new Date(start.getTime() + 60 * 60 * 1000);
      const duurMinuten = Math.round((einde.getTime() - start.getTime()) / 60000);
      await window.api.uren.create({
        omschrijving: afspraakVoorUren.samenvatting || "Google Calendar afspraak",
        startTijd: start.toISOString(),
        eindTijd: einde.toISOString(),
        duurMinuten,
        klantId: urenKlantId || null,
        gefactureerd: false,
      });
      setUrenMelding("Urenregistratie aangemaakt");
      setTimeout(() => setUrenMelding(null), 4000);
      setAfspraakVoorUren(null);
      setUrenKlantId("");
    } catch {
      setUrenMelding("Opslaan mislukt");
      setTimeout(() => setUrenMelding(null), 4000);
    } finally {
      setUrenOpslaan(false);
    }
  };

  const vorigeMaand = () => {
    if (maand === 0) {
      setMaand(11);
      setJaar(jaar - 1);
    } else {
      setMaand(maand - 1);
    }
  };

  const volgendeMaand = () => {
    if (maand === 11) {
      setMaand(0);
      setJaar(jaar + 1);
    } else {
      setMaand(maand + 1);
    }
  };

  const naarVandaag = () => {
    setJaar(nu.getFullYear());
    setMaand(nu.getMonth());
  };

  const openAfspraak = (afspraak: Afspraak, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPositie({
      x: rect.left + window.scrollX,
      y: rect.bottom + window.scrollY + 4,
    });
    setGeselecteerdeAfspraak(afspraak);
  };

  const maakFactuurUrl = (afspraak: Afspraak) => {
    const params = new URLSearchParams({
      titel: afspraak.samenvatting,
      datum: afspraak.start.split("T")[0],
    });
    return `/facturen/nieuw?${params}`;
  };

  const dagen = getMaandDagen(jaar, maand);

  // Groepeer afspraken per dag
  const afsprakenPerDag = new Map<string, Afspraak[]>();
  afspraken.forEach((a) => {
    const key = a.start.split("T")[0];
    if (!afsprakenPerDag.has(key)) afsprakenPerDag.set(key, []);
    afsprakenPerDag.get(key)!.push(a);
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Agenda"
        subtitel="Google Calendar afspraken"
        acties={
          <Button variant="outline" onClick={naarVandaag}>
            <Calendar className="h-4 w-4" />
            Vandaag
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-4">
        {/* Navigatie */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={vorigeMaand}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={volgendeMaand}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 capitalize">
            {MAANDEN[maand]} {jaar}
          </h2>
          <div className="w-24" />
        </div>

        {/* Google niet gekoppeld */}
        {googleNietGekoppeld && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <AlertCircle className="h-8 w-8 text-amber-500 shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900">Google Agenda niet gekoppeld</h3>
                <p className="text-sm text-amber-700 mt-1">
                  Koppel je Google Agenda in de instellingen om afspraken te bekijken. Eenmaal
                  gekoppeld synchroniseren al je afspraken automatisch.
                </p>
              </div>
              <Button
                onClick={() => navigate("/instellingen")}
                className="shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
                Naar instellingen
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Foutmelding */}
        {fout && !googleNietGekoppeld && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {fout}
          </div>
        )}

        {/* Kalender */}
        <Card className="overflow-hidden">
          {/* Weekdag headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {WEEKDAGEN.map((dag) => (
              <div
                key={dag}
                className="text-center py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"
              >
                {dag}
              </div>
            ))}
          </div>

          {laden ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            </div>
          ) : (
            <div className="grid grid-cols-7 divide-x divide-gray-100">
              {dagen.map((dag, idx) => {
                const isHuidigeMaand = dag.getMonth() === maand;
                const isVandaag = isSameDag(dag, nu);
                const isWeekend = dag.getDay() === 0 || dag.getDay() === 6;
                const dagKey = dag.toISOString().split("T")[0];
                const dagAfspraken = afsprakenPerDag.get(dagKey) ?? [];

                return (
                  <div
                    key={idx}
                    className={`min-h-[100px] p-1.5 border-b border-gray-100 ${
                      isWeekend ? "bg-gray-50/50" : ""
                    } ${!isHuidigeMaand ? "opacity-40" : ""}`}
                  >
                    <div className="flex justify-center mb-1">
                      <span
                        className={`text-sm font-medium h-7 w-7 flex items-center justify-center rounded-full ${
                          isVandaag
                            ? "bg-indigo-600 text-white"
                            : "text-gray-700"
                        }`}
                      >
                        {dag.getDate()}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {dagAfspraken.slice(0, 3).map((afspraak, aIdx) => (
                        <button
                          key={afspraak.id}
                          onClick={(e) => openAfspraak(afspraak, e)}
                          className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate hover:opacity-80 transition-opacity ${afspraakKleur(aIdx)}`}
                          title={afspraak.samenvatting}
                        >
                          {!afspraak.geheledag && (
                            <span className="font-semibold mr-1">
                              {formatTijd(afspraak.start, false)}
                            </span>
                          )}
                          {afspraak.samenvatting}
                        </button>
                      ))}
                      {dagAfspraken.length > 3 && (
                        <p className="text-xs text-gray-400 text-center">
                          +{dagAfspraken.length - 3} meer
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Afspraak detail popover */}
      {geselecteerdeAfspraak && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setGeselecteerdeAfspraak(null)}
          />
          {/* Popover */}
          <div
            className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 w-80 p-4"
            style={{
              left: Math.min(popoverPositie.x, window.innerWidth - 340),
              top: Math.min(popoverPositie.y, window.innerHeight - 300),
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                {geselecteerdeAfspraak.samenvatting}
              </h3>
              <button
                onClick={() => setGeselecteerdeAfspraak(null)}
                className="text-gray-400 hover:text-gray-600 shrink-0 p-0.5 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                <span>
                  {geselecteerdeAfspraak.geheledag ? (
                    <>
                      {new Date(geselecteerdeAfspraak.start).toLocaleDateString("nl-NL", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })} — Hele dag
                    </>
                  ) : (
                    <>
                      {new Date(geselecteerdeAfspraak.start).toLocaleDateString("nl-NL", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {formatTijd(geselecteerdeAfspraak.start, false)} –{" "}
                      {formatTijd(geselecteerdeAfspraak.einde, false)}
                    </>
                  )}
                </span>
              </div>

              {geselecteerdeAfspraak.locatie && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  <span className="text-xs">{geselecteerdeAfspraak.locatie}</span>
                </div>
              )}

              {geselecteerdeAfspraak.omschrijving && (
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                  <span className="text-xs line-clamp-3">{geselecteerdeAfspraak.omschrijving}</span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  setGeselecteerdeAfspraak(null);
                  navigate(maakFactuurUrl(geselecteerdeAfspraak));
                }}
              >
                <FileText className="h-4 w-4" />
                Maak factuur van afspraak
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setAfspraakVoorUren(geselecteerdeAfspraak);
                  setUrenKlantId("");
                  setGeselecteerdeAfspraak(null);
                }}
              >
                <Clock className="h-4 w-4" />
                Voeg toe als uren
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Modal: afspraak toevoegen als uren */}
      {urenMelding && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 shadow-lg">
          {urenMelding}
        </div>
      )}

      <Modal
        open={!!afspraakVoorUren}
        onOpenChange={(o) => {
          if (!o) {
            setAfspraakVoorUren(null);
            setUrenKlantId("");
          }
        }}
      >
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle>Afspraak toevoegen als uren</ModalTitle>
          </ModalHeader>
          {afspraakVoorUren && (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1 text-sm">
                <p className="font-semibold text-gray-900">{afspraakVoorUren.samenvatting}</p>
                <p className="text-gray-500">
                  {afspraakVoorUren.geheledag ? (
                    <>
                      {new Date(afspraakVoorUren.start).toLocaleDateString("nl-NL", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })} — Hele dag
                    </>
                  ) : (
                    <>
                      {new Date(afspraakVoorUren.start).toLocaleDateString("nl-NL", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {formatTijd(afspraakVoorUren.start, false)}{" "}
                      {afspraakVoorUren.einde && `– ${formatTijd(afspraakVoorUren.einde, false)}`}
                    </>
                  )}
                </p>
                {(() => {
                  const start = new Date(afspraakVoorUren.start);
                  const einde = afspraakVoorUren.einde
                    ? new Date(afspraakVoorUren.einde)
                    : new Date(start.getTime() + 60 * 60 * 1000);
                  const duurMin = Math.round((einde.getTime() - start.getTime()) / 60000);
                  const uren = Math.floor(duurMin / 60);
                  const mins = duurMin % 60;
                  return (
                    <p className="text-indigo-700 font-medium">
                      Duur: {uren > 0 ? `${uren}u ` : ""}{mins > 0 ? `${mins}m` : ""}
                    </p>
                  );
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Klant (optioneel)
                </label>
                <select
                  value={urenKlantId}
                  onChange={(e) => setUrenKlantId(e.target.value)}
                  className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Geen klant</option>
                  {klanten.map((k) => (
                    <option key={k.id} value={k.id}>{k.bedrijf ?? k.naam}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={voegAfspraakToeAlsUren} loading={urenOpslaan}>
              Opslaan als uren
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

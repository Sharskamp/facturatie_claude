import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Printer,
  Send,
  Loader2,
  Mail,
  MessageSquare,
  Copy,
  CheckCircle2,
  ExternalLink,
  FileDown,
  FileMinus,
  Bell,
  FolderOpen,
  Archive,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";
import { formatBedrag, formatDatum, formatDatumLang, statusKleur, statusLabel } from "@/lib/utils";

interface FactuurRegel {
  id: string;
  omschrijving: string;
  aantal: number;
  eenheid?: string | null;
  prijs: number;
  btwPercentage: number;
  kortingPercentage: number;
  totaal: number;
}

interface FactuurBetaling {
  id: string;
  bedrag: number;
  aangemaakt: string;
  inkomen: {
    id: string;
    datum: string;
    omschrijving: string;
    bedrag: number;
    bron: string | null;
    tegenrekeningNaam: string | null;
  };
}

interface Factuur {
  id: string;
  nummer: string;
  datum: string;
  vervaldatum: string;
  status: string;
  subtotaal: number;
  kortingBedrag: number;
  kortingPercentage: number;
  btwBedrag: number;
  totaal: number;
  btwVerlegd: boolean;
  notities?: string | null;
  betalingsCondities?: string | null;
  taal?: string;
  totaalKorting?: number;
  totaalKortingBedrag?: number;
  mollieBetaalLink?: string | null;
  bronBestandPad?: string | null;
  historisch?: boolean;
  regels: FactuurRegel[];
  betalingen?: FactuurBetaling[];
  reedsBetaald?: number;
  openstaand?: number;
  teveel?: number;
  groepTotaal?: number;
  groepFacturen?: Array<{
    id: string;
    nummer: string;
    totaal: number;
    betalingen: FactuurBetaling[];
  }>;
  klant: {
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
  };
}

interface Instellingen {
  naam?: string;
  bedrijfsnaam?: string;
  adres?: string;
  postcode?: string;
  stad?: string;
  email?: string;
  telefoon?: string;
  kvkNummer?: string;
  btwNummer?: string;
  iban?: string;
  korActief?: boolean;
}

type VerstuurTab = "email" | "whatsapp";

export default function FactuurDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [factuur, setFactuur] = useState<Factuur | null>(null);
  const [instellingen, setInstellingen] = useState<Instellingen | null>(null);
  const [laden, setLaden] = useState(true);
  const [verstuurModalOpen, setVerstuurModalOpen] = useState(false);
  const [verstuurTab, setVerstuurTab] = useState<VerstuurTab>("email");
  const [emailAdres, setEmailAdres] = useState("");
  const [emailBericht, setEmailBericht] = useState("");
  const [verstuurLaden, setVerstuurLaden] = useState(false);
  const [verstuurFout, setVerstuurFout] = useState<string | null>(null);
  const [verstuurSucces, setVerstuurSucces] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);
  const [statusBijwerken, setStatusBijwerken] = useState(false);
  const [creditnotaLaden, setCreditnotaLaden] = useState(false);
  const [herinneringLaden, setHerinneringLaden] = useState(false);
  const [mollieLaden, setMollieLaden] = useState(false);
  const [checkLaden, setCheckLaden] = useState(false);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [auditLogs, setAuditLogs] = useState<Array<{id: string; actie: string; details?: string; aangemaakt: string}>>([]);

  const laadFactuur = useCallback(async () => {
    try {
      const data = await window.api.facturen.get(id!);
      setFactuur(data);
      setEmailAdres(data.klant?.email ?? "");
    } catch (e) {
      console.error("Fout bij laden factuur:", e);
      navigate("/facturen");
    } finally {
      setLaden(false);
    }
  }, [id, navigate]);

  const laadInstellingen = useCallback(async () => {
    try {
      const data = await window.api.instellingen.get();
      setInstellingen(data ?? {});
    } catch (e) {
      console.error("Fout bij laden instellingen:", e);
      setInstellingen({});
    }
  }, []);

  useEffect(() => {
    laadFactuur();
    laadInstellingen();
  }, [laadFactuur, laadInstellingen]);

  useEffect(() => {
    if (!id) return;
    window.api.audit.list(id).then(setAuditLogs).catch(() => {});
  }, [id]);

  async function verstuur() {
    if (!factuur) return;
    setVerstuurLaden(true);
    setVerstuurFout(null);
    try {
      const body =
        verstuurTab === "email"
          ? { methode: "email", naarEmail: emailAdres, bericht: emailBericht }
          : { methode: "whatsapp" };

      const data = await window.api.facturen.verstuur(id!, body);
      if (verstuurTab === "whatsapp" && data.whatsappUrl) {
        setWhatsappUrl(data.whatsappUrl);
        window.api.audit.create({ factuurId: id!, actie: "VERZONDEN", details: factuur.klant.telefoon ?? "whatsapp" }).catch(() => {});
        window.api.audit.list(id!).then(setAuditLogs).catch(() => {});
      } else {
        window.api.audit.create({ factuurId: id!, actie: "VERZONDEN", details: emailAdres }).catch(() => {});
        window.api.audit.list(id!).then(setAuditLogs).catch(() => {});
        setVerstuurSucces(true);
        setTimeout(() => {
          setVerstuurModalOpen(false);
          setVerstuurSucces(false);
          laadFactuur();
        }, 1500);
      }
    } catch (e: unknown) {
      setVerstuurFout(e instanceof Error ? e.message : "Verzenden mislukt");
    } finally {
      setVerstuurLaden(false);
    }
  }

  async function markeerBetaald() {
    if (!factuur) return;
    setStatusBijwerken(true);
    const oudStatus = factuur.status;
    try {
      await window.api.facturen.update(id!, { status: "BETAALD" });
      window.api.audit.create({ factuurId: id!, actie: "STATUS_GEWIJZIGD", details: `${oudStatus} → BETAALD` }).catch(() => {});
      laadFactuur();
      window.api.audit.list(id!).then(setAuditLogs).catch(() => {});
    } catch (e) {
      console.error("Fout bij bijwerken status:", e);
    } finally {
      setStatusBijwerken(false);
    }
  }

  async function kopieerNaarKlembord(tekst: string) {
    await navigator.clipboard.writeText(tekst);
    setGekopieerd(true);
    setTimeout(() => setGekopieerd(false), 2000);
  }

  function toonMelding(type: "succes" | "fout", tekst: string) {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 4000);
  }

  async function maakCreditnota() {
    if (!factuur) return;
    if (!confirm(`Weet je zeker dat je een creditnota wilt aanmaken voor factuur ${factuur.nummer}?`)) return;
    setCreditnotaLaden(true);
    try {
      const nieuweId = await window.api.facturen.maakCreditnota(id!);
      navigate(`/facturen/${nieuweId}`);
    } catch (e: unknown) {
      toonMelding("fout", e instanceof Error ? e.message : "Creditnota aanmaken mislukt");
    } finally {
      setCreditnotaLaden(false);
    }
  }

  async function stuurHerinnering() {
    if (!factuur) return;
    if (!confirm(`Herinnering sturen voor factuur ${factuur.nummer}?`)) return;
    setHerinneringLaden(true);
    try {
      await window.api.facturen.stuurHerinneringen();
      toonMelding("succes", "Herinnering verstuurd");
    } catch (e: unknown) {
      toonMelding("fout", e instanceof Error ? e.message : "Herinnering sturen mislukt");
    } finally {
      setHerinneringLaden(false);
    }
  }

  const korActief = instellingen?.korActief ?? false;

  // Bereken BTW per tarief
  const btwGroepen = factuur?.regels.reduce(
    (acc, regel) => {
      if (factuur.btwVerlegd || korActief) return acc;
      const bruto = regel.prijs * regel.aantal;
      const korting = (bruto * regel.kortingPercentage) / 100;
      const netto = bruto - korting;
      const btw = (netto * regel.btwPercentage) / 100;
      const key = `${regel.btwPercentage}%`;
      acc[key] = (acc[key] ?? 0) + btw;
      return acc;
    },
    {} as Record<string, number>
  ) ?? {};

  if (laden) {
    return (
      <div>
        <Header titel="Factuur laden..." />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
        </div>
      </div>
    );
  }

  if (!factuur) return null;

  const verlopen =
    factuur.status === "VERZONDEN" &&
    new Date(factuur.vervaldatum) < new Date();
  const effectiefStatus = verlopen ? "VERLOPEN" : factuur.status;

  const bedrijfNaam = instellingen?.bedrijfsnaam ?? instellingen?.naam ?? "Uw Bedrijfsnaam";
  const whatsappBericht = `Beste ${factuur.klant.naam},\n\nHierbij stuur ik u factuur ${factuur.nummer} ter waarde van ${formatBedrag(factuur.totaal)}.\n\nVervaldatum: ${formatDatum(factuur.vervaldatum)}\n\nMet vriendelijke groet,\n${bedrijfNaam}`;

  return (
    <div>
      <Header
        titel={`Factuur ${factuur.nummer}`}
        subtitel={factuur.klant.bedrijf ?? factuur.klant.naam}
        acties={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/facturen")}
            >
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
            {factuur.status === "CONCEPT" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/facturen/${id}/bewerken`)}
              >
                <Pencil className="h-4 w-4" />
                Bewerken
              </Button>
            )}
            {!factuur.historisch && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Afdrukken
              </Button>
            )}
            {!factuur.historisch && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const res = await window.api.facturen.downloadPdf(id!) as { succes: boolean; fout?: string }
                  if (!res.succes && res.fout) {
                    alert(`PDF mislukt: ${res.fout}`)
                  } else {
                    window.api.audit.create({ factuurId: id!, actie: "PDF_GEDOWNLOAD" }).catch(() => {});
                    window.api.audit.list(id!).then(setAuditLogs).catch(() => {});
                    laadFactuur();
                  }
                }}
              >
                <FileDown className="h-4 w-4" />
                PDF downloaden
              </Button>
            )}
            {factuur.bronBestandPad && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const res = await window.api.facturen.openBronBestand(id!)
                  if (!res.succes) toonMelding("fout", res.fout ?? "Bestand kon niet worden geopend")
                }}
              >
                <FolderOpen className="h-4 w-4" />
                Bekijk bestand
              </Button>
            )}
            {factuur.mollieBetaalLink ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(factuur.mollieBetaalLink!).catch(() => {});
                  toonMelding("succes", "iDEAL betaallink gekopieerd");
                }}
              >
                <Copy className="h-4 w-4" />
                Betaallink kopiëren
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                loading={mollieLaden}
                onClick={async () => {
                  setMollieLaden(true);
                  try {
                    const res = await window.api.mollie.maakBetaalLink(id!);
                    await laadFactuur();
                    toonMelding("succes", "iDEAL betaallink aangemaakt");
                    if (res.url) navigator.clipboard.writeText(res.url).catch(() => {});
                  } catch (e: unknown) {
                    const err = e as Error;
                    toonMelding("fout", err.message || "Mollie betaallink mislukt");
                  } finally {
                    setMollieLaden(false);
                  }
                }}
              >
                <ExternalLink className="h-4 w-4" />
                iDEAL betaallink
              </Button>
            )}
            {factuur.mollieBetaalLink && factuur.status !== "BETAALD" && (
              <Button
                variant="outline"
                size="sm"
                loading={checkLaden}
                onClick={async () => {
                  setCheckLaden(true);
                  try {
                    const result = await window.api.mollie.checkBetalingStatus(id!);
                    if (result.betaald === true) {
                      toonMelding("succes", "Betaling ontvangen! Factuur gemarkeerd als betaald.");
                      laadFactuur();
                    } else if (result.fout) {
                      toonMelding("fout", result.fout);
                    } else {
                      toonMelding("fout", "Nog geen betaling gevonden bij Mollie.");
                    }
                  } catch (e: unknown) {
                    toonMelding("fout", e instanceof Error ? e.message : "Statuscontrole mislukt");
                  } finally {
                    setCheckLaden(false);
                  }
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                Controleer betaalstatus
              </Button>
            )}
            {(factuur.status === "VERZONDEN" || factuur.status === "BETAALD") && (
              <Button
                variant="outline"
                size="sm"
                loading={creditnotaLaden}
                onClick={maakCreditnota}
              >
                <FileMinus className="h-4 w-4" />
                Creditnota aanmaken
              </Button>
            )}
            {factuur.status === "VERZONDEN" && factuur.klant.email && (
              <Button
                variant="outline"
                size="sm"
                loading={herinneringLaden}
                onClick={stuurHerinnering}
              >
                <Bell className="h-4 w-4" />
                Herinnering sturen
              </Button>
            )}
            {factuur.status !== "BETAALD" && factuur.status !== "GEANNULEERD" && (
              <>
                {(factuur.status === "VERZONDEN" || verlopen) && (
                  <Button
                    variant="success"
                    size="sm"
                    loading={statusBijwerken}
                    onClick={markeerBetaald}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Betaald
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    setVerstuurTab("email");
                    setVerstuurFout(null);
                    setVerstuurSucces(false);
                    setWhatsappUrl(null);
                    setVerstuurModalOpen(true);
                  }}
                >
                  <Send className="h-4 w-4" />
                  Versturen
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="p-6">
        {/* Melding banner */}
        {melding && (
          <div
            className={`max-w-4xl mx-auto mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
              melding.type === "succes"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {melding.tekst}
          </div>
        )}

        {/* Historisch import banner */}
        {factuur.historisch && (
          <div className="max-w-4xl mx-auto mb-4 rounded-lg px-4 py-3 flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">Historisch geïmporteerde factuur</span> — deze factuur is ingeladen vanuit een eerder opgemaakt document en is niet via de app aangemaakt.
                {factuur.bronBestandPad && " Het originele bestand is bewaard en kan hieronder worden geopend."}
              </span>
            </div>
            {factuur.bronBestandPad && (
              <button
                className="shrink-0 inline-flex items-center gap-1.5 font-medium underline underline-offset-2 hover:text-amber-900"
                onClick={async () => {
                  const res = await window.api.facturen.openBronBestand(id!)
                  if (!res.succes) toonMelding("fout", res.fout ?? "Bestand kon niet worden geopend")
                }}
              >
                <FolderOpen className="h-4 w-4" />
                Origineel openen
              </button>
            )}
          </div>
        )}

        {/* Factuur preview */}
        <Card className="max-w-4xl mx-auto print:shadow-none print:border-0">
          <CardContent className="p-8 sm:p-12">
            {/* Koptekst */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-6 mb-10">
              {/* Afzenderinfo */}
              <div>
                <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center mb-3">
                  <span className="text-white font-bold text-lg">A</span>
                </div>
                <h2 className="text-lg font-bold text-gray-900">
                  {bedrijfNaam}
                </h2>
                <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                  {instellingen?.adres && <p>{instellingen.adres}</p>}
                  {(instellingen?.postcode || instellingen?.stad) && (
                    <p>{instellingen.postcode} {instellingen.stad}</p>
                  )}
                  {instellingen?.telefoon && <p>{instellingen.telefoon}</p>}
                  {instellingen?.email && <p>{instellingen.email}</p>}
                  {instellingen?.kvkNummer && <p className="pt-1">KVK: {instellingen.kvkNummer}</p>}
                  {instellingen?.btwNummer && <p>BTW: {instellingen.btwNummer}</p>}
                  {instellingen?.iban && <p>IBAN: {instellingen.iban}</p>}
                </div>
              </div>

              {/* Factuurinfo rechts */}
              <div className="sm:text-right">
                <div className="flex sm:justify-end items-center gap-2 mb-3">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${statusKleur(effectiefStatus)}`}
                  >
                    {statusLabel(effectiefStatus)}
                  </span>
                  {factuur.historisch && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                      <Archive className="h-3 w-3" />
                      Historisch
                    </span>
                  )}
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-3">
                  FACTUUR
                </h1>
                <div className="text-sm text-gray-600 space-y-1">
                  <div className="flex sm:justify-end gap-8">
                    <span className="text-gray-400 font-medium">Nummer</span>
                    <span className="font-mono font-semibold text-gray-900">
                      {factuur.nummer}
                    </span>
                  </div>
                  <div className="flex sm:justify-end gap-8">
                    <span className="text-gray-400 font-medium">Datum</span>
                    <span>{formatDatumLang(factuur.datum)}</span>
                  </div>
                  <div className="flex sm:justify-end gap-8">
                    <span className="text-gray-400 font-medium">
                      Vervaldatum
                    </span>
                    <span
                      className={verlopen ? "text-red-600 font-semibold" : ""}
                    >
                      {formatDatumLang(factuur.vervaldatum)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Factuuradres */}
            <div className="mb-8 p-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Factuuradres
              </p>
              <p className="font-semibold text-gray-900">
                {factuur.klant.bedrijf
                  ? factuur.klant.bedrijf
                  : factuur.klant.naam}
              </p>
              {factuur.klant.bedrijf && (
                <p className="text-gray-600">t.a.v. {factuur.klant.naam}</p>
              )}
              {factuur.klant.adres && (
                <p className="text-gray-600">{factuur.klant.adres}</p>
              )}
              {(factuur.klant.postcode || factuur.klant.stad) && (
                <p className="text-gray-600">
                  {[factuur.klant.postcode, factuur.klant.stad]
                    .filter(Boolean)
                    .join(" ")}
                </p>
              )}
              {factuur.klant.land && (
                <p className="text-gray-600">{factuur.klant.land}</p>
              )}
              {factuur.klant.btwNummer && (
                <p className="text-sm text-gray-500 mt-1">
                  BTW: {factuur.klant.btwNummer}
                </p>
              )}
            </div>

            {/* KOR melding */}
            {korActief && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                KOR actief — deze factuur is verstuurd zonder BTW
              </div>
            )}
            {/* BTW verlegd melding */}
            {!korActief && factuur.btwVerlegd && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                BTW verlegd — de BTW wordt aangegeven door de afnemer
              </div>
            )}

            {/* Regelstabel */}
            <div className="mb-8">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Omschrijving
                    </th>
                    <th className="text-right py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Aantal
                    </th>
                    <th className="text-right py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Eenheid
                    </th>
                    <th className="text-right py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Prijs
                    </th>
                    {!korActief && (
                      <th className="text-right py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        BTW%
                      </th>
                    )}
                    {factuur.regels.some((r) => r.kortingPercentage > 0) && (
                      <th className="text-right py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Korting%
                      </th>
                    )}
                    <th className="text-right py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Subtotaal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {factuur.regels.map((regel) => {
                    const bruto = regel.prijs * regel.aantal;
                    const korting =
                      (bruto * regel.kortingPercentage) / 100;
                    const netto = bruto - korting;
                    return (
                      <tr
                        key={regel.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-3 text-sm text-gray-900 font-medium">
                          {regel.omschrijving}
                        </td>
                        <td className="py-3 text-sm text-gray-600 text-right">
                          {regel.aantal}
                        </td>
                        <td className="py-3 text-sm text-gray-400 text-right">
                          {regel.eenheid ?? ""}
                        </td>
                        <td className="py-3 text-sm text-gray-600 text-right">
                          {formatBedrag(regel.prijs)}
                        </td>
                        {!korActief && (
                          <td className="py-3 text-sm text-gray-600 text-right">
                            {factuur.btwVerlegd ? "Verlegd" : `${regel.btwPercentage}%`}
                          </td>
                        )}
                        {factuur.regels.some(
                          (r) => r.kortingPercentage > 0
                        ) && (
                          <td className="py-3 text-sm text-gray-600 text-right">
                            {regel.kortingPercentage > 0
                              ? `${regel.kortingPercentage}%`
                              : "-"}
                          </td>
                        )}
                        <td className="py-3 text-sm font-semibold text-gray-900 text-right">
                          {formatBedrag(netto)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totaalblok */}
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotaal</span>
                  <span className="text-gray-900">
                    {formatBedrag(
                      factuur.subtotaal +
                        factuur.kortingBedrag
                    )}
                  </span>
                </div>
                {factuur.kortingBedrag > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      Korting ({factuur.kortingPercentage}%)
                    </span>
                    <span className="text-green-600">
                      -{formatBedrag(factuur.kortingBedrag)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Netto</span>
                  <span className="text-gray-900">
                    {formatBedrag(factuur.subtotaal)}
                  </span>
                </div>
                {!korActief && factuur.btwVerlegd && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">BTW (verlegd)</span>
                    <span className="text-gray-400">€ 0,00</span>
                  </div>
                )}
                {!korActief && !factuur.btwVerlegd && Object.entries(btwGroepen).map(([tarief, bedrag]) => (
                  <div key={tarief} className="flex justify-between text-sm">
                    <span className="text-gray-500">BTW {tarief}</span>
                    <span className="text-gray-900">
                      {formatBedrag(bedrag)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-3 border-t-2 border-gray-900">
                  <span className="font-bold text-gray-900 text-base">
                    Totaal
                  </span>
                  <span className="font-bold text-gray-900 text-base">
                    {formatBedrag(factuur.totaal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notities & Betalingscondities */}
            {(factuur.notities || factuur.betalingsCondities) && (
              <div className="mt-10 pt-8 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-6">
                {factuur.notities && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Notities
                    </p>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {factuur.notities}
                    </p>
                  </div>
                )}
                {factuur.betalingsCondities && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      Betalingscondities
                    </p>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {factuur.betalingsCondities}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Voettekst */}
            <div className="mt-10 pt-6 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                {bedrijfNaam}
                {instellingen?.kvkNummer && ` · KVK ${instellingen.kvkNummer}`}
                {instellingen?.btwNummer && ` · BTW ${instellingen.btwNummer}`}
                {instellingen?.iban && ` · IBAN ${instellingen.iban}`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Knop om klant te bekijken */}
        <div className="max-w-4xl mx-auto mt-4">
          <button
            onClick={() => navigate(`/klanten/${factuur.klant.id}`)}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <ExternalLink className="h-4 w-4" />
            Klantprofiel bekijken: {factuur.klant.naam}
          </button>
        </div>

        {/* Betaalstatus sectie */}
        {factuur.betalingen !== undefined && (
          <div className="max-w-4xl mx-auto mt-4">
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">Betaalstatus</h3>
              </div>
              <div className="p-4 space-y-3">
                {/* Samenvatting op groepniveau */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">{factuur.groepFacturen ? "Groepstotaal: " : "Factuurbedrag: "}</span>
                    <span className="font-medium">{formatBedrag(factuur.groepTotaal ?? factuur.totaal)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Ontvangen: </span>
                    <span className={`font-medium ${(factuur.reedsBetaald ?? 0) > 0 ? "text-green-700" : "text-gray-700"}`}>
                      {formatBedrag(factuur.reedsBetaald ?? 0)}
                    </span>
                  </div>
                  {(factuur.openstaand ?? 0) > 0.01 && (
                    <div>
                      <span className="text-gray-500">Openstaand: </span>
                      <span className="font-semibold text-amber-600">{formatBedrag(factuur.openstaand ?? 0)}</span>
                    </div>
                  )}
                  {(factuur.teveel ?? 0) > 0.01 && (
                    <div>
                      <span className="text-gray-500">Te veel betaald: </span>
                      <span className="font-semibold text-red-600">{formatBedrag(factuur.teveel ?? 0)}</span>
                    </div>
                  )}
                </div>

                {/* Voortgangsbalk op groepniveau */}
                {(factuur.groepTotaal ?? factuur.totaal) > 0 && (
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (factuur.teveel ?? 0) > 0.01 ? "bg-red-500" :
                        (factuur.openstaand ?? 0) < 0.01 ? "bg-green-500" : "bg-amber-400"
                      }`}
                      style={{ width: `${Math.min(100, ((factuur.reedsBetaald ?? 0) / (factuur.groepTotaal ?? factuur.totaal)) * 100)}%` }}
                    />
                  </div>
                )}

                {/* Betaalhistorie: gegroepeerd per factuur als er meerdere zijn */}
                {factuur.groepFacturen ? (
                  <div className="space-y-4 mt-2">
                    {factuur.groepFacturen.map(gf => (
                      <div key={gf.id}>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                          Factuur {gf.nummer} · {formatBedrag(gf.totaal)}
                          {gf.id === factuur.id && <span className="ml-1 text-indigo-500">(deze factuur)</span>}
                        </p>
                        {gf.betalingen.length > 0 ? (
                          <div className="space-y-1">
                            {gf.betalingen.map(b => (
                              <div key={b.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                                <div className="flex items-center gap-3">
                                  <span className="text-gray-400 text-xs">{formatDatumLang(b.inkomen.datum)}</span>
                                  <span className="text-gray-700">{b.inkomen.tegenrekeningNaam ?? b.inkomen.omschrijving}</span>
                                  {b.inkomen.bedrag !== b.bedrag && (
                                    <span className="text-xs text-gray-400">(totale betaling: {formatBedrag(b.inkomen.bedrag)})</span>
                                  )}
                                </div>
                                <span className="font-semibold text-green-700">{formatBedrag(b.bedrag)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">Nog geen betalingen.</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : factuur.betalingen && factuur.betalingen.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ontvangen betalingen</p>
                    {factuur.betalingen.map(b => (
                      <div key={b.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400 text-xs">{formatDatumLang(b.inkomen.datum)}</span>
                          <span className="text-gray-700">{b.inkomen.tegenrekeningNaam ?? b.inkomen.omschrijving}</span>
                          {b.inkomen.bedrag !== b.bedrag && (
                            <span className="text-xs text-gray-400">(totale betaling: {formatBedrag(b.inkomen.bedrag)})</span>
                          )}
                        </div>
                        <span className="font-semibold text-green-700">{formatBedrag(b.bedrag)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">Nog geen betalingen ontvangen.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Audit log timeline */}
        <div className="max-w-4xl mx-auto mt-6 pb-6">
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Activiteiten</h3>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nog geen activiteiten geregistreerd.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="flex gap-3 text-sm py-2 border-b border-gray-100">
                  <span className="text-gray-400 whitespace-nowrap">{formatDatum(log.aangemaakt)}</span>
                  <span className="font-medium">{log.actie}</span>
                  {log.details && <span className="text-gray-500">{log.details}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Verstuur modal */}
      <Modal open={verstuurModalOpen} onOpenChange={setVerstuurModalOpen}>
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>Factuur versturen</ModalTitle>
          </ModalHeader>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 -mt-2">
            <button
              onClick={() => {
                setVerstuurTab("email");
                setWhatsappUrl(null);
                setVerstuurFout(null);
                setVerstuurSucces(false);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                verstuurTab === "email"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Mail className="h-4 w-4" />
              E-mail
            </button>
            <button
              onClick={() => {
                setVerstuurTab("whatsapp");
                setWhatsappUrl(null);
                setVerstuurFout(null);
                setVerstuurSucces(false);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                verstuurTab === "whatsapp"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              WhatsApp
            </button>
          </div>

          <div className="space-y-4 pt-2">
            {verstuurFout && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {verstuurFout}
              </div>
            )}

            {verstuurSucces && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Factuur succesvol verzonden!
              </div>
            )}

            {verstuurTab === "email" ? (
              <>
                <Input
                  label="Ontvanger e-mailadres"
                  type="email"
                  value={emailAdres}
                  onChange={(e) => setEmailAdres(e.target.value)}
                  placeholder="klant@voorbeeld.nl"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Persoonlijk bericht (optioneel)
                  </label>
                  <Textarea
                    value={emailBericht}
                    onChange={(e) => setEmailBericht(e.target.value)}
                    placeholder={`Beste ${factuur.klant.naam},\n\nBijgaand treft u factuur ${factuur.nummer} aan...`}
                    rows={4}
                  />
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-500">
                  <p className="font-medium text-gray-700 mb-1">
                    E-mail bevat:
                  </p>
                  <ul className="space-y-0.5 list-disc list-inside">
                    <li>
                      Factuur {factuur.nummer} —{" "}
                      {formatBedrag(factuur.totaal)}
                    </li>
                    <li>Vervaldatum: {formatDatum(factuur.vervaldatum)}</li>
                    <li>Link naar online factuur</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                {whatsappUrl ? (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                      <p className="text-sm font-medium text-green-800 mb-2">
                        WhatsApp bericht klaar!
                      </p>
                      <p className="text-sm text-green-700">
                        Klik op de knop hieronder om het bericht te openen in
                        WhatsApp.
                      </p>
                    </div>
                    <button
                      onClick={() => window.api.shell.openExternal(whatsappUrl)}
                      className="flex items-center justify-center gap-2 w-full h-9 px-4 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Openen in WhatsApp
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        Voorbeeld bericht
                      </p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {whatsappBericht}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => kopieerNaarKlembord(whatsappBericht)}
                      >
                        {gekopieerd ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            Gekopieerd!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Kopieer bericht
                          </>
                        )}
                      </Button>
                    </div>
                    {factuur.klant.telefoon ? (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        Telefoon bekend: {factuur.klant.telefoon}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                        Geen telefoonnummer bekend voor deze klant
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <ModalFooter className="mt-4 gap-2">
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            {!whatsappUrl && (
              <Button
                onClick={verstuur}
                loading={verstuurLaden}
                disabled={
                  verstuurSucces ||
                  (verstuurTab === "email" && !emailAdres.trim())
                }
              >
                {verstuurTab === "email" ? (
                  <>
                    <Mail className="h-4 w-4" />
                    Verstuur e-mail
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4" />
                    Genereer WhatsApp
                  </>
                )}
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

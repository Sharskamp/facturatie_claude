import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  FileCheck,
  Trash2,
  ArrowRight,
  Plus,
  Loader2,
  Save,
  X,
  Mail,
  Printer,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBedrag, formatDatum, statusKleur, statusLabel } from "@/lib/utils";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";

interface OfferteRegel {
  id: string;
  omschrijving: string;
  aantal: number;
  eenheid?: string | null;
  prijs: number;
  btwPercentage: number;
  kortingPercentage: number;
  totaal: number;
}

interface Offerte {
  id: string;
  nummer: string;
  status: string;
  datum: string;
  geldigTot: string;
  subtotaal: number;
  kortingBedrag: number;
  kortingPercentage: number;
  btwBedrag: number;
  totaal: number;
  notities?: string | null;
  regels: OfferteRegel[];
  klant: {
    id: string;
    naam: string;
    bedrijf?: string | null;
    email?: string | null;
  };
}

interface Klant {
  id: string;
  naam: string;
  bedrijf?: string | null;
}

interface EditRegel {
  id: string;
  omschrijving: string;
  aantal: number;
  eenheid: string;
  prijs: number;
  btwPercentage: number;
  kortingPercentage: number;
}

const BTW_TARIEVEN = [0, 9, 21];

const OFFERTE_STATUSSEN = [
  "CONCEPT",
  "VERZONDEN",
  "GEACCEPTEERD",
  "AFGEWEZEN",
  "VERLOPEN",
] as const;

function LEEG_REGEL(): EditRegel {
  return {
    id: crypto.randomUUID(),
    omschrijving: "",
    aantal: 1,
    eenheid: "stuks",
    prijs: 0,
    btwPercentage: 21,
    kortingPercentage: 0,
  };
}

function berekenRegelNetto(r: EditRegel): number {
  const bruto = r.prijs * r.aantal;
  return bruto - (bruto * r.kortingPercentage) / 100;
}

function berekenTotalen(regels: EditRegel[], kortingPct: number) {
  const nettoPerTarief: Record<number, number> = {};
  let subtotaalBruto = 0;

  for (const r of regels) {
    const netto = berekenRegelNetto(r);
    subtotaalBruto += netto;
    nettoPerTarief[r.btwPercentage] = (nettoPerTarief[r.btwPercentage] ?? 0) + netto;
  }

  const kortingBedrag = (subtotaalBruto * kortingPct) / 100;
  const subtotaalNaKorting = subtotaalBruto - kortingBedrag;
  const kortingRatio = subtotaalBruto > 0 ? kortingBedrag / subtotaalBruto : 0;

  const btwPerTarief: Record<string, number> = {};
  let totaalBtw = 0;

  for (const [tarief, netto] of Object.entries(nettoPerTarief)) {
    const tariefNum = Number(tarief);
    const nettoNaKorting = netto * (1 - kortingRatio);
    const btw = (nettoNaKorting * tariefNum) / 100;
    if (btw > 0) {
      const key = `${tariefNum}%`;
      btwPerTarief[key] = (btwPerTarief[key] ?? 0) + btw;
      totaalBtw += btw;
    }
  }

  return {
    subtotaalBruto,
    kortingBedrag,
    subtotaalNaKorting,
    totaalBtw,
    btwPerTarief,
    totaal: subtotaalNaKorting + totaalBtw,
  };
}

export default function OfferteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [offerte, setOfferte] = useState<Offerte | null>(null);
  const [laden, setLaden] = useState(true);
  const [bewerken, setBewerken] = useState(false);
  const [statusLaden, setStatusLaden] = useState(false);
  const [verwijderLaden, setVerwijderLaden] = useState(false);
  const [factuurLaden, setFactuurLaden] = useState(false);
  const [opslaanLaden, setOpslaanLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', onderwerp: '', bericht: '' });
  const [emailLaden, setEmailLaden] = useState(false);
  const [emailFout, setEmailFout] = useState<string | null>(null);

  // Edit form state
  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [klantenLaden, setKlantenLaden] = useState(false);
  const [editKlantId, setEditKlantId] = useState("");
  const [editDatum, setEditDatum] = useState("");
  const [editGeldigTot, setEditGeldigTot] = useState("");
  const [editNotities, setEditNotities] = useState("");
  const [editKortingPercentage, setEditKortingPercentage] = useState(0);
  const [editRegels, setEditRegels] = useState<EditRegel[]>([]);
  const [foutenVelden, setFoutenVelden] = useState<Record<string, string>>({});

  const laadOfferte = useCallback(async () => {
    try {
      const data = await window.api.offertes.get(id!);
      setOfferte(data);
    } catch (e) {
      console.error("Fout bij laden offerte:", e);
      navigate("/offertes");
    } finally {
      setLaden(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    laadOfferte();
  }, [laadOfferte]);

  function toonMelding(type: "succes" | "fout", tekst: string) {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 4000);
  }

  function startBewerken() {
    if (!offerte) return;
    setEditKlantId(offerte.klant.id);
    setEditDatum(offerte.datum.split("T")[0]);
    setEditGeldigTot(offerte.geldigTot.split("T")[0]);
    setEditNotities(offerte.notities ?? "");
    setEditKortingPercentage(offerte.kortingPercentage ?? 0);
    setEditRegels(
      offerte.regels.map((r) => ({
        id: r.id,
        omschrijving: r.omschrijving,
        aantal: r.aantal,
        eenheid: r.eenheid ?? "stuks",
        prijs: r.prijs,
        btwPercentage: r.btwPercentage,
        kortingPercentage: r.kortingPercentage,
      }))
    );
    setFoutenVelden({});
    setFout(null);

    if (klanten.length === 0) {
      setKlantenLaden(true);
      window.api.klanten
        .list()
        .then((data) => setKlanten(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setKlantenLaden(false));
    }

    setBewerken(true);
  }

  function annuleerBewerken() {
    setBewerken(false);
    setFout(null);
    setFoutenVelden({});
  }

  function voegRegelToe() {
    setEditRegels((prev) => [...prev, LEEG_REGEL()]);
  }

  function verwijderEditRegel(regelId: string) {
    setEditRegels((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((r) => r.id !== regelId);
    });
  }

  function updateEditRegel<K extends keyof EditRegel>(
    regelId: string,
    veld: K,
    waarde: EditRegel[K]
  ) {
    setEditRegels((prev) =>
      prev.map((r) => (r.id === regelId ? { ...r, [veld]: waarde } : r))
    );
  }

  function valideerEdit(): boolean {
    const fouten: Record<string, string> = {};
    if (!editKlantId) fouten.klantId = "Selecteer een klant";
    editRegels.forEach((r, i) => {
      if (!r.omschrijving.trim()) fouten[`regel-${i}-omschrijving`] = "Verplicht";
    });
    setFoutenVelden(fouten);
    return Object.keys(fouten).length === 0;
  }

  async function slaOpBewerking() {
    if (!valideerEdit()) return;
    setOpslaanLaden(true);
    setFout(null);
    try {
      await window.api.offertes.update(id!, {
        klantId: editKlantId,
        datum: editDatum,
        geldigTot: editGeldigTot,
        notities: editNotities,
        kortingPercentage: editKortingPercentage,
        regels: editRegels.map(({ id: _id, ...r }) => r),
      });
      await laadOfferte();
      setBewerken(false);
      toonMelding("succes", "Offerte opgeslagen");
    } catch (e: unknown) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setOpslaanLaden(false);
    }
  }

  async function wijzigStatus(nieuweStatus: string) {
    if (!offerte) return;
    setStatusLaden(true);
    try {
      await window.api.offertes.update(id!, { status: nieuweStatus });
      await laadOfferte();
      toonMelding("succes", `Status gewijzigd naar ${statusLabel(nieuweStatus)}`);
    } catch (e: unknown) {
      toonMelding("fout", e instanceof Error ? e.message : "Status wijzigen mislukt");
    } finally {
      setStatusLaden(false);
    }
  }

  async function naarFactuur() {
    if (!offerte) return;
    if (!confirm("Wil je van deze offerte een factuur maken?")) return;
    setFactuurLaden(true);
    try {
      const data = await window.api.offertes.update(id!, { actie: "naar-factuur" });
      if (data.factuur) {
        navigate(`/facturen/${data.factuur.id}`);
      }
    } catch (e: unknown) {
      toonMelding("fout", e instanceof Error ? e.message : "Omzetten mislukt");
      setFactuurLaden(false);
    }
  }

  async function verwijder() {
    if (!offerte) return;
    if (!confirm(`Weet je zeker dat je offerte ${offerte.nummer} wilt verwijderen?`)) return;
    setVerwijderLaden(true);
    try {
      await window.api.offertes.delete(id!);
      navigate("/offertes");
    } catch (e: unknown) {
      toonMelding("fout", e instanceof Error ? e.message : "Verwijderen mislukt");
      setVerwijderLaden(false);
    }
  }

  async function verstuurEmail() {
    if (!offerte || !emailForm.email.trim()) {
      setEmailFout('E-mailadres is verplicht');
      return;
    }
    setEmailLaden(true);
    setEmailFout(null);
    try {
      await window.api.offertes.verstuur(offerte.id, {
        email: emailForm.email,
        onderwerp: emailForm.onderwerp || undefined,
        bericht: emailForm.bericht || undefined,
      });
      setEmailModalOpen(false);
      toonMelding('succes', 'Offerte verstuurd per e-mail');
      laadOfferte();
    } catch (e: unknown) {
      setEmailFout(e instanceof Error ? e.message : 'Versturen mislukt');
    } finally {
      setEmailLaden(false);
    }
  }

  if (laden) {
    return (
      <div>
        <Header titel="Offerte laden..." />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
        </div>
      </div>
    );
  }

  if (!offerte) return null;

  const isConcept = offerte.status === "CONCEPT";

  // BTW groepen voor view mode
  const btwGroepen = offerte.regels.reduce(
    (acc, regel) => {
      const bruto = regel.prijs * regel.aantal;
      const korting = (bruto * regel.kortingPercentage) / 100;
      const netto = bruto - korting;
      const btw = (netto * regel.btwPercentage) / 100;
      if (btw > 0) {
        const key = `${regel.btwPercentage}%`;
        acc[key] = (acc[key] ?? 0) + btw;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  // Totalen voor edit preview
  const editTotalen = bewerken
    ? berekenTotalen(editRegels, editKortingPercentage)
    : null;

  return (
    <div>
      <Header
        titel={`Offerte ${offerte.nummer}`}
        subtitel={offerte.klant.bedrijf ?? offerte.klant.naam}
        acties={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/offertes")}
            >
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>

            {isConcept && !bewerken && (
              <Button variant="outline" size="sm" onClick={startBewerken}>
                <Edit className="h-4 w-4" />
                Bewerken
              </Button>
            )}

            {bewerken && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={annuleerBewerken}
                  disabled={opslaanLaden}
                >
                  <X className="h-4 w-4" />
                  Annuleren
                </Button>
                <Button size="sm" onClick={slaOpBewerking} loading={opslaanLaden}>
                  <Save className="h-4 w-4" />
                  Opslaan
                </Button>
              </>
            )}

            {!bewerken && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmailForm({ email: offerte.klant.email ?? '', onderwerp: '', bericht: '' });
                    setEmailFout(null);
                    setEmailModalOpen(true);
                  }}
                >
                  <Mail className="h-4 w-4" />
                  E-mail versturen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/offertes/${offerte.id}/print`)}
                >
                  <Printer className="h-4 w-4" />
                  Afdrukken
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={naarFactuur}
                  loading={factuurLaden}
                >
                  <ArrowRight className="h-4 w-4" />
                  Naar factuur
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={verwijder}
                  loading={verwijderLaden}
                  className="text-red-600 hover:text-red-700 hover:border-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                  Verwijderen
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="p-6 max-w-5xl mx-auto space-y-6">
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

        {fout && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {fout}
          </div>
        )}

        {!bewerken ? (
          /* ---- VIEW MODE ---- */
          <>
            {/* Info & status */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-4">
                  <CardTitle>Offertegegevens</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">
                        Nummer
                      </p>
                      <p className="font-semibold text-gray-900 font-mono">
                        {offerte.nummer}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">
                        Status
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusKleur(offerte.status)}`}
                      >
                        {statusLabel(offerte.status)}
                      </span>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">
                        Datum
                      </p>
                      <p className="text-gray-900">{formatDatum(offerte.datum)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">
                        Geldig tot
                      </p>
                      <p className="text-gray-900">{formatDatum(offerte.geldigTot)}</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">
                      Klant
                    </p>
                    <p className="font-semibold text-gray-900">
                      {offerte.klant.bedrijf ?? offerte.klant.naam}
                    </p>
                    {offerte.klant.bedrijf && (
                      <p className="text-sm text-gray-500">{offerte.klant.naam}</p>
                    )}
                    {offerte.klant.email && (
                      <p className="text-sm text-gray-500">{offerte.klant.email}</p>
                    )}
                    <button
                      onClick={() => navigate(`/klanten/${offerte.klant.id}`)}
                      className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mt-1"
                    >
                      Klantprofiel bekijken →
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* Status wijzigen */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle>Status wijzigen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {OFFERTE_STATUSSEN.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        if (s !== offerte.status) wijzigStatus(s);
                      }}
                      disabled={statusLaden || s === offerte.status}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                        s === offerte.status
                          ? `${statusKleur(s)} border-transparent cursor-default`
                          : "border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      }`}
                    >
                      {statusLaden && s !== offerte.status ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {statusLabel(s)}
                        </span>
                      ) : (
                        statusLabel(s)
                      )}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Regels */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle>Regels</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Omschrijving</TableHead>
                      <TableHead className="text-right">Aantal</TableHead>
                      <TableHead>Eenheid</TableHead>
                      <TableHead className="text-right">Prijs</TableHead>
                      <TableHead className="text-right">BTW%</TableHead>
                      {offerte.regels.some((r) => r.kortingPercentage > 0) && (
                        <TableHead className="text-right">Korting%</TableHead>
                      )}
                      <TableHead className="text-right">Subtotaal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offerte.regels.map((regel) => {
                      const bruto = regel.prijs * regel.aantal;
                      const korting = (bruto * regel.kortingPercentage) / 100;
                      const netto = bruto - korting;
                      return (
                        <TableRow key={regel.id}>
                          <TableCell className="font-medium">
                            {regel.omschrijving}
                          </TableCell>
                          <TableCell className="text-right">
                            {regel.aantal}
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {regel.eenheid ?? ""}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatBedrag(regel.prijs)}
                          </TableCell>
                          <TableCell className="text-right">
                            {regel.btwPercentage}%
                          </TableCell>
                          {offerte.regels.some((r) => r.kortingPercentage > 0) && (
                            <TableCell className="text-right">
                              {regel.kortingPercentage > 0
                                ? `${regel.kortingPercentage}%`
                                : "-"}
                            </TableCell>
                          )}
                          <TableCell className="text-right font-semibold">
                            {formatBedrag(netto)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Totalen en notities */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {offerte.notities && (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle>Notities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {offerte.notities}
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card className={!offerte.notities ? "lg:col-start-2" : ""}>
                <CardHeader className="pb-4">
                  <CardTitle>Totaaloverzicht</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotaal</span>
                      <span className="text-gray-900">
                        {formatBedrag(offerte.subtotaal + offerte.kortingBedrag)}
                      </span>
                    </div>
                    {offerte.kortingBedrag > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">
                            Korting ({offerte.kortingPercentage}%)
                          </span>
                          <span className="text-green-600">
                            -{formatBedrag(offerte.kortingBedrag)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Netto</span>
                          <span className="text-gray-900">
                            {formatBedrag(offerte.subtotaal)}
                          </span>
                        </div>
                      </>
                    )}
                    {Object.entries(btwGroepen).map(([tarief, bedrag]) => (
                      <div key={tarief} className="flex justify-between text-sm">
                        <span className="text-gray-500">BTW {tarief}</span>
                        <span className="text-gray-900">{formatBedrag(bedrag)}</span>
                      </div>
                    ))}
                    {Object.keys(btwGroepen).length === 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">BTW</span>
                        <span className="text-gray-400">€ 0,00</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-gray-900">
                      <span className="font-bold text-gray-900">Totaal</span>
                      <span className="font-bold text-gray-900 text-xl">
                        {formatBedrag(offerte.totaal)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6">
                    <Button
                      className="w-full"
                      onClick={naarFactuur}
                      loading={factuurLaden}
                    >
                      <FileCheck className="h-4 w-4" />
                      Omzetten naar factuur
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          /* ---- EDIT MODE ---- */
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Klant */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-4">
                  <CardTitle>Klantgegevens</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Klant *
                    </label>
                    {klantenLaden ? (
                      <div className="flex items-center gap-2 h-9">
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        <span className="text-sm text-gray-400">Klanten laden...</span>
                      </div>
                    ) : (
                      <Select value={editKlantId} onValueChange={setEditKlantId}>
                        <SelectTrigger fout={foutenVelden.klantId}>
                          <SelectValue placeholder="Selecteer een klant..." />
                        </SelectTrigger>
                        <SelectContent>
                          {klanten.map((k) => (
                            <SelectItem key={k.id} value={k.id}>
                              {k.bedrijf ? `${k.bedrijf} (${k.naam})` : k.naam}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {foutenVelden.klantId && (
                      <p className="mt-1 text-xs text-red-600">{foutenVelden.klantId}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Datums */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle>Offertedetails</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    label="Offertedatum"
                    type="date"
                    value={editDatum}
                    onChange={(e) => setEditDatum(e.target.value)}
                  />
                  <Input
                    label="Geldig tot"
                    type="date"
                    value={editGeldigTot}
                    onChange={(e) => setEditGeldigTot(e.target.value)}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Regelitems */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle>Offerteregels</CardTitle>
                  <Button variant="outline" size="sm" onClick={voegRegelToe}>
                    <Plus className="h-4 w-4" />
                    Regel toevoegen
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="hidden lg:grid lg:grid-cols-[1fr_80px_100px_110px_80px_80px_32px] gap-2 px-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Omschrijving
                  </span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                    Aantal
                  </span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Eenheid
                  </span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                    Prijs (€)
                  </span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                    BTW%
                  </span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
                    Korting%
                  </span>
                  <span />
                </div>

                {editRegels.map((regel, index) => {
                  const netto = berekenRegelNetto(regel);
                  return (
                    <div
                      key={regel.id}
                      className="grid grid-cols-1 lg:grid-cols-[1fr_80px_100px_110px_80px_80px_32px] gap-2 p-3 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-colors"
                    >
                      <div>
                        <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                          Omschrijving
                        </label>
                        <input
                          type="text"
                          value={regel.omschrijving}
                          onChange={(e) =>
                            updateEditRegel(regel.id, "omschrijving", e.target.value)
                          }
                          placeholder="Omschrijving van de dienst of product"
                          className={`flex h-9 w-full rounded-lg border bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent ${
                            foutenVelden[`regel-${index}-omschrijving`]
                              ? "border-red-400"
                              : "border-gray-300"
                          }`}
                        />
                        {foutenVelden[`regel-${index}-omschrijving`] && (
                          <p className="mt-0.5 text-xs text-red-600">
                            {foutenVelden[`regel-${index}-omschrijving`]}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                          Aantal
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={regel.aantal}
                          onChange={(e) =>
                            updateEditRegel(
                              regel.id,
                              "aantal",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                          Eenheid
                        </label>
                        <input
                          type="text"
                          value={regel.eenheid}
                          onChange={(e) =>
                            updateEditRegel(regel.id, "eenheid", e.target.value)
                          }
                          placeholder="stuks"
                          className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                          Prijs (€)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
                            €
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={regel.prijs}
                            onChange={(e) =>
                              updateEditRegel(
                                regel.id,
                                "prijs",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-2 py-1 text-sm text-gray-900 shadow-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                          BTW%
                        </label>
                        <select
                          value={regel.btwPercentage}
                          onChange={(e) =>
                            updateEditRegel(
                              regel.id,
                              "btwPercentage",
                              parseInt(e.target.value)
                            )
                          }
                          className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                          {BTW_TARIEVEN.map((t) => (
                            <option key={t} value={t}>
                              {t}%
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                          Korting%
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={regel.kortingPercentage}
                            onChange={(e) =>
                              updateEditRegel(
                                regel.id,
                                "kortingPercentage",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-2 pr-6 py-1 text-sm text-gray-900 shadow-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
                            %
                          </span>
                        </div>
                      </div>

                      <div className="flex items-end justify-between lg:justify-center gap-2">
                        <span className="lg:hidden text-sm font-semibold text-gray-700">
                          {formatBedrag(netto)}
                        </span>
                        <button
                          type="button"
                          onClick={() => verwijderEditRegel(regel.id)}
                          disabled={editRegels.length === 1}
                          className="flex items-center justify-center h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Verwijder regel"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed"
                  onClick={voegRegelToe}
                >
                  <Plus className="h-4 w-4" />
                  Regel toevoegen
                </Button>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Notities & korting */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle>Notities &amp; korting</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notities
                    </label>
                    <Textarea
                      value={editNotities}
                      onChange={(e) => setEditNotities(e.target.value)}
                      placeholder="Opmerkingen voor de klant..."
                      rows={4}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Globale korting (%)
                    </label>
                    <div className="relative w-40">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={editKortingPercentage}
                        onChange={(e) =>
                          setEditKortingPercentage(parseFloat(e.target.value) || 0)
                        }
                        className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 pr-7 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
                        %
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Totaaloverzicht */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle>Totaaloverzicht</CardTitle>
                </CardHeader>
                <CardContent>
                  {editTotalen && (
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Subtotaal</span>
                        <span className="text-gray-900">
                          {formatBedrag(editTotalen.subtotaalBruto)}
                        </span>
                      </div>
                      {editTotalen.kortingBedrag > 0 && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">
                              Korting ({editKortingPercentage}%)
                            </span>
                            <span className="text-green-600">
                              -{formatBedrag(editTotalen.kortingBedrag)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Netto</span>
                            <span className="text-gray-900">
                              {formatBedrag(editTotalen.subtotaalNaKorting)}
                            </span>
                          </div>
                        </>
                      )}
                      {Object.entries(editTotalen.btwPerTarief).map(([tarief, bedrag]) => (
                        <div key={tarief} className="flex justify-between text-sm">
                          <span className="text-gray-500">BTW {tarief}</span>
                          <span className="text-gray-900">{formatBedrag(bedrag)}</span>
                        </div>
                      ))}
                      {Object.keys(editTotalen.btwPerTarief).length === 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">BTW</span>
                          <span className="text-gray-400">€ 0,00</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-gray-900">
                        <span className="font-bold text-gray-900">Totaal</span>
                        <span className="font-bold text-gray-900 text-xl">
                          {formatBedrag(editTotalen.totaal)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-6">
                    <Button
                      className="w-full"
                      onClick={slaOpBewerking}
                      loading={opslaanLaden}
                    >
                      <Save className="h-4 w-4" />
                      Wijzigingen opslaan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      <Modal open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>Offerte versturen per e-mail</ModalTitle>
          </ModalHeader>
          <div className="space-y-4">
            {emailFout && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {emailFout}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres ontvanger *</label>
              <input
                type="email"
                value={emailForm.email}
                onChange={(e) => setEmailForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="klant@bedrijf.nl"
                className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Onderwerp (optioneel)</label>
              <input
                type="text"
                value={emailForm.onderwerp}
                onChange={(e) => setEmailForm(prev => ({ ...prev, onderwerp: e.target.value }))}
                placeholder={`Offerte ${offerte?.nummer}`}
                className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Persoonlijk bericht (optioneel)</label>
              <textarea
                value={emailForm.bericht}
                onChange={(e) => setEmailForm(prev => ({ ...prev, bericht: e.target.value }))}
                placeholder="Laat leeg voor standaard tekst..."
                rows={4}
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent resize-none"
              />
            </div>
          </div>
          <ModalFooter className="mt-4 gap-2">
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={verstuurEmail} disabled={emailLaden} className="gap-2">
              {emailLaden && <Loader2 className="h-4 w-4 animate-spin" />}
              <Mail className="h-4 w-4" />
              Versturen
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

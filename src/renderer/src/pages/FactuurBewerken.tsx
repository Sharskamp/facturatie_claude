import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  BookmarkPlus,
  Trash2,
  BookOpen,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
} from "@/components/ui/modal";
import { FactuurRegelTabel, type Regel } from "@/components/facturen/FactuurRegelTabel";
import { FactuurTotalenSidebar } from "@/components/facturen/FactuurTotalenSidebar";

interface Klant {
  id: string;
  naam: string;
  bedrijf?: string | null;
  email?: string | null;
}

interface FactuurRegel {
  omschrijving: string;
  aantal: number;
  eenheid?: string;
  prijs: number;
  btwPercentage: number;
  kortingPercentage: number;
}

interface Factuur {
  id: string;
  klantId: string;
  datum: string;
  vervaldatum: string;
  status: string;
  nummer?: string;
  btwVerlegd: boolean;
  kortingPercentage: number;
  notities?: string;
  betalingsCondities?: string;
  taal?: string;
  totaalKortingBedrag: number;
  regels: FactuurRegel[];
}

const LEEG_REGEL = (): Regel => ({
  id: crypto.randomUUID(),
  omschrijving: "",
  aantal: 1,
  eenheid: "stuks",
  prijs: 0,
  btwPercentage: 21,
  kortingPercentage: 0,
});

function berekenRegelTotalen(
  regel: Regel,
  btwVerlegd: boolean
): { netto: number; btw: number; totaal: number } {
  const bruto = regel.prijs * regel.aantal;
  const korting = (bruto * regel.kortingPercentage) / 100;
  const netto = bruto - korting;
  const btw = btwVerlegd ? 0 : (netto * regel.btwPercentage) / 100;
  return { netto, btw, totaal: netto + btw };
}

export default function FactuurBewerkenPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [klanten, setKlanten] = useState<Klant[]>([]);
  const [klantLaden, setKlantLaden] = useState(true);
  const [factuurLaden, setFactuurLaden] = useState(true);
  const [korActief, setKorActief] = useState(false);
  const [factuurNummer, setFactuurNummer] = useState<string>("");
  const [nietBewerkbaar, setNietBewerkbaar] = useState(false);
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [foutenVelden, setFoutenVelden] = useState<Record<string, string>>({});

  // Formuliervelden
  const [klantId, setKlantId] = useState("");
  const [datum, setDatum] = useState("");
  const [vervaldatum, setVervaldatum] = useState("");
  const [btwVerlegd, setBtwVerlegd] = useState(false);
  const [kortingPercentage, setKortingPercentage] = useState(0);
  const [notities, setNotities] = useState("");
  const [betalingsCondities, setBetalingsCondities] = useState("");
  const [regels, setRegels] = useState<Regel[]>([LEEG_REGEL()]);
  const [geavanceerdOpen, setGeavanceerdOpen] = useState(false);

  // Totaalkorting
  const [totaalKortingActief, setTotaalKortingActief] = useState(false);
  const [totaalKortingType, setTotaalKortingType] = useState<"percentage" | "vastBedrag">("percentage");
  const [totaalKortingPercentage, setTotaalKortingPercentage] = useState(0);
  const [totaalKortingVastBedrag, setTotaalKortingVastBedrag] = useState(0);

  // Factuurtaal
  const [taal, setTaal] = useState<"nl" | "en">("nl");

  // Sjablonen
  const [sjablonen, setSjablonen] = useState<Array<{
    id: string;
    naam: string;
    regels: string;
    notities?: string | null;
    betalingsCondities?: string | null;
    btwVerlegd: boolean;
  }>>([]);
  const [sjabloonNaam, setSjabloonNaam] = useState("");
  const [sjabloonModalOpen, setSjabloonModalOpen] = useState(false);
  const [sjabloonLaden, setSjabloonLaden] = useState(false);

  useEffect(() => {
    window.api.factuurSjablonen.list().then((data) => {
      setSjablonen(data as typeof sjablonen);
    }).catch(() => {});
  }, []);

  function laadSjabloon(sjabloon: typeof sjablonen[number]) {
    const parsed = JSON.parse(sjabloon.regels) as Array<{
      omschrijving: string;
      aantal: number;
      eenheid?: string;
      prijs: number;
      btwPercentage: number;
      kortingPercentage: number;
    }>;
    setRegels(parsed.map((r) => ({
      id: crypto.randomUUID(),
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      eenheid: r.eenheid ?? "stuks",
      prijs: r.prijs,
      btwPercentage: r.btwPercentage,
      kortingPercentage: r.kortingPercentage,
    })));
    setBtwVerlegd(sjabloon.btwVerlegd);
    if (sjabloon.notities != null) setNotities(sjabloon.notities);
    if (sjabloon.betalingsCondities != null) setBetalingsCondities(sjabloon.betalingsCondities);
  }

  async function slaOpAlsSjabloon() {
    if (!sjabloonNaam.trim()) return;
    setSjabloonLaden(true);
    try {
      await window.api.factuurSjablonen.create({
        naam: sjabloonNaam,
        regels: regels.map((r) => ({
          omschrijving: r.omschrijving,
          aantal: r.aantal,
          eenheid: r.eenheid,
          prijs: r.prijs,
          btwPercentage: r.btwPercentage,
          kortingPercentage: r.kortingPercentage,
        })),
        notities,
        betalingsCondities,
        btwVerlegd,
      });
      const data = await window.api.factuurSjablonen.list();
      setSjablonen(data as typeof sjablonen);
      setSjabloonNaam("");
      setSjabloonModalOpen(false);
    } catch (e) {
      console.error("Sjabloon opslaan mislukt:", e);
    } finally {
      setSjabloonLaden(false);
    }
  }

  async function verwijderSjabloon(sjabloonId: string) {
    try {
      await window.api.factuurSjablonen.delete(sjabloonId);
      setSjablonen((prev) => prev.filter((s) => s.id !== sjabloonId));
    } catch (e) {
      console.error("Sjabloon verwijderen mislukt:", e);
    }
  }

  const laadKlanten = useCallback(async () => {
    try {
      const data = await window.api.klanten.list();
      setKlanten(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Fout bij laden klanten:", e);
    } finally {
      setKlantLaden(false);
    }
  }, []);

  useEffect(() => {
    window.api.instellingen.get().then((inst: { korActief?: boolean }) => {
      setKorActief(inst?.korActief ?? false);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    laadKlanten();

    if (!id) return;

    window.api.facturen.get(id)
      .then((factuur: Factuur) => {
        if (factuur.status !== "CONCEPT") {
          setNietBewerkbaar(true);
          setFactuurNummer(factuur.nummer ?? factuur.id);
          return;
        }

        setFactuurNummer(factuur.nummer ?? factuur.id);
        setKlantId(factuur.klantId);
        setDatum(factuur.datum.split("T")[0]);
        setVervaldatum(factuur.vervaldatum.split("T")[0]);
        setBtwVerlegd(factuur.btwVerlegd);
        setKortingPercentage(factuur.kortingPercentage);
        setNotities(factuur.notities ?? "");
        setBetalingsCondities(factuur.betalingsCondities ?? "");
        setTaal((factuur.taal as "nl" | "en") ?? "nl");
        setRegels(
          factuur.regels.map((r) => ({
            id: crypto.randomUUID(),
            omschrijving: r.omschrijving,
            aantal: r.aantal,
            eenheid: r.eenheid ?? "stuks",
            prijs: r.prijs,
            btwPercentage: r.btwPercentage,
            kortingPercentage: r.kortingPercentage,
          }))
        );
        if (factuur.totaalKortingBedrag > 0) {
          setTotaalKortingActief(true);
          setTotaalKortingType("vastBedrag");
          setTotaalKortingVastBedrag(factuur.totaalKortingBedrag);
        }
      })
      .catch((e: unknown) => {
        setFout(e instanceof Error ? e.message : "Factuur laden mislukt");
      })
      .finally(() => {
        setFactuurLaden(false);
      });
  }, [id, laadKlanten]);

  // Totaalberekeningen
  const totalen = useMemo(() => {
    let subtotaalBruto = 0;
    const nettoPerTarief: Record<number, number> = {};

    for (const regel of regels) {
      const { netto } = berekenRegelTotalen(regel, btwVerlegd);
      subtotaalBruto += netto;
      if (!btwVerlegd) {
        nettoPerTarief[regel.btwPercentage] = (nettoPerTarief[regel.btwPercentage] ?? 0) + netto;
      }
    }

    let kortingBedrag = 0;
    if (totaalKortingActief) {
      if (totaalKortingType === "percentage") {
        kortingBedrag = (subtotaalBruto * totaalKortingPercentage) / 100;
      } else {
        kortingBedrag = Math.min(totaalKortingVastBedrag, subtotaalBruto);
      }
    }

    const subtotaalNaKorting = subtotaalBruto - kortingBedrag;
    const kortingRatio = subtotaalBruto > 0 ? kortingBedrag / subtotaalBruto : 0;

    const btwPerTarief: Record<string, number> = {};
    let totaalBtw = 0;
    if (!btwVerlegd) {
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
    }

    const totaal = subtotaalNaKorting + totaalBtw;
    const totaalKortingBedrag = kortingBedrag;

    return {
      subtotaalBruto,
      kortingBedrag,
      subtotaal: subtotaalNaKorting,
      totaalBtw,
      btwPerTarief,
      totaal,
      totaalKortingBedrag,
    };
  }, [regels, btwVerlegd, totaalKortingActief, totaalKortingType, totaalKortingPercentage, totaalKortingVastBedrag]);

  function voegRegelToe() {
    setRegels((prev) => [...prev, LEEG_REGEL()]);
  }

  function verwijderRegel(regelId: string) {
    setRegels((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((r) => r.id !== regelId);
    });
  }

  function updateRegel<K extends keyof Regel>(regelId: string, veld: K, waarde: Regel[K]) {
    setRegels((prev) =>
      prev.map((r) => (r.id === regelId ? { ...r, [veld]: waarde } : r))
    );
  }

  function valideer(): boolean {
    const fouten: Record<string, string> = {};
    if (!klantId) fouten.klantId = "Selecteer een klant";
    regels.forEach((r, i) => {
      if (!r.omschrijving.trim()) fouten[`regel-${i}-omschrijving`] = "Verplicht";
      if (r.prijs < 0) fouten[`regel-${i}-prijs`] = "Ongeldig";
    });
    setFoutenVelden(fouten);
    return Object.keys(fouten).length === 0;
  }

  async function slaOp(status: "CONCEPT" | "VERZONDEN") {
    if (!valideer()) return;
    setOpslaan(true);
    setFout(null);
    try {
      const payload = {
        klantId,
        datum,
        vervaldatum,
        btwVerlegd,
        kortingPercentage,
        notities: notities || null,
        betalingsCondities: betalingsCondities || null,
        regels: regels.map(({ id: _id, ...r }) => r),
        status,
        totaalKorting: totaalKortingActief
          ? totaalKortingType === "percentage"
            ? totaalKortingPercentage
            : 0
          : 0,
        totaalKortingBedrag: totalen.totaalKortingBedrag,
        taal,
      };
      await window.api.facturen.update(id!, payload);

      if (status === "CONCEPT") {
        navigate(`/facturen/${id}`);
      } else {
        navigate(`/facturen/${id}?verstuur=1`);
      }
    } catch (e: unknown) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt");
      setOpslaan(false);
    }
  }

  const geselecteerdeKlant = klanten.find((k) => k.id === klantId);

  if (factuurLaden) {
    return (
      <div>
        <Header
          titel="Factuur bewerken"
          subtitel="Bezig met laden..."
          acties={
            <Button variant="outline" size="sm" onClick={() => navigate("/facturen")}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
          }
        />
        <div className="p-6 flex items-center gap-2 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Factuur laden...</span>
        </div>
      </div>
    );
  }

  if (nietBewerkbaar) {
    return (
      <div>
        <Header
          titel={`Factuur bewerken${factuurNummer ? ` — ${factuurNummer}` : ""}`}
          subtitel="Bewerken niet mogelijk"
          acties={
            <Button variant="outline" size="sm" onClick={() => navigate(`/facturen/${id}`)}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
          }
        />
        <div className="p-6 max-w-5xl mx-auto">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-4 text-sm text-amber-800 flex flex-col gap-3">
            <p className="font-semibold">Alleen conceptfacturen kunnen worden bewerkt</p>
            <p>Deze factuur heeft een status die bewerken niet toestaat. Alleen facturen met de status CONCEPT kunnen worden gewijzigd.</p>
            <div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/facturen/${id}`)}>
                <ArrowLeft className="h-4 w-4" />
                Terug naar factuur
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        titel={`Factuur bewerken${factuurNummer ? ` — ${factuurNummer}` : ""}`}
        subtitel="Wijzig de gegevens van deze conceptfactuur"
        acties={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/facturen/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Button>
        }
      />

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {fout && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {fout}
          </div>
        )}

        {/* Sjablonen */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-gray-500" />
              Sjablonen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              {sjablonen.length > 0 && (
                <Select onValueChange={(val) => {
                  const s = sjablonen.find((x) => x.id === val);
                  if (s) laadSjabloon(s);
                }}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Laad sjabloon..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sjablonen.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.naam}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSjabloonModalOpen(true)}
              >
                <BookmarkPlus className="h-4 w-4 mr-1" />
                Opslaan als sjabloon
              </Button>
            </div>
            {sjablonen.length > 0 && (
              <ul className="space-y-1">
                {sjablonen.map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm text-gray-700 bg-gray-50 rounded px-3 py-1.5">
                    <span>{s.naam}</span>
                    <button
                      type="button"
                      onClick={() => verwijderSjabloon(s.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors ml-2"
                      title="Verwijder sjabloon"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Klant en datums */}
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
                {klantLaden ? (
                  <div className="flex items-center gap-2 h-9">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-400">Klanten laden...</span>
                  </div>
                ) : (
                  <Select value={klantId} onValueChange={setKlantId}>
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

              {geselecteerdeKlant && (
                <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 space-y-1">
                  <p className="font-medium text-gray-900">
                    {geselecteerdeKlant.bedrijf ?? geselecteerdeKlant.naam}
                  </p>
                  {geselecteerdeKlant.bedrijf && (
                    <p className="text-gray-500">{geselecteerdeKlant.naam}</p>
                  )}
                  {geselecteerdeKlant.email && (
                    <p className="text-gray-500">{geselecteerdeKlant.email}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(`/klanten/${geselecteerdeKlant.id}`)}
                    className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mt-1"
                  >
                    Klantprofiel bekijken →
                  </button>
                </div>
              )}

              {klanten.length === 0 && !klantLaden && (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
                  <p className="text-sm text-gray-500">Nog geen klanten.</p>
                  <button
                    onClick={() => navigate("/klanten")}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                  >
                    Klant aanmaken →
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Datums en instellingen */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Factuurdetails</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Factuurdatum"
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
              />
              <Input
                label="Vervaldatum"
                type="date"
                value={vervaldatum}
                onChange={(e) => setVervaldatum(e.target.value)}
              />
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="btwVerlegd"
                  checked={btwVerlegd}
                  onChange={(e) => setBtwVerlegd(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label
                  htmlFor="btwVerlegd"
                  className="text-sm text-gray-700 cursor-pointer"
                >
                  BTW verlegd
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Regelitems */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle>Factuurregels</CardTitle>
              <Button variant="outline" size="sm" onClick={voegRegelToe}>
                Regel toevoegen
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <FactuurRegelTabel
              regels={regels}
              btwVerlegd={btwVerlegd}
              korActief={korActief}
              producten={[]}
              foutenVelden={foutenVelden}
              onRegelUpdate={updateRegel}
              onRegelVerwijder={verwijderRegel}
              onRegelToevoegen={voegRegelToe}
            />
          </CardContent>
        </Card>

        {/* Factuurtaal */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Taal</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Factuurtaal
              </label>
              <Select value={taal} onValueChange={(v) => setTaal(v as "nl" | "en")}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nl">Nederlands</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notities en betalingscondities */}
          <Card>
            <CardHeader className="pb-4">
              <button
                onClick={() => setGeavanceerdOpen((v) => !v)}
                className="flex items-center justify-between w-full text-left"
              >
                <CardTitle>Notities &amp; betalingscondities</CardTitle>
                {geavanceerdOpen ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </CardHeader>
            {geavanceerdOpen && (
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notities
                  </label>
                  <Textarea
                    value={notities}
                    onChange={(e) => setNotities(e.target.value)}
                    placeholder="Interne notities, opmerkingen voor de klant..."
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Betalingscondities
                  </label>
                  <Textarea
                    value={betalingsCondities}
                    onChange={(e) => setBetalingsCondities(e.target.value)}
                    placeholder="Bijv. Betaling binnen 30 dagen na factuurdatum..."
                    rows={3}
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Totaaloverzicht */}
          <FactuurTotalenSidebar
            totalen={totalen}
            btwVerlegd={btwVerlegd}
            korActief={korActief}
            totaalKortingActief={totaalKortingActief}
            totaalKortingType={totaalKortingType}
            totaalKortingPercentage={totaalKortingPercentage}
            totaalKortingVastBedrag={totaalKortingVastBedrag}
            onTotaalKortingActiefChange={setTotaalKortingActief}
            onTotaalKortingTypeChange={setTotaalKortingType}
            onTotaalKortingPercentageChange={setTotaalKortingPercentage}
            onTotaalKortingVastBedragChange={setTotaalKortingVastBedrag}
            opslaan={opslaan}
            onOpslaan={() => slaOp("CONCEPT")}
            opslaanLabel="Opslaan als concept"
            onVersturen={() => slaOp("VERZONDEN")}
            versturenLabel="Opslaan & versturen"
          />
        </div>
      </div>

      {/* Sjabloon opslaan modal */}
      <Modal open={sjabloonModalOpen} onOpenChange={setSjabloonModalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Sjabloon opslaan</ModalTitle>
          </ModalHeader>
          <div className="space-y-3 py-2">
            <Input
              label="Naam"
              placeholder="Bijv. Standaard diensten..."
              value={sjabloonNaam}
              onChange={(e) => setSjabloonNaam(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") slaOpAlsSjabloon(); }}
            />
          </div>
          <ModalFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSjabloonModalOpen(false)}
              disabled={sjabloonLaden}
            >
              Annuleren
            </Button>
            <Button
              size="sm"
              onClick={slaOpAlsSjabloon}
              disabled={!sjabloonNaam.trim() || sjabloonLaden}
            >
              {sjabloonLaden && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Opslaan
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

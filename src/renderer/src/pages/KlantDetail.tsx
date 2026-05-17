import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Plus,
  Loader2,
  FileText,
  Mail,
  Phone,
  MapPin,
  Building2,
  CreditCard,
  Globe,
  MessageSquare,
  X,
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
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBedrag, formatDatum, statusKleur, statusLabel } from "@/lib/utils";

interface Klant {
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
  notities?: string | null;
  betaalTermijn?: number | null;
  taal?: string;
}

interface Factuur {
  id: string;
  nummer: string;
  datum: string;
  vervaldatum: string;
  status: string;
  totaal: number;
}

interface KlantNotitie {
  id: string;
  tekst: string;
  aangemaakt: string;
}

const LEEG_FORMULIER: Partial<Klant> = {
  naam: "",
  bedrijf: "",
  email: "",
  telefoon: "",
  adres: "",
  postcode: "",
  stad: "",
  land: "Nederland",
  kvkNummer: "",
  btwNummer: "",
  notities: "",
  betaalTermijn: undefined,
  taal: "nl",
};

export default function KlantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [klant, setKlant] = useState<Klant | null>(null);
  const [facturen, setFacturen] = useState<Factuur[]>([]);
  const [laden, setLaden] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formulier, setFormulier] = useState<Partial<Klant>>(LEEG_FORMULIER);
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [notities, setNotities] = useState<KlantNotitie[]>([]);
  const [nieuweNotitie, setNieuweNotitie] = useState("");

  const laadKlant = useCallback(async () => {
    if (!id) return;
    try {
      const data = await window.api.klanten.get(id);
      setKlant(data);
    } catch (e) {
      console.error("Fout bij laden klant:", e);
      navigate("/klanten");
    }
  }, [id, navigate]);

  const laadFacturen = useCallback(async () => {
    if (!id) return;
    try {
      const data = await window.api.facturen.list({ klantId: id });
      setFacturen(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Fout bij laden facturen:", e);
      setFacturen([]);
    }
  }, [id]);

  const laadNotities = useCallback(async () => {
    if (!id) return;
    try {
      const data = await window.api.klantNotities.list(id);
      setNotities(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Fout bij laden notities:", e);
      setNotities([]);
    }
  }, [id]);

  useEffect(() => {
    async function laadAlles() {
      setLaden(true);
      await Promise.all([laadKlant(), laadFacturen(), laadNotities()]);
      setLaden(false);
    }
    laadAlles();
  }, [laadKlant, laadFacturen, laadNotities]);

  async function voegNotitieТoe() {
    if (!nieuweNotitie.trim() || !id) return;
    try {
      await window.api.klantNotities.create({ klantId: id, tekst: nieuweNotitie.trim() });
      setNieuweNotitie("");
      await laadNotities();
    } catch (e) {
      console.error("Fout bij aanmaken notitie:", e);
    }
  }

  async function verwijderNotitie(notitieId: string) {
    try {
      await window.api.klantNotities.delete(notitieId);
      await laadNotities();
    } catch (e) {
      console.error("Fout bij verwijderen notitie:", e);
    }
  }

  function openBewerken() {
    if (!klant) return;
    setFormulier({
      naam: klant.naam,
      bedrijf: klant.bedrijf ?? "",
      email: klant.email ?? "",
      telefoon: klant.telefoon ?? "",
      adres: klant.adres ?? "",
      postcode: klant.postcode ?? "",
      stad: klant.stad ?? "",
      land: klant.land,
      kvkNummer: klant.kvkNummer ?? "",
      btwNummer: klant.btwNummer ?? "",
      notities: klant.notities ?? "",
      betaalTermijn: klant.betaalTermijn ?? undefined,
      taal: klant.taal ?? "nl",
    });
    setFout(null);
    setModalOpen(true);
  }

  async function slaOp() {
    if (!formulier.naam?.trim()) {
      setFout("Naam is verplicht");
      return;
    }
    if (!id) return;
    setOpslaan(true);
    setFout(null);
    try {
      await window.api.klanten.update(id, formulier);
      setModalOpen(false);
      await laadKlant();
    } catch (e: unknown) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setOpslaan(false);
    }
  }

  function updateFormulier(veld: keyof Klant, waarde: unknown) {
    setFormulier((prev) => ({ ...prev, [veld]: waarde }));
  }

  // Statistieken
  const totaalGefactureerd = facturen.reduce((som, f) => som + f.totaal, 0);
  const openstaand = facturen
    .filter((f) => f.status === "VERZONDEN" || f.status === "VERLOPEN")
    .reduce((som, f) => som + f.totaal, 0);
  const betaald = facturen
    .filter((f) => f.status === "BETAALD")
    .reduce((som, f) => som + f.totaal, 0);

  if (laden) {
    return (
      <div>
        <Header titel="Klant laden..." />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
        </div>
      </div>
    );
  }

  if (!klant) return null;

  return (
    <div>
      <Header
        titel={klant.naam}
        subtitel={klant.bedrijf ?? undefined}
        acties={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/klanten")}
            >
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
            <Button size="sm" onClick={openBewerken} className="gap-2">
              <Edit className="h-4 w-4" />
              Bewerken
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Statistieken */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm font-medium text-gray-500 mb-1">Totaal gefactureerd</p>
              <p className="text-2xl font-bold text-gray-900">{formatBedrag(totaalGefactureerd)}</p>
              <p className="text-xs text-gray-400 mt-1">{facturen.length} factuur{facturen.length !== 1 ? "en" : ""}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="text-sm font-medium text-gray-500 mb-1">Openstaand</p>
              <p className="text-2xl font-bold text-blue-600">{formatBedrag(openstaand)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {facturen.filter((f) => f.status === "VERZONDEN" || f.status === "VERLOPEN").length} openstaande factuur{facturen.filter((f) => f.status === "VERZONDEN" || f.status === "VERLOPEN").length !== 1 ? "en" : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <p className="text-sm font-medium text-gray-500 mb-1">Betaald</p>
              <p className="text-2xl font-bold text-green-600">{formatBedrag(betaald)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {facturen.filter((f) => f.status === "BETAALD").length} betaalde factuur{facturen.filter((f) => f.status === "BETAALD").length !== 1 ? "en" : ""}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Hoofd content: klantinfo links, factuurgeschiedenis rechts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Klantinfo kaart */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader className="pb-3">
              <CardTitle>Klantgegevens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Naam & bedrijf */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contact</p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Building2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{klant.naam}</p>
                      {klant.bedrijf && (
                        <p className="text-sm text-gray-500">{klant.bedrijf}</p>
                      )}
                    </div>
                  </div>
                  {klant.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                      <a
                        href={`mailto:${klant.email}`}
                        className="text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        {klant.email}
                      </a>
                    </div>
                  )}
                  {klant.telefoon && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                      <a
                        href={`tel:${klant.telefoon}`}
                        className="text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        {klant.telefoon}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Adres */}
              {(klant.adres || klant.postcode || klant.stad) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Adres</p>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div className="text-sm text-gray-700 space-y-0.5">
                      {klant.adres && <p>{klant.adres}</p>}
                      {(klant.postcode || klant.stad) && (
                        <p>{[klant.postcode, klant.stad].filter(Boolean).join(" ")}</p>
                      )}
                      {klant.land && <p>{klant.land}</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* KvK & BTW */}
              {(klant.kvkNummer || klant.btwNummer) && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bedrijfsgegevens</p>
                  <div className="space-y-1.5">
                    {klant.kvkNummer && (
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-600">KVK: {klant.kvkNummer}</span>
                      </div>
                    )}
                    {klant.btwNummer && (
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-600">BTW: {klant.btwNummer}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Betaaltermijn & taal */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Instellingen</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-600">
                      Betaaltermijn:{" "}
                      {klant.betaalTermijn ? `${klant.betaalTermijn} dagen` : "Globale instelling"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-600">
                      Taal: {klant.taal === "en" ? "English" : "Nederlands"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notities */}
              {klant.notities && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notities</p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{klant.notities}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Factuurgeschiedenis */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle>Factuurgeschiedenis</CardTitle>
              <Button
                size="sm"
                onClick={() => navigate(`/facturen/nieuw?klantId=${id}`)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Nieuwe factuur
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {facturen.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <FileText className="h-12 w-12 text-gray-200 mb-3" />
                  <p className="text-gray-500 font-medium">Geen facturen gevonden</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Maak een nieuwe factuur aan voor deze klant
                  </p>
                  <Button
                    className="mt-4 gap-2"
                    size="sm"
                    onClick={() => navigate(`/facturen/nieuw?klantId=${id}`)}
                  >
                    <Plus className="h-4 w-4" />
                    Nieuwe factuur
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nummer</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Vervaldatum</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Totaal</TableHead>
                      <TableHead className="text-right">Actie</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {facturen.map((factuur) => (
                      <TableRow
                        key={factuur.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/facturen/${factuur.id}`)}
                      >
                        <TableCell className="font-mono font-semibold text-gray-900">
                          {factuur.nummer}
                        </TableCell>
                        <TableCell className="text-gray-500">
                          {formatDatum(factuur.datum)}
                        </TableCell>
                        <TableCell className="text-gray-500">
                          {formatDatum(factuur.vervaldatum)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusKleur(factuur.status)}`}
                          >
                            {statusLabel(factuur.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-gray-900">
                          {formatBedrag(factuur.totaal)}
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/facturen/${factuur.id}`);
                            }}
                            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Bekijken
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Notities & Activiteit */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Notities &amp; Activiteit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Nieuwe notitie invoer */}
            <div className="flex gap-2 items-start">
              <Textarea
                className="flex-1"
                placeholder="Nieuwe notitie toevoegen..."
                value={nieuweNotitie}
                onChange={(e) => setNieuweNotitie(e.target.value)}
                rows={2}
              />
              <Button
                size="sm"
                onClick={voegNotitieТое}
                disabled={!nieuweNotitie.trim()}
                className="shrink-0"
              >
                Toevoegen
              </Button>
            </div>

            {/* Lijst van notities */}
            {notities.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nog geen notities</p>
            ) : (
              <div className="space-y-2">
                {[...notities].sort(
                  (a, b) => new Date(b.aangemaakt).getTime() - new Date(a.aangemaakt).getTime()
                ).map((notitie) => (
                  <div
                    key={notitie.id}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{notitie.tekst}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatDatum(notitie.aangemaakt)}</p>
                    </div>
                    <button
                      onClick={() => verwijderNotitie(notitie.id)}
                      className="shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                      title="Verwijderen"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bewerken modal */}
      <Modal open={modalOpen} onOpenChange={setModalOpen}>
        <ModalContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <ModalHeader>
            <ModalTitle>Klant bewerken</ModalTitle>
          </ModalHeader>

          <div className="space-y-4">
            {fout && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {fout}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Naam *"
                value={formulier.naam ?? ""}
                onChange={(e) => updateFormulier("naam", e.target.value)}
                placeholder="Jan de Vries"
                fout={fout && !formulier.naam?.trim() ? "Verplicht" : undefined}
              />
              <Input
                label="Bedrijf"
                value={formulier.bedrijf ?? ""}
                onChange={(e) => updateFormulier("bedrijf", e.target.value)}
                placeholder="De Vries BV"
              />
              <Input
                label="E-mail"
                type="email"
                value={formulier.email ?? ""}
                onChange={(e) => updateFormulier("email", e.target.value)}
                placeholder="jan@devries.nl"
              />
              <Input
                label="Telefoon"
                value={formulier.telefoon ?? ""}
                onChange={(e) => updateFormulier("telefoon", e.target.value)}
                placeholder="+31 6 12345678"
              />
            </div>

            <Input
              label="Adres"
              value={formulier.adres ?? ""}
              onChange={(e) => updateFormulier("adres", e.target.value)}
              placeholder="Hoofdstraat 1"
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Input
                label="Postcode"
                value={formulier.postcode ?? ""}
                onChange={(e) => updateFormulier("postcode", e.target.value)}
                placeholder="1234 AB"
              />
              <Input
                label="Stad"
                value={formulier.stad ?? ""}
                onChange={(e) => updateFormulier("stad", e.target.value)}
                placeholder="Amsterdam"
              />
              <Input
                label="Land"
                value={formulier.land ?? "Nederland"}
                onChange={(e) => updateFormulier("land", e.target.value)}
                placeholder="Nederland"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="KVK-nummer"
                value={formulier.kvkNummer ?? ""}
                onChange={(e) => updateFormulier("kvkNummer", e.target.value)}
                placeholder="12345678"
              />
              <Input
                label="BTW-nummer"
                value={formulier.btwNummer ?? ""}
                onChange={(e) => updateFormulier("btwNummer", e.target.value)}
                placeholder="NL123456789B01"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Betaaltermijn (dagen)"
                type="number"
                value={formulier.betaalTermijn ?? ""}
                onChange={(e) =>
                  updateFormulier(
                    "betaalTermijn",
                    e.target.value ? Number(e.target.value) : undefined
                  )
                }
                placeholder="Standaard globaal"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Factuurtaal
                </label>
                <select
                  value={formulier.taal ?? "nl"}
                  onChange={(e) => updateFormulier("taal", e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="nl">Nederlands</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notities
              </label>
              <Textarea
                value={formulier.notities ?? ""}
                onChange={(e) => updateFormulier("notities", e.target.value)}
                placeholder="Interne notities over deze klant..."
                rows={3}
              />
            </div>
          </div>

          <ModalFooter className="mt-6 gap-2">
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={slaOp} disabled={opslaan} className="gap-2">
              {opslaan && <Loader2 className="h-4 w-4 animate-spin" />}
              Opslaan
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

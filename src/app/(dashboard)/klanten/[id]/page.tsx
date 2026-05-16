"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Plus,
  FileText,
  Building2,
  Mail,
  Phone,
  MapPin,
  Hash,
  Receipt,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  _count?: { facturen: number };
}

interface Factuur {
  id: string;
  nummer: string;
  datum: string;
  vervaldatum: string;
  totaal: number;
  status: string;
}

interface FormulierData {
  naam: string;
  bedrijf: string;
  email: string;
  telefoon: string;
  adres: string;
  postcode: string;
  stad: string;
  land: string;
  kvkNummer: string;
  btwNummer: string;
  notities: string;
}

function InfoRij({
  icon: Icon,
  label,
  waarde,
}: {
  icon: React.ElementType;
  label: string;
  waarde?: string | null;
}) {
  if (!waarde) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gray-50 shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-gray-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900 mt-0.5 break-words">{waarde}</p>
      </div>
    </div>
  );
}

export default function KlantDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [klant, setKlant] = useState<Klant | null>(null);
  const [facturen, setFacturen] = useState<Factuur[]>([]);
  const [laden, setLaden] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formulier, setFormulier] = useState<FormulierData>({
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
  });
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const laadKlant = useCallback(async () => {
    try {
      const [klantRes, facturenRes] = await Promise.all([
        fetch(`/api/klanten/${id}`),
        fetch(`/api/facturen?klantId=${id}`),
      ]);
      if (!klantRes.ok) {
        router.push("/klanten");
        return;
      }
      const [klantData, facturenData] = await Promise.all([
        klantRes.json(),
        facturenRes.json(),
      ]);
      setKlant(klantData);
      setFacturen(Array.isArray(facturenData) ? facturenData : []);
    } catch (e) {
      console.error("Fout bij laden klant:", e);
    } finally {
      setLaden(false);
    }
  }, [id, router]);

  useEffect(() => {
    laadKlant();
  }, [laadKlant]);

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
      land: klant.land ?? "Nederland",
      kvkNummer: klant.kvkNummer ?? "",
      btwNummer: klant.btwNummer ?? "",
      notities: klant.notities ?? "",
    });
    setFout(null);
    setModalOpen(true);
  }

  async function slaOp() {
    if (!formulier.naam.trim()) {
      setFout("Naam is verplicht");
      return;
    }
    setOpslaan(true);
    setFout(null);
    try {
      const res = await fetch(`/api/klanten/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formulier),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.fout ?? "Opslaan mislukt");
      }
      setModalOpen(false);
      laadKlant();
    } catch (e: unknown) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setOpslaan(false);
    }
  }

  function updateFormulier(veld: keyof FormulierData, waarde: string) {
    setFormulier((prev) => ({ ...prev, [veld]: waarde }));
  }

  const totaalOmzet = facturen
    .filter((f) => f.status === "BETAALD")
    .reduce((s, f) => s + f.totaal, 0);

  const openstaand = facturen
    .filter((f) => f.status === "VERZONDEN" || f.status === "VERLOPEN")
    .reduce((s, f) => s + f.totaal, 0);

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

  const adresRegel = [klant.adres, klant.postcode, klant.stad, klant.land]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      <Header
        titel={klant.bedrijf ?? klant.naam}
        subtitel={klant.bedrijf ? klant.naam : undefined}
        acties={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/klanten")}
            >
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
            <Button variant="outline" size="sm" onClick={openBewerken}>
              <Pencil className="h-4 w-4" />
              Bewerken
            </Button>
            <Button
              size="sm"
              onClick={() =>
                router.push(`/facturen/nieuw?klantId=${klant.id}`)
              }
            >
              <Plus className="h-4 w-4" />
              Nieuwe factuur
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Statistieken */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Totaal facturen
              </p>
              <p className="text-3xl font-bold text-gray-900 mt-1">
                {facturen.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Totaal omzet
              </p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {formatBedrag(totaalOmzet)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Openstaand
              </p>
              <p
                className={`text-3xl font-bold mt-1 ${
                  openstaand > 0 ? "text-red-600" : "text-gray-400"
                }`}
              >
                {formatBedrag(openstaand)}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Klantgegevens */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-indigo-600" />
                Klantgegevens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <InfoRij icon={Building2} label="Bedrijf" waarde={klant.bedrijf} />
              <InfoRij icon={Mail} label="E-mailadres" waarde={klant.email} />
              <InfoRij icon={Phone} label="Telefoon" waarde={klant.telefoon} />
              <InfoRij icon={MapPin} label="Adres" waarde={adresRegel || undefined} />
              <InfoRij icon={Hash} label="KVK-nummer" waarde={klant.kvkNummer} />
              <InfoRij icon={Receipt} label="BTW-nummer" waarde={klant.btwNummer} />
              {!klant.bedrijf &&
                !klant.email &&
                !klant.telefoon &&
                !adresRegel &&
                !klant.kvkNummer &&
                !klant.btwNummer && (
                  <p className="text-sm text-gray-400 py-4 text-center">
                    Geen aanvullende gegevens
                  </p>
                )}
            </CardContent>
            {klant.notities && (
              <>
                <div className="mx-6 border-t border-gray-100" />
                <CardContent className="pt-4">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                    Notities
                  </p>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {klant.notities}
                  </p>
                </CardContent>
              </>
            )}
          </Card>

          {/* Facturen */}
          <Card className="xl:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Facturen
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() =>
                    router.push(`/facturen/nieuw?klantId=${klant.id}`)
                  }
                >
                  <Plus className="h-4 w-4" />
                  Nieuwe factuur
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {facturen.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="h-12 w-12 text-gray-200 mb-3" />
                  <p className="text-gray-500 font-medium">Geen facturen</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Maak de eerste factuur voor deze klant aan
                  </p>
                  <Button
                    className="mt-4"
                    size="sm"
                    onClick={() =>
                      router.push(`/facturen/nieuw?klantId=${klant.id}`)
                    }
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
                      <TableHead className="text-right">Totaal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {facturen.map((f) => (
                      <TableRow
                        key={f.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/facturen/${f.id}`)}
                      >
                        <TableCell className="font-mono text-sm font-medium text-indigo-700">
                          {f.nummer}
                        </TableCell>
                        <TableCell className="text-gray-500">
                          {formatDatum(f.datum)}
                        </TableCell>
                        <TableCell className="text-gray-500">
                          {formatDatum(f.vervaldatum)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatBedrag(f.totaal)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusKleur(f.status)}`}
                          >
                            {statusLabel(f.status)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/facturen/${f.id}`);
                            }}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <ExternalLink className="h-4 w-4" />
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
                value={formulier.naam}
                onChange={(e) => updateFormulier("naam", e.target.value)}
                placeholder="Jan de Vries"
                fout={
                  fout && !formulier.naam.trim() ? "Verplicht" : undefined
                }
              />
              <Input
                label="Bedrijf"
                value={formulier.bedrijf}
                onChange={(e) => updateFormulier("bedrijf", e.target.value)}
                placeholder="De Vries BV"
              />
              <Input
                label="E-mail"
                type="email"
                value={formulier.email}
                onChange={(e) => updateFormulier("email", e.target.value)}
                placeholder="jan@devries.nl"
              />
              <Input
                label="Telefoon"
                value={formulier.telefoon}
                onChange={(e) =>
                  updateFormulier("telefoon", e.target.value)
                }
                placeholder="+31 6 12345678"
              />
            </div>

            <Input
              label="Adres"
              value={formulier.adres}
              onChange={(e) => updateFormulier("adres", e.target.value)}
              placeholder="Hoofdstraat 1"
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Input
                label="Postcode"
                value={formulier.postcode}
                onChange={(e) =>
                  updateFormulier("postcode", e.target.value)
                }
                placeholder="1234 AB"
              />
              <Input
                label="Stad"
                value={formulier.stad}
                onChange={(e) => updateFormulier("stad", e.target.value)}
                placeholder="Amsterdam"
              />
              <Input
                label="Land"
                value={formulier.land}
                onChange={(e) => updateFormulier("land", e.target.value)}
                placeholder="Nederland"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="KVK-nummer"
                value={formulier.kvkNummer}
                onChange={(e) =>
                  updateFormulier("kvkNummer", e.target.value)
                }
                placeholder="12345678"
              />
              <Input
                label="BTW-nummer"
                value={formulier.btwNummer}
                onChange={(e) =>
                  updateFormulier("btwNummer", e.target.value)
                }
                placeholder="NL123456789B01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notities
              </label>
              <Textarea
                value={formulier.notities}
                onChange={(e) =>
                  updateFormulier("notities", e.target.value)
                }
                placeholder="Interne notities over deze klant..."
                rows={3}
              />
            </div>
          </div>

          <ModalFooter className="mt-6 gap-2">
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={slaOp} loading={opslaan}>
              Opslaan
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

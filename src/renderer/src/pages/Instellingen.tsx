import { useState, useEffect, useCallback, useRef } from "react";
import {
  Building2,
  FileText,
  Mail,
  Calendar,
  Calculator,
  CheckCircle,
  AlertCircle,
  Loader2,
  Send,
  Link,
  Unlink,
  MoreHorizontal,
  Car,
  Download,
  Settings,
  Palette,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Menu,
  CreditCard,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/context/theme";
import { FactuurLayoutPreview } from "@/components/facturen/FactuurLayoutPreview";
import { FactuurHtmlDocument } from "@/components/facturen/FactuurHtmlDocument";
import { type FactuurHtmlFactuur } from "@/lib/factuur-html";

type Tab = "bedrijf" | "facturen" | "layout" | "email" | "google" | "kor" | "overig" | "geavanceerd" | "navigatie" | "bank";

const TAB_CONFIG: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "bedrijf", label: "Bedrijfsgegevens", icon: Building2 },
  { id: "facturen", label: "Facturen", icon: FileText },
  { id: "layout", label: "Factuurlayout", icon: Palette },
  { id: "email", label: "Email", icon: Mail },
  { id: "google", label: "Google Agenda", icon: Calendar },
  { id: "kor", label: "KOR", icon: Calculator },
  { id: "overig", label: "Overig", icon: MoreHorizontal },
  { id: "navigatie", label: "Navigatie", icon: Menu },
  { id: "bank", label: "Bankimport", icon: CreditCard },
  { id: "geavanceerd", label: "Geavanceerd", icon: Settings },
];

const ALLE_PAGINAS = [
  { href: "/klanten", naam: "Klanten" },
  { href: "/facturen", naam: "Facturen" },
  { href: "/offertes", naam: "Offertes" },
  { href: "/agenda", naam: "Agenda" },
  { href: "/inkomen", naam: "Inkomen" },
  { href: "/uitgaven", naam: "Uitgaven" },
  { href: "/crediteuren", naam: "Crediteuren" },
  { href: "/uren", naam: "Uren" },
  { href: "/kilometer", naam: "Kilometer" },
  { href: "/bank-import", naam: "Bankimport" },
  { href: "/producten", naam: "Producten" },
  { href: "/vaste-activa", naam: "Vaste activa" },
  { href: "/rapporten", naam: "Rapporten" },
];

interface Instellingen {
  // Bedrijf
  naam?: string;
  bedrijfsnaam?: string;
  email?: string;
  telefoon?: string;
  adres?: string;
  postcode?: string;
  stad?: string;
  kvkNummer?: string;
  btwNummer?: string;
  iban?: string;
  website?: string;
  // Facturen
  factuurPrefix?: string;
  standaardBetaalTermijn?: number;
  standaardBtwTarief?: number;
  betalingsherinneringen?: boolean;
  herinneringDagen?: number;
  // Email / SMTP
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  emailSmtpSecure?: boolean;
  emailSmtpUser?: string;
  emailSmtpPass?: string;
  emailSmtpPassIngesteld?: boolean;
  emailBcc?: string;
  // Google
  googleGekoppeld?: boolean;
  googleEmail?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  // KOR
  korActief?: boolean;
  korDrempel?: number;
  korIngangsDatum?: string;
  // Email sjabloon
  emailAanhef?: string;
  emailAfsluitingsTekst?: string;
  emailFactuurOnderwerp?: string;
  emailFactuurTekst?: string;
  emailHerinneringOnderwerp?: string;
  emailHerinneringTekst?: string;
  emailBevestigingOnderwerp?: string;
  emailBevestigingTekst?: string;
  agendaHerinneringActief?: boolean;
  agendaHerinneringModus?: string;
  agendaHerinneringVoorafUren?: number;
  agendaHerinneringDagen?: number;
  agendaHerinneringTijd?: string;
  // Overig
  kmVergoeding?: number;
  bankAfschriftenMap?: string;
  // Geavanceerd
  pdfMapPad?: string;
  logoBase64?: string;
  korWaarschuwing?: boolean;
  factuurVolgNummer?: number;
  donkerModus?: string;
  autoStart?: boolean;
  // Layout
  layoutPrimairKleur?: string;
  layoutSecundairKleur?: string;
  layoutLettertype?: string;
  layoutKoptekst?: string;
  layoutVoettekst?: string;
  layoutLogoPositie?: string;
  layoutToonBtwNummer?: boolean;
  layoutToonKvkNummer?: boolean;
  layoutToonIban?: boolean;
  layoutToonQrCode?: boolean;
  layoutRegelSpacing?: string;
  layoutLetterGrootte?: string;
  layoutLogoGrootte?: string;
  layoutMarges?: string;
  layoutSectieVolgorde?: string;
  onbetaaldeFactuurMelding?: boolean;
  factuurHtmlTemplate?: string;
  offerteGeldigheidDagen?: number;
  verborgenPaginas?: string;
  bankWeergaveVelden?: string;
  uitgavenWeergaveVelden?: string;
  spaarrekeningen?: string;
}

const ALLE_BANK_VELDEN = [
  { id: 'datum', label: 'Datum', verplicht: true },
  { id: 'omschrijving', label: 'Omschrijving', verplicht: true },
  { id: 'bedrag', label: 'Bedrag', verplicht: true },
  { id: 'tegenrekeningNaam', label: 'Naam tegenpartij' },
  { id: 'tegenrekening', label: 'Tegenrekening (IBAN)' },
  { id: 'mutatiesoort', label: 'Mutatiesoort' },
  { id: 'mededelingen', label: 'Mededelingen' },
  { id: 'betalingskenmerk', label: 'Betalingskenmerk (EndToEndId)' },
  { id: 'saldoNaBoeking', label: 'Saldo na boeking' },
  { id: 'bron', label: 'Bron' },
  { id: 'factuur', label: 'Gekoppelde factuur' },
];

const ALLE_UITGAVEN_VELDEN = [
  { id: 'datum', label: 'Datum', verplicht: true },
  { id: 'omschrijving', label: 'Omschrijving', verplicht: true },
  { id: 'bedrag', label: 'Excl. BTW', verplicht: true },
  { id: 'totaal', label: 'Totaal', verplicht: true },
  { id: 'leverancier', label: 'Leverancier' },
  { id: 'categorie', label: 'Categorie' },
  { id: 'btw', label: 'BTW' },
];

function parseVelden(json: string | undefined, alle: { id: string }[]): string[] {
  try {
    const parsed = JSON.parse(json ?? '[]');
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
  } catch {}
  return alle.map(v => v.id);
}

function KolomConfigurator({
  titel,
  omschrijving,
  allVelden,
  velden,
  setVelden,
}: {
  titel: string;
  omschrijving: string;
  allVelden: { id: string; label: string; verplicht?: boolean }[];
  velden: string[];
  setVelden: (v: string[]) => void;
}) {
  const gesorteerd = [
    ...velden.map(id => allVelden.find(v => v.id === id)!).filter(Boolean),
    ...allVelden.filter(v => !velden.includes(v.id)),
  ];

  const toggle = (id: string) => {
    setVelden(velden.includes(id) ? velden.filter(v => v !== id) : [...velden, id]);
  };

  const verplaats = (id: string, richting: -1 | 1) => {
    const idx = velden.indexOf(id);
    if (idx < 0) return;
    const swap = idx + richting;
    if (swap < 0 || swap >= velden.length) return;
    const nieuw = [...velden];
    [nieuw[idx], nieuw[swap]] = [nieuw[swap], nieuw[idx]];
    setVelden(nieuw);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titel}</CardTitle>
        <CardDescription>{omschrijving}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {gesorteerd.map((veld) => {
          const actief = velden.includes(veld.id);
          const positie = velden.indexOf(veld.id);
          return (
            <div
              key={veld.id}
              className={`flex items-center justify-between py-2.5 px-3 rounded-lg border ${actief ? 'border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-700' : 'border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 opacity-50'}`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={actief}
                  disabled={veld.verplicht}
                  onChange={() => toggle(veld.id)}
                  className="h-4 w-4 text-indigo-600 rounded disabled:opacity-40"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{veld.label}</span>
                {veld.verplicht && <span className="text-xs text-gray-400">(verplicht)</span>}
              </div>
              {actief && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={positie === 0}
                    onClick={() => verplaats(veld.id, -1)}
                    className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-800 disabled:opacity-30"
                    title="Omhoog"
                  >
                    <ChevronUp className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                  </button>
                  <button
                    type="button"
                    disabled={positie === velden.length - 1}
                    onClick={() => verplaats(veld.id, 1)}
                    className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-800 disabled:opacity-30"
                    title="Omlaag"
                  >
                    <ChevronDown className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function maakPreviewFactuur(instellingen: Instellingen): FactuurHtmlFactuur {
  const subtotaal = 85;
  const btwBedrag = instellingen.korActief ? 0 : 17.85;
  const totaal = subtotaal + btwBedrag;

  return {
    nummer: "2026-0043",
    datum: "2026-05-23",
    vervaldatum: "2026-06-06",
    subtotaal,
    kortingBedrag: 0,
    btwBedrag,
    totaal,
    notities: "",
    betalingsCondities: "Gelieve deze factuur uiterlijk 06-06-2026 te voldoen onder vermelding van uw naam en factuurnummer 2026-0043.",
    regels: [
      {
        omschrijving: "pt / uur",
        aantal: 1,
        eenheid: null,
        prijs: 85,
        totaal: subtotaal,
        kortingPercentage: 0,
      },
    ],
    klant: {
      naam: "Sven Harskamp",
      adres: "Orxmasingel 17",
      postcode: "9036JT",
      stad: "Menaam",
    },
  };
}

export default function InstellingenPagina() {
  const { modus, setModus } = useTheme();
  const [actieveTab, setActieveTab] = useState<Tab>("bedrijf");
  const [instellingen, setInstellingen] = useState<Instellingen>({});
  const [laden, setLaden] = useState(true);
  const [opslaan, setOpslaan] = useState(false);
  const [googleSecretInput, setGoogleSecretInput] = useState("");
  const [smtpPassInput, setSmtpPassInput] = useState("");
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [emailTestStatus, setEmailTestStatus] = useState<"idle" | "laden" | "succes" | "fout">("idle");
  const [googleLaden, setGoogleLaden] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [exportJaar, setExportJaar] = useState(new Date().getFullYear());
  const [pdfArchiefLaden, setPdfArchiefLaden] = useState(false);
  const [exportMelding, setExportMelding] = useState<string | null>(null);
  const [wissenMelding, setWissenMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [nieuweSpaarrekening, setNieuweSpaarrekening] = useState("");
  const [bankVeldenLijst, setBankVeldenLijst] = useState<string[]>(() => ALLE_BANK_VELDEN.map(v => v.id));
  const [uitgavenVeldenLijst, setUitgavenVeldenLijst] = useState<string[]>(() => ALLE_UITGAVEN_VELDEN.map(v => v.id));
  const isGeladen = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewSchaal, setPreviewSchaal] = useState(0.65);
  const haalInstellingenOp = useCallback(async () => {
    try {
      const data = await window.api.instellingen.get();
      setInstellingen(data ?? {});
      setBankVeldenLijst(parseVelden((data as any)?.bankWeergaveVelden, ALLE_BANK_VELDEN));
      setUitgavenVeldenLijst(parseVelden((data as any)?.uitgavenWeergaveVelden, ALLE_UITGAVEN_VELDEN));
    } catch {
      toonMelding("fout", "Kon instellingen niet laden");
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    haalInstellingenOp();
  }, [haalInstellingenOp]);

  useEffect(() => {
    if (!laden) {
      // Activeer auto-save na volledig laden om false-positive saves te voorkomen
      const t = setTimeout(() => { isGeladen.current = true; }, 300);
      return () => clearTimeout(t);
    }
  }, [laden]);

  // Auto-save: sla instellingen 1.5s na elke wijziging op
  useEffect(() => {
    if (!isGeladen.current || Object.keys(instellingen).length === 0) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      window.api.instellingen.update(instellingen as Record<string, unknown>).catch(() => {});
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [instellingen]);

  useEffect(() => {
    if (!isGeladen.current) return;
    window.dispatchEvent(new CustomEvent('verborgenPaginasGewijzigd', { detail: instellingen.verborgenPaginas ?? '[]' }));
  }, [instellingen.verborgenPaginas]);

  useEffect(() => {
    window.api.app.getAutoStart().then(setAutoStart).catch(() => {});
  }, []);

  useEffect(() => {
    if (actieveTab !== "layout") return;
    const el = previewContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const schaal = (entry.contentRect.width - 24) / 794;
      setPreviewSchaal(Math.max(0.45, Math.min(1.2, schaal)));
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [actieveTab]);

  const effectievePreviewSchaal = Math.max(0.45, Math.min(1.2, previewSchaal));
  const previewFactuur = maakPreviewFactuur(instellingen);

  const toonMelding = (type: "succes" | "fout", tekst: string) => {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 5000);
  };

  const slaOp = async (velden: Partial<Instellingen>) => {
    setOpslaan(true);
    try {
      await window.api.instellingen.update(velden);
      toonMelding("succes", "Instellingen opgeslagen");
    } catch {
      toonMelding("fout", "Opslaan mislukt");
    } finally {
      setOpslaan(false);
    }
  };

  const updateVeld = <K extends keyof Instellingen>(veld: K, waarde: Instellingen[K]) => {
    setInstellingen((prev) => ({ ...prev, [veld]: waarde }));
  };

  const testEmail = async () => {
    setEmailTestStatus("laden");
    try {
      await window.api.instellingen.testEmail({
        host: instellingen.emailSmtpHost ?? "",
        port: instellingen.emailSmtpPort ?? 587,
        secure: instellingen.emailSmtpSecure ?? false,
        user: instellingen.emailSmtpUser ?? "",
        pass: smtpPassInput || undefined,
        naar: instellingen.email ?? "",
      });
      setEmailTestStatus("succes");
      setTimeout(() => setEmailTestStatus("idle"), 4000);
    } catch (e: unknown) {
      setEmailTestStatus("fout");
      const msg = e instanceof Error ? e.message : "Versturen mislukt";
      toonMelding("fout", msg);
      setTimeout(() => setEmailTestStatus("idle"), 4000);
    }
  };

  const koppelGoogle = async () => {
    setGoogleLaden(true);
    toonMelding("succes", "Browser wordt geopend. Geef toestemming in Google en wacht...");
    try {
      await (window.api.instellingen as any).googleKoppelen();
      setInstellingen((prev) => ({ ...prev, googleGekoppeld: true }));
      toonMelding("succes", "Google Agenda succesvol gekoppeld!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Koppelen mislukt";
      toonMelding("fout", msg);
    } finally {
      setGoogleLaden(false);
    }
  };

  const ontkoppelGoogle = async () => {
    if (!confirm("Weet je zeker dat je Google Agenda wilt ontkoppelen?")) return;
    setGoogleLaden(true);
    try {
      await window.api.instellingen.googleOntkoppelen();
      setInstellingen((prev) => ({ ...prev, googleGekoppeld: false, googleEmail: undefined }));
      toonMelding("succes", "Google Agenda ontkoppeld");
    } catch {
      toonMelding("fout", "Ontkoppelen mislukt");
    } finally {
      setGoogleLaden(false);
    }
  };

  if (laden) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header titel="Instellingen" subtitel="Beheer je accountgegevens" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header titel="Instellingen" subtitel="Beheer je accountgegevens" />

      <div className={`flex-1 p-6 space-y-6 mx-auto w-full ${actieveTab === "layout" ? "max-w-[1700px]" : "max-w-4xl"}`}>
        {melding && (
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium flex items-center gap-2 ${
              melding.type === "succes"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {melding.type === "succes" ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {melding.tekst}
          </div>
        )}

        {/* Tab navigatie */}
        <div className="flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActieveTab(id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                actieveTab === id
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* ── Bedrijfsgegevens ── */}
        {actieveTab === "bedrijf" && (
          <Card>
            <CardHeader>
              <CardTitle>Bedrijfsgegevens</CardTitle>
              <CardDescription>Jouw persoonlijke en bedrijfsinformatie</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Naam"
                  value={instellingen.naam ?? ""}
                  onChange={(e) => updateVeld("naam", e.target.value)}
                  onBlur={() => slaOp({ naam: instellingen.naam })}
                  placeholder="Jan de Vries"
                />
                <Input
                  label="Bedrijfsnaam"
                  value={instellingen.bedrijfsnaam ?? ""}
                  onChange={(e) => updateVeld("bedrijfsnaam", e.target.value)}
                  onBlur={() => slaOp({ bedrijfsnaam: instellingen.bedrijfsnaam })}
                  placeholder="De Vries Consultancy"
                />
                <Input
                  label="E-mail"
                  type="email"
                  value={instellingen.email ?? ""}
                  onChange={(e) => updateVeld("email", e.target.value)}
                  onBlur={() => slaOp({ email: instellingen.email })}
                  placeholder="jan@devries.nl"
                />
                <Input
                  label="Telefoon"
                  value={instellingen.telefoon ?? ""}
                  onChange={(e) => updateVeld("telefoon", e.target.value)}
                  onBlur={() => slaOp({ telefoon: instellingen.telefoon })}
                  placeholder="+31 6 12345678"
                />
              </div>
              <Input
                label="Adres"
                value={instellingen.adres ?? ""}
                onChange={(e) => updateVeld("adres", e.target.value)}
                onBlur={() => slaOp({ adres: instellingen.adres })}
                placeholder="Hoofdstraat 1"
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Input
                  label="Postcode"
                  value={instellingen.postcode ?? ""}
                  onChange={(e) => updateVeld("postcode", e.target.value)}
                  onBlur={() => slaOp({ postcode: instellingen.postcode })}
                  placeholder="1234 AB"
                />
                <Input
                  label="Stad"
                  value={instellingen.stad ?? ""}
                  onChange={(e) => updateVeld("stad", e.target.value)}
                  onBlur={() => slaOp({ stad: instellingen.stad })}
                  placeholder="Amsterdam"
                />
                <Input
                  label="Website"
                  value={instellingen.website ?? ""}
                  onChange={(e) => updateVeld("website", e.target.value)}
                  onBlur={() => slaOp({ website: instellingen.website })}
                  placeholder="https://devries.nl"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="KVK-nummer"
                  value={instellingen.kvkNummer ?? ""}
                  onChange={(e) => updateVeld("kvkNummer", e.target.value)}
                  onBlur={() => slaOp({ kvkNummer: instellingen.kvkNummer })}
                  placeholder="12345678"
                />
                {!instellingen.korActief && (
                <Input
                  label="BTW-nummer"
                  value={instellingen.btwNummer ?? ""}
                  onChange={(e) => updateVeld("btwNummer", e.target.value)}
                  onBlur={() => slaOp({ btwNummer: instellingen.btwNummer })}
                  placeholder="NL123456789B01"
                />
                )}
                <Input
                  label="IBAN"
                  value={instellingen.iban ?? ""}
                  onChange={(e) => updateVeld("iban", e.target.value)}
                  onBlur={() => slaOp({ iban: instellingen.iban })}
                  placeholder="NL91ABNA0417164300"
                />
              </div>
              {/* Bedrijfslogo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijfslogo</label>
                {instellingen.logoBase64 && (
                  <img
                    src={instellingen.logoBase64}
                    alt="Logo"
                    className="h-16 mb-2 object-contain rounded border border-gray-200 p-1"
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64 = reader.result as string;
                      updateVeld("logoBase64", base64);
                      slaOp({ logoBase64: base64 });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => slaOp(instellingen)} loading={opslaan}>
                  Opslaan
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Facturen ── */}
        {actieveTab === "facturen" && (
          <Card>
            <CardHeader>
              <CardTitle>Factuurinstellingen</CardTitle>
              <CardDescription>Standaard waarden voor nieuwe facturen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Factuur prefix"
                  value={instellingen.factuurPrefix ?? ""}
                  onChange={(e) => updateVeld("factuurPrefix", e.target.value)}
                  onBlur={() => slaOp({ factuurPrefix: instellingen.factuurPrefix })}
                  placeholder="INV-"
                />
                <Input
                  label="Standaard betaaltermijn (dagen)"
                  type="number"
                  min="1"
                  max="365"
                  value={instellingen.standaardBetaalTermijn ?? 30}
                  onChange={(e) => updateVeld("standaardBetaalTermijn", parseInt(e.target.value))}
                  onBlur={() => slaOp({ standaardBetaalTermijn: instellingen.standaardBetaalTermijn })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Standaard geldigheidsduur offerte (dagen)"
                  type="number"
                  min="1"
                  max="365"
                  value={instellingen.offerteGeldigheidDagen ?? 30}
                  onChange={(e) => updateVeld("offerteGeldigheidDagen", parseInt(e.target.value))}
                  onBlur={() => slaOp({ offerteGeldigheidDagen: instellingen.offerteGeldigheidDagen })}
                />
              </div>
              {!instellingen.korActief && (
              <div>
                <Select
                  value={String(instellingen.standaardBtwTarief ?? 21)}
                  onValueChange={(v) => {
                    const tarief = parseInt(v);
                    updateVeld("standaardBtwTarief", tarief);
                    slaOp({ standaardBtwTarief: tarief });
                  }}
                >
                  <SelectTrigger label="Standaard BTW tarief">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="21">21% — Standaard tarief</SelectItem>
                    <SelectItem value="9">9% — Verlaagd tarief</SelectItem>
                    <SelectItem value="0">0% — Geen BTW</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              )}

              {/* Herinneringen toggle */}
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Betalingsherinneringen</p>
                    <p className="text-xs text-gray-400 mt-0.5">Automatisch herinneringen versturen bij te late betaling</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nieuw = !instellingen.betalingsherinneringen;
                      updateVeld("betalingsherinneringen", nieuw);
                      slaOp({ betalingsherinneringen: nieuw });
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      instellingen.betalingsherinneringen ? "bg-indigo-600" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        instellingen.betalingsherinneringen ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                {instellingen.betalingsherinneringen && (
                  <Input
                    label="Na hoeveel dagen herinnering sturen"
                    type="number"
                    min="1"
                    max="90"
                    value={instellingen.herinneringDagen ?? 7}
                    onChange={(e) => updateVeld("herinneringDagen", parseInt(e.target.value))}
                    onBlur={() => slaOp({ herinneringDagen: instellingen.herinneringDagen })}
                  />
                )}
              </div>

              {/* Agenda afspraakreinneringen */}
              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Afspraakherinneringen</p>
                    <p className="text-xs text-gray-400 mt-0.5">Automatisch herinneringen sturen aan klanten voor afspraken</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nieuw = !instellingen.agendaHerinneringActief;
                      updateVeld("agendaHerinneringActief", nieuw);
                      slaOp({ agendaHerinneringActief: nieuw });
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      instellingen.agendaHerinneringActief ? "bg-indigo-600" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        instellingen.agendaHerinneringActief ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                {instellingen.agendaHerinneringActief && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Verstuurmodus</label>
                      <select
                        value={instellingen.agendaHerinneringModus ?? "vooraf"}
                        onChange={(e) => updateVeld("agendaHerinneringModus", e.target.value)}
                        onBlur={() => slaOp({ agendaHerinneringModus: instellingen.agendaHerinneringModus })}
                        className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                      >
                        <option value="vooraf">X uur voor de afspraak</option>
                        <option value="vasteTijd">Op een vast tijdstip X dagen van te voren</option>
                      </select>
                    </div>
                    {instellingen.agendaHerinneringModus === "vasteTijd" ? (
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Dagen van te voren"
                          type="number"
                          min="1"
                          max="30"
                          value={instellingen.agendaHerinneringDagen ?? 1}
                          onChange={(e) => updateVeld("agendaHerinneringDagen", parseInt(e.target.value))}
                          onBlur={() => slaOp({ agendaHerinneringDagen: instellingen.agendaHerinneringDagen })}
                        />
                        <Input
                          label="Tijdstip (bijv. 09:00)"
                          type="time"
                          value={instellingen.agendaHerinneringTijd ?? "09:00"}
                          onChange={(e) => updateVeld("agendaHerinneringTijd", e.target.value)}
                          onBlur={() => slaOp({ agendaHerinneringTijd: instellingen.agendaHerinneringTijd })}
                        />
                      </div>
                    ) : (
                      <Input
                        label="Uren voor de afspraak"
                        type="number"
                        min="1"
                        max="72"
                        value={instellingen.agendaHerinneringVoorafUren ?? 2}
                        onChange={(e) => updateVeld("agendaHerinneringVoorafUren", parseInt(e.target.value))}
                        onBlur={() => slaOp({ agendaHerinneringVoorafUren: instellingen.agendaHerinneringVoorafUren })}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => slaOp(instellingen)} loading={opslaan}>
                  Opslaan
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Factuurlayout ── */}
        {actieveTab === "layout" && (
          <div className="flex gap-6 items-start" style={{ minHeight: "calc(100vh - 220px)" }}>
            <div className="w-[420px] shrink-0 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Factuurtemplate (HTML/CSS)</CardTitle>
                  <CardDescription>Maak een volledig eigen factuurlayout met HTML en CSS. Gebruik {"{{"}variabele{"}}"} placeholders voor dynamische waarden. Laat leeg voor de standaard opmaak.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <textarea
                    rows={30}
                    className="w-full font-mono text-xs rounded-md border border-gray-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Laat leeg om de standaard opmaak te gebruiken..."
                    value={instellingen.factuurHtmlTemplate ?? ""}
                    onChange={(e) => updateVeld("factuurHtmlTemplate", e.target.value)}
                    onBlur={() => slaOp({ factuurHtmlTemplate: instellingen.factuurHtmlTemplate })}
                    style={{ minHeight: "500px" }}
                  />
                  <details className="rounded-lg border border-gray-100 bg-gray-50">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-600 select-none">Beschikbare variabelen</summary>
                    <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-4 text-xs text-gray-600">
                      <div>
                        <p className="font-semibold text-gray-700 mb-1">Bedrijf</p>
                        <ul className="space-y-0.5 font-mono text-gray-500">
                          <li>{"{{bedrijfsnaam}}"}</li>
                          <li>{"{{bedrijfAdres}}"}</li>
                          <li>{"{{bedrijfPostcode}}"}</li>
                          <li>{"{{bedrijfStad}}"}</li>
                          <li>{"{{bedrijfEmail}}"}</li>
                          <li>{"{{bedrijfTelefoon}}"}</li>
                          <li>{"{{bedrijfWebsite}}"}</li>
                          <li>{"{{kvkNummer}}"}</li>
                          <li>{"{{btwNummer}}"}</li>
                          <li>{"{{iban}}"}</li>
                          <li>{"{{logo}}"}</li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-700 mb-1">Factuur</p>
                        <ul className="space-y-0.5 font-mono text-gray-500">
                          <li>{"{{factuurNummer}}"}</li>
                          <li>{"{{factuurDatum}}"}</li>
                          <li>{"{{vervaldatum}}"}</li>
                          <li>{"{{notities}}"}</li>
                          <li>{"{{betalingsCondities}}"}</li>
                        </ul>
                        <p className="font-semibold text-gray-700 mb-1 mt-3">Klant</p>
                        <ul className="space-y-0.5 font-mono text-gray-500">
                          <li>{"{{klantNaam}}"}</li>
                          <li>{"{{klantBedrijf}}"}</li>
                          <li>{"{{klantAdres}}"}</li>
                          <li>{"{{klantPostcode}}"}</li>
                          <li>{"{{klantStad}}"}</li>
                          <li>{"{{klantBtwNummer}}"}</li>
                        </ul>
                        <p className="font-semibold text-gray-700 mb-1 mt-3">Totalen</p>
                        <ul className="space-y-0.5 font-mono text-gray-500">
                          <li>{"{{subtotaal}}"}</li>
                          <li>{"{{kortingBedrag}}"}</li>
                          <li>{"{{kortingClass}}"}</li>
                          <li>{"{{btwBedrag}}"}</li>
                          <li>{"{{btwClass}}"}</li>
                          <li>{"{{totaalBedrag}}"}</li>
                          <li>{"{{regelsHtml}}"} <span className="font-sans text-gray-400">(HTML tabel)</span></li>
                          <li>{"{{betaalQrCode}}"} <span className="font-sans text-gray-400">(SEPA betaal QR-code afbeelding)</span></li>
                        </ul>
                      </div>
                    </div>
                  </details>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                      onClick={() => { updateVeld("factuurHtmlTemplate", ""); slaOp({ factuurHtmlTemplate: "" }); }}
                    >
                      Reset naar standaard
                    </button>
                    <Button onClick={() => slaOp({ factuurHtmlTemplate: instellingen.factuurHtmlTemplate })} loading={opslaan}>
                      Opslaan
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex-1 min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Live voorbeeld van de factuur</p>
                <p className="text-xs text-gray-500">Deze preview schaalt automatisch mee met je scherm</p>
              </div>
              <div
                ref={previewContainerRef}
                className="overflow-auto rounded-xl bg-gray-100 px-4 py-5"
                style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)", minHeight: "calc(100vh - 280px)" }}
              >
                <div
                  style={{
                    width: `${Math.round(794 * effectievePreviewSchaal)}px`,
                    height: `${Math.round(1123 * effectievePreviewSchaal)}px`,
                    overflow: "hidden",
                    borderRadius: "4px",
                    boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
                    margin: "0 auto",
                    background: "white",
                  }}
                >
                  <div style={{ width: "794px", transformOrigin: "top left", transform: `scale(${effectievePreviewSchaal})` }}>
                    {instellingen.factuurHtmlTemplate?.trim() ? (
                      <FactuurHtmlDocument
                        title="Factuur template preview"
                        instellingen={instellingen}
                        factuur={previewFactuur}
                        frameStyle={{ width: "794px", height: "1123px" }}
                      />
                    ) : (
                      <FactuurLayoutPreview inst={instellingen} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Email / SMTP ── */}
        {actieveTab === "email" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>E-mail instellingen</CardTitle>
                <CardDescription>SMTP-configuratie voor het versturen van facturen en herinneringen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                  <p className="font-medium mb-1">Instructies</p>
                  <p>
                    Vul je SMTP-gegevens in om e-mails te kunnen versturen vanuit AdminPro. Voor Gmail gebruik je{" "}
                    <code className="bg-blue-100 px-1 rounded">smtp.gmail.com</code> (poort 587 of 465).
                    Zorg dat je een app-wachtwoord hebt aangemaakt in je Google-account.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <Input
                      label="SMTP Host"
                      value={instellingen.emailSmtpHost ?? ""}
                      onChange={(e) => updateVeld("emailSmtpHost", e.target.value)}
                      onBlur={() => slaOp({ emailSmtpHost: instellingen.emailSmtpHost })}
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <Input
                    label="Poort"
                    type="number"
                    value={instellingen.emailSmtpPort ?? 587}
                    onChange={(e) => updateVeld("emailSmtpPort", parseInt(e.target.value))}
                    onBlur={() => slaOp({ emailSmtpPort: instellingen.emailSmtpPort })}
                    placeholder="587"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">SSL/TLS (beveiligde verbinding)</p>
                    <p className="text-xs text-gray-400">Gebruik poort 465 voor SSL, 587 voor STARTTLS</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nieuw = !instellingen.emailSmtpSecure;
                      updateVeld("emailSmtpSecure", nieuw);
                      slaOp({ emailSmtpSecure: nieuw });
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      instellingen.emailSmtpSecure ? "bg-indigo-600" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        instellingen.emailSmtpSecure ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Gebruikersnaam / E-mail"
                    type="email"
                    value={instellingen.emailSmtpUser ?? ""}
                    onChange={(e) => updateVeld("emailSmtpUser", e.target.value)}
                    onBlur={() => slaOp({ emailSmtpUser: instellingen.emailSmtpUser })}
                    placeholder="jij@gmail.com"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Wachtwoord / App-wachtwoord</label>
                    <Input
                      type="password"
                      value={smtpPassInput}
                      onChange={(e) => setSmtpPassInput(e.target.value)}
                      onBlur={async () => {
                        if (smtpPassInput.trim()) {
                          try {
                            await window.api.instellingen.update({ emailSmtpPass: smtpPassInput.trim() } as Record<string, unknown>);
                            setSmtpPassInput("");
                            updateVeld("emailSmtpPassIngesteld", true);
                            toonMelding("succes", "Wachtwoord opgeslagen");
                          } catch {
                            toonMelding("fout", "Wachtwoord opslaan mislukt");
                          }
                        }
                      }}
                      placeholder={instellingen.emailSmtpPassIngesteld ? "●●●●●●●● (opgeslagen — laat leeg om te bewaren)" : "App-wachtwoord invoeren"}
                    />
                    {instellingen.emailSmtpPassIngesteld && !smtpPassInput && (
                      <p className="mt-1 text-xs text-green-600">✓ Wachtwoord is opgeslagen. Typ een nieuw wachtwoord om te wijzigen.</p>
                    )}
                  </div>
                </div>

                <Input
                  label="Vaste BCC-ontvanger (optioneel)"
                  type="email"
                  value={instellingen.emailBcc ?? ""}
                  onChange={(e) => updateVeld("emailBcc", e.target.value)}
                  onBlur={() => slaOp({ emailBcc: instellingen.emailBcc })}
                  placeholder="bcc@jouwbedrijf.nl"
                  helperText="Dit adres ontvangt altijd een kopie van alle uitgaande e-mails."
                />

                <div className="flex flex-wrap gap-3 justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={testEmail}
                    disabled={emailTestStatus === "laden" || !instellingen.emailSmtpHost}
                  >
                    {emailTestStatus === "laden" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {emailTestStatus === "succes"
                      ? "E-mail verzonden!"
                      : emailTestStatus === "fout"
                      ? "Verzenden mislukt"
                      : "Test e-mail versturen"}
                  </Button>
                  <Button onClick={() => slaOp(instellingen)} loading={opslaan}>
                    Opslaan
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>E-mailsjabloon</CardTitle>
                <CardDescription>Personaliseer de tekst in je factuur- en offerte e-mails</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Onderwerp factuur-e-mail
                  </label>
                  <input
                    type="text"
                    value={instellingen.emailFactuurOnderwerp ?? ''}
                    onChange={(e) => updateVeld('emailFactuurOnderwerp', e.target.value)}
                    placeholder="Factuur {{nummer}} van {{bedrijf}}"
                    className="flex h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-400">Gebruik {'{{nummer}}'} voor het factuurnummer, {'{{bedrijf}}'} voor je bedrijfsnaam</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Aanhef
                  </label>
                  <input
                    type="text"
                    value={instellingen.emailAanhef ?? ''}
                    onChange={(e) => updateVeld('emailAanhef', e.target.value)}
                    placeholder="Geachte {{naam}},"
                    className="flex h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-400">Gebruik {'{{naam}}'} voor de klantnaam</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Afsluitingstekst
                  </label>
                  <input
                    type="text"
                    value={instellingen.emailAfsluitingsTekst ?? ''}
                    onChange={(e) => updateVeld('emailAfsluitingsTekst', e.target.value)}
                    placeholder="Met vriendelijke groet,"
                    className="flex h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                  />
                </div>
                <Button
                  onClick={() => slaOp({ emailAanhef: instellingen.emailAanhef, emailAfsluitingsTekst: instellingen.emailAfsluitingsTekst, emailFactuurOnderwerp: instellingen.emailFactuurOnderwerp })}
                  disabled={opslaan}
                  className="gap-2"
                >
                  {opslaan && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sjabloon opslaan
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Factuur e-mail sjabloon</CardTitle>
                <CardDescription>Stel de volledige e-mailtekst in voor het versturen van facturen. Laat leeg voor de standaard opmaak.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    E-mailtekst factuur
                  </label>
                  <textarea
                    rows={6}
                    value={instellingen.emailFactuurTekst ?? ''}
                    onChange={(e) => updateVeld('emailFactuurTekst', e.target.value)}
                    placeholder={`Hierbij ontvangt u factuur {{nummer}} met een totaalbedrag van {{totaal}}.\n\nU kunt deze betalen vóór {{vervaldatum}}.\n\nHartelijk dank voor uw vertrouwen.`}
                    className="flex w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent resize-none"
                  />
                  <p className="mt-1 text-xs text-gray-400">Variabelen: {'{{naam}}'}, {'{{nummer}}'}, {'{{totaal}}'}, {'{{vervaldatum}}'}, {'{{bedrijf}}'}. De aanhef en afsluitingstekst worden automatisch toegevoegd.</p>
                </div>
                <Button
                  onClick={() => slaOp({ emailFactuurTekst: instellingen.emailFactuurTekst })}
                  disabled={opslaan}
                  className="gap-2"
                >
                  {opslaan && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sjabloon opslaan
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Betalingsherinnering sjabloon</CardTitle>
                <CardDescription>Stel de e-mailtekst in voor betalingsherinneringen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Onderwerp herinnering
                  </label>
                  <input
                    type="text"
                    value={instellingen.emailHerinneringOnderwerp ?? ''}
                    onChange={(e) => updateVeld('emailHerinneringOnderwerp', e.target.value)}
                    placeholder="Betalingsherinnering - Factuur {{factuurnummer}}"
                    className="flex h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-400">Gebruik {'{{factuurnummer}}'} voor het nummer</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tekst herinnering
                  </label>
                  <textarea
                    rows={5}
                    value={instellingen.emailHerinneringTekst ?? ''}
                    onChange={(e) => updateVeld('emailHerinneringTekst', e.target.value)}
                    placeholder={`Geachte {{naam}},\n\nWij attenderen u op onderstaande openstaande facturen.\n\nMet vriendelijke groet`}
                    className="flex w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent resize-none"
                  />
                  <p className="mt-1 text-xs text-gray-400">Beschikbare variabelen: {'{{naam}}'} (klantnaam), {'{{openstaand}}'} (totaal openstaand bedrag). De facturenlijst wordt automatisch toegevoegd.</p>
                </div>
                <Button
                  onClick={() => slaOp({ emailHerinneringOnderwerp: instellingen.emailHerinneringOnderwerp, emailHerinneringTekst: instellingen.emailHerinneringTekst })}
                  disabled={opslaan}
                  className="gap-2"
                >
                  {opslaan && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sjabloon opslaan
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Afspraakbevestiging sjabloon</CardTitle>
                <CardDescription>Stel de e-mailtekst in voor afspraakbevestigingen vanuit de agenda</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Onderwerp bevestiging
                  </label>
                  <input
                    type="text"
                    value={instellingen.emailBevestigingOnderwerp ?? ''}
                    onChange={(e) => updateVeld('emailBevestigingOnderwerp', e.target.value)}
                    placeholder="Afspraakbevestiging – {{onderwerp}}"
                    className="flex h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-400">Variabelen: {'{{onderwerp}}'} (afspraaknaam), {'{{naam}}'} (klantnaam)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tekst bevestiging
                  </label>
                  <textarea
                    rows={5}
                    value={instellingen.emailBevestigingTekst ?? ''}
                    onChange={(e) => updateVeld('emailBevestigingTekst', e.target.value)}
                    placeholder={`Hierbij bevestigen wij uw afspraak: {{onderwerp}}\n\nDatum & tijd: {{datum}}\nLocatie: {{locatie}}\n\nWij zien u graag verschijnen.`}
                    className="flex w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent resize-none"
                  />
                  <p className="mt-1 text-xs text-gray-400">Variabelen: {'{{naam}}'}, {'{{onderwerp}}'}, {'{{datum}}'}, {'{{locatie}}'}. Laat leeg voor de standaardtekst.</p>
                </div>
                <Button
                  onClick={() => slaOp({ emailBevestigingOnderwerp: instellingen.emailBevestigingOnderwerp, emailBevestigingTekst: instellingen.emailBevestigingTekst })}
                  disabled={opslaan}
                  className="gap-2"
                >
                  {opslaan && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sjabloon opslaan
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Google Agenda ── */}
        {actieveTab === "google" && (
          <div className="space-y-4">
            {/* Stap 1: Credentials */}
            <Card>
              <CardHeader>
                <CardTitle>Google OAuth-gegevens</CardTitle>
                <CardDescription>
                  Vereist om Google Agenda te koppelen. Maak een OAuth 2.0 client aan via de{" "}
                  <button
                    className="text-indigo-600 underline"
                    onClick={() => window.api.shell.openExternal("https://console.cloud.google.com/apis/credentials")}
                  >
                    Google Cloud Console
                  </button>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 space-y-1">
                  <p className="font-semibold">Instructies:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-700">
                    <li>Ga naar Google Cloud Console → APIs & Services → Credentials</li>
                    <li>Maak een "OAuth 2.0 Client ID" aan van type "Desktop application"</li>
                    <li>Kopieer de Client ID en Client Secret hieronder</li>
                    <li>Activeer de "Google Calendar API" in je project</li>
                  </ol>
                </div>
                <div className="grid gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Google Client ID</label>
                    <Input
                      value={instellingen.googleClientId ?? ""}
                      onChange={(e) => updateVeld("googleClientId", e.target.value)}
                      placeholder="123456789-abc....apps.googleusercontent.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Google Client Secret</label>
                    <Input
                      type="password"
                      value={googleSecretInput}
                      onChange={(e) => setGoogleSecretInput(e.target.value)}
                      onBlur={async () => {
                        if (googleSecretInput.trim()) {
                          try {
                            await window.api.instellingen.update({ googleClientSecret: googleSecretInput.trim() } as Record<string, unknown>);
                            setGoogleSecretInput("");
                            toonMelding("succes", "Client secret opgeslagen");
                          } catch (e: unknown) {
                            toonMelding("fout", `Client secret opslaan mislukt: ${e instanceof Error ? e.message : "onbekend"}`);
                          }
                        }
                      }}
                      placeholder="Plak of typ het client secret (wordt opgeslagen bij verlaten veld)"
                    />
                    <p className="text-xs text-gray-400 mt-1">Het secret wordt veilig opgeslagen en nooit getoond. Verlaat het veld om op te slaan.</p>
                  </div>
                </div>
                <Button
                  onClick={() => slaOp({ googleClientId: instellingen.googleClientId } as any)}
                  loading={opslaan}
                >
                  Gegevens opslaan
                </Button>
              </CardContent>
            </Card>

            {/* Stap 2: Koppelen */}
            <Card>
              <CardHeader>
                <CardTitle>Google Agenda</CardTitle>
                <CardDescription>Synchroniseer je afspraken met Google Calendar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {instellingen.googleGekoppeld ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 p-4">
                      <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-green-800">Verbonden met Google</p>
                        {instellingen.googleEmail && (
                          <p className="text-sm text-green-700">{instellingen.googleEmail}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">
                      Je Google Agenda is gekoppeld. Afspraken zijn zichtbaar in het Agenda-overzicht.
                    </p>
                    <Button variant="destructive" onClick={ontkoppelGoogle} loading={googleLaden}>
                      <Unlink className="h-4 w-4" />
                      Google Agenda ontkoppelen
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!instellingen.googleClientId && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                        ⚠ Vul eerst de Google Client ID en Client Secret in (bovenstaande kaart) voordat je koppelt.
                      </div>
                    )}
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                      <p>Na het klikken op de knop opent een browservenster. Log in bij Google en geef toestemming. De koppeling voltooit automatisch — je hoeft geen code te kopiëren.</p>
                    </div>
                    <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                      <li>Bekijk afspraken in het maandoverzicht</li>
                      <li>Maak facturen vanuit een afspraak</li>
                      <li>Zie reistijden en locaties</li>
                    </ul>
                    <Button
                      onClick={koppelGoogle}
                      loading={googleLaden}
                      disabled={!instellingen.googleClientId}
                    >
                      <Link className="h-4 w-4" />
                      {googleLaden ? "Wachten op Google toestemming..." : "Koppel Google Agenda"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── KOR ── */}
        {actieveTab === "kor" && (
          <Card>
            <CardHeader>
              <CardTitle>Kleineondernemersregeling (KOR)</CardTitle>
              <CardDescription>BTW-vrijstelling voor kleine ondernemers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 text-sm text-indigo-900 space-y-2">
                <p className="font-semibold">Wat is de KOR?</p>
                <p>
                  De Kleineondernemersregeling (KOR) is een BTW-vrijstelling voor ondernemers met een
                  jaarlijkse omzet onder de drempelwaarde (standaard €20.000). Als je de KOR toepast:
                </p>
                <ul className="list-disc list-inside space-y-1 text-indigo-800">
                  <li>Bereken je geen BTW op je facturen</li>
                  <li>Hoef je geen BTW-aangifte te doen</li>
                  <li>Kun je ook geen inkoop-BTW terugvragen</li>
                  <li>Vermeld je "BTW vrijgesteld o.g.v. artikel 25 Wet OB" op facturen</li>
                </ul>
                <p className="text-indigo-700">
                  Let op: je moet de KOR minimaal 3 jaar aanhouden nadat je je hebt aangemeld bij de Belastingdienst.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">KOR actief</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Schakel in als je bent aangemeld voor de KOR
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nieuw = !instellingen.korActief;
                    updateVeld("korActief", nieuw);
                    slaOp({ korActief: nieuw });
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    instellingen.korActief ? "bg-indigo-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      instellingen.korActief ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <Input
                label="KOR ingangsdatum"
                type="date"
                value={instellingen.korIngangsDatum ?? ""}
                onChange={(e) => updateVeld("korIngangsDatum", e.target.value)}
                onBlur={() => slaOp({ korIngangsDatum: instellingen.korIngangsDatum })}
                helperText="Datum waarop de KOR is ingegaan. Rapportages na deze datum tonen geen BTW meer."
              />

              <div>
                <Input
                  label="KOR drempelwaarde (jaarlijkse omzet)"
                  type="number"
                  min="0"
                  step="100"
                  prefix="€"
                  value={instellingen.korDrempel ?? 20000}
                  onChange={(e) => updateVeld("korDrempel", parseFloat(e.target.value))}
                  onBlur={() => slaOp({ korDrempel: instellingen.korDrempel })}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Standaard drempelwaarde is €20.000 (2024). Controleer de Belastingdienst voor de actuele grens.
                </p>
              </div>

              {instellingen.korActief && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    KOR is actief. AdminPro zal geen BTW berekenen op nieuwe facturen. Zorg dat je
                    bent aangemeld bij de Belastingdienst voordat je de KOR toepast.
                  </p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={() => slaOp({ korActief: instellingen.korActief, korDrempel: instellingen.korDrempel })} loading={opslaan}>
                  Opslaan
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Overig ── */}
        {actieveTab === "overig" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Car className="h-5 w-5" />
                  Kilometervergoeding
                </CardTitle>
                <CardDescription>Tarief voor zakelijke reiskosten per kilometer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                  <p>
                    De Belastingdienst hanteert een standaard vergoeding van <strong>€ 0,23 per km</strong> (2024).
                    Dit tarief wordt gebruikt bij de kilometerregistratie om de aftrekbare vergoeding te berekenen.
                  </p>
                </div>
                <Input
                  label="Kilometervergoeding (€ per km)"
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  prefix="€"
                  value={instellingen.kmVergoeding ?? 0.23}
                  onChange={(e) => updateVeld("kmVergoeding", parseFloat(e.target.value))}
                  onBlur={() => slaOp({ kmVergoeding: instellingen.kmVergoeding })}
                  placeholder="0.23"
                />
                <p className="text-xs text-gray-400">
                  Pas dit aan als je een ander tarief wilt hanteren, bijv. het hogere belastingvrije tarief voor motorfietsen (€ 0,23).
                </p>
                <div className="flex justify-end pt-2">
                  <Button onClick={() => slaOp({ kmVergoeding: instellingen.kmVergoeding })} loading={opslaan}>
                    Opslaan
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bankfeed automatisering</CardTitle>
                <CardDescription>Stel een map in die automatisch wordt bewaakt voor nieuwe bankafschriften (CSV). Bij een nieuw bestand verschijnt een melding.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bewaking map</label>
                  <div className="flex gap-2">
                    <input
                      value={instellingen.bankAfschriftenMap ?? ''}
                      readOnly
                      className="flex-1 h-9 rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-600"
                      placeholder="Geen map gekozen"
                    />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const result = await window.api.app.kiesPdfMap() as string | null;
                          if (result) {
                            updateVeld('bankAfschriftenMap', result);
                          }
                        } catch {
                          toonMelding('fout', 'Kon map niet selecteren');
                        }
                      }}
                    >
                      Kiezen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Geavanceerd ── */}
        {actieveTab === "geavanceerd" && (
          <div className="space-y-6">
            {/* Weergave */}
            <Card>
              <CardHeader>
                <CardTitle>Weergave</CardTitle>
                <CardDescription>Pas het uiterlijk van de app aan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Select
                    value={modus}
                    onValueChange={(v) => {
                      setModus(v as "systeem" | "licht" | "donker");
                      slaOp({ donkerModus: v });
                    }}
                  >
                    <SelectTrigger label="Kleurthema">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="systeem">Volg Windows</SelectItem>
                      <SelectItem value="licht">Altijd licht</SelectItem>
                      <SelectItem value="donker">Altijd donker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Opstarten met Windows</p>
                    <p className="text-xs text-gray-500 mt-0.5">Start de app automatisch wanneer Windows opstart</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      window.api.app.setAutoStart(!autoStart).then(() => setAutoStart(!autoStart)).catch(() => {});
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      autoStart ? "bg-indigo-600" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        autoStart ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Bedrijfslogo */}
            <Card>
              <CardHeader>
                <CardTitle>Bedrijfslogo</CardTitle>
                <CardDescription>Logo dat op facturen wordt afgedrukt</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {instellingen.logoBase64 && (
                  <img
                    src={instellingen.logoBase64}
                    alt="Bedrijfslogo"
                    className="h-16 mb-2 object-contain rounded border border-gray-200 p-1"
                  />
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Logo uploaden</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const base64 = reader.result as string;
                        updateVeld("logoBase64", base64);
                        slaOp({ logoBase64: base64 });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG — maximaal 2 MB aanbevolen</p>
                </div>
                {instellingen.logoBase64 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateVeld("logoBase64", "");
                      slaOp({ logoBase64: "" });
                    }}
                  >
                    Logo verwijderen
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Factuurnummer formaat */}
            <Card>
              <CardHeader>
                <CardTitle>Factuurnummer</CardTitle>
                <CardDescription>Stel het formaat en volgend nummer in</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Factuurnummer prefix"
                    value={instellingen.factuurPrefix ?? ""}
                    onChange={(e) => updateVeld("factuurPrefix", e.target.value)}
                    onBlur={() => slaOp({ factuurPrefix: instellingen.factuurPrefix })}
                    placeholder="F"
                  />
                  <Input
                    label="Volgend factuurnummer"
                    type="number"
                    min="1"
                    value={instellingen.factuurVolgNummer ?? ""}
                    onChange={(e) => updateVeld("factuurVolgNummer", Number(e.target.value))}
                    onBlur={() => slaOp({ factuurVolgNummer: instellingen.factuurVolgNummer })}
                    placeholder="1"
                  />
                </div>
              </CardContent>
            </Card>

            {/* PDF-opslagmap */}
            <Card>
              <CardHeader>
                <CardTitle>PDF-opslag</CardTitle>
                <CardDescription>Locatie voor opgeslagen PDF-facturen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PDF-opslagmap</label>
                  <div className="flex gap-2">
                    <input
                      value={instellingen.pdfMapPad || "Standaard (Documenten)"}
                      readOnly
                      className="flex-1 h-9 rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-600"
                    />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const pad = await window.api.app.kiesPdfMap() as string | null;
                          if (pad) {
                            updateVeld("pdfMapPad", pad);
                            slaOp({ pdfMapPad: pad });
                          }
                        } catch {
                          toonMelding("fout", "Kon map niet selecteren");
                        }
                      }}
                    >
                      Map kiezen
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KOR-waarschuwing */}
            <Card>
              <CardHeader>
                <CardTitle>KOR-drempel waarschuwing</CardTitle>
                <CardDescription>Melding bij nadering van de KOR-drempel</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Waarschuw bij nadering KOR-drempel</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Ontvang een melding als je omzet de KOR-drempel nadert
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nieuw = !instellingen.korWaarschuwing;
                      updateVeld("korWaarschuwing", nieuw);
                      slaOp({ korWaarschuwing: nieuw });
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      instellingen.korWaarschuwing ? "bg-indigo-600" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        instellingen.korWaarschuwing ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Jaarlijkse export */}
            <Card>
              <CardHeader>
                <CardTitle>Jaarlijkse export</CardTitle>
                <CardDescription>Exporteer alle boekhouding van een jaar naar Excel of PDF-archief</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {exportMelding && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                    {exportMelding}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jaar selecteren</label>
                  <select
                    value={exportJaar}
                    onChange={(e) => setExportJaar(parseInt(e.target.value))}
                    className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((jaar) => (
                      <option key={jaar} value={jaar}>{jaar}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const result = await window.api.app.exporteerExcel(exportJaar) as { succes?: boolean; geannuleerd?: boolean; pad?: string; fout?: string };
                        if (result.geannuleerd) return;
                        if (result.succes) {
                          toonMelding("succes", `Excel geëxporteerd naar: ${result.pad}`);
                        } else {
                          toonMelding("fout", result.fout ?? "Excel export mislukt");
                        }
                      } catch (e: unknown) {
                        toonMelding("fout", e instanceof Error ? e.message : "Excel export mislukt");
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exporteer naar Excel (.xlsx)
                  </Button>
                  <Button
                    variant="outline"
                    loading={pdfArchiefLaden}
                    onClick={async () => {
                      setPdfArchiefLaden(true);
                      setExportMelding(`Bezig met genereren van PDFs voor ${exportJaar}... Dit kan even duren.`);
                      try {
                        const result = await window.api.app.exportPdfArchief(exportJaar) as { succes?: boolean; geannuleerd?: boolean; pad?: string; aantalPdfs?: number; fout?: string };
                        setExportMelding(null);
                        if (result.geannuleerd) return;
                        if (result.succes) {
                          toonMelding("succes", `PDF-archief aangemaakt met ${result.aantalPdfs ?? ""} PDFs: ${result.pad}`);
                        } else {
                          toonMelding("fout", result.fout ?? "PDF-archief mislukt");
                        }
                      } catch (e: unknown) {
                        setExportMelding(null);
                        toonMelding("fout", e instanceof Error ? e.message : "PDF-archief mislukt");
                      } finally {
                        setPdfArchiefLaden(false);
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    PDF-archief aanmaken
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Testdata wissen */}
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-700">Testdata wissen</CardTitle>
                <CardDescription>Verwijder alle geïmporteerde of aangemaakte gegevens. Alleen gebruiken tijdens het testen.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {wissenMelding && (
                  <div className={`rounded-lg px-4 py-3 text-sm ${wissenMelding.type === "succes" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
                    {wissenMelding.tekst}
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    onClick={async () => {
                      if (!confirm("Weet je zeker dat je ALLE inkomen-records wilt verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
                      try {
                        const result = await window.api.inkomen.deleteAll() as { succes: boolean; count: number };
                        setWissenMelding({ type: "succes", tekst: `${result.count} inkomen-records verwijderd.` });
                      } catch {
                        setWissenMelding({ type: "fout", tekst: "Wissen van inkomen mislukt." });
                      }
                    }}
                  >
                    Alle inkomen wissen
                  </Button>
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    onClick={async () => {
                      if (!confirm("Weet je zeker dat je ALLE uitgaven wilt verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
                      try {
                        const result = await window.api.uitgaven.deleteAll() as { succes: boolean; count: number };
                        setWissenMelding({ type: "succes", tekst: `${result.count} uitgaven verwijderd.` });
                      } catch {
                        setWissenMelding({ type: "fout", tekst: "Wissen van uitgaven mislukt." });
                      }
                    }}
                  >
                    Alle uitgaven wissen
                  </Button>
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    onClick={async () => {
                      if (!confirm("Weet je zeker dat je ALLE facturen wilt verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
                      try {
                        const result = await window.api.facturen.deleteAll() as { succes: boolean; count: number };
                        setWissenMelding({ type: "succes", tekst: `${result.count} facturen verwijderd.` });
                      } catch {
                        setWissenMelding({ type: "fout", tekst: "Wissen van facturen mislukt." });
                      }
                    }}
                  >
                    Alle facturen wissen
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Data & beveiliging */}
            <Card>
              <CardHeader>
                <CardTitle>Data &amp; beveiliging</CardTitle>
                <CardDescription>Maak een backup of exporteer al je gegevens naar CSV</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const result = await window.api.app.backup() as { succes: boolean; pad?: string };
                      if (result.succes) {
                        toonMelding("succes", `Backup opgeslagen: ${result.pad}`);
                      } else {
                        toonMelding("fout", "Backup mislukt");
                      }
                    } catch {
                      toonMelding("fout", "Backup mislukt");
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Database backup (.db)
                </Button>
                <div>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const result = await window.api.app.exporteerData() as { succes?: boolean; geannuleerd?: boolean; pad?: string };
                        if (result.geannuleerd) return;
                        if (result.succes) {
                          toonMelding("succes", `Data geëxporteerd naar: ${result.pad}`);
                        } else {
                          toonMelding("fout", "Export mislukt");
                        }
                      } catch {
                        toonMelding("fout", "Export mislukt");
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exporteer alles naar CSV
                  </Button>
                  <p className="text-xs text-gray-500 mt-1">
                    Klanten, facturen, uren, km, inkomen, uitgaven — te openen in Excel
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {actieveTab === "navigatie" && (() => {
          const verborgen: string[] = JSON.parse(instellingen.verborgenPaginas ?? '[]');
          const togglePagina = (href: string) => {
            const nieuw = verborgen.includes(href)
              ? verborgen.filter(h => h !== href)
              : [...verborgen, href];
            updateVeld('verborgenPaginas', JSON.stringify(nieuw));
          };
          return (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Navigatie verbergen</CardTitle>
                  <CardDescription>
                    Verborgen pagina's verdwijnen uit het hoofdmenu en zijn terug te vinden onder "Meer" onderaan de sidebar.
                    Dashboard en Instellingen kunnen niet worden verborgen.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ALLE_PAGINAS.map(pagina => {
                    const isVerborgen = verborgen.includes(pagina.href);
                    return (
                      <div
                        key={pagina.href}
                        className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                      >
                        <span className="text-sm font-medium">{pagina.naam}</span>
                        <button
                          onClick={() => togglePagina(pagina.href)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isVerborgen
                              ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                              : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                          }`}
                        >
                          {isVerborgen
                            ? <><EyeOff className="h-3.5 w-3.5" /> Verborgen</>
                            : <><Eye className="h-3.5 w-3.5" /> Zichtbaar</>
                          }
                        </button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          );
        })()}

        {actieveTab === "bank" && (
          <div className="space-y-4">
            <KolomConfigurator
              titel="Inkomsten kolomweergave"
              omschrijving="Kies welke velden zichtbaar zijn in het inkomstenoverzicht na een bankimport, en bepaal de volgorde."
              allVelden={ALLE_BANK_VELDEN}
              velden={bankVeldenLijst}
              setVelden={setBankVeldenLijst}
            />
            <KolomConfigurator
              titel="Uitgaven kolomweergave"
              omschrijving="Kies welke velden zichtbaar zijn in het uitgavenoverzicht, en bepaal de volgorde."
              allVelden={ALLE_UITGAVEN_VELDEN}
              velden={uitgavenVeldenLijst}
              setVelden={setUitgavenVeldenLijst}
            />
            <div>
              <Button
                loading={opslaan}
                onClick={async () => {
                  await slaOp({
                    bankWeergaveVelden: JSON.stringify(bankVeldenLijst),
                    uitgavenWeergaveVelden: JSON.stringify(uitgavenVeldenLijst),
                  });
                  window.dispatchEvent(new CustomEvent('bankVeldenGewijzigd'));
                }}
              >
                Toepassen
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Spaarrekeningen</CardTitle>
                <CardDescription>
                  Voeg IBAN-nummers of namen van tegenpartijen toe. Transacties waarbij de tegenrekening of naam overeenkomt worden als spaaroverschrijving herkend.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const lijst: string[] = (() => { try { return JSON.parse(instellingen.spaarrekeningen ?? '[]') } catch { return [] } })();
                  return (
                    <>
                      {lijst.length === 0 ? (
                        <p className="text-sm text-gray-400">Geen spaarrekeningen toegevoegd.</p>
                      ) : (
                        <div className="space-y-1">
                          {lijst.map((iban) => (
                            <div key={iban} className="flex items-center justify-between py-2 px-3 rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                              <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{iban}
                                <span className="ml-2 text-xs font-sans text-gray-400">{/^[A-Z]{2}\d{2}/.test(iban) ? "IBAN" : "naam tegenpartij"}</span>
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  const nieuw = lijst.filter(r => r !== iban);
                                  updateVeld('spaarrekeningen', JSON.stringify(nieuw));
                                  await slaOp({ spaarrekeningen: JSON.stringify(nieuw) });
                                  window.dispatchEvent(new CustomEvent('bankVeldenGewijzigd'));
                                }}
                                className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none"
                                title="Verwijderen"
                              >×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={nieuweSpaarrekening}
                          onChange={(e) => setNieuweSpaarrekening(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              const iban = nieuweSpaarrekening.trim().toUpperCase();
                              if (!iban) return;
                              const nieuw = [...lijst, iban];
                              updateVeld('spaarrekeningen', JSON.stringify(nieuw));
                              await slaOp({ spaarrekeningen: JSON.stringify(nieuw) });
                              setNieuweSpaarrekening("");
                              window.dispatchEvent(new CustomEvent('bankVeldenGewijzigd'));
                            }
                          }}
                          placeholder="NL00 BANK 0000 0000 00 of naam tegenpartij"
                          className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            const iban = nieuweSpaarrekening.trim().toUpperCase();
                            if (!iban) return;
                            const nieuw = [...lijst, iban];
                            updateVeld('spaarrekeningen', JSON.stringify(nieuw));
                            await slaOp({ spaarrekeningen: JSON.stringify(nieuw) });
                            setNieuweSpaarrekening("");
                            window.dispatchEvent(new CustomEvent('bankVeldenGewijzigd'));
                          }}
                        >
                          Toevoegen
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

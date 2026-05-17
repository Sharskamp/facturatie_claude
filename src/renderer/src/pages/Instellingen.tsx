import { useState, useEffect, useCallback } from "react";
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
  Bot,
  MoreHorizontal,
  Car,
  Download,
  Settings,
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

type Tab = "bedrijf" | "facturen" | "email" | "google" | "kor" | "ai" | "overig" | "geavanceerd";

const TAB_CONFIG: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "bedrijf", label: "Bedrijfsgegevens", icon: Building2 },
  { id: "facturen", label: "Facturen", icon: FileText },
  { id: "email", label: "Email", icon: Mail },
  { id: "google", label: "Google Agenda", icon: Calendar },
  { id: "kor", label: "KOR", icon: Calculator },
  { id: "ai", label: "AI / OCR", icon: Bot },
  { id: "overig", label: "Overig", icon: MoreHorizontal },
  { id: "geavanceerd", label: "Geavanceerd", icon: Settings },
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
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  // Google
  googleGekoppeld?: boolean;
  googleEmail?: string;
  // KOR
  korActief?: boolean;
  korDrempel?: number;
  // AI / OCR
  anthropicApiKey?: string;
  // Overig
  kmVergoeding?: number;
  // Geavanceerd
  pdfMapPad?: string;
  mollieApiKey?: string;
  logoBase64?: string;
  korWaarschuwing?: boolean;
  factuurVolgNummer?: number;
  donkerModus?: string;
  autoStart?: boolean;
}

export default function InstellingenPagina() {
  const { modus, setModus } = useTheme();
  const [actieveTab, setActieveTab] = useState<Tab>("bedrijf");
  const [instellingen, setInstellingen] = useState<Instellingen>({});
  const [laden, setLaden] = useState(true);
  const [opslaan, setOpslaan] = useState(false);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [emailTestStatus, setEmailTestStatus] = useState<"idle" | "laden" | "succes" | "fout">("idle");
  const [googleLaden, setGoogleLaden] = useState(false);
  const [autoStart, setAutoStart] = useState(false);

  const haalInstellingenOp = useCallback(async () => {
    try {
      const data = await window.api.instellingen.get();
      setInstellingen(data ?? {});
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
    window.api.app.getAutoStart().then(setAutoStart).catch(() => {});
  }, []);

  const toonMelding = (type: "succes" | "fout", tekst: string) => {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 5000);
  };

  const slaOp = async (velden: Partial<Instellingen>) => {
    setOpslaan(true);
    try {
      const data = await window.api.instellingen.update(velden);
      setInstellingen((prev) => ({ ...prev, ...data }));
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
      await window.api.instellingen.update({
        actie: "test-email",
        smtpHost: instellingen.smtpHost,
        smtpPort: instellingen.smtpPort,
        smtpSecure: instellingen.smtpSecure,
        smtpUser: instellingen.smtpUser,
        smtpPass: instellingen.smtpPass,
        email: instellingen.email,
      } as any);
      setEmailTestStatus("succes");
      setTimeout(() => setEmailTestStatus("idle"), 4000);
    } catch {
      setEmailTestStatus("fout");
      setTimeout(() => setEmailTestStatus("idle"), 4000);
    }
  };

  const koppelGoogle = async () => {
    setGoogleLaden(true);
    try {
      const data = await window.api.instellingen.update({ actie: "google-koppelen" } as any);
      if ((data as any).redirectUrl) {
        window.api.shell.openExternal((data as any).redirectUrl);
      } else {
        toonMelding("fout", "Kon Google OAuth niet starten");
      }
    } catch {
      toonMelding("fout", "Verbindingsfout");
    } finally {
      setGoogleLaden(false);
    }
  };

  const ontkoppelGoogle = async () => {
    if (!confirm("Weet je zeker dat je Google Agenda wilt ontkoppelen?")) return;
    setGoogleLaden(true);
    try {
      await window.api.instellingen.update({ actie: "google-ontkoppelen" } as any);
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

      <div className="flex-1 p-6 space-y-6 max-w-4xl mx-auto w-full">
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
                <Input
                  label="BTW-nummer"
                  value={instellingen.btwNummer ?? ""}
                  onChange={(e) => updateVeld("btwNummer", e.target.value)}
                  onBlur={() => slaOp({ btwNummer: instellingen.btwNummer })}
                  placeholder="NL123456789B01"
                />
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

              <div className="flex justify-end pt-2">
                <Button onClick={() => slaOp(instellingen)} loading={opslaan}>
                  Opslaan
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Email / SMTP ── */}
        {actieveTab === "email" && (
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
                    value={instellingen.smtpHost ?? ""}
                    onChange={(e) => updateVeld("smtpHost", e.target.value)}
                    onBlur={() => slaOp({ smtpHost: instellingen.smtpHost })}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <Input
                  label="Poort"
                  type="number"
                  value={instellingen.smtpPort ?? 587}
                  onChange={(e) => updateVeld("smtpPort", parseInt(e.target.value))}
                  onBlur={() => slaOp({ smtpPort: instellingen.smtpPort })}
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
                    const nieuw = !instellingen.smtpSecure;
                    updateVeld("smtpSecure", nieuw);
                    slaOp({ smtpSecure: nieuw });
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    instellingen.smtpSecure ? "bg-indigo-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      instellingen.smtpSecure ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Gebruikersnaam / E-mail"
                  type="email"
                  value={instellingen.smtpUser ?? ""}
                  onChange={(e) => updateVeld("smtpUser", e.target.value)}
                  onBlur={() => slaOp({ smtpUser: instellingen.smtpUser })}
                  placeholder="jij@gmail.com"
                />
                <Input
                  label="Wachtwoord / App-wachtwoord"
                  type="password"
                  value={instellingen.smtpPass ?? ""}
                  onChange={(e) => updateVeld("smtpPass", e.target.value)}
                  onBlur={() => slaOp({ smtpPass: instellingen.smtpPass })}
                  placeholder="••••••••••••"
                />
              </div>

              <div className="flex flex-wrap gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={testEmail}
                  disabled={emailTestStatus === "laden" || !instellingen.smtpHost}
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
        )}

        {/* ── Google Agenda ── */}
        {actieveTab === "google" && (
          <Card>
            <CardHeader>
              <CardTitle>Google Agenda</CardTitle>
              <CardDescription>Synchroniseer je afspraken met Google Calendar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {instellingen.googleGekoppeld ? (
                /* Verbonden */
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
                    Je Google Agenda is gekoppeld. Afspraken worden automatisch gesynchroniseerd en
                    zijn zichtbaar in het Agenda-overzicht.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={ontkoppelGoogle}
                    loading={googleLaden}
                  >
                    <Unlink className="h-4 w-4" />
                    Google Agenda ontkoppelen
                  </Button>
                </div>
              ) : (
                /* Niet verbonden */
                <div className="space-y-4">
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-3">
                    <h3 className="font-semibold text-gray-900">Koppel je Google Agenda</h3>
                    <p className="text-sm text-gray-600">
                      Door je Google Agenda te koppelen kun je al je afspraken bekijken in AdminPro
                      en direct facturen aanmaken vanuit een afspraak.
                    </p>
                    <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                      <li>Bekijk afspraken in het maandoverzicht</li>
                      <li>Maak facturen vanuit een afspraak</li>
                      <li>Zie reistijden en locaties</li>
                    </ul>
                  </div>
                  <Button onClick={koppelGoogle} loading={googleLaden} className="gap-2">
                    <Link className="h-4 w-4" />
                    Koppel Google Agenda
                  </Button>
                  <p className="text-xs text-gray-400">
                    Je wordt doorgestuurd naar Google om toestemming te geven. AdminPro krijgt
                    alleen leestoegang tot je agenda.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
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
        )}

        {/* ── AI / OCR ── */}
        {actieveTab === "ai" && (
          <Card>
            <CardHeader>
              <CardTitle>AI / OCR — Bon scannen</CardTitle>
              <CardDescription>Gebruik Claude Vision om bonnen automatisch uit te lezen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 text-sm text-indigo-900 space-y-2">
                <p className="font-semibold">Hoe werkt het?</p>
                <p>
                  Na het uploaden van een bon kun je op "Scannen" klikken. AdminPro stuurt de
                  afbeelding naar de Claude Vision API en leest automatisch het bedrag,
                  de leverancier en de datum uit.
                </p>
                <p className="text-indigo-700">
                  Vereist een Anthropic API-sleutel. Maak er een aan op{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => window.api.shell.openExternal("https://console.anthropic.com/")}
                  >
                    console.anthropic.com
                  </button>
                  .
                </p>
              </div>

              <Input
                label="Anthropic API sleutel"
                type="password"
                value={instellingen.anthropicApiKey ?? ""}
                onChange={(e) => updateVeld("anthropicApiKey", e.target.value)}
                onBlur={() => slaOp({ anthropicApiKey: instellingen.anthropicApiKey })}
                placeholder="sk-ant-api03-..."
              />
              <p className="text-xs text-gray-400">
                De sleutel wordt veilig lokaal opgeslagen. Ondersteunde formaten: JPG, PNG, WEBP (geen PDF).
              </p>

              <div className="flex justify-end pt-2">
                <Button onClick={() => slaOp({ anthropicApiKey: instellingen.anthropicApiKey })} loading={opslaan}>
                  Opslaan
                </Button>
              </div>
            </CardContent>
          </Card>
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

            {/* Mollie API-sleutel */}
            <Card>
              <CardHeader>
                <CardTitle>Betaalintegratie</CardTitle>
                <CardDescription>iDEAL betaallinks via Mollie</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Input
                    label="Mollie API-sleutel"
                    type="password"
                    value={instellingen.mollieApiKey ?? ""}
                    onChange={(e) => updateVeld("mollieApiKey", e.target.value)}
                    onBlur={() => slaOp({ mollieApiKey: instellingen.mollieApiKey })}
                    placeholder="live_..."
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Voor iDEAL betaallinks op facturen (optioneel). Maak een API-sleutel aan op{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => window.api.shell.openExternal("https://mollie.com/")}
                    >
                      mollie.com
                    </button>
                    .
                  </p>
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
      </div>
    </div>
  );
}

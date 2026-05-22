import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Eye, EyeOff, Loader2, ChevronRight, ChevronLeft, Check, Upload } from "lucide-react";
import { useAuth } from "@/context/auth";

interface FormulierData {
  naam: string;
  email: string;
  wachtwoord: string;
  bedrijfsnaam: string;
  kvkNummer: string;
  btwNummer: string;
  iban: string;
  adres: string;
  postcode: string;
  stad: string;
  telefoon: string;
  website: string;
  logoBase64: string;
}

const LEEG: FormulierData = {
  naam: "",
  email: "",
  wachtwoord: "",
  bedrijfsnaam: "",
  kvkNummer: "",
  btwNummer: "",
  iban: "",
  adres: "",
  postcode: "",
  stad: "",
  telefoon: "",
  website: "",
  logoBase64: "",
};

const STAPPEN = [
  "Persoonlijke info",
  "Bedrijfsgegevens",
  "Adres & contact",
  "Logo & afronden",
];

export default function Setup() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [stap, setStap] = useState(0);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [toonWachtwoord, setToonWachtwoord] = useState(false);
  const [formulier, setFormulier] = useState<FormulierData>(LEEG);

  function stel(veld: keyof FormulierData, waarde: string) {
    setFormulier((prev) => ({ ...prev, [veld]: waarde }));
  }

  function valideerStap(): string | null {
    if (stap === 0) {
      if (!formulier.naam.trim()) return "Naam is verplicht";
      if (!formulier.email.trim()) return "E-mailadres is verplicht";
      if (!formulier.wachtwoord || formulier.wachtwoord.length < 8)
        return "Wachtwoord moet minimaal 8 tekens bevatten";
    }
    return null;
  }

  function volgende() {
    const validatieFout = valideerStap();
    if (validatieFout) {
      setFout(validatieFout);
      return;
    }
    setFout("");
    setStap((s) => Math.min(s + 1, STAPPEN.length - 1));
  }

  function terug() {
    setFout("");
    setStap((s) => Math.max(s - 1, 0));
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    const lezer = new FileReader();
    lezer.onload = () => {
      stel("logoBase64", lezer.result as string);
    };
    lezer.readAsDataURL(bestand);
  }

  async function handleSetup() {
    setBezig(true);
    setFout("");
    try {
      await window.api.auth.setup({
        naam: formulier.naam,
        email: formulier.email,
        wachtwoord: formulier.wachtwoord,
        bedrijfsnaam: formulier.bedrijfsnaam || undefined,
        ...(formulier.kvkNummer && { kvkNummer: formulier.kvkNummer }),
        ...(formulier.btwNummer && { btwNummer: formulier.btwNummer }),
        ...(formulier.iban && { iban: formulier.iban }),
        ...(formulier.adres && { adres: formulier.adres }),
        ...(formulier.postcode && { postcode: formulier.postcode }),
        ...(formulier.stad && { stad: formulier.stad }),
        ...(formulier.telefoon && { telefoon: formulier.telefoon }),
        ...(formulier.website && { website: formulier.website }),
        ...(formulier.logoBase64 && { logoBase64: formulier.logoBase64 }),
      } as Parameters<typeof window.api.auth.setup>[0]);
      const user = await window.api.auth.login(formulier.email, formulier.wachtwoord);
      login(user);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setFout(err instanceof Error ? err.message : "Setup mislukt");
      setBezig(false);
    }
  }

  const inputKlasse =
    "w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4 shadow-lg">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Streamline Facturatie</h1>
          <p className="text-gray-500 mt-1">Stel je account in</p>
        </div>

        {/* Stap-indicator */}
        <div className="flex items-center justify-center mb-8 gap-2">
          {STAPPEN.map((naam, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                  i < stap
                    ? "bg-indigo-600 text-white"
                    : i === stap
                    ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {i < stap ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STAPPEN.length - 1 && (
                <div
                  className={`h-0.5 w-8 transition-colors ${
                    i < stap ? "bg-indigo-600" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">{STAPPEN[stap]}</h2>
          <p className="text-sm text-gray-400 mb-6">Stap {stap + 1} van {STAPPEN.length}</p>

          {fout && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
              {fout}
            </div>
          )}

          {/* Stap 1: Persoonlijke info */}
          {stap === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Naam *</label>
                <input
                  type="text"
                  required
                  value={formulier.naam}
                  onChange={(e) => stel("naam", e.target.value)}
                  placeholder="Jan de Vries"
                  className={inputKlasse}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres *</label>
                <input
                  type="email"
                  required
                  value={formulier.email}
                  onChange={(e) => stel("email", e.target.value)}
                  placeholder="jan@bedrijf.nl"
                  className={inputKlasse}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Wachtwoord *</label>
                <div className="relative">
                  <input
                    type={toonWachtwoord ? "text" : "password"}
                    required
                    minLength={8}
                    value={formulier.wachtwoord}
                    onChange={(e) => stel("wachtwoord", e.target.value)}
                    placeholder="Minimaal 8 tekens"
                    className={`${inputKlasse} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setToonWachtwoord(!toonWachtwoord)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {toonWachtwoord ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stap 2: Bedrijfsgegevens */}
          {stap === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijfsnaam</label>
                <input
                  type="text"
                  value={formulier.bedrijfsnaam}
                  onChange={(e) => stel("bedrijfsnaam", e.target.value)}
                  placeholder="Jouw Bedrijf B.V."
                  className={inputKlasse}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KvK-nummer</label>
                <input
                  type="text"
                  value={formulier.kvkNummer}
                  onChange={(e) => stel("kvkNummer", e.target.value)}
                  placeholder="12345678"
                  className={inputKlasse}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">BTW-nummer</label>
                <input
                  type="text"
                  value={formulier.btwNummer}
                  onChange={(e) => stel("btwNummer", e.target.value)}
                  placeholder="NL123456789B01"
                  className={inputKlasse}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                <input
                  type="text"
                  value={formulier.iban}
                  onChange={(e) => stel("iban", e.target.value)}
                  placeholder="NL91 ABNA 0417 1643 00"
                  className={inputKlasse}
                />
              </div>
            </div>
          )}

          {/* Stap 3: Adres & contact */}
          {stap === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                <input
                  type="text"
                  value={formulier.adres}
                  onChange={(e) => stel("adres", e.target.value)}
                  placeholder="Hoofdstraat 1"
                  className={inputKlasse}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                  <input
                    type="text"
                    value={formulier.postcode}
                    onChange={(e) => stel("postcode", e.target.value)}
                    placeholder="1234 AB"
                    className={inputKlasse}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stad</label>
                  <input
                    type="text"
                    value={formulier.stad}
                    onChange={(e) => stel("stad", e.target.value)}
                    placeholder="Amsterdam"
                    className={inputKlasse}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefoonnummer</label>
                <input
                  type="tel"
                  value={formulier.telefoon}
                  onChange={(e) => stel("telefoon", e.target.value)}
                  placeholder="+31 6 12345678"
                  className={inputKlasse}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input
                  type="url"
                  value={formulier.website}
                  onChange={(e) => stel("website", e.target.value)}
                  placeholder="https://www.bedrijf.nl"
                  className={inputKlasse}
                />
              </div>
            </div>
          )}

          {/* Stap 4: Logo & afronden */}
          {stap === 3 && (
            <div className="space-y-6">
              {/* Logo upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bedrijfslogo</label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                  {formulier.logoBase64 ? (
                    <img
                      src={formulier.logoBase64}
                      alt="Logo"
                      className="max-h-24 max-w-full object-contain rounded"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Upload className="h-8 w-8" />
                      <span className="text-sm">Klik om een logo te uploaden</span>
                      <span className="text-xs">PNG, JPG, SVG</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Samenvatting */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Samenvatting</h3>
                {[
                  { label: "Naam", waarde: formulier.naam },
                  { label: "E-mail", waarde: formulier.email },
                  { label: "Bedrijfsnaam", waarde: formulier.bedrijfsnaam },
                  { label: "KvK-nummer", waarde: formulier.kvkNummer },
                  { label: "BTW-nummer", waarde: formulier.btwNummer },
                  { label: "IBAN", waarde: formulier.iban },
                  { label: "Adres", waarde: formulier.adres },
                  { label: "Postcode", waarde: formulier.postcode },
                  { label: "Stad", waarde: formulier.stad },
                  { label: "Telefoon", waarde: formulier.telefoon },
                  { label: "Website", waarde: formulier.website },
                ]
                  .filter((r) => r.waarde)
                  .map((r) => (
                    <div key={r.label} className="flex justify-between text-sm">
                      <span className="text-gray-500">{r.label}</span>
                      <span className="font-medium text-gray-800 truncate max-w-[55%] text-right">{r.waarde}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Navigatieknoppen */}
          <div className="flex justify-between mt-8 gap-3">
            <button
              type="button"
              onClick={terug}
              disabled={stap === 0}
              className="flex items-center gap-2 px-4 h-11 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Terug
            </button>

            {stap < STAPPEN.length - 1 ? (
              <button
                type="button"
                onClick={volgende}
                className="flex items-center gap-2 px-6 h-11 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                Volgende
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSetup}
                disabled={bezig}
                className="flex items-center gap-2 px-6 h-11 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {bezig ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Klaar!
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Streamline Facturatie — Persoonlijke administratiesoftware
        </p>
      </div>
    </div>
  );
}

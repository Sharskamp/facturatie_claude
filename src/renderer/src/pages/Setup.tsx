import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth";

export default function Setup() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [toonWachtwoord, setToonWachtwoord] = useState(false);
  const [formulier, setFormulier] = useState({
    naam: "",
    email: "",
    wachtwoord: "",
    bedrijfsnaam: "",
  });

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      const result = await window.api.auth.setup(formulier);
      // Automatisch inloggen na setup
      const user = await window.api.auth.login(formulier.email, formulier.wachtwoord);
      login(user);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setFout(err instanceof Error ? err.message : "Setup mislukt");
      setBezig(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4 shadow-lg">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">AdminPro</h1>
          <p className="text-gray-500 mt-1">Stel je account in</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Account aanmaken</h2>
          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Naam</label>
              <input
                type="text"
                required
                value={formulier.naam}
                onChange={(e) => setFormulier({ ...formulier, naam: e.target.value })}
                placeholder="Jan de Vries"
                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijfsnaam</label>
              <input
                type="text"
                value={formulier.bedrijfsnaam}
                onChange={(e) => setFormulier({ ...formulier, bedrijfsnaam: e.target.value })}
                placeholder="Jouw Bedrijf B.V."
                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres</label>
              <input
                type="email"
                required
                value={formulier.email}
                onChange={(e) => setFormulier({ ...formulier, email: e.target.value })}
                placeholder="jan@bedrijf.nl"
                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wachtwoord</label>
              <div className="relative">
                <input
                  type={toonWachtwoord ? "text" : "password"}
                  required
                  minLength={8}
                  value={formulier.wachtwoord}
                  onChange={(e) => setFormulier({ ...formulier, wachtwoord: e.target.value })}
                  placeholder="Minimaal 8 tekens"
                  className="w-full h-10 px-3 pr-10 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

            {fout && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{fout}</p>
            )}

            <button
              type="submit"
              disabled={bezig}
              className="w-full h-11 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {bezig && <Loader2 className="h-4 w-4 animate-spin" />}
              Account aanmaken
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          AdminPro — Persoonlijke administratiesoftware
        </p>
      </div>
    </div>
  );
}

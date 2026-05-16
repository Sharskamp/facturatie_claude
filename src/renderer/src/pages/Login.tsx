import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [toonWachtwoord, setToonWachtwoord] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", wachtwoord: "" });

  useEffect(() => {
    window.api.auth.setupStatus().then((d) => {
      if (!d.geconfigureerd) navigate("/setup", { replace: true });
    });
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      const user = await window.api.auth.login(loginForm.email, loginForm.wachtwoord);
      login(user);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      setFout(err instanceof Error ? err.message : "Onjuist e-mailadres of wachtwoord");
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
          <p className="text-gray-500 mt-1">Jouw administratie op één plek</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Inloggen</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres</label>
              <input
                type="email"
                required
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
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
                  value={loginForm.wachtwoord}
                  onChange={(e) => setLoginForm({ ...loginForm, wachtwoord: e.target.value })}
                  placeholder="••••••••"
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
              Inloggen
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

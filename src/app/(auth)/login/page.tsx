"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPagina() {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [toonWachtwoord, setToonWachtwoord] = useState(false);
  const [setupModus, setSetupModus] = useState(false);
  const [setupBezig, setSetupBezig] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: "", wachtwoord: "" });
  const [setupForm, setSetupForm] = useState({
    naam: "",
    email: "",
    wachtwoord: "",
    bedrijfsnaam: "",
  });

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        if (!d.geconfigureerd) setSetupModus(true);
      });
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");

    const result = await signIn("credentials", {
      email: loginForm.email,
      wachtwoord: loginForm.wachtwoord,
      redirect: false,
    });

    if (result?.error) {
      setFout("Onjuist e-mailadres of wachtwoord");
      setBezig(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setSetupBezig(true);
    setFout("");

    const response = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setupForm),
    });

    if (response.ok) {
      await signIn("credentials", {
        email: setupForm.email,
        wachtwoord: setupForm.wachtwoord,
        redirect: false,
      });
      router.push("/");
      router.refresh();
    } else {
      const data = await response.json();
      setFout(data.fout ?? "Setup mislukt");
      setSetupBezig(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4 shadow-lg">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">AdminPro</h1>
          <p className="text-gray-500 mt-1">
            {setupModus ? "Stel je account in" : "Jouw administratie op één plek"}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {setupModus ? (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Account aanmaken</h2>
              <form onSubmit={handleSetup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Naam</label>
                  <input
                    type="text"
                    required
                    value={setupForm.naam}
                    onChange={(e) => setSetupForm({ ...setupForm, naam: e.target.value })}
                    placeholder="Jan de Vries"
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bedrijfsnaam
                  </label>
                  <input
                    type="text"
                    value={setupForm.bedrijfsnaam}
                    onChange={(e) =>
                      setSetupForm({ ...setupForm, bedrijfsnaam: e.target.value })
                    }
                    placeholder="Jouw Bedrijf B.V."
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-mailadres
                  </label>
                  <input
                    type="email"
                    required
                    value={setupForm.email}
                    onChange={(e) => setSetupForm({ ...setupForm, email: e.target.value })}
                    placeholder="jan@bedrijf.nl"
                    className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Wachtwoord
                  </label>
                  <div className="relative">
                    <input
                      type={toonWachtwoord ? "text" : "password"}
                      required
                      minLength={8}
                      value={setupForm.wachtwoord}
                      onChange={(e) =>
                        setSetupForm({ ...setupForm, wachtwoord: e.target.value })
                      }
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
                  disabled={setupBezig}
                  className="w-full h-11 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {setupBezig && <Loader2 className="h-4 w-4 animate-spin" />}
                  Account aanmaken
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Inloggen</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-mailadres
                  </label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Wachtwoord
                  </label>
                  <div className="relative">
                    <input
                      type={toonWachtwoord ? "text" : "password"}
                      required
                      value={loginForm.wachtwoord}
                      onChange={(e) =>
                        setLoginForm({ ...loginForm, wachtwoord: e.target.value })
                      }
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
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          AdminPro — Persoonlijke administratiesoftware
        </p>
      </div>
    </div>
  );
}

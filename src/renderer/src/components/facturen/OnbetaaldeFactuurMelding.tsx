import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X, Send, AlertCircle, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBedrag } from "@/lib/utils";
import { useAuth } from "@/context/auth";

interface OnbetaaldeFactuur {
  id: string;
  nummer: string;
  klantNaam: string;
  totaal: number;
  vervaldatum: string;
  status: string;
  dagenTeLaat: number;
  dagenTotVervaldatum: number;
}

const DISMISSED_KEY = "onbetaald_dismissed";
const DISMISS_DURATION_MS = 4 * 60 * 60 * 1000; // 4 uur

export default function OnbetaaldeFactuurMelding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [facturen, setFacturen] = useState<OnbetaaldeFactuur[]>([]);
  const [zichtbaar, setZichtbaar] = useState(false);
  const [herinneringLaden, setHerinneringLaden] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  const controleerFacturen = useCallback(async () => {
    if (!user) return;
    try {
      const dismissedRaw = sessionStorage.getItem(DISMISSED_KEY);
      if (dismissedRaw) {
        const { ts } = JSON.parse(dismissedRaw) as { ts: number };
        if (Date.now() - ts < DISMISS_DURATION_MS) return;
      }
      const result = await (window.api.facturen as any).onbetaaldeMeldingen();
      if (result?.facturen?.length > 0) {
        setFacturen(result.facturen);
        setZichtbaar(true);
      }
    } catch {
      // stil falen
    }
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(controleerFacturen, 2000);
    return () => clearTimeout(timer);
  }, [controleerFacturen]);

  const sluit = () => {
    setZichtbaar(false);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify({ ts: Date.now() }));
  };

  const stuurHerinnering = async (factuurId: string) => {
    setHerinneringLaden(factuurId);
    try {
      await window.api.facturen.stuurHerinneringen();
      setMelding("Herinneringen verstuurd");
      setTimeout(() => setMelding(null), 4000);
    } catch (e: unknown) {
      setMelding(e instanceof Error ? e.message : "Versturen mislukt");
      setTimeout(() => setMelding(null), 5000);
    } finally {
      setHerinneringLaden(null);
    }
  };

  if (!zichtbaar || facturen.length === 0) return null;

  const vervallen = facturen.filter((f) => f.dagenTeLaat > 0);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm" onClick={sluit} />

      {/* Panel */}
      <div className="fixed bottom-6 right-6 z-50 w-[min(420px,calc(100vw-48px))] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                {facturen.length} onbetaalde factuur{facturen.length > 1 ? "en" : ""}
              </p>
              <p className="text-xs text-gray-500">
                {vervallen.length > 0 ? `${vervallen.length} vervallen` : `${facturen.length} bijna vervallen`}
              </p>
            </div>
          </div>
          <button
            onClick={sluit}
            className="text-gray-400 hover:text-gray-600 p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {facturen.map((factuur) => (
            <div key={factuur.id} className="px-5 py-3 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {factuur.dagenTeLaat > 0 ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium text-gray-900 truncate">{factuur.nummer}</span>
                    <span className="text-xs text-gray-400 shrink-0">{factuur.klantNaam}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="font-semibold text-gray-900">{formatBedrag(factuur.totaal)}</span>
                    {factuur.dagenTeLaat > 0 ? (
                      <span className="text-red-600 font-medium">{factuur.dagenTeLaat} dag{factuur.dagenTeLaat > 1 ? "en" : ""} te laat</span>
                    ) : (
                      <span className="text-amber-600">vervalt over {factuur.dagenTotVervaldatum} dag{factuur.dagenTotVervaldatum > 1 ? "en" : ""}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => stuurHerinnering(factuur.id)}
                    disabled={herinneringLaden === factuur.id}
                    className="p-1.5 rounded hover:bg-amber-100 text-amber-600 hover:text-amber-700 transition-colors"
                    title="Herinnering sturen"
                  >
                    {herinneringLaden === factuur.id ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => { sluit(); navigate(`/facturen/${factuur.id}`); }}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Bekijk factuur"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          {melding && (
            <p className="text-xs text-green-700 font-medium truncate flex-1">{melding}</p>
          )}
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={sluit}>
              Sluiten
            </Button>
            <Button
              size="sm"
              onClick={() => { sluit(); navigate("/facturen?status=VERZONDEN"); }}
            >
              Alle facturen
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

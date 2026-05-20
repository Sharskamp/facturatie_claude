import { Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBedrag } from "@/lib/utils";

export interface FactuurTotalenSidebarProps {
  totalen: {
    subtotaalBruto: number;
    kortingBedrag: number;
    subtotaal: number;
    btwPerTarief: Record<string, number>;
    totaalBtw: number;
    totaal: number;
  };
  btwVerlegd: boolean;
  korActief: boolean;
  // totaalkorting sectie
  totaalKortingActief: boolean;
  totaalKortingType: "percentage" | "vastBedrag";
  totaalKortingPercentage: number;
  totaalKortingVastBedrag: number;
  onTotaalKortingActiefChange: (v: boolean) => void;
  onTotaalKortingTypeChange: (v: "percentage" | "vastBedrag") => void;
  onTotaalKortingPercentageChange: (v: number) => void;
  onTotaalKortingVastBedragChange: (v: number) => void;
  // submit
  opslaan: boolean;
  onOpslaan: () => void;
  opslaanLabel?: string;
  // optioneel tweede actie (bijv. versturen)
  onVersturen?: () => void;
  versturenLabel?: string;
}

export function FactuurTotalenSidebar({
  totalen,
  btwVerlegd,
  korActief,
  totaalKortingActief,
  totaalKortingType,
  totaalKortingPercentage,
  totaalKortingVastBedrag,
  onTotaalKortingActiefChange,
  onTotaalKortingTypeChange,
  onTotaalKortingPercentageChange,
  onTotaalKortingVastBedragChange,
  opslaan,
  onOpslaan,
  opslaanLabel = "Opslaan als concept",
  onVersturen,
  versturenLabel = "Opslaan & versturen",
}: FactuurTotalenSidebarProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Totaaloverzicht</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Totaalkorting toggle */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Totaalkorting toepassen</p>
              <p className="text-xs text-gray-400">
                {korActief ? "Korting op het totaalbedrag" : "Korting op het totaalbedrag (BTW wordt berekend over het bedrag na korting)"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onTotaalKortingActiefChange(!totaalKortingActief)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                totaalKortingActief ? "bg-indigo-600" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  totaalKortingActief ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {totaalKortingActief && (
            <div className="space-y-3 pl-1">
              {/* Radio: percentage of vast bedrag */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="totaalKortingType"
                    value="percentage"
                    checked={totaalKortingType === "percentage"}
                    onChange={() => onTotaalKortingTypeChange("percentage")}
                    className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Percentage</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="totaalKortingType"
                    value="vastBedrag"
                    checked={totaalKortingType === "vastBedrag"}
                    onChange={() => onTotaalKortingTypeChange("vastBedrag")}
                    className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Vast bedrag</span>
                </label>
              </div>

              {totaalKortingType === "percentage" ? (
                <div className="flex items-center gap-3">
                  <div className="relative w-36">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={totaalKortingPercentage}
                      onChange={(e) =>
                        onTotaalKortingPercentageChange(parseFloat(e.target.value) || 0)
                      }
                      className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 pr-7 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
                      %
                    </span>
                  </div>
                  {totalen.kortingBedrag > 0 && (
                    <span className="text-sm text-green-600 font-medium">
                      = -
                      {new Intl.NumberFormat("nl-NL", {
                        style: "currency",
                        currency: "EUR",
                      }).format(totalen.kortingBedrag)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="relative w-36">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
                      €
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={totaalKortingVastBedrag}
                      onChange={(e) =>
                        onTotaalKortingVastBedragChange(parseFloat(e.target.value) || 0)
                      }
                      className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Totalen tabel */}
        <div className="space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotaal</span>
            <span className="text-gray-900">{formatBedrag(totalen.subtotaalBruto)}</span>
          </div>

          {totalen.kortingBedrag > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">
                {totaalKortingActief && totaalKortingType === "percentage"
                  ? `Totaalkorting (${totaalKortingPercentage}%)`
                  : "Totaalkorting"}
              </span>
              <span className="text-green-600">-{formatBedrag(totalen.kortingBedrag)}</span>
            </div>
          )}

          {totalen.kortingBedrag > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Netto</span>
              <span className="text-gray-900">{formatBedrag(totalen.subtotaal)}</span>
            </div>
          )}

          {!korActief && btwVerlegd && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">BTW (verlegd)</span>
              <span className="text-gray-400">€ 0,00</span>
            </div>
          )}
          {!korActief && !btwVerlegd && Object.entries(totalen.btwPerTarief).map(([tarief, bedrag]) => (
            <div key={tarief} className="flex justify-between text-sm">
              <span className="text-gray-500">BTW {tarief}</span>
              <span className="text-gray-900">{formatBedrag(bedrag)}</span>
            </div>
          ))}

          <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-gray-900">
            <span className="font-bold text-gray-900">Totaal</span>
            <span className="font-bold text-gray-900 text-xl">
              {formatBedrag(totalen.totaal)}
            </span>
          </div>
        </div>

        {/* Actieknoppen */}
        <div className="mt-6 space-y-3">
          <Button
            className="w-full"
            onClick={onOpslaan}
            loading={opslaan}
            variant="outline"
          >
            <Save className="h-4 w-4" />
            {opslaanLabel}
          </Button>
          {onVersturen && (
            <Button className="w-full" onClick={onVersturen} loading={opslaan}>
              <Send className="h-4 w-4" />
              {versturenLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

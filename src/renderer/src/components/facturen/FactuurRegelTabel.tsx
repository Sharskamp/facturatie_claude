import { Car, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBedrag } from "@/lib/utils";

export interface Regel {
  id: string;
  omschrijving: string;
  aantal: number;
  eenheid: string;
  prijs: number;
  btwPercentage: number;
  kortingPercentage: number;
  isReiskosten?: boolean;
  reiskostenBegindatum?: string;
  reiskostenEinddatum?: string;
}

export interface Product {
  id: string;
  naam: string;
  omschrijving?: string;
  prijs: number;
  btwPercentage: number;
  eenheid?: string;
}

export interface FactuurRegelTabelProps {
  regels: Regel[];
  btwVerlegd: boolean;
  korActief: boolean;
  producten: Product[];
  foutenVelden?: Record<string, string>;
  kmVergoeding?: number;
  onRegelUpdate: <K extends keyof Regel>(id: string, veld: K, waarde: Regel[K]) => void;
  onRegelVerwijder: (id: string) => void;
  onRegelToevoegen: () => void;
  onReiskostenToevoegen?: () => void;
}

const BTW_TARIEVEN = [0, 9, 21];

function berekenRegelNetto(regel: Regel, btwVerlegd: boolean): number {
  const bruto = regel.prijs * regel.aantal;
  const korting = (bruto * regel.kortingPercentage) / 100;
  const netto = bruto - korting;
  return btwVerlegd ? netto : netto;
}

export function FactuurRegelTabel({
  regels,
  btwVerlegd,
  korActief,
  producten,
  foutenVelden = {},
  kmVergoeding = 0.23,
  onRegelUpdate,
  onRegelVerwijder,
  onRegelToevoegen,
  onReiskostenToevoegen,
}: FactuurRegelTabelProps) {
  return (
    <div className="space-y-3">
      {/* Tabelhoofden (verborgen op mobiel) */}
      <div className={`hidden lg:grid gap-2 px-1 ${korActief ? "lg:grid-cols-[1fr_80px_100px_110px_80px_32px]" : "lg:grid-cols-[1fr_80px_100px_110px_80px_80px_32px]"}`}>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Omschrijving
        </span>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
          Aantal
        </span>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Eenheid
        </span>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
          Prijs (€)
        </span>
        {!korActief && (
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
            BTW%
          </span>
        )}
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">
          Korting%
        </span>
        <span />
      </div>

      {regels.map((regel, index) => {
        const netto = berekenRegelNetto(regel, btwVerlegd);
        return (
          <div key={regel.id} className="rounded-lg border border-gray-100 overflow-hidden">
          <div
            className={`grid grid-cols-1 gap-2 p-3 bg-gray-50/50 hover:bg-gray-50 transition-colors ${regel.isReiskosten ? "border-b border-blue-100 bg-blue-50/30 hover:bg-blue-50/50" : ""} ${korActief ? "lg:grid-cols-[1fr_80px_100px_110px_80px_32px]" : "lg:grid-cols-[1fr_80px_100px_110px_80px_80px_32px]"}`}
          >
            {/* Omschrijving */}
            <div>
              {regel.isReiskosten && (
                <div className="flex items-center gap-1 mb-1">
                  <Car className="h-3 w-3 text-blue-500" />
                  <span className="text-xs font-medium text-blue-600">Reiskosten</span>
                </div>
              )}
              {producten.length > 0 && !regel.isReiskosten && (
                <select
                  className="flex h-8 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500 mb-1"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const product = producten.find((p) => p.id === e.target.value);
                    if (!product) return;
                    onRegelUpdate(
                      regel.id,
                      "omschrijving",
                      product.naam + (product.omschrijving ? ` – ${product.omschrijving}` : "")
                    );
                    onRegelUpdate(regel.id, "prijs", product.prijs);
                    onRegelUpdate(
                      regel.id,
                      "btwPercentage",
                      korActief ? 0 : product.btwPercentage
                    );
                    if (product.eenheid) {
                      onRegelUpdate(regel.id, "eenheid", product.eenheid);
                    }
                  }}
                >
                  <option value="">Kies uit catalogus...</option>
                  {producten.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.naam} — {formatBedrag(p.prijs)}
                    </option>
                  ))}
                </select>
              )}
              <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                Omschrijving
              </label>
              <input
                type="text"
                value={regel.omschrijving}
                onChange={(e) => onRegelUpdate(regel.id, "omschrijving", e.target.value)}
                placeholder="Omschrijving van de dienst of product"
                className={`flex h-9 w-full rounded-lg border bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent ${
                  foutenVelden[`regel-${index}-omschrijving`]
                    ? "border-red-400"
                    : "border-gray-300"
                }`}
              />
              {foutenVelden[`regel-${index}-omschrijving`] && (
                <p className="mt-0.5 text-xs text-red-600">
                  {foutenVelden[`regel-${index}-omschrijving`]}
                </p>
              )}
            </div>

            {/* Aantal */}
            <div>
              <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                Aantal
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={regel.aantal}
                onChange={(e) =>
                  onRegelUpdate(regel.id, "aantal", parseFloat(e.target.value) || 0)
                }
                className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
              />
            </div>

            {/* Eenheid */}
            <div>
              <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                Eenheid
              </label>
              <input
                type="text"
                value={regel.eenheid}
                onChange={(e) => onRegelUpdate(regel.id, "eenheid", e.target.value)}
                placeholder="stuks"
                className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
              />
            </div>

            {/* Prijs */}
            <div>
              <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                Prijs (€)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
                  €
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={regel.prijs}
                  onChange={(e) =>
                    onRegelUpdate(regel.id, "prijs", parseFloat(e.target.value) || 0)
                  }
                  className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-7 pr-2 py-1 text-sm text-gray-900 shadow-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                />
              </div>
            </div>

            {/* BTW% — verborgen bij KOR */}
            {!korActief && (
              <div>
                <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                  BTW%
                </label>
                <select
                  value={regel.btwPercentage}
                  onChange={(e) =>
                    onRegelUpdate(regel.id, "btwPercentage", parseInt(e.target.value))
                  }
                  disabled={btwVerlegd}
                  className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {BTW_TARIEVEN.map((t) => (
                    <option key={t} value={t}>
                      {t}%
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Korting% */}
            <div>
              <label className="lg:hidden text-xs font-medium text-gray-500 mb-1 block">
                Korting%
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={regel.kortingPercentage}
                  onChange={(e) =>
                    onRegelUpdate(
                      regel.id,
                      "kortingPercentage",
                      parseFloat(e.target.value) || 0
                    )
                  }
                  className="flex h-9 w-full rounded-lg border border-gray-300 bg-white px-2 pr-6 py-1 text-sm text-gray-900 shadow-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
                  %
                </span>
              </div>
            </div>

            {/* Totaal + verwijder */}
            <div className="flex items-end justify-between lg:justify-center gap-2">
              <span className="lg:hidden text-sm font-semibold text-gray-700">
                {formatBedrag(netto)}
              </span>
              <button
                type="button"
                onClick={() => onRegelVerwijder(regel.id)}
                disabled={regels.length === 1}
                className="flex items-center justify-center h-9 w-9 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Verwijder regel"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Reiskosten periode-velden (alleen voor reiskosten regels, niet zichtbaar op factuur) */}
          {regel.isReiskosten && (
            <div className="px-3 py-2 bg-blue-50/40 border-t border-blue-100 flex flex-wrap gap-4 items-center">
              <span className="text-xs text-blue-500 font-medium flex items-center gap-1">
                <Car className="h-3 w-3" /> Km-periode (intern)
              </span>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Van</label>
                  <input
                    type="date"
                    value={regel.reiskostenBegindatum ?? ""}
                    onChange={(e) => onRegelUpdate(regel.id, "reiskostenBegindatum", e.target.value)}
                    className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Tot</label>
                  <input
                    type="date"
                    value={regel.reiskostenEinddatum ?? ""}
                    onChange={(e) => onRegelUpdate(regel.id, "reiskostenEinddatum", e.target.value)}
                    className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
              <span className="text-xs text-gray-400">Niet zichtbaar op factuur</span>
            </div>
          )}
          </div>
        );
      })}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 border-dashed"
          onClick={onRegelToevoegen}
        >
          <Plus className="h-4 w-4" />
          Regel toevoegen
        </Button>
        {onReiskostenToevoegen && (
          <Button
            variant="outline"
            size="sm"
            className="border-dashed text-blue-600 border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            onClick={onReiskostenToevoegen}
            title={`Reiskosten (€${kmVergoeding.toFixed(2)}/km)`}
          >
            <Car className="h-4 w-4" />
            Reiskosten
          </Button>
        )}
      </div>
    </div>
  );
}

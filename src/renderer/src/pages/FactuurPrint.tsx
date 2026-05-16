import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { formatBedrag, formatDatum } from "@/lib/utils";

interface FactuurRegel {
  id: string;
  omschrijving: string;
  aantal: number;
  eenheid?: string;
  prijs: number;
  btwPercentage: number;
  kortingPercentage: number;
  totaal: number;
}

interface Factuur {
  id: string;
  nummer: string;
  status: string;
  datum: string;
  vervaldatum: string;
  subtotaal: number;
  kortingBedrag: number;
  kortingPercentage: number;
  btwBedrag: number;
  totaal: number;
  notities?: string;
  betalingsCondities?: string;
  btwVerlegd: boolean;
  regels: FactuurRegel[];
  klant: {
    naam: string;
    bedrijf?: string;
    email?: string;
    telefoon?: string;
    adres?: string;
    postcode?: string;
    stad?: string;
    land?: string;
    btwNummer?: string;
    kvkNummer?: string;
  };
}

interface Instellingen {
  naam?: string;
  bedrijfsnaam?: string;
  adres?: string;
  postcode?: string;
  stad?: string;
  email?: string;
  telefoon?: string;
  website?: string;
  kvkNummer?: string;
  btwNummer?: string;
  iban?: string;
}

export default function FactuurPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [factuur, setFactuur] = useState<Factuur | null>(null);
  const [instellingen, setInstellingen] = useState<Instellingen | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.facturen.get(id!),
      window.api.instellingen.get(),
    ]).then(([f, i]) => {
      setFactuur(f);
      setInstellingen(i);
    });
  }, [id]);

  if (!factuur || !instellingen) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  // Groepeer BTW per tarief
  const btwGroepen = factuur.regels.reduce(
    (acc, regel) => {
      if (regel.btwPercentage > 0 && !factuur.btwVerlegd) {
        const key = regel.btwPercentage;
        if (!acc[key]) acc[key] = 0;
        const netto = regel.prijs * regel.aantal * (1 - regel.kortingPercentage / 100);
        acc[key] += (netto * regel.btwPercentage) / 100;
      }
      return acc;
    },
    {} as Record<number, number>
  );

  return (
    <>
      {/* Print knop */}
      <div className="no-print fixed top-4 right-4 z-10">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
        >
          <Printer className="h-4 w-4" /> Afdrukken / PDF opslaan
        </button>
      </div>

      {/* Invoice - A4 format */}
      <div className="min-h-screen bg-gray-100 no-print:pt-20 print:bg-white">
        <div className="max-w-[794px] mx-auto bg-white shadow-sm print:shadow-none p-12 min-h-[1123px]">
          {/* Header */}
          <div className="flex justify-between items-start mb-10">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {instellingen.bedrijfsnaam ?? instellingen.naam}
              </h1>
              {instellingen.adres && <p className="text-gray-600 mt-1">{instellingen.adres}</p>}
              {(instellingen.postcode || instellingen.stad) && (
                <p className="text-gray-600">
                  {instellingen.postcode} {instellingen.stad}
                </p>
              )}
              {instellingen.email && <p className="text-gray-600">{instellingen.email}</p>}
              {instellingen.telefoon && <p className="text-gray-600">{instellingen.telefoon}</p>}
              {instellingen.kvkNummer && (
                <p className="text-gray-600">KvK: {instellingen.kvkNummer}</p>
              )}
              {instellingen.btwNummer && (
                <p className="text-gray-600">BTW: {instellingen.btwNummer}</p>
              )}
            </div>

            <div className="text-right">
              <div className="text-3xl font-bold text-indigo-600">FACTUUR</div>
              <div className="mt-2">
                <span className="text-gray-500">Factuurnummer: </span>
                <span className="font-semibold">{factuur.nummer}</span>
              </div>
              <div>
                <span className="text-gray-500">Factuurdatum: </span>
                <span className="font-semibold">{formatDatum(factuur.datum)}</span>
              </div>
              <div>
                <span className="text-gray-500">Vervaldatum: </span>
                <span className="font-semibold text-red-600">{formatDatum(factuur.vervaldatum)}</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t-2 border-indigo-600 mb-8" />

          {/* Bill to */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Factuur aan
            </p>
            <p className="font-semibold text-gray-900">
              {factuur.klant.bedrijf ?? factuur.klant.naam}
            </p>
            {factuur.klant.bedrijf && (
              <p className="text-gray-600">t.a.v. {factuur.klant.naam}</p>
            )}
            {factuur.klant.adres && <p className="text-gray-600">{factuur.klant.adres}</p>}
            {(factuur.klant.postcode || factuur.klant.stad) && (
              <p className="text-gray-600">
                {factuur.klant.postcode} {factuur.klant.stad}
              </p>
            )}
            {factuur.klant.btwNummer && (
              <p className="text-gray-600">BTW: {factuur.klant.btwNummer}</p>
            )}
          </div>

          {/* Line items */}
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Omschrijving
                </th>
                <th className="text-center py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-20">
                  Aantal
                </th>
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-24">
                  Prijs
                </th>
                {!factuur.btwVerlegd && (
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">
                    BTW
                  </th>
                )}
                {factuur.regels.some((r) => r.kortingPercentage > 0) && (
                  <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-20">
                    Korting
                  </th>
                )}
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">
                  Totaal
                </th>
              </tr>
            </thead>
            <tbody>
              {factuur.regels.map((regel) => (
                <tr key={regel.id} className="border-b border-gray-100">
                  <td className="py-3 text-gray-900">
                    {regel.omschrijving}
                    {regel.eenheid && (
                      <span className="text-gray-400 text-sm ml-1">/ {regel.eenheid}</span>
                    )}
                  </td>
                  <td className="py-3 text-center text-gray-700">{regel.aantal}</td>
                  <td className="py-3 text-right text-gray-700">{formatBedrag(regel.prijs)}</td>
                  {!factuur.btwVerlegd && (
                    <td className="py-3 text-right text-gray-500 text-sm">{regel.btwPercentage}%</td>
                  )}
                  {factuur.regels.some((r) => r.kortingPercentage > 0) && (
                    <td className="py-3 text-right text-gray-500 text-sm">
                      {regel.kortingPercentage > 0 ? `${regel.kortingPercentage}%` : "-"}
                    </td>
                  )}
                  <td className="py-3 text-right font-medium">{formatBedrag(regel.totaal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="flex justify-between py-1.5 text-gray-600">
                <span>Subtotaal</span>
                <span>{formatBedrag(factuur.subtotaal + factuur.kortingBedrag)}</span>
              </div>
              {factuur.kortingBedrag > 0 && (
                <div className="flex justify-between py-1.5 text-green-600">
                  <span>Korting ({factuur.kortingPercentage}%)</span>
                  <span>- {formatBedrag(factuur.kortingBedrag)}</span>
                </div>
              )}
              {factuur.btwVerlegd ? (
                <div className="flex justify-between py-1.5 text-gray-500 text-sm italic">
                  <span>BTW verlegd</span>
                  <span>€ 0,00</span>
                </div>
              ) : (
                Object.entries(btwGroepen).map(([tarief, bedrag]) => (
                  <div key={tarief} className="flex justify-between py-1.5 text-gray-600">
                    <span>BTW {tarief}%</span>
                    <span>{formatBedrag(bedrag)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between py-3 border-t-2 border-gray-900 mt-1">
                <span className="font-bold text-lg">Totaal</span>
                <span className="font-bold text-lg text-indigo-600">
                  {formatBedrag(factuur.totaal)}
                </span>
              </div>
            </div>
          </div>

          {/* BTW verlegd notice */}
          {factuur.btwVerlegd && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-800">
              BTW verlegd — de BTW wordt verlegd naar de ontvanger (Art. 12 Wet OB 1968)
            </div>
          )}

          {/* Notes */}
          {factuur.notities && (
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Opmerkingen
              </p>
              <p className="text-gray-700 text-sm whitespace-pre-wrap">{factuur.notities}</p>
            </div>
          )}

          {/* Payment info */}
          <div className="border-t border-gray-200 pt-6 mt-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Betalingsinformatie
            </p>
            {instellingen.iban && (
              <p className="text-gray-700">
                <span className="text-gray-500">IBAN:</span>{" "}
                <span className="font-mono font-medium">{instellingen.iban}</span>
              </p>
            )}
            <p className="text-gray-700">
              <span className="text-gray-500">Onder vermelding van:</span>{" "}
              <span className="font-medium">{factuur.nummer}</span>
            </p>
            {factuur.betalingsCondities && (
              <p className="text-gray-600 text-sm mt-1">{factuur.betalingsCondities}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

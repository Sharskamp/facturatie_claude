import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { formatBedrag, formatDatum } from "@/lib/utils";

interface OfferteRegel {
  id: string;
  omschrijving: string;
  aantal: number;
  eenheid?: string;
  prijs: number;
  btwPercentage: number;
  kortingPercentage: number;
  totaal: number;
}

interface Offerte {
  id: string;
  nummer: string;
  status: string;
  datum: string;
  geldigTot: string;
  subtotaal: number;
  kortingBedrag: number;
  kortingPercentage: number;
  btwBedrag: number;
  totaal: number;
  notities?: string;
  regels: OfferteRegel[];
  klant: {
    naam: string;
    bedrijf?: string;
    email?: string;
    adres?: string;
    postcode?: string;
    stad?: string;
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

export default function OffertePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [offerte, setOfferte] = useState<Offerte | null>(null);
  const [instellingen, setInstellingen] = useState<Instellingen | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.offertes.get(id!),
      window.api.instellingen.get(),
    ]).then(([o, i]) => {
      setOfferte(o);
      setInstellingen(i);
    });
  }, [id]);

  if (!offerte || !instellingen) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  // Groepeer BTW per tarief
  const btwGroepen = offerte.regels.reduce(
    (acc, regel) => {
      if (regel.btwPercentage > 0) {
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

      {/* Offerte - A4 format */}
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
              <div className="text-3xl font-bold text-indigo-600">OFFERTE</div>
              <div className="mt-2">
                <span className="text-gray-500">Offertenummer: </span>
                <span className="font-semibold">{offerte.nummer}</span>
              </div>
              <div>
                <span className="text-gray-500">Offertedatum: </span>
                <span className="font-semibold">{formatDatum(offerte.datum)}</span>
              </div>
              <div>
                <span className="text-gray-500">Geldig tot: </span>
                <span className="font-semibold text-red-600">{formatDatum(offerte.geldigTot)}</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t-2 border-indigo-600 mb-8" />

          {/* Offerte aan */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Offerte aan
            </p>
            <p className="font-semibold text-gray-900">
              {offerte.klant.bedrijf ?? offerte.klant.naam}
            </p>
            {offerte.klant.bedrijf && (
              <p className="text-gray-600">t.a.v. {offerte.klant.naam}</p>
            )}
            {offerte.klant.adres && <p className="text-gray-600">{offerte.klant.adres}</p>}
            {(offerte.klant.postcode || offerte.klant.stad) && (
              <p className="text-gray-600">
                {offerte.klant.postcode} {offerte.klant.stad}
              </p>
            )}
            {offerte.klant.btwNummer && (
              <p className="text-gray-600">BTW: {offerte.klant.btwNummer}</p>
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
                <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">
                  BTW
                </th>
                {offerte.regels.some((r) => r.kortingPercentage > 0) && (
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
              {offerte.regels.map((regel) => (
                <tr key={regel.id} className="border-b border-gray-100">
                  <td className="py-3 text-gray-900">
                    {regel.omschrijving}
                    {regel.eenheid && (
                      <span className="text-gray-400 text-sm ml-1">/ {regel.eenheid}</span>
                    )}
                  </td>
                  <td className="py-3 text-center text-gray-700">{regel.aantal}</td>
                  <td className="py-3 text-right text-gray-700">{formatBedrag(regel.prijs)}</td>
                  <td className="py-3 text-right text-gray-500 text-sm">{regel.btwPercentage}%</td>
                  {offerte.regels.some((r) => r.kortingPercentage > 0) && (
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
                <span>{formatBedrag(offerte.subtotaal + offerte.kortingBedrag)}</span>
              </div>
              {offerte.kortingBedrag > 0 && (
                <div className="flex justify-between py-1.5 text-green-600">
                  <span>Korting ({offerte.kortingPercentage}%)</span>
                  <span>- {formatBedrag(offerte.kortingBedrag)}</span>
                </div>
              )}
              {Object.entries(btwGroepen).map(([tarief, bedrag]) => (
                <div key={tarief} className="flex justify-between py-1.5 text-gray-600">
                  <span>BTW {tarief}%</span>
                  <span>{formatBedrag(bedrag)}</span>
                </div>
              ))}
              <div className="flex justify-between py-3 border-t-2 border-gray-900 mt-1">
                <span className="font-bold text-lg">Totaal</span>
                <span className="font-bold text-lg text-indigo-600">
                  {formatBedrag(offerte.totaal)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {offerte.notities && (
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Opmerkingen
              </p>
              <p className="text-gray-700 text-sm whitespace-pre-wrap">{offerte.notities}</p>
            </div>
          )}

          {/* Geldigheid info (instead of payment info) */}
          <div className="border-t border-gray-200 pt-6 mt-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Betalingsinformatie
            </p>
            <p className="text-gray-700">
              <span className="text-gray-500">Geldig tot:</span>{" "}
              <span className="font-medium">{formatDatum(offerte.geldigTot)}</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

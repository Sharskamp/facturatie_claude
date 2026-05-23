import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { formatBedrag, formatDatum } from "@/lib/utils";
import QRCode from "qrcode";
import { FactuurHtmlDocument } from "@/components/facturen/FactuurHtmlDocument";

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
  totaalKortingBedrag: number;
  notities?: string;
  betalingsCondities?: string;
  btwVerlegd: boolean;
  taal?: string;
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
  korActief?: boolean;
  layoutPrimairKleur?: string;
  layoutLettertype?: string;
  layoutLetterGrootte?: string;
  layoutMarges?: string;
  layoutLogoGrootte?: string;
  layoutKoptekst?: string;
  layoutVoettekst?: string;
  layoutLogoPositie?: string;
  layoutToonBtwNummer?: boolean;
  layoutToonKvkNummer?: boolean;
  layoutToonIban?: boolean;
  layoutToonQrCode?: boolean;
  layoutRegelSpacing?: string;
  layoutSectieVolgorde?: string;
  logoBase64?: string;
  factuurHtmlTemplate?: string;
}

export default function FactuurPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [factuur, setFactuur] = useState<Factuur | null>(null);
  const [instellingen, setInstellingen] = useState<Instellingen | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.facturen.get(id!),
      window.api.instellingen.get(),
    ]).then(([f, i]) => {
      setFactuur(f);
      setInstellingen(i);
    });
  }, [id]);

  useEffect(() => {
    if (!factuur || !instellingen?.iban) return;
    const bedrijfsnaam = instellingen.bedrijfsnaam ?? instellingen.naam ?? '';
    const iban = instellingen.iban.replace(/\s/g, '');
    const bedrag = `EUR${factuur.totaal.toFixed(2)}`;
    const epcData = [
      'BCD', '002', '1', 'SCT',
      '', // BIC (optional)
      bedrijfsnaam,
      iban,
      bedrag,
      '', // purpose (empty)
      factuur.nummer,
      '',
    ].join('\n');
    QRCode.toDataURL(epcData, { errorCorrectionLevel: 'M', width: 120 })
      .then(url => setQrDataUrl(url))
      .catch(() => {});
  }, [factuur, instellingen]);

  if (!factuur || !instellingen) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (instellingen.factuurHtmlTemplate?.trim()) {
    return (
      <>
        <div className="no-print fixed top-4 right-4 z-10">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
          >
            <Printer className="h-4 w-4" /> Afdrukken / PDF opslaan
          </button>
        </div>

        <div className="min-h-screen bg-gray-100 no-print:pt-20 print:bg-white">
          <div className="max-w-[794px] mx-auto bg-white shadow-sm print:shadow-none min-h-[1123px]">
            <FactuurHtmlDocument
              title={`Factuur ${factuur.nummer}`}
              factuur={factuur}
              instellingen={instellingen}
              frameStyle={{ width: "794px", height: "1123px" }}
            />
          </div>
        </div>
      </>
    );
  }

  const isEn = factuur.taal === "en";
  const labels = {
    title: isEn ? "INVOICE" : "FACTUUR",
    invoiceNumber: isEn ? "Invoice number" : "Factuurnummer",
    invoiceDate: isEn ? "Date" : "Factuurdatum",
    dueDate: isEn ? "Due date" : "Vervaldatum",
    billTo: isEn ? "Bill to" : "Factuur aan",
    description: isEn ? "Description" : "Omschrijving",
    quantity: isEn ? "Qty" : "Aantal",
    price: isEn ? "Price" : "Prijs",
    tax: isEn ? "Tax" : "BTW",
    discount: isEn ? "Discount" : "Korting",
    total: isEn ? "Total" : "Totaal",
    subtotal: isEn ? "Subtotal" : "Subtotaal",
    notes: isEn ? "Notes" : "Opmerkingen",
    paymentInfo: isEn ? "Payment information" : "Betalingsinformatie",
    reference: isEn ? "Reference" : "Onder vermelding van",
    btwReversed: isEn ? "Reverse charge — VAT is payable by the recipient" : "BTW verlegd — de BTW wordt verlegd naar de ontvanger (Art. 12 Wet OB 1968)",
    payOnline: isEn ? "Pay online via" : "Betaal online via",
  };

  const korActief = instellingen.korActief ?? false;
  const primairKleur = instellingen.layoutPrimairKleur ?? "#4f46e5";
  const lettertype = instellingen.layoutLettertype ?? "Arial, sans-serif";
  const letterGrootte = `${instellingen.layoutLetterGrootte ?? "14"}px`;
  const MARGE_MAP: Record<string, string> = { krap: "24px", normaal: "40px", ruim: "56px" };
  const marges = MARGE_MAP[instellingen.layoutMarges ?? "normaal"] ?? "40px";
  const LOGO_H_MAP: Record<string, string> = { small: "40px", medium: "64px", large: "96px" };
  const logoHoogte = LOGO_H_MAP[instellingen.layoutLogoGrootte ?? "medium"] ?? "64px";
  const toonIban = instellingen.layoutToonIban !== false;
  const toonKvk = instellingen.layoutToonKvkNummer !== false;
  const toonBtwNummer = instellingen.layoutToonBtwNummer !== false;
  const koptekst = instellingen.layoutKoptekst;
  const voettekst = instellingen.layoutVoettekst;

  // Parse section order; bedrijf and factuurInfo are always rendered together as the header block
  const DEFAULT_SECTIES = ["koptekst", "bedrijf", "klant", "factuurInfo", "regels", "totalen", "betaling", "voettekst"];
  let rawVolgorde: string[];
  try {
    const parsed = JSON.parse(instellingen.layoutSectieVolgorde ?? "[]");
    rawVolgorde = Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SECTIES;
  } catch {
    rawVolgorde = DEFAULT_SECTIES;
  }
  // Collapse factuurInfo into bedrijf so they render as one side-by-side header row
  const sectieVolgorde = [...new Set(rawVolgorde.map(s => s === "factuurInfo" ? "bedrijf" : s))];

  // Groepeer BTW per tarief (verborgen als KOR actief of BTW verlegd)
  const btwGroepen = factuur.regels.reduce(
    (acc, regel) => {
      if (regel.btwPercentage > 0 && !factuur.btwVerlegd && !korActief) {
        const key = regel.btwPercentage;
        if (!acc[key]) acc[key] = 0;
        const netto = regel.prijs * regel.aantal * (1 - regel.kortingPercentage / 100);
        acc[key] += (netto * regel.btwPercentage) / 100;
      }
      return acc;
    },
    {} as Record<number, number>
  );

  const heeftKorting = factuur.regels.some((r) => r.kortingPercentage > 0);
  const heeftBtw = !korActief && !factuur.btwVerlegd && Object.keys(btwGroepen).length > 0;

  const grossSubtotaalPrint = factuur.regels.reduce((acc, r) => acc + r.prijs * r.aantal, 0);
  const regelKortingTotaalPrint = factuur.regels.reduce((acc, r) => acc + r.prijs * r.aantal * r.kortingPercentage / 100, 0);
  const effectieveKortingPrint = regelKortingTotaalPrint + factuur.kortingBedrag + factuur.totaalKortingBedrag;
  const effectiefKortingPct = grossSubtotaalPrint > 0.005
    ? Math.round(effectieveKortingPrint / grossSubtotaalPrint * 1000) / 10
    : 0;

  const sectieBlokkken: Record<string, JSX.Element | null> = {
    koptekst: koptekst ? (
      <div key="koptekst" className="mb-6 text-sm text-gray-600 whitespace-pre-wrap border-b border-gray-200 pb-4">
        {koptekst}
      </div>
    ) : null,

    bedrijf: (
      <div key="bedrijf">
        {/* Header: bedrijfsgegevens links, factuurnummer/datum rechts */}
        <div className="flex justify-between items-start mb-10">
          <div>
            {instellingen.logoBase64 && (
              <img src={instellingen.logoBase64} alt="logo" style={{ height: logoHoogte, objectFit: "contain", marginBottom: "8px" }} />
            )}
            <h1 className="text-2xl font-bold text-gray-900">
              {instellingen.bedrijfsnaam ?? instellingen.naam}
            </h1>
            {instellingen.adres && <p className="text-gray-600 mt-1">{instellingen.adres}</p>}
            {(instellingen.postcode || instellingen.stad) && (
              <p className="text-gray-600">{instellingen.postcode} {instellingen.stad}</p>
            )}
            {instellingen.email && <p className="text-gray-600">{instellingen.email}</p>}
            {instellingen.telefoon && <p className="text-gray-600">{instellingen.telefoon}</p>}
            {toonKvk && instellingen.kvkNummer && (
              <p className="text-gray-600">KvK: {instellingen.kvkNummer}</p>
            )}
            {toonBtwNummer && !korActief && instellingen.btwNummer && (
              <p className="text-gray-600">BTW: {instellingen.btwNummer}</p>
            )}
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold" style={{ color: primairKleur }}>{labels.title}</div>
            <div className="mt-2">
              <span className="text-gray-500">{labels.invoiceNumber}: </span>
              <span className="font-semibold">{factuur.nummer}</span>
            </div>
            <div>
              <span className="text-gray-500">{labels.invoiceDate}: </span>
              <span className="font-semibold">{formatDatum(factuur.datum)}</span>
            </div>
            <div>
              <span className="text-gray-500">{labels.dueDate}: </span>
              <span className="font-semibold text-red-600">{formatDatum(factuur.vervaldatum)}</span>
            </div>
          </div>
        </div>
        <div className="border-t-2 mb-8" style={{ borderColor: primairKleur }} />
      </div>
    ),

    klant: (
      <div key="klant" className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          {labels.billTo}
        </p>
        <p className="font-semibold text-gray-900">
          {factuur.klant.bedrijf ?? factuur.klant.naam}
        </p>
        {factuur.klant.bedrijf && (
          <p className="text-gray-600">t.a.v. {factuur.klant.naam}</p>
        )}
        {factuur.klant.adres && <p className="text-gray-600">{factuur.klant.adres}</p>}
        {(factuur.klant.postcode || factuur.klant.stad) && (
          <p className="text-gray-600">{factuur.klant.postcode} {factuur.klant.stad}</p>
        )}
        {factuur.klant.btwNummer && (
          <p className="text-gray-600">BTW: {factuur.klant.btwNummer}</p>
        )}
      </div>
    ),

    regels: (
      <table key="regels" className="w-full mb-6">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {labels.description}
            </th>
            <th className="text-center py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-20">
              {labels.quantity}
            </th>
            <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-24">
              {labels.price}
            </th>
            {heeftBtw && (
              <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-16">
                {labels.tax}
              </th>
            )}
            {heeftKorting && (
              <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-20">
                {labels.discount}
              </th>
            )}
            <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 w-28">
              {labels.total}
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
              {heeftBtw && (
                <td className="py-3 text-right text-gray-500 text-sm">{regel.btwPercentage}%</td>
              )}
              {heeftKorting && (
                <td className="py-3 text-right text-gray-500 text-sm">
                  {regel.kortingPercentage > 0 ? `${regel.kortingPercentage}%` : "-"}
                </td>
              )}
              <td className="py-3 text-right font-medium">{formatBedrag(regel.totaal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),

    totalen: (
      <div key="totalen">
        <div className="flex justify-end mb-8">
          <div className="w-64">
            <div className="flex justify-between py-1.5 text-gray-600">
              <span>{labels.subtotal}</span>
              <span>{formatBedrag(grossSubtotaalPrint)}</span>
            </div>
            {effectieveKortingPrint > 0.005 && (
              <div className="flex justify-between py-1.5 text-green-600">
                <span>
                  {isEn ? "Discount" : "Korting"}
                  {effectiefKortingPct > 0
                    ? ` (${Number.isInteger(effectiefKortingPct) ? effectiefKortingPct : effectiefKortingPct.toFixed(1).replace(".", ",")}%)`
                    : ""}
                </span>
                <span>- {formatBedrag(effectieveKortingPrint)}</span>
              </div>
            )}
            {!korActief && factuur.btwVerlegd && (
              <div className="flex justify-between py-1.5 text-gray-500 text-sm italic">
                <span>BTW verlegd</span>
                <span>€ 0,00</span>
              </div>
            )}
            {!korActief && !factuur.btwVerlegd && Object.entries(btwGroepen).map(([tarief, bedrag]) => (
              <div key={tarief} className="flex justify-between py-1.5 text-gray-600">
                <span>BTW {tarief}%</span>
                <span>{formatBedrag(bedrag)}</span>
              </div>
            ))}
            <div className="flex justify-between py-3 border-t-2 border-gray-900 mt-1">
              <span className="font-bold text-lg">{labels.total}</span>
              <span className="font-bold text-lg" style={{ color: primairKleur }}>
                {formatBedrag(factuur.totaal)}
              </span>
            </div>
          </div>
        </div>
        {!korActief && factuur.btwVerlegd && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-800">
            {labels.btwReversed}
          </div>
        )}
        {factuur.notities && (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
              {labels.notes}
            </p>
            <p className="text-gray-700 text-sm whitespace-pre-wrap">{factuur.notities}</p>
          </div>
        )}
      </div>
    ),

    betaling: (
      <div key="betaling" className="border-t border-gray-200 pt-6 mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          {labels.paymentInfo}
        </p>
        {toonIban && instellingen.iban && (
          <p className="text-gray-700">
            <span className="text-gray-500">IBAN:</span>{" "}
            <span className="font-mono font-medium">{instellingen.iban}</span>
          </p>
        )}
        <p className="text-gray-700">
          <span className="text-gray-500">{labels.reference}:</span>{" "}
          <span className="font-medium">{factuur.nummer}</span>
        </p>
        {factuur.betalingsCondities && (
          <p className="text-gray-600 text-sm mt-1">{factuur.betalingsCondities}</p>
        )}
        {qrDataUrl && (
          <div className="mt-4 flex items-center gap-4">
            <img src={qrDataUrl} alt="SEPA betaal QR" className="w-28 h-28" />
            <div className="text-xs text-gray-500">
              <p className="font-medium text-gray-700 mb-1">SEPA betaal QR</p>
              <p>Scan met je bank-app om</p>
              <p>direct te betalen</p>
            </div>
          </div>
        )}
      </div>
    ),

    voettekst: voettekst ? (
      <div key="voettekst" className="border-t border-gray-200 pt-4 mt-4">
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{voettekst}</p>
      </div>
    ) : null,
  };

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
        <div className="max-w-[794px] mx-auto bg-white shadow-sm print:shadow-none min-h-[1123px]" style={{ fontFamily: lettertype, fontSize: letterGrootte, padding: marges }}>
          {sectieVolgorde.map(sectie => sectieBlokkken[sectie] ?? null)}
        </div>
      </div>
    </>
  );
}

interface PreviewInstellingen {
  layoutPrimairKleur?: string;
  layoutLettertype?: string;
  layoutLetterGrootte?: string;
  layoutMarges?: string;
  layoutLogoGrootte?: string;
  layoutKoptekst?: string;
  layoutVoettekst?: string;
  layoutToonBtwNummer?: boolean;
  layoutToonKvkNummer?: boolean;
  layoutToonIban?: boolean;
  layoutToonQrCode?: boolean;
  layoutLogoPositie?: string;
  naam?: string;
  bedrijfsnaam?: string;
  adres?: string;
  stad?: string;
  btwNummer?: string;
  kvkNummer?: string;
  iban?: string;
  logoBase64?: string;
  korActief?: boolean;
}

const MARGE_MAP: Record<string, string> = {
  krap: "24px",
  normaal: "40px",
  ruim: "56px",
};

const LOGO_GROOTTE_MAP: Record<string, string> = {
  small: "40px",
  medium: "64px",
  large: "96px",
};

export function FactuurLayoutPreview({ inst }: { inst: PreviewInstellingen }) {
  const kleur = inst.layoutPrimairKleur ?? "#4f46e5";
  const font = inst.layoutLettertype ?? "Arial, sans-serif";
  const fontSize = `${inst.layoutLetterGrootte ?? "14"}px`;
  const marge = MARGE_MAP[inst.layoutMarges ?? "normaal"] ?? "40px";
  const logoH = LOGO_GROOTTE_MAP[inst.layoutLogoGrootte ?? "medium"] ?? "64px";
  const logoPos = inst.layoutLogoPositie ?? "links";
  const toonBtw = inst.layoutToonBtwNummer !== false;
  const toonKvk = inst.layoutToonKvkNummer !== false;
  const toonIban = inst.layoutToonIban !== false;
  const toonQr = inst.layoutToonQrCode !== false;
  const korActief = inst.korActief ?? false;

  const bedrijf = inst.bedrijfsnaam ?? inst.naam ?? "Bedrijfsnaam B.V.";
  const adres = inst.adres ?? "Hoofdstraat 12";
  const stad = inst.stad ?? "1234 AB Amsterdam";

  const regels = [
    { omschrijving: "Webdesign & ontwikkeling", aantal: 8, prijs: "€ 95,00", btw: "21%", totaal: "€ 760,00" },
    { omschrijving: "Maandelijks onderhoud", aantal: 1, prijs: "€ 150,00", btw: "21%", totaal: "€ 150,00" },
    { omschrijving: "SEO-optimalisatie", aantal: 3, prijs: "€ 85,00", btw: "21%", totaal: "€ 255,00" },
    { omschrijving: "Hosting & domein (jaarlijks)", aantal: 1, prijs: "€ 120,00", btw: "21%", totaal: "€ 120,00" },
    { omschrijving: "Technisch overleg (uren)", aantal: 2, prijs: "€ 95,00", btw: "21%", totaal: "€ 190,00" },
  ];

  return (
    <div
      style={{
        width: "794px",
        minHeight: "1123px",
        background: "white",
        fontFamily: font,
        fontSize,
        padding: marge,
        boxSizing: "border-box",
        color: "#111",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Koptekst */}
      {inst.layoutKoptekst && (
        <div style={{ fontSize: "11px", color: "#666", marginBottom: "14px", borderBottom: `1px solid ${kleur}`, paddingBottom: "8px" }}>
          {inst.layoutKoptekst}
        </div>
      )}

      {/* Header: bedrijf + logo */}
      <div
        style={{
          display: "flex",
          justifyContent: logoPos === "midden" ? "center" : "space-between",
          alignItems: "flex-start",
          marginBottom: "20px",
          flexDirection: logoPos === "midden" ? "column" : "row",
          gap: "12px",
        }}
      >
        <div>
          <div style={{ fontSize: "24px", fontWeight: "800", color: kleur, letterSpacing: "-0.5px" }}>{bedrijf}</div>
          <div style={{ fontSize: "12px", color: "#555", marginTop: "5px" }}>{adres}</div>
          <div style={{ fontSize: "12px", color: "#555" }}>{stad}</div>
          {toonBtw && (
            <div style={{ fontSize: "11px", color: "#888", marginTop: "3px" }}>
              BTW: {inst.btwNummer ?? "NL123456789B01"}
            </div>
          )}
          {toonKvk && (
            <div style={{ fontSize: "11px", color: "#888" }}>
              KvK: {inst.kvkNummer ?? "12345678"}
            </div>
          )}
          <div style={{ fontSize: "11px", color: "#888" }}>info@{bedrijf.toLowerCase().replace(/[^a-z0-9]/g, "")}.nl</div>
        </div>
        {inst.logoBase64 ? (
          <img src={inst.logoBase64} alt="logo" style={{ height: logoH, objectFit: "contain" }} />
        ) : (
          <div
            style={{
              height: logoH,
              width: logoH,
              background: `${kleur}18`,
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              color: kleur,
              fontWeight: "600",
              border: `1px solid ${kleur}30`,
            }}
          >
            LOGO
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: `3px solid ${kleur}`, marginBottom: "22px" }} />

      {/* FACTUUR titel + factuurgegevens + klantgegevens */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
        <div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: kleur, letterSpacing: "2px", marginBottom: "10px" }}>
            FACTUUR
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: "12px" }}>
            <tbody>
              <tr>
                <td style={{ color: "#888", paddingRight: "16px", paddingBottom: "3px" }}>Factuurnummer</td>
                <td style={{ fontWeight: "600", paddingBottom: "3px" }}>F2026-0042</td>
              </tr>
              <tr>
                <td style={{ color: "#888", paddingRight: "16px", paddingBottom: "3px" }}>Factuurdatum</td>
                <td style={{ paddingBottom: "3px" }}>17-05-2026</td>
              </tr>
              <tr>
                <td style={{ color: "#888", paddingRight: "16px", paddingBottom: "3px" }}>Vervaldatum</td>
                <td style={{ paddingBottom: "3px", color: "#d97706", fontWeight: "600" }}>16-06-2026</td>
              </tr>
              <tr>
                <td style={{ color: "#888", paddingRight: "16px" }}>Referentie</td>
                <td>PO-2026-778</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          style={{
            textAlign: "right",
            background: "#f8f8fb",
            border: "1px solid #e5e7eb",
            borderRadius: "10px",
            padding: "14px 18px",
            minWidth: "210px",
          }}
        >
          <div style={{ fontSize: "10px", fontWeight: "700", color: kleur, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
            Factuur aan
          </div>
          <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "3px" }}>Klant Voorbeeld B.V.</div>
          <div style={{ fontSize: "11px", color: "#555" }}>T.a.v. de heer J. Jansen</div>
          <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>Klantenstraat 42</div>
          <div style={{ fontSize: "11px", color: "#555" }}>1234 AB Amsterdam</div>
          <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>BTW: NL987654321B01</div>
        </div>
      </div>

      {/* Regeloverzicht — header */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "0", fontSize: "12px" }}>
        <thead>
          <tr style={{ background: kleur }}>
            <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "white", borderRadius: "0" }}>Omschrijving</th>
            <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "white", width: "60px" }}>Aantal</th>
            <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "white", width: "90px" }}>Prijs</th>
            {!korActief && (
              <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "white", width: "60px" }}>BTW</th>
            )}
            <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "white", width: "90px" }}>Totaal</th>
          </tr>
        </thead>
        <tbody>
          {regels.map((r, i) => (
            <tr
              key={i}
              style={{
                background: i % 2 === 0 ? "white" : "#fafafa",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <td style={{ padding: "10px 12px" }}>{r.omschrijving}</td>
              <td style={{ textAlign: "right", padding: "10px 12px" }}>{r.aantal}</td>
              <td style={{ textAlign: "right", padding: "10px 12px" }}>{r.prijs}</td>
              {!korActief && <td style={{ textAlign: "right", padding: "10px 12px", color: "#888" }}>{r.btw}</td>}
              <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: "600" }}>{r.totaal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Dunne afsluitende lijn onder tabel */}
      <div style={{ borderTop: `2px solid ${kleur}`, marginBottom: "20px" }} />

      {/* Totalen */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "28px" }}>
        <div style={{ width: "280px", fontSize: "13px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f0f0f0" }}>
            <span style={{ color: "#666" }}>Subtotaal excl. BTW</span>
            <span>€ 1.475,00</span>
          </div>
          {!korActief && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f0f0f0" }}>
              <span style={{ color: "#666" }}>BTW 21%</span>
              <span>€ 309,75</span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 14px",
              marginTop: "6px",
              background: kleur,
              borderRadius: "8px",
              fontWeight: "700",
              fontSize: "16px",
              color: "white",
            }}
          >
            <span>Te betalen</span>
            <span>{korActief ? "€ 1.475,00" : "€ 1.784,75"}</span>
          </div>
        </div>
      </div>

      {/* Betalingsgegevens */}
      <div
        style={{
          background: "#f8f8fb",
          border: `1px solid ${kleur}30`,
          borderLeft: `4px solid ${kleur}`,
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "20px",
          fontSize: "12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "8px", color: kleur }}>Betalingsgegevens</div>
          {toonIban && (
            <div style={{ marginBottom: "4px" }}>
              <span style={{ color: "#888" }}>IBAN: </span>
              <span style={{ fontWeight: "600" }}>{inst.iban ?? "NL91 ABNA 0417 1643 00"}</span>
            </div>
          )}
          <div style={{ marginBottom: "4px" }}>
            <span style={{ color: "#888" }}>T.n.v.: </span>
            <span>{bedrijf}</span>
          </div>
          <div style={{ marginBottom: "4px" }}>
            <span style={{ color: "#888" }}>Kenmerk: </span>
            <span style={{ fontWeight: "600" }}>F2026-0042</span>
          </div>
          <div style={{ marginTop: "8px", color: "#555", fontSize: "11px" }}>
            Gelieve het bedrag binnen 30 dagen over te maken onder vermelding van het factuurnummer.
          </div>
        </div>
        {toonQr && (
          <div>
            <div
              style={{
                width: "72px",
                height: "72px",
                background: "#e8e8e8",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "9px",
                color: "#999",
                flexDirection: "column",
                gap: "3px",
              }}
            >
              <div style={{ fontSize: "20px" }}>▦</div>
              <span>SEPA QR</span>
            </div>
          </div>
        )}
      </div>

      {/* Korting-vrijstelling tekst */}
      {korActief && (
        <div style={{ fontSize: "11px", color: "#888", marginBottom: "16px", fontStyle: "italic" }}>
          BTW vrijgesteld o.g.v. artikel 25 Wet OB (Kleineondernemersregeling)
        </div>
      )}

      {/* Spacer om voettekst naar onder te duwen */}
      <div style={{ flex: 1 }} />

      {/* Voettekst */}
      {inst.layoutVoettekst ? (
        <div style={{ fontSize: "10px", color: "#888", borderTop: "1px solid #eee", paddingTop: "10px", marginTop: "16px" }}>
          {inst.layoutVoettekst}
        </div>
      ) : (
        <div style={{ fontSize: "10px", color: "#ccc", borderTop: "1px solid #eee", paddingTop: "10px", marginTop: "16px", textAlign: "center" }}>
          Bedankt voor uw opdracht — {bedrijf} · {adres}, {stad}
        </div>
      )}
    </div>
  );
}

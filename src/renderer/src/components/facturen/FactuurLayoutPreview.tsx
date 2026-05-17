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

  const bedrijf = inst.bedrijfsnaam ?? inst.naam ?? "Bedrijfsnaam";
  const adres = inst.adres ?? "Straatnaam 1";
  const stad = inst.stad ?? "Amsterdam";

  return (
    <div
      style={{
        width: "794px",
        minHeight: "1123px",
        background: "white",
        fontFamily: font,
        fontSize,
        transformOrigin: "top left",
        transform: "scale(0.42)",
        padding: marge,
        boxSizing: "border-box",
        color: "#111",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
      }}
    >
      {/* Koptekst */}
      {inst.layoutKoptekst && (
        <div style={{ fontSize: "11px", color: "#666", marginBottom: "12px", borderBottom: `1px solid ${kleur}`, paddingBottom: "6px" }}>
          {inst.layoutKoptekst}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: logoPos === "rechts" ? "space-between" : logoPos === "midden" ? "center" : "space-between", alignItems: "flex-start", marginBottom: "24px", flexDirection: logoPos === "midden" ? "column" : "row", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "22px", fontWeight: "700", color: kleur }}>{bedrijf}</div>
          <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>{adres}</div>
          <div style={{ fontSize: "12px", color: "#555" }}>{stad}</div>
          {toonBtw && inst.btwNummer && <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>BTW: {inst.btwNummer}</div>}
          {toonKvk && inst.kvkNummer && <div style={{ fontSize: "11px", color: "#888" }}>KvK: {inst.kvkNummer}</div>}
        </div>
        {inst.logoBase64 ? (
          <img src={inst.logoBase64} alt="logo" style={{ height: logoH, objectFit: "contain" }} />
        ) : (
          <div style={{ height: logoH, width: logoH, background: "#f0f0f0", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#aaa" }}>logo</div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: `2px solid ${kleur}`, marginBottom: "20px" }} />

      {/* FACTUUR titel + klantgegevens */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: kleur, marginBottom: "4px" }}>FACTUUR</div>
          <div style={{ fontSize: "11px", color: "#555" }}>Factuurnummer: F2025-0001</div>
          <div style={{ fontSize: "11px", color: "#555" }}>Datum: 17-05-2025</div>
          <div style={{ fontSize: "11px", color: "#555" }}>Vervaldatum: 16-06-2025</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Klant Voorbeeld B.V.</div>
          <div style={{ fontSize: "11px", color: "#555" }}>Klantenstraat 42</div>
          <div style={{ fontSize: "11px", color: "#555" }}>1234 AB Amsterdam</div>
        </div>
      </div>

      {/* Regeltabel */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px", fontSize: "12px" }}>
        <thead>
          <tr style={{ background: "#f8f8f8" }}>
            <th style={{ textAlign: "left", padding: "8px", borderBottom: `2px solid ${kleur}`, fontWeight: 600 }}>Omschrijving</th>
            <th style={{ textAlign: "right", padding: "8px", borderBottom: `2px solid ${kleur}`, fontWeight: 600 }}>Aantal</th>
            <th style={{ textAlign: "right", padding: "8px", borderBottom: `2px solid ${kleur}`, fontWeight: 600 }}>Prijs</th>
            {!korActief && <th style={{ textAlign: "right", padding: "8px", borderBottom: `2px solid ${kleur}`, fontWeight: 600 }}>BTW</th>}
            <th style={{ textAlign: "right", padding: "8px", borderBottom: `2px solid ${kleur}`, fontWeight: 600 }}>Totaal</th>
          </tr>
        </thead>
        <tbody>
          {[
            { omschrijving: "Webdesign & ontwikkeling", aantal: 8, prijs: "€ 95,00", btw: "21%", totaal: "€ 760,00" },
            { omschrijving: "Maandelijks onderhoud", aantal: 1, prijs: "€ 150,00", btw: "21%", totaal: "€ 150,00" },
          ].map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px" }}>{r.omschrijving}</td>
              <td style={{ textAlign: "right", padding: "8px" }}>{r.aantal}</td>
              <td style={{ textAlign: "right", padding: "8px" }}>{r.prijs}</td>
              {!korActief && <td style={{ textAlign: "right", padding: "8px" }}>{r.btw}</td>}
              <td style={{ textAlign: "right", padding: "8px" }}>{r.totaal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totalen */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "24px" }}>
        <div style={{ width: "240px", fontSize: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
            <span style={{ color: "#555" }}>Subtotaal</span>
            <span>€ 910,00</span>
          </div>
          {!korActief && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ color: "#555" }}>BTW 21%</span>
              <span>€ 191,10</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `2px solid ${kleur}`, fontWeight: "700", fontSize: "14px", color: kleur }}>
            <span>Totaal</span>
            <span>{korActief ? "€ 910,00" : "€ 1.101,10"}</span>
          </div>
        </div>
      </div>

      {/* Betaalgegevens */}
      <div style={{ background: "#f8f8f8", borderRadius: "8px", padding: "16px", marginBottom: "16px", fontSize: "11px" }}>
        <div style={{ fontWeight: 600, marginBottom: "6px" }}>Betalingsgegevens</div>
        {toonIban && <div style={{ color: "#555" }}>IBAN: {inst.iban ?? "NL91 ABNA 0417 1643 00"}</div>}
        <div style={{ color: "#555" }}>Onder vermelding van factuurnummer F2025-0001</div>
        {toonQr && (
          <div style={{ marginTop: "8px", width: "60px", height: "60px", background: "#e0e0e0", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", color: "#999" }}>QR</div>
        )}
      </div>

      {/* Voettekst */}
      {inst.layoutVoettekst && (
        <div style={{ fontSize: "10px", color: "#888", borderTop: "1px solid #eee", paddingTop: "8px", marginTop: "12px" }}>
          {inst.layoutVoettekst}
        </div>
      )}
    </div>
  );
}

import { CSSProperties, useEffect, useState } from "react";
import {
  bouwFactuurHtml,
  type FactuurHtmlFactuur,
  type FactuurHtmlInstellingen,
} from "@/lib/factuur-html";

export function FactuurHtmlDocument({
  factuur,
  instellingen,
  className = "",
  title,
  frameStyle,
}: {
  factuur: FactuurHtmlFactuur;
  instellingen: FactuurHtmlInstellingen | null;
  className?: string;
  title?: string;
  frameStyle?: CSSProperties;
}) {
  const [html, setHtml] = useState("");
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    let actief = true;

    if (!instellingen?.factuurHtmlTemplate?.trim()) {
      setHtml("");
      setLaden(false);
      setFout(null);
      return () => {
        actief = false;
      };
    }

    setLaden(true);
    setFout(null);

    bouwFactuurHtml({ factuur, instellingen })
      .then((resultaat) => {
        if (!actief) return;
        setHtml(resultaat);
        setLaden(false);
      })
      .catch((error: unknown) => {
        if (!actief) return;
        setHtml("");
        setLaden(false);
        setFout(error instanceof Error ? error.message : "Preview kon niet worden opgebouwd.");
      });

    return () => {
      actief = false;
    };
  }, [factuur, instellingen]);

  if (!instellingen?.factuurHtmlTemplate?.trim()) {
    return null;
  }

  if (fout) {
    return (
      <div
        className={className}
        style={{
          width: "794px",
          height: "1123px",
          background: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "24px",
          ...frameStyle,
        }}
      >
        <div>
          <p style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>Preview kon niet worden geladen</p>
          <p style={{ marginTop: "8px", fontSize: "13px", color: "#6b7280" }}>{fout}</p>
        </div>
      </div>
    );
  }

  if (laden && !html) {
    return (
      <div
        className={className}
        style={{
          width: "794px",
          height: "1123px",
          background: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...frameStyle,
        }}
      >
        <div style={{ textAlign: "center", color: "#6b7280", fontSize: "13px" }}>Factuurpreview laden...</div>
      </div>
    );
  }

  return (
    <iframe
      key={html}
      title={title ?? `Factuur ${factuur.nummer}`}
      srcDoc={html}
      className={className}
      style={{
        width: "794px",
        height: "1123px",
        border: 0,
        background: "white",
        display: "block",
        ...frameStyle,
      }}
    />
  );
}

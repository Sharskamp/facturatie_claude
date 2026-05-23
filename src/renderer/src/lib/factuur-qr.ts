import QRCode from "qrcode";

export async function genereerSepaQrDataUrl({
  iban,
  ontvanger,
  bedrag,
  kenmerk,
  omschrijving,
}: {
  iban?: string | null;
  ontvanger?: string | null;
  bedrag?: number | null;
  kenmerk?: string | null;
  omschrijving?: string | null;
}) {
  if (!iban || !ontvanger || !bedrag || bedrag <= 0) return "";

  try {
    const epcData = [
      "BCD",
      "002",
      "1",
      "SCT",
      "",
      ontvanger,
      iban.replace(/\s/g, ""),
      `EUR${bedrag.toFixed(2)}`,
      "",
      kenmerk ?? "",
      omschrijving ?? "",
    ].join("\n");

    return await QRCode.toDataURL(epcData, {
      errorCorrectionLevel: "M",
      width: 128,
      margin: 1,
    });
  } catch {
    return "";
  }
}

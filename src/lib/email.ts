import nodemailer from "nodemailer";

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

interface EmailOpties {
  naar: string;
  van: string;
  onderwerp: string;
  html: string;
  tekst?: string;
  bijlagen?: Array<{
    bestandsnaam: string;
    inhoud: string | Buffer;
    contentType: string;
  }>;
}

export function maakTransporter(config: EmailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export async function verstuurEmail(config: EmailConfig, opties: EmailOpties) {
  const transporter = maakTransporter(config);

  const bijlagen = opties.bijlagen?.map((b) => ({
    filename: b.bestandsnaam,
    content: b.inhoud,
    contentType: b.contentType,
  }));

  await transporter.sendMail({
    from: opties.van,
    to: opties.naar,
    subject: opties.onderwerp,
    html: opties.html,
    text: opties.tekst,
    attachments: bijlagen,
  });
}

export function maakFactuurEmailHtml(params: {
  klantNaam: string;
  bedrijfsnaam: string;
  factuurNummer: string;
  totaal: string;
  vervaldatum: string;
  factuurUrl: string;
  notities?: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factuur ${params.factuurNummer}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #4f46e5; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Factuur ${params.factuurNummer}</h1>
    <p style="color: #c7d2fe; margin: 5px 0 0;">${params.bedrijfsnaam}</p>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb;">
    <p>Geachte ${params.klantNaam},</p>

    <p>Hierbij ontvangt u factuur <strong>${params.factuurNummer}</strong> met een totaalbedrag van <strong>${params.totaal}</strong>.</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Factuurnummer</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold;">${params.factuurNummer}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Vervaldatum</td>
          <td style="padding: 8px 0; text-align: right; font-weight: bold;">${params.vervaldatum}</td>
        </tr>
        <tr style="border-top: 1px solid #e5e7eb;">
          <td style="padding: 12px 0; font-weight: bold;">Totaal bedrag</td>
          <td style="padding: 12px 0; text-align: right; font-size: 20px; font-weight: bold; color: #4f46e5;">${params.totaal}</td>
        </tr>
      </table>
    </div>

    ${params.notities ? `<p style="color: #6b7280; font-style: italic;">${params.notities}</p>` : ""}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${params.factuurUrl}" style="background: #4f46e5; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
        Factuur bekijken &amp; downloaden
      </a>
    </div>

    <p>Met vriendelijke groet,<br><strong>${params.bedrijfsnaam}</strong></p>
  </div>

  <div style="background: #f3f4f6; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #9ca3af;">
    <p>Deze email is verstuurd via het administratiesysteem van ${params.bedrijfsnaam}</p>
  </div>
</body>
</html>
  `.trim();
}

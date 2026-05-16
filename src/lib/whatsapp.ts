export function maakWhatsAppLink(params: {
  telefoon: string;
  klantNaam: string;
  bedrijfsnaam: string;
  factuurNummer: string;
  totaal: string;
  vervaldatum: string;
  factuurUrl?: string;
}): string {
  const telefoonnummer = params.telefoon.replace(/\D/g, "").replace(/^0/, "31");

  const bericht = [
    `Geachte ${params.klantNaam},`,
    "",
    `Hierbij stuur ik u factuur *${params.factuurNummer}* met een totaalbedrag van *${params.totaal}*.`,
    "",
    `Vervaldatum: ${params.vervaldatum}`,
    params.factuurUrl ? `Factuur bekijken: ${params.factuurUrl}` : "",
    "",
    `Met vriendelijke groet,`,
    params.bedrijfsnaam,
  ]
    .filter((r) => r !== undefined)
    .join("\n");

  const encodedBericht = encodeURIComponent(bericht);
  return `https://wa.me/${telefoonnummer}?text=${encodedBericht}`;
}

export function maakWhatsAppBerichtTekst(params: {
  klantNaam: string;
  bedrijfsnaam: string;
  factuurNummer: string;
  totaal: string;
  vervaldatum: string;
  factuurUrl?: string;
}): string {
  return [
    `Geachte ${params.klantNaam},`,
    "",
    `Hierbij stuur ik u factuur *${params.factuurNummer}* met een totaalbedrag van *${params.totaal}*.`,
    "",
    `Vervaldatum: ${params.vervaldatum}`,
    params.factuurUrl ? `Factuur bekijken: ${params.factuurUrl}` : "",
    "",
    `Met vriendelijke groet,`,
    params.bedrijfsnaam,
  ]
    .filter((r) => r !== undefined)
    .join("\n");
}

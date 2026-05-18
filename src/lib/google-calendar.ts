const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export interface GoogleKalender {
  id: string;
  samenvatting: string;
  achtergrondKleur?: string;
  primair?: boolean;
}

export interface GoogleAfspraak {
  id: string;
  samenvatting: string;
  omschrijving?: string;
  locatie?: string;
  start: string;
  einde: string;
  geheledag: boolean;
  kalenderId?: string;
  kalenderKleur?: string;
  isPrimair?: boolean;
}

export function maakGoogleAuthUrl(clientId: string, redirectUri: string): string {
  if (!clientId) throw new Error("Google Client ID ontbreekt. Vul dit in bij Instellingen → Google Agenda.");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function wisselCodeVoorTokens(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
) {
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth-gegevens ontbreken. Vul Client ID en Client Secret in bij Instellingen → Google Agenda.");
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`Google token uitwisseling mislukt: ${err || response.statusText}`);
  }
  return response.json();
}

export async function vernieuwAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
) {
  if (!clientId || !clientSecret) throw new Error("Google OAuth-gegevens ontbreken.");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("Token vernieuwen mislukt");
  return response.json();
}

export async function haalKalenderLijst(accessToken: string): Promise<GoogleKalender[]> {
  const response = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = body;
    try { detail = JSON.parse(body)?.error?.message ?? body; } catch {}
    throw new Error(`Kalenderlijst fout ${response.status}: ${detail}`);
  }
  const data = await response.json();
  return (data.items ?? []).map((item: Record<string, unknown>) => ({
    id: item.id as string,
    samenvatting: (item.summary as string) || (item.id as string),
    achtergrondKleur: item.backgroundColor as string | undefined,
    primair: item.primary as boolean | undefined,
  }));
}

export async function haalAgendaAfspraken(
  accessToken: string,
  vanDatum: Date,
  totDatum: Date,
  calendarId = "primary"
): Promise<Omit<GoogleAfspraak, "kalenderId" | "kalenderKleur" | "isPrimair">[]> {
  const params = new URLSearchParams({
    timeMin: vanDatum.toISOString(),
    timeMax: totDatum.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = body;
    try { detail = JSON.parse(body)?.error?.message ?? body; } catch {}
    throw new Error(`Google Calendar fout ${response.status}: ${detail}`);
  }
  const data = await response.json();
  return (data.items ?? []).map((item: Record<string, unknown>) => {
    const startObj = item.start as Record<string, string>;
    const eindObj = item.end as Record<string, string>;
    const geheledag = !!startObj?.date;
    return {
      id: item.id as string,
      samenvatting: (item.summary as string) ?? "(Geen titel)",
      omschrijving: item.description as string | undefined,
      locatie: item.location as string | undefined,
      start: startObj?.dateTime ?? startObj?.date ?? "",
      einde: eindObj?.dateTime ?? eindObj?.date ?? "",
      geheledag,
    };
  });
}

export async function maakGoogleAfspraak(
  accessToken: string,
  calendarId: string,
  afspraak: {
    titel: string;
    startDatumTijd: string;
    eindDatumTijd: string;
    geheledag?: boolean;
    omschrijving?: string;
    locatie?: string;
  }
): Promise<string> {
  const body = afspraak.geheledag
    ? {
        summary: afspraak.titel,
        description: afspraak.omschrijving,
        location: afspraak.locatie,
        start: { date: afspraak.startDatumTijd.split("T")[0] },
        end: { date: afspraak.eindDatumTijd.split("T")[0] },
      }
    : {
        summary: afspraak.titel,
        description: afspraak.omschrijving,
        location: afspraak.locatie,
        start: { dateTime: afspraak.startDatumTijd, timeZone: "Europe/Amsterdam" },
        end: { dateTime: afspraak.eindDatumTijd, timeZone: "Europe/Amsterdam" },
      };

  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    let detail = errBody;
    try { detail = JSON.parse(errBody)?.error?.message ?? errBody; } catch {}
    throw new Error(`Afspraak aanmaken mislukt ${response.status}: ${detail}`);
  }
  const data = await response.json();
  return data.id as string;
}

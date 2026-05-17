const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export interface GoogleAfspraak {
  id: string;
  samenvatting: string;
  omschrijving?: string;
  locatie?: string;
  start: Date;
  einde: Date;
  geheledag: boolean;
  kleur?: string;
}

export function maakGoogleAuthUrl(clientId: string, redirectUri: string): string {
  if (!clientId) throw new Error("Google Client ID ontbreekt. Vul dit in bij Instellingen → Google Agenda.");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
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
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth-gegevens ontbreken.");
  }
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

export async function haalAgendaAfspraken(
  accessToken: string,
  vanDatum: Date,
  totDatum: Date
): Promise<GoogleAfspraak[]> {
  const params = new URLSearchParams({
    timeMin: vanDatum.toISOString(),
    timeMax: totDatum.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/primary/events?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = body;
    try {
      const json = JSON.parse(body);
      detail = json?.error?.message ?? body;
    } catch {}
    throw new Error(`Google Calendar fout ${response.status}: ${detail}`);
  }

  const data = await response.json();
  return (data.items ?? []).map((item: Record<string, unknown>) => {
    const startObj = item.start as Record<string, string>;
    const eindObj = item.end as Record<string, string>;
    const geheledag = !!startObj?.date;
    const start = new Date(startObj?.dateTime ?? startObj?.date ?? "");
    const einde = new Date(eindObj?.dateTime ?? eindObj?.date ?? "");
    return {
      id: item.id as string,
      samenvatting: (item.summary as string) ?? "(Geen titel)",
      omschrijving: item.description as string | undefined,
      locatie: item.location as string | undefined,
      start,
      einde,
      geheledag,
      kleur: item.colorId as string | undefined,
    };
  });
}

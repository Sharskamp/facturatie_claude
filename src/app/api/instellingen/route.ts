import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { wisselCodeVoorTokens } from "@/lib/google-calendar";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const user = await prisma.user.findFirst({
    select: {
      id: true,
      naam: true,
      email: true,
      bedrijfsnaam: true,
      kvkNummer: true,
      btwNummer: true,
      iban: true,
      adres: true,
      postcode: true,
      stad: true,
      telefoon: true,
      website: true,
      logo: true,
      factuurPrefix: true,
      offertePrefix: true,
      emailSmtpHost: true,
      emailSmtpPort: true,
      emailSmtpUser: true,
      emailSmtpSecure: true,
      korActief: true,
      korDrempel: true,
      standaardBetaalTermijn: true,
      standaardBtwTarief: true,
      betalingsherinneringen: true,
      herinneringDagen: true,
      googleRefreshToken: true,
    },
  });

  return NextResponse.json({
    ...user,
    googleGekoppeld: !!user?.googleRefreshToken,
  });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const data = await req.json();
  const { emailSmtpPass, ...rest } = data;

  const updateData: Record<string, unknown> = { ...rest };
  if (emailSmtpPass) updateData.emailSmtpPass = emailSmtpPass;

  const user = await prisma.user.updateMany({ data: updateData });
  return NextResponse.json({ succes: true });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { actie, code, redirectUri } = await req.json();

  if (actie === "google-koppelen") {
    const tokens = await wisselCodeVoorTokens(code, redirectUri);

    await prisma.user.updateMany({
      data: {
        googleRefreshToken: tokens.refresh_token,
        googleAccessToken: tokens.access_token,
        googleTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return NextResponse.json({ succes: true });
  }

  if (actie === "google-ontkoppelen") {
    await prisma.user.updateMany({
      data: {
        googleRefreshToken: null,
        googleAccessToken: null,
        googleTokenExpiry: null,
      },
    });
    return NextResponse.json({ succes: true });
  }

  return NextResponse.json({ fout: "Onbekende actie" }, { status: 400 });
}

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { haalAgendaAfspraken, vernieuwAccessToken } from "@/lib/google-calendar";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ fout: "Niet ingelogd" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const van = searchParams.get("van") ?? new Date().toISOString();
  const tot = searchParams.get("tot") ?? new Date(Date.now() + 30 * 86400000).toISOString();

  const user = await prisma.user.findFirst();
  if (!user?.googleRefreshToken) {
    return NextResponse.json({ fout: "Google Calendar niet gekoppeld", afspraken: [] });
  }

  try {
    let accessToken = user.googleAccessToken;

    // Vernieuw access token als verlopen
    if (!accessToken || !user.googleTokenExpiry || user.googleTokenExpiry < new Date()) {
      const tokens = await vernieuwAccessToken(user.googleRefreshToken);
      accessToken = tokens.access_token;
      await prisma.user.updateMany({
        data: {
          googleAccessToken: tokens.access_token,
          googleTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
        },
      });
    }

    const afspraken = await haalAgendaAfspraken(
      accessToken!,
      new Date(van),
      new Date(tot)
    );

    return NextResponse.json({ afspraken });
  } catch (error) {
    return NextResponse.json(
      { fout: "Fout bij ophalen agenda", details: String(error), afspraken: [] },
      { status: 500 }
    );
  }
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, FileCheck, Eye, Trash2, ArrowRight } from "lucide-react";
import { formatBedrag, formatDatum, statusKleur, statusLabel } from "@/lib/utils";

interface Offerte {
  id: string;
  nummer: string;
  status: string;
  datum: string;
  geldigTot: string;
  totaal: number;
  klant: { naam: string; bedrijf?: string };
}

const statusFilters = ["Alles", "CONCEPT", "VERZONDEN", "GEACCEPTEERD", "AFGEWEZEN", "VERLOPEN"];

export default function OffertesPage() {
  const router = useRouter();
  const [offertes, setOffertes] = useState<Offerte[]>([]);
  const [loading, setLoading] = useState(true);
  const [actieveFilter, setActieveFilter] = useState("Alles");

  useEffect(() => {
    laadOffertes();
  }, [actieveFilter]);

  async function laadOffertes() {
    setLoading(true);
    const params = actieveFilter !== "Alles" ? `?status=${actieveFilter}` : "";
    const res = await fetch(`/api/offertes${params}`);
    const data = await res.json();
    setOffertes(data);
    setLoading(false);
  }

  async function naarFactuur(id: string) {
    if (!confirm("Wil je van deze offerte een factuur maken?")) return;
    const res = await fetch(`/api/offertes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "naar-factuur" }),
    });
    const data = await res.json();
    if (data.factuur) {
      router.push(`/facturen/${data.factuur.id}`);
    }
  }

  async function verwijder(id: string) {
    if (!confirm("Weet je zeker dat je deze offerte wilt verwijderen?")) return;
    await fetch(`/api/offertes/${id}`, { method: "DELETE" });
    laadOffertes();
  }

  return (
    <div>
      <Header
        titel="Offertes"
        subtitel="Beheer je offertes en zet ze om naar facturen"
        acties={
          <Button onClick={() => router.push("/offertes/nieuw")}>
            <Plus className="h-4 w-4" /> Nieuwe offerte
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Status filters */}
        <div className="flex gap-2 flex-wrap">
          {statusFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActieveFilter(filter)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                actieveFilter === filter
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {filter === "Alles" ? "Alles" : statusLabel(filter)}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Geldig tot</TableHead>
                  <TableHead className="text-right">Totaal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-gray-500">
                      Laden...
                    </TableCell>
                  </TableRow>
                ) : offertes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-gray-500">
                      <FileCheck className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      Geen offertes gevonden
                    </TableCell>
                  </TableRow>
                ) : (
                  offertes.map((offerte) => (
                    <TableRow key={offerte.id} className="cursor-pointer">
                      <TableCell className="font-medium text-indigo-600">{offerte.nummer}</TableCell>
                      <TableCell>
                        <div className="font-medium">{offerte.klant.naam}</div>
                        {offerte.klant.bedrijf && (
                          <div className="text-xs text-gray-500">{offerte.klant.bedrijf}</div>
                        )}
                      </TableCell>
                      <TableCell>{formatDatum(offerte.datum)}</TableCell>
                      <TableCell>{formatDatum(offerte.geldigTot)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatBedrag(offerte.totaal)}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusKleur(offerte.status)}`}>
                          {statusLabel(offerte.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {offerte.status !== "GEACCEPTEERD" && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => naarFactuur(offerte.id)}
                              title="Omzetten naar factuur"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => verwijder(offerte.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

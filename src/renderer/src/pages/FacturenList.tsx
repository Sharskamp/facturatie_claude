import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileText, Eye, Loader2, Search, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBedrag, formatDatum, statusKleur, statusLabel } from "@/lib/utils";

interface Factuur {
  id: string;
  nummer: string;
  datum: string;
  vervaldatum: string;
  totaal: number;
  status: string;
  klant: { id: string; naam: string; bedrijf?: string | null };
}

type StatusFilter = "ALLES" | "CONCEPT" | "VERZONDEN" | "BETAALD" | "VERLOPEN";

const STATUS_TABS: { label: string; waarde: StatusFilter }[] = [
  { label: "Alles", waarde: "ALLES" },
  { label: "Concept", waarde: "CONCEPT" },
  { label: "Verzonden", waarde: "VERZONDEN" },
  { label: "Betaald", waarde: "BETAALD" },
  { label: "Verlopen", waarde: "VERLOPEN" },
];

export default function FacturenPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initieleStatus = (searchParams.get("status") as StatusFilter) ?? "ALLES";

  const [facturen, setFacturen] = useState<Factuur[]>([]);
  const [laden, setLaden] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initieleStatus);
  const [zoekterm, setZoekterm] = useState("");
  const [verwijderModalOpen, setVerwijderModalOpen] = useState(false);
  const [teVerwijderen, setTeVerwijderen] = useState<Factuur | null>(null);

  const laadFacturen = useCallback(async (status: StatusFilter) => {
    setLaden(true);
    try {
      const params: Record<string, string> = {};
      if (status !== "ALLES") params.status = status;
      const data = await window.api.facturen.list(Object.keys(params).length ? params : undefined);
      setFacturen(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Fout bij laden facturen:", e);
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    laadFacturen(statusFilter);
  }, [statusFilter, laadFacturen]);

  function wisselStatus(s: StatusFilter) {
    setStatusFilter(s);
    setZoekterm("");
    navigate(`/facturen${s !== "ALLES" ? `?status=${s}` : ""}`, { replace: true });
  }

  function openVerwijder(f: Factuur, e: React.MouseEvent) {
    e.stopPropagation();
    setTeVerwijderen(f);
    setVerwijderModalOpen(true);
  }

  async function verwijder() {
    if (!teVerwijderen) return;
    try {
      await window.api.facturen.delete(teVerwijderen.id);
      setVerwijderModalOpen(false);
      setTeVerwijderen(null);
      laadFacturen(statusFilter);
    } catch (e) {
      console.error("Fout bij verwijderen:", e);
    }
  }

  // Lokale zoekfilter
  const gefilterd = facturen.filter((f) => {
    if (!zoekterm) return true;
    const z = zoekterm.toLowerCase();
    return (
      f.nummer.toLowerCase().includes(z) ||
      f.klant.naam.toLowerCase().includes(z) ||
      (f.klant.bedrijf ?? "").toLowerCase().includes(z)
    );
  });

  // Aantallen per status
  const aantallen = facturen.reduce(
    (acc, f) => {
      acc[f.status] = (acc[f.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const isVerlopen = (f: Factuur) =>
    f.status === "VERZONDEN" && new Date(f.vervaldatum) < new Date();

  return (
    <div>
      <Header
        titel="Facturen"
        subtitel={`${facturen.length} factuur${facturen.length !== 1 ? "en" : ""}`}
        acties={
          <Button onClick={() => navigate("/facturen/nieuw")}>
            <Plus className="h-4 w-4" />
            Nieuwe factuur
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Status tabs */}
        <div className="flex flex-wrap items-center gap-1 border-b border-gray-200">
          {STATUS_TABS.map((tab) => {
            const actief = statusFilter === tab.waarde;
            const aantal =
              tab.waarde === "ALLES"
                ? facturen.length
                : (aantallen[tab.waarde] ?? 0);
            return (
              <button
                key={tab.waarde}
                onClick={() => wisselStatus(tab.waarde)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  actief
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                }`}
              >
                {tab.label}
                {aantal > 0 && (
                  <span
                    className={`inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-xs font-semibold ${
                      actief
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {aantal}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Zoekbalk */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Zoek op nummer of klant..."
            value={zoekterm}
            onChange={(e) => setZoekterm(e.target.value)}
            className="flex h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-1 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {laden ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              </div>
            ) : gefilterd.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <FileText className="h-12 w-12 text-gray-200 mb-3" />
                <p className="text-gray-500 font-medium">
                  {zoekterm ? "Geen facturen gevonden" : "Geen facturen"}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {zoekterm
                    ? "Probeer een andere zoekterm"
                    : statusFilter === "ALLES"
                    ? "Maak uw eerste factuur aan"
                    : `Geen ${statusLabel(statusFilter).toLowerCase()} facturen`}
                </p>
                {statusFilter === "ALLES" && !zoekterm && (
                  <Button
                    className="mt-4"
                    size="sm"
                    onClick={() => navigate("/facturen/nieuw")}
                  >
                    <Plus className="h-4 w-4" />
                    Nieuwe factuur
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nummer</TableHead>
                    <TableHead>Klant</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Vervaldatum</TableHead>
                    <TableHead className="text-right">Totaal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gefilterd.map((f) => {
                    const verlopen = isVerlopen(f);
                    const effectiefStatus = verlopen ? "VERLOPEN" : f.status;
                    return (
                      <TableRow
                        key={f.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/facturen/${f.id}`)}
                      >
                        <TableCell className="font-mono text-sm font-medium text-indigo-700">
                          {f.nummer}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-gray-900">
                              {f.klant.naam}
                            </p>
                            {f.klant.bedrijf && (
                              <p className="text-xs text-gray-400">
                                {f.klant.bedrijf}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-500">
                          {formatDatum(f.datum)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              verlopen
                                ? "text-red-600 font-medium"
                                : "text-gray-500"
                            }
                          >
                            {formatDatum(f.vervaldatum)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-gray-900">
                          {formatBedrag(f.totaal)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusKleur(effectiefStatus)}`}
                          >
                            {statusLabel(effectiefStatus)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/facturen/${f.id}`);
                              }}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Bekijken"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => openVerwijder(f, e)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Verwijderen"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Verwijder modal */}
      <Modal open={verwijderModalOpen} onOpenChange={setVerwijderModalOpen}>
        <ModalContent className="max-w-md">
          <ModalHeader>
            <ModalTitle>Factuur verwijderen</ModalTitle>
          </ModalHeader>
          <p className="text-sm text-gray-600">
            Weet u zeker dat u factuur{" "}
            <span className="font-semibold">{teVerwijderen?.nummer}</span> wilt
            verwijderen? Dit kan niet ongedaan worden gemaakt.
          </p>
          <ModalFooter className="mt-4 gap-2">
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button variant="destructive" onClick={verwijder}>
              Verwijderen
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

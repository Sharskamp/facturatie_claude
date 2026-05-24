import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";
import { Loader2, Plus, CheckCircle, Trash2, FileText, ScanLine } from "lucide-react";
import { formatBedrag, formatDatum } from "@/lib/utils";

interface Crediteur {
  id: string;
  leverancier: string;
  factuurNummer?: string | null;
  factuurdatum: string;
  vervaldatum: string;
  bedrag: number;
  btwBedrag: number;
  btwPercentage: number;
  status: "OPENSTAAND" | "BETAALD";
  betaaldOp?: string | null;
  notities?: string | null;
}

const leegFormulier = {
  leverancier: "",
  factuurNummer: "",
  factuurdatum: new Date().toISOString().slice(0, 10),
  vervaldatum: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  bedrag: "",
  btwPercentage: "21",
  notities: "",
};

function isVervallen(crediteur: Crediteur): boolean {
  return crediteur.status === "OPENSTAAND" && new Date(crediteur.vervaldatum) < new Date();
}

export default function CrediteurenPage() {
  const [crediteuren, setCrediteuren] = useState<Crediteur[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"Openstaand" | "Alles">("Alles");
  const [modalOpen, setModalOpen] = useState(false);
  const [formulier, setFormulier] = useState(leegFormulier);
  const [opslaan, setOpslaan] = useState(false);
  const [scanBezig, setScanBezig] = useState(false);

  const laadCrediteuren = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === "Openstaand" ? { status: "OPENSTAAND" } : undefined;
      const data = await window.api.crediteuren.list(params);
      setCrediteuren(data as Crediteur[]);
    } catch (e) {
      console.error("Fout bij laden:", e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    laadCrediteuren();
  }, [laadCrediteuren]);

  async function markeerBetaald(id: string) {
    if (!confirm("Wil je deze factuur als betaald markeren?")) return;
    try {
      await window.api.crediteuren.update(id, {
        status: "BETAALD",
        betaaldOp: new Date().toISOString(),
      });
      await laadCrediteuren();
    } catch (e) {
      console.error("Fout bij markeren als betaald:", e);
    }
  }

  async function verwijder(id: string) {
    if (!confirm("Weet je zeker dat je deze factuur wilt verwijderen?")) return;
    try {
      await window.api.crediteuren.delete(id);
      await laadCrediteuren();
    } catch (e) {
      console.error("Fout bij verwijderen:", e);
    }
  }

  async function handleOpslaan() {
    if (!formulier.leverancier.trim()) return;
    if (!formulier.bedrag) return;
    if (new Date(formulier.vervaldatum) < new Date(formulier.factuurdatum)) {
      alert("Vervaldatum moet na de factuurdatum liggen.");
      return;
    }
    if (parseFloat(formulier.bedrag) <= 0) {
      alert("Bedrag moet groter dan 0 zijn.");
      return;
    }
    setOpslaan(true);
    const bedrag = parseFloat(formulier.bedrag);
    const btwPercentage = parseInt(formulier.btwPercentage);
    const btwBedrag = (bedrag * btwPercentage) / 100;
    await window.api.crediteuren.create({
      leverancier: formulier.leverancier.trim(),
      factuurNummer: formulier.factuurNummer.trim() || null,
      factuurdatum: new Date(formulier.factuurdatum).toISOString(),
      vervaldatum: new Date(formulier.vervaldatum).toISOString(),
      bedrag,
      btwBedrag,
      btwPercentage,
      notities: formulier.notities.trim() || null,
    });
    setModalOpen(false);
    setFormulier(leegFormulier);
    setOpslaan(false);
    laadCrediteuren();
  }

  const scanFactuur = async () => {
    setScanBezig(true);
    try {
      const res = await window.api.scan.kiesEnScan();
      if (!res.succes) {
        if (res.fout) alert(`Scan mislukt: ${res.fout}`);
        return;
      }
      const v = res.velden!;
      if (!v || v.error) {
        alert(`OCR fout: ${v?.error || 'Kon gegevens niet lezen. Probeer een beter afbeelding.'}`);
        return;
      }
      let btwPercentage = 21;
      if (v.subtotaal != null && v.btwBedrag != null && v.subtotaal > 0) {
        const berekend = Math.round((v.btwBedrag / v.subtotaal) * 100);
        if (berekend <= 2) btwPercentage = 0;
        else if (berekend <= 14) btwPercentage = 9;
        else btwPercentage = 21;
      }
      const factuurdatum = v.datum ?? new Date().toISOString().slice(0, 10);
      const vervaldatum = v.vervaldatum ?? new Date(new Date(factuurdatum).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setFormulier({
        leverancier: v.klantNaam ?? '',
        factuurNummer: v.nummer ?? '',
        factuurdatum,
        vervaldatum,
        bedrag: v.subtotaal != null ? String(v.subtotaal) : (v.totaal != null ? String(v.totaal) : ''),
        btwPercentage: String(btwPercentage),
        notities: '',
      });
      setModalOpen(true);
    } catch {
      alert('Scan mislukt');
    } finally {
      setScanBezig(false);
    }
  };

  const totaalOpenstaand = crediteuren
    .filter((c) => c.status === "OPENSTAAND")
    .reduce((som, c) => som + c.bedrag + c.btwBedrag, 0);

  const totaalBetaald = crediteuren
    .filter((c) => c.status === "BETAALD")
    .reduce((som, c) => som + c.bedrag + c.btwBedrag, 0);

  const zichtbareCrediteuren =
    filter === "Openstaand"
      ? crediteuren.filter((c) => c.status === "OPENSTAAND")
      : crediteuren;

  return (
    <div>
      <Header
        titel="Crediteuren"
        subtitel="Inkomende leveranciersfacturen"
        acties={
          <div className="flex gap-2">
            <Button variant="outline" onClick={scanFactuur} disabled={scanBezig}>
              {scanBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              {scanBezig ? 'Scannen...' : 'Scan factuur'}
            </Button>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> Nieuwe factuur
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Stat-cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Totaal openstaand</CardDescription>
              <CardTitle className="text-2xl text-red-600">{formatBedrag(totaalOpenstaand)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Totaal betaald</CardDescription>
              <CardTitle className="text-2xl text-green-600">{formatBedrag(totaalBetaald)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filterknoppen */}
        <div className="flex gap-2">
          {(["Openstaand", "Alles"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Tabel */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leverancier</TableHead>
                  <TableHead>Factuurnummer</TableHead>
                  <TableHead>Factuurdatum</TableHead>
                  <TableHead>Vervaldatum</TableHead>
                  <TableHead className="text-right">Bedrag (incl. btw)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-gray-500">
                      <Loader2 className="h-6 w-6 mx-auto animate-spin text-gray-300" />
                    </TableCell>
                  </TableRow>
                ) : zichtbareCrediteuren.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-gray-500">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      Geen facturen gevonden
                    </TableCell>
                  </TableRow>
                ) : (
                  zichtbareCrediteuren.map((c) => (
                    <TableRow
                      key={c.id}
                      className={isVervallen(c) ? "bg-red-50 hover:bg-red-100" : ""}
                    >
                      <TableCell className="font-medium max-w-[160px] truncate">{c.leverancier}</TableCell>
                      <TableCell className="text-gray-500 max-w-[120px] truncate">
                        {c.factuurNummer ?? <span className="text-gray-300">—</span>}
                      </TableCell>
                      <TableCell>{formatDatum(c.factuurdatum)}</TableCell>
                      <TableCell className={isVervallen(c) ? "text-red-600 font-medium" : ""}>
                        {formatDatum(c.vervaldatum)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatBedrag(c.bedrag + c.btwBedrag)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            c.status === "BETAALD"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {c.status === "BETAALD" ? "Betaald" : "Openstaand"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {c.status === "OPENSTAAND" && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => markeerBetaald(c.id)}
                              title="Betaald markeren"
                            >
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => verwijder(c.id)}
                            title="Verwijderen"
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

      {/* Modal: nieuwe factuur */}
      <Modal open={modalOpen} onOpenChange={setModalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Nieuwe leveranciersfactuur</ModalTitle>
          </ModalHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Leverancier <span className="text-red-500">*</span>
              </label>
              <Input
                value={formulier.leverancier}
                onChange={(e) => setFormulier({ ...formulier, leverancier: e.target.value })}
                placeholder="Naam leverancier"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Factuurnummer
              </label>
              <Input
                value={formulier.factuurNummer}
                onChange={(e) => setFormulier({ ...formulier, factuurNummer: e.target.value })}
                placeholder="Optioneel"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Factuurdatum <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={formulier.factuurdatum}
                  onChange={(e) => setFormulier({ ...formulier, factuurdatum: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vervaldatum <span className="text-red-500">*</span>
                </label>
                <Input
                  type="date"
                  value={formulier.vervaldatum}
                  onChange={(e) => setFormulier({ ...formulier, vervaldatum: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bedrag (excl. btw) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formulier.bedrag}
                  onChange={(e) => setFormulier({ ...formulier, bedrag: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  BTW-percentage <span className="text-red-500">*</span>
                </label>
                <select
                  value={formulier.btwPercentage}
                  onChange={(e) => setFormulier({ ...formulier, btwPercentage: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="0">0%</option>
                  <option value="9">9%</option>
                  <option value="21">21%</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notities</label>
              <Textarea
                value={formulier.notities}
                onChange={(e) => setFormulier({ ...formulier, notities: e.target.value })}
                placeholder="Optionele notities..."
                rows={3}
              />
            </div>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Annuleren
            </Button>
            <Button
              onClick={handleOpslaan}
              disabled={opslaan || !formulier.leverancier.trim() || !formulier.bedrag}
            >
              {opslaan ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Opslaan
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

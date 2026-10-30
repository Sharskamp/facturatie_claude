import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalFooter } from "@/components/ui/modal";
import { Loader2, Plus, Trash2, Pencil, ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { formatBedrag, formatDatum } from "@/lib/utils";

interface PriveTransactie {
  id: string;
  datum: string;
  type: "STORTING" | "ONTTREKKING";
  bedrag: number;
  omschrijving: string;
  notities?: string | null;
}

const leegFormulier = {
  datum: new Date().toISOString().slice(0, 10),
  type: "STORTING" as "STORTING" | "ONTTREKKING",
  bedrag: "",
  omschrijving: "",
  notities: "",
};

export default function PriveTransacties() {
  const [transacties, setTransacties] = useState<PriveTransactie[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [formulier, setFormulier] = useState(leegFormulier);
  const [opslaan, setOpslaan] = useState(false);
  const [jaarFilter, setJaarFilter] = useState(new Date().getFullYear());

  const laadTransacties = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.privetransacties.list({ jaar: jaarFilter });
      setTransacties(data as PriveTransactie[]);
    } catch (e) {
      console.error("Fout bij laden:", e);
    } finally {
      setLoading(false);
    }
  }, [jaarFilter]);

  useEffect(() => {
    laadTransacties();
  }, [laadTransacties]);

  function openNieuw() {
    setBewerkenId(null);
    setFormulier(leegFormulier);
    setModalOpen(true);
  }

  function openBewerken(t: PriveTransactie) {
    setBewerkenId(t.id);
    setFormulier({
      datum: t.datum.slice(0, 10),
      type: t.type,
      bedrag: String(t.bedrag),
      omschrijving: t.omschrijving,
      notities: t.notities ?? "",
    });
    setModalOpen(true);
  }

  async function handleOpslaan() {
    if (!formulier.omschrijving.trim()) return;
    if (!formulier.bedrag || parseFloat(formulier.bedrag) <= 0) {
      alert("Voer een geldig bedrag in.");
      return;
    }
    setOpslaan(true);
    const data = {
      datum: new Date(formulier.datum).toISOString(),
      type: formulier.type,
      bedrag: parseFloat(formulier.bedrag),
      omschrijving: formulier.omschrijving.trim(),
      notities: formulier.notities.trim() || null,
    };
    try {
      if (bewerkenId) {
        await window.api.privetransacties.update(bewerkenId, data);
      } else {
        await window.api.privetransacties.create(data);
      }
      setModalOpen(false);
      await laadTransacties();
    } catch (e) {
      console.error("Fout bij opslaan:", e);
      alert("Opslaan mislukt.");
    } finally {
      setOpslaan(false);
    }
  }

  async function verwijder(id: string) {
    if (!confirm("Weet je zeker dat je deze transactie wilt verwijderen?")) return;
    try {
      await window.api.privetransacties.delete(id);
      await laadTransacties();
    } catch (e) {
      console.error("Fout bij verwijderen:", e);
    }
  }

  const totalStortingen = transacties
    .filter(t => t.type === "STORTING")
    .reduce((s, t) => s + t.bedrag, 0);
  const totalOnttrekkingen = transacties
    .filter(t => t.type === "ONTTREKKING")
    .reduce((s, t) => s + t.bedrag, 0);
  const saldo = totalStortingen - totalOnttrekkingen;

  const jaren = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="flex flex-col h-full">
      <Header title="Privé transacties" />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Samenvatting */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4 text-green-500" />
                Stortingen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatBedrag(totalStortingen)}</p>
              <p className="text-xs text-gray-400 mt-1">Geld dat je in de zaak hebt gestort</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4 text-red-500" />
                Onttrekkingen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">{formatBedrag(totalOnttrekkingen)}</p>
              <p className="text-xs text-gray-400 mt-1">Geld dat je uit de zaak hebt opgenomen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-indigo-500" />
                Saldo privévermogen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${saldo >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatBedrag(saldo)}
              </p>
              <p className="text-xs text-gray-400 mt-1">Stortingen minus onttrekkingen</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Overzicht {jaarFilter}</CardTitle>
              <div className="flex items-center gap-3">
                <select
                  value={jaarFilter}
                  onChange={e => setJaarFilter(Number(e.target.value))}
                  className="border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800"
                >
                  {jaren.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
                <Button onClick={openNieuw} size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Toevoegen
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              </div>
            ) : transacties.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Wallet className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>Geen privé transacties in {jaarFilter}.</p>
                <p className="text-sm mt-1">Voeg stortingen en onttrekkingen toe voor je belastingaangifte.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Omschrijving</TableHead>
                    <TableHead className="text-right">Bedrag</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transacties.map(t => (
                    <TableRow key={t.id}>
                      <TableCell>{formatDatum(t.datum)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.type === "STORTING"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {t.type === "STORTING"
                            ? <ArrowDownCircle className="h-3 w-3" />
                            : <ArrowUpCircle className="h-3 w-3" />
                          }
                          {t.type === "STORTING" ? "Storting" : "Onttrekking"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span>{t.omschrijving}</span>
                        {t.notities && (
                          <p className="text-xs text-gray-400 mt-0.5">{t.notities}</p>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        t.type === "STORTING" ? "text-green-600" : "text-red-600"
                      }`}>
                        {t.type === "ONTTREKKING" ? "-" : "+"}{formatBedrag(t.bedrag)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openBewerken(t)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => verwijder(t.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Modal open={modalOpen} onOpenChange={setModalOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>{bewerkenId ? "Transactie bewerken" : "Nieuwe privé transactie"}</ModalTitle>
          </ModalHeader>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Datum</label>
                <Input type="date" value={formulier.datum} onChange={e => setFormulier(f => ({ ...f, datum: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Type</label>
                <select
                  value={formulier.type}
                  onChange={e => setFormulier(f => ({ ...f, type: e.target.value as "STORTING" | "ONTTREKKING" }))}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800"
                >
                  <option value="STORTING">Storting (privé → zaak)</option>
                  <option value="ONTTREKKING">Onttrekking (zaak → privé)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Bedrag (€)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={formulier.bedrag}
                onChange={e => setFormulier(f => ({ ...f, bedrag: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Omschrijving</label>
              <Input
                placeholder="Bijv. Laptop gekocht van privérekening"
                value={formulier.omschrijving}
                onChange={e => setFormulier(f => ({ ...f, omschrijving: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Notities (optioneel)</label>
              <Textarea
                placeholder="Extra toelichting..."
                value={formulier.notities}
                onChange={e => setFormulier(f => ({ ...f, notities: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Annuleren</Button>
            <Button onClick={handleOpslaan} disabled={opslaan}>
              {opslaan && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Opslaan
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

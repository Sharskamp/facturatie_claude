import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Link, TrendingUp, Unlink, Search, Loader2, BookOpen } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  ModalClose,
} from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBedrag, formatDatum } from "@/lib/utils";

interface Inkomen {
  id: string;
  datum: string;
  omschrijving: string;
  bron: string;
  bedrag: number;
  factuurId?: string | null;
  factuur?: { nummer: string } | null;
  notities?: string | null;
  geboektAlsOmzet: boolean;
  tegenrekeningNaam?: string | null;
  tegenrekening?: string | null;
  mutatiesoort?: string | null;
  mededelingen?: string | null;
  betalingskenmerk?: string | null;
  saldoNaBoeking?: string | null;
}

interface Factuur {
  id: string;
  nummer: string;
  klant?: { naam: string } | null;
  totaal: number;
  status: string;
  vervaldatum?: string | null;
}

interface FactuurMetBetaling extends Factuur {
  reedsBetaald: number;
  openstaand: number;
}

interface MatchData {
  matchType: 'volledig' | 'alleenNummer' | 'bedrag' | 'geen';
  volledigeMatches: FactuurMetBetaling[];
  alleenNummerMatches: FactuurMetBetaling[];
  bedragMatches: FactuurMetBetaling[];
  alleOpen: FactuurMetBetaling[];
  alleFacturen: FactuurMetBetaling[];
}

const BRON_OPTIES = ["Bank", "Contant", "PayPal", "iDEAL", "Overig"];

function FactuurMatchRij({
  factuur,
  betaling,
  geselecteerd,
  onToggle,
}: {
  factuur: FactuurMetBetaling;
  betaling: number;
  geselecteerd: boolean;
  onToggle: () => void;
}) {
  const verschil = betaling - factuur.openstaand;
  const isExact = Math.abs(verschil) <= Math.max(factuur.openstaand * 0.02, 0.02);
  const teLaag = verschil < -0.02;
  const teHoog = verschil > 0.02 && !isExact;

  return (
    <label
      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
        geselecteerd
          ? "border-indigo-400 bg-indigo-50"
          : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
      }`}
    >
      <input
        type="checkbox"
        checked={geselecteerd}
        onChange={onToggle}
        className="mt-0.5 h-4 w-4 text-indigo-600 border-gray-300 rounded"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900">
            {factuur.nummer}
            {factuur.klant ? ` — ${factuur.klant.naam}` : ""}
          </p>
          <div className="flex items-center gap-2 text-xs">
            {isExact ? (
              <span className="text-green-700 font-medium bg-green-100 px-2 py-0.5 rounded-full">Exact</span>
            ) : teLaag ? (
              <span className="text-red-700 font-medium bg-red-100 px-2 py-0.5 rounded-full">
                Te weinig ({formatBedrag(Math.abs(verschil))})
              </span>
            ) : teHoog ? (
              <span className="text-amber-700 font-medium bg-amber-100 px-2 py-0.5 rounded-full">
                Te veel ({formatBedrag(Math.abs(verschil))})
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
          <span>Totaal: {formatBedrag(factuur.totaal)}</span>
          {factuur.reedsBetaald > 0 && (
            <span className="text-amber-600">Al betaald: {formatBedrag(factuur.reedsBetaald)}</span>
          )}
          <span className="font-medium text-gray-700">Openstaand: {formatBedrag(factuur.openstaand)}</span>
          {factuur.vervaldatum && (
            <span>Vervalt {formatDatum(factuur.vervaldatum)}</span>
          )}
        </div>
      </div>
    </label>
  );
}

const huidigeMaand = () => {
  const nu = new Date();
  return `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}`;
};

export default function InkomenPagina() {
  const [inkomens, setInkomens] = useState<Inkomen[]>([]);
  const [facturen, setFacturen] = useState<Factuur[]>([]);
  const [laden, setLaden] = useState(true);
  const [maandFilter, setMaandFilter] = useState(huidigeMaand());
  const [bankVelden, setBankVelden] = useState<string[]>([
    'datum', 'omschrijving', 'tegenrekeningNaam', 'tegenrekening', 'mutatiesoort', 'mededelingen', 'betalingskenmerk', 'saldoNaBoeking', 'bedrag', 'bron', 'factuur'
  ]);
  const [spaarVelden, setSpaarVelden] = useState<string[]>([]);
  const [verbergSpaarrekeningen, setVerbergSpaarrekeningen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [bewerkenId, setBewerkenId] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ type: "succes" | "fout"; tekst: string } | null>(null);
  const [koppelModalOpen, setKoppelModalOpen] = useState(false);
  const [koppelInkomenId, setKoppelInkomenId] = useState<string | null>(null);
  const [koppelFactuurId, setKoppelFactuurId] = useState("");

  // Smart-match koppeling state
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchInkomen, setMatchInkomen] = useState<Inkomen | null>(null);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [matchLaden, setMatchLaden] = useState(false);
  const [matchGeselecteerdeIds, setMatchGeselecteerdeIds] = useState<string[]>([]);
  const [toontAlleFacturen, setToontAlleFacturen] = useState(false);

  const [formulier, setFormulier] = useState({
    datum: new Date().toISOString().split("T")[0],
    omschrijving: "",
    bedrag: "",
    bron: "Bank",
    factuurId: "",
    notities: "",
  });

  const haalInkomensOp = useCallback(async () => {
    try {
      const data = await window.api.inkomen.list({ maand: maandFilter });
      setInkomens(Array.isArray(data) ? data : (data as any).inkomens ?? []);
    } catch {
      toonMelding("fout", "Kon inkomens niet laden");
    } finally {
      setLaden(false);
    }
  }, [maandFilter]);

  const haalFacturenOp = useCallback(async () => {
    try {
      const data = await window.api.facturen.list({ status: "VERZONDEN" });
      setFacturen(Array.isArray(data) ? data : (data as any).facturen ?? []);
    } catch {
      // stil falen
    }
  }, []);

  const haalInstellingenOp = useCallback(async () => {
    try {
      const inst = await window.api.instellingen.get() as any;
      if (inst?.bankWeergaveVelden) {
        try {
          const velden = JSON.parse(inst.bankWeergaveVelden);
          if (Array.isArray(velden) && velden.length > 0) setBankVelden(velden);
        } catch {}
      }
      if (inst?.spaarrekeningen) {
        try {
          const spaar = JSON.parse(inst.spaarrekeningen);
          if (Array.isArray(spaar)) setSpaarVelden(spaar);
        } catch {}
      }
    } catch {}
  }, []);

  useEffect(() => {
    haalInkomensOp();
    haalFacturenOp();
    haalInstellingenOp();
  }, [haalInkomensOp, haalFacturenOp, haalInstellingenOp]);

  useEffect(() => {
    const handler = () => haalInstellingenOp();
    window.addEventListener('bankVeldenGewijzigd', handler);
    return () => window.removeEventListener('bankVeldenGewijzigd', handler);
  }, [haalInstellingenOp]);

  const autoKoppelBezig = useRef(false);
  useEffect(() => {
    if (laden || autoKoppelBezig.current) return;
    const ongekoppeld = inkomens.filter(i => !i.factuurId && !i.geboektAlsOmzet && i.bron === "Bankimport");
    if (ongekoppeld.length === 0) return;
    autoKoppelBezig.current = true;
    (async () => {
      let gekoppeld = 0;
      for (const inkomen of ongekoppeld) {
        try {
          const match = await window.api.bank.zoekFactuurMatch({
            bedrag: inkomen.bedrag,
            datum: inkomen.datum,
            omschrijving: inkomen.omschrijving ?? undefined,
            mededelingen: inkomen.mededelingen ?? undefined,
            betalingskenmerk: inkomen.betalingskenmerk ?? undefined,
          }) as { matchType: string; volledigeMatches: { id: string; nummer: string }[]; alleenNummerMatches: { id: string; nummer: string }[] };
          const kandidaat =
            match.matchType === "volledig" && match.volledigeMatches.length === 1 ? match.volledigeMatches[0]
            : match.matchType === "alleenNummer" && match.alleenNummerMatches.length === 1 ? match.alleenNummerMatches[0]
            : null;
          if (kandidaat) {
            await window.api.bank.koppelAanFactuur({ inkomstenId: inkomen.id, factuurId: kandidaat.id });
            gekoppeld++;
          }
        } catch { /* stil falen per betaling */ }
      }
      if (gekoppeld > 0) {
        toonMelding("succes", `${gekoppeld} betaling${gekoppeld !== 1 ? "en" : ""} automatisch gekoppeld aan een factuur`);
        haalInkomensOp();
        haalFacturenOp();
      }
      autoKoppelBezig.current = false;
    })();
  }, [laden, inkomens, haalInkomensOp, haalFacturenOp]);

  const toonMelding = (type: "succes" | "fout", tekst: string) => {
    setMelding({ type, tekst });
    setTimeout(() => setMelding(null), 4000);
  };

  const resetFormulier = () => {
    setFormulier({
      datum: new Date().toISOString().split("T")[0],
      omschrijving: "",
      bedrag: "",
      bron: "Bank",
      factuurId: "",
      notities: "",
    });
    setBewerkenId(null);
  };

  const openBewerken = (inkomen: Inkomen) => {
    setFormulier({
      datum: inkomen.datum.split("T")[0],
      omschrijving: inkomen.omschrijving,
      bedrag: String(inkomen.bedrag),
      bron: inkomen.bron,
      factuurId: inkomen.factuurId ?? "",
      notities: inkomen.notities ?? "",
    });
    setBewerkenId(inkomen.id);
    setModalOpen(true);
  };

  const slaOp = async () => {
    if (!formulier.omschrijving || !formulier.bedrag) {
      toonMelding("fout", "Vul alle verplichte velden in");
      return;
    }
    const payload = {
      ...formulier,
      bedrag: parseFloat(formulier.bedrag),
      factuurId: formulier.factuurId || null,
      // Handmatig toegevoegde inkomsten tellen altijd mee als omzet
      ...(bewerkenId ? {} : { geboektAlsOmzet: true }),
    };
    try {
      if (bewerkenId) {
        await window.api.inkomen.update(bewerkenId, payload);
      } else {
        await window.api.inkomen.create(payload);
      }
      toonMelding("succes", bewerkenId ? "Inkomen bijgewerkt" : "Inkomen toegevoegd");
      setModalOpen(false);
      resetFormulier();
      haalInkomensOp();
    } catch {
      toonMelding("fout", "Opslaan mislukt");
    }
  };

  const verwijder = async (id: string) => {
    if (!confirm("Weet je zeker dat je dit inkomen wilt verwijderen?")) return;
    try {
      await window.api.inkomen.delete(id);
      toonMelding("succes", "Inkomen verwijderd");
      haalInkomensOp();
    } catch {
      toonMelding("fout", "Verwijderen mislukt");
    }
  };

  const openKoppel = (inkomenId: string) => {
    setKoppelInkomenId(inkomenId);
    setKoppelFactuurId("");
    setKoppelModalOpen(true);
  };

  const slaKoppelOp = async () => {
    if (!koppelInkomenId || !koppelFactuurId) return;
    try {
      await window.api.inkomen.update(koppelInkomenId, { factuurId: koppelFactuurId });
      toonMelding("succes", "Gekoppeld aan factuur");
      setKoppelModalOpen(false);
      haalInkomensOp();
    } catch {
      toonMelding("fout", "Koppelen mislukt");
    }
  };

  const ontkoppel = async (id: string) => {
    try {
      await window.api.inkomen.update(id, { factuurId: null });
      toonMelding("succes", "Ontkoppeld van factuur");
      haalInkomensOp();
    } catch {
      toonMelding("fout", "Verbindingsfout");
    }
  };

  const boekAlsOmzet = async (id: string) => {
    try {
      await window.api.inkomen.update(id, { geboektAlsOmzet: true });
      toonMelding("succes", "Geboekt als losse omzet");
      haalInkomensOp();
    } catch {
      toonMelding("fout", "Bijwerken mislukt");
    }
  };

  const openSmartKoppel = async (inkomen: Inkomen) => {
    setMatchInkomen(inkomen);
    setMatchGeselecteerdeIds([]);
    setMatchData(null);
    setToontAlleFacturen(false);
    setMatchLaden(true);

    let data: MatchData;
    try {
      const res = await window.api.bank.zoekFactuurMatch({
        bedrag: inkomen.bedrag,
        datum: inkomen.datum,
        omschrijving: inkomen.omschrijving ?? undefined,
        mededelingen: inkomen.mededelingen ?? undefined,
        betalingskenmerk: inkomen.betalingskenmerk ?? undefined,
      });
      data = res as MatchData;
    } catch {
      data = { matchType: 'geen', volledigeMatches: [], alleenNummerMatches: [], bedragMatches: [], alleOpen: [] };
    }

    // Auto-koppel wanneer zowel factuurnummer als bedrag exact overeenkomen (1 match)
    if (data.matchType === 'volledig' && data.volledigeMatches.length === 1) {
      const factuur = data.volledigeMatches[0];
      try {
        const res = await window.api.bank.koppelAanFactuur({ inkomstenId: inkomen.id, factuurId: factuur.id });
        const volledigBetaald = (res as any).volledigBetaald;
        toonMelding("succes", volledigBetaald
          ? `Factuur ${factuur.nummer} automatisch gekoppeld en volledig betaald`
          : `Betaling automatisch geboekt op factuur ${factuur.nummer} (gedeeltelijk)`
        );
        haalInkomensOp();
        haalFacturenOp();
      } catch {
        toonMelding("fout", "Automatisch koppelen mislukt");
      }
      setMatchLaden(false);
      return;
    }

    setMatchData(data);
    setMatchLaden(false);
    setMatchModalOpen(true);

    // Selecteer alleenNummer-matches alvast voor snelle bevestiging
    if (data.matchType === 'alleenNummer' && data.alleenNummerMatches.length === 1) {
      setMatchGeselecteerdeIds([data.alleenNummerMatches[0].id]);
    }
  };

  const toggleMatchSelectie = (id: string) => {
    setMatchGeselecteerdeIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const geselecteerdeFacturen = (matchData?.alleFacturen ?? matchData?.alleOpen ?? []).filter(f =>
    matchGeselecteerdeIds.includes(f.id)
  );

  const totaalGeselecteerdOpenstaand = geselecteerdeFacturen.reduce(
    (s, f) => s + f.openstaand, 0
  );

  const koppelViaMatch = async () => {
    if (!matchInkomen || matchGeselecteerdeIds.length === 0) return;
    try {
      if (matchGeselecteerdeIds.length === 1) {
        const factuurId = matchGeselecteerdeIds[0];
        const res = await window.api.bank.koppelAanFactuur({ inkomstenId: matchInkomen.id, factuurId });
        const nummer = (res as any).factuurNummer || factuurId;
        const volledigBetaald = (res as any).volledigBetaald;
        toonMelding("succes", volledigBetaald
          ? `Factuur ${nummer} volledig betaald`
          : `Betaling gedeeltelijk geboekt op factuur ${nummer}`
        );
      } else {
        const koppelingen = geselecteerdeFacturen.map(f => ({
          factuurId: f.id,
          bedrag: f.openstaand,
        }));
        const res = await window.api.bank.koppelAanMeerdereFacturen({
          inkomstenId: matchInkomen.id,
          koppelingen,
        });
        const nummers = ((res as any).resultaten ?? []).map((r: any) => r.factuurNummer).join(", ");
        toonMelding("succes", `Betaling gesplitst over facturen: ${nummers}`);
      }
      setMatchModalOpen(false);
      haalInkomensOp();
      haalFacturenOp();
    } catch {
      toonMelding("fout", "Koppelen mislukt");
    }
  };

  const isSpaar = (i: Inkomen) => !!(i.tegenrekening && spaarVelden.includes(i.tegenrekening));
  const zichtbareInkomens = verbergSpaarrekeningen ? inkomens.filter(i => !isSpaar(i)) : inkomens;
  const totaalInkomen = zichtbareInkomens.reduce((s, i) => s + i.bedrag, 0);
  const gekoppeld = zichtbareInkomens.filter((i) => i.factuurId);
  const totaalGekoppeld = gekoppeld.reduce((s, i) => s + i.bedrag, 0);
  const totaalNietGekoppeld = totaalInkomen - totaalGekoppeld;
  const wachtOpKoppeling = zichtbareInkomens.filter((i) => !i.factuurId && !i.geboektAlsOmzet && i.bron === "Bankimport");
  const totaalWachtOpKoppeling = wachtOpKoppeling.reduce((s, i) => s + i.bedrag, 0);

  const maandOpties = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        titel="Inkomen"
        subtitel="Beheer je inkomsten"
        acties={
          <Button
            onClick={() => {
              resetFormulier();
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Inkomen toevoegen
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-6">
        {melding && (
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              melding.type === "succes"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {melding.tekst}
          </div>
        )}

        {/* Uitleg */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          <p className="font-semibold mb-0.5">Betalingsontvangsten — niet automatisch omzet</p>
          <p className="text-blue-700">Bankimports worden <strong>alleen</strong> gebruikt om facturen als betaald te markeren. Omzet wordt berekend op basis van uitgestuurde facturen. Koppel elke bankbetaling aan een factuur, of boek hem als losse zakelijke omzet.</p>
        </div>

        {/* Samenvatting kaarten */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Totaal ontvangen</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900">{formatBedrag(totaalInkomen)}</p>
              <p className="text-xs text-gray-400 mt-1">{inkomens.length} registraties</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Gekoppeld aan factuur</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatBedrag(totaalGekoppeld)}</p>
              <p className="text-xs text-gray-400 mt-1">{gekoppeld.length} betalingen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Wacht op koppeling</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">{formatBedrag(totaalWachtOpKoppeling)}</p>
              <p className="text-xs text-gray-400 mt-1">{wachtOpKoppeling.length} bankbetalingen</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Niet gekoppeld</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-600">{formatBedrag(totaalNietGekoppeld)}</p>
              <p className="text-xs text-gray-400 mt-1">{inkomens.length - gekoppeld.length} registraties</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-gray-400" />
            <Select value={maandFilter} onValueChange={setMaandFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {maandOpties.map((m) => (
                <SelectItem key={m} value={m}>
                  {new Date(m + "-01").toLocaleDateString("nl-NL", {
                    month: "long",
                    year: "numeric",
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
          {spaarVelden.length > 0 && (
            <button
              type="button"
              onClick={() => setVerbergSpaarrekeningen(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                verbergSpaarrekeningen
                  ? 'bg-purple-600 border-purple-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-purple-400 hover:text-purple-600 dark:bg-gray-800 dark:border-gray-600'
              }`}
            >
              <span className={`inline-block w-8 h-4 rounded-full relative transition-colors ${verbergSpaarrekeningen ? 'bg-white/30' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${verbergSpaarrekeningen ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
              Spaarrekeningen verbergen
            </button>
          )}
        </div>

        {/* Tabel */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                {bankVelden.includes('datum') && <TableHead>Datum</TableHead>}
                {bankVelden.includes('omschrijving') && <TableHead>Omschrijving</TableHead>}
                {bankVelden.includes('tegenrekeningNaam') && <TableHead>Naam tegenpartij</TableHead>}
                {bankVelden.includes('tegenrekening') && <TableHead>Tegenrekening</TableHead>}
                {bankVelden.includes('mutatiesoort') && <TableHead>Mutatiesoort</TableHead>}
                {bankVelden.includes('mededelingen') && <TableHead>Mededelingen</TableHead>}
                {bankVelden.includes('betalingskenmerk') && <TableHead>Kenmerk</TableHead>}
                {bankVelden.includes('saldoNaBoeking') && <TableHead>Saldo</TableHead>}
                {bankVelden.includes('bedrag') && <TableHead className="text-right">Bedrag</TableHead>}
                {bankVelden.includes('bron') && <TableHead>Bron</TableHead>}
                {bankVelden.includes('factuur') && <TableHead>Factuur</TableHead>}
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {laden ? (
                <TableRow>
                  <TableCell colSpan={bankVelden.length + 1} className="text-center py-8 text-gray-400">
                    Laden...
                  </TableCell>
                </TableRow>
              ) : zichtbareInkomens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={bankVelden.length + 1} className="text-center py-8 text-gray-400">
                    Geen inkomens gevonden voor deze maand
                  </TableCell>
                </TableRow>
              ) : (
                zichtbareInkomens.map((inkomen) => (
                  <TableRow key={inkomen.id}>
                    {bankVelden.includes('datum') && (
                      <TableCell className="text-gray-500 whitespace-nowrap">{formatDatum(inkomen.datum)}</TableCell>
                    )}
                    {bankVelden.includes('omschrijving') && (
                      <TableCell className="font-medium max-w-[200px] truncate">{inkomen.omschrijving}</TableCell>
                    )}
                    {bankVelden.includes('tegenrekeningNaam') && (
                      <TableCell className="text-sm text-gray-700">{inkomen.tegenrekeningNaam || <span className="text-gray-300">—</span>}</TableCell>
                    )}
                    {bankVelden.includes('tegenrekening') && (
                      <TableCell className="text-xs font-mono text-gray-500">{inkomen.tegenrekening || <span className="text-gray-300">—</span>}</TableCell>
                    )}
                    {bankVelden.includes('mutatiesoort') && (
                      <TableCell className="text-xs text-gray-500">{inkomen.mutatiesoort || <span className="text-gray-300">—</span>}</TableCell>
                    )}
                    {bankVelden.includes('mededelingen') && (
                      <TableCell className="text-xs text-gray-600 max-w-[180px] truncate">{inkomen.mededelingen || <span className="text-gray-300">—</span>}</TableCell>
                    )}
                    {bankVelden.includes('betalingskenmerk') && (
                      <TableCell className="text-xs font-mono text-gray-500 max-w-[140px] truncate">{inkomen.betalingskenmerk || <span className="text-gray-300">—</span>}</TableCell>
                    )}
                    {bankVelden.includes('saldoNaBoeking') && (
                      <TableCell className="text-xs text-gray-500 text-right">{inkomen.saldoNaBoeking || <span className="text-gray-300">—</span>}</TableCell>
                    )}
                    {bankVelden.includes('bedrag') && (
                      <TableCell className={`text-right font-semibold ${inkomen.bedrag >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {formatBedrag(inkomen.bedrag)}
                      </TableCell>
                    )}
                    {bankVelden.includes('bron') && (
                      <TableCell>
                        {inkomen.tegenrekening && spaarVelden.includes(inkomen.tegenrekening) ? (
                          <Badge className="text-purple-600 border-purple-300 bg-purple-50">Spaarrekening</Badge>
                        ) : inkomen.bron === "Bankimport" && !inkomen.factuurId && !inkomen.geboektAlsOmzet ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">Wacht op koppeling</Badge>
                        ) : inkomen.bron === "Bankimport" && inkomen.geboektAlsOmzet ? (
                          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">Losse omzet</Badge>
                        ) : (
                          <Badge variant="default">{inkomen.bron}</Badge>
                        )}
                      </TableCell>
                    )}
                    {bankVelden.includes('factuur') && (
                      <TableCell>
                        {inkomen.factuur ? (
                          <span className="text-indigo-600 text-sm font-medium">{inkomen.factuur.nummer}</span>
                        ) : inkomen.geboektAlsOmzet ? (
                          <span className="text-green-600 text-xs">Losse zakelijke omzet</span>
                        ) : (
                          <span className="text-gray-400 text-xs">Niet gekoppeld</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {inkomen.tegenrekening && spaarVelden.includes(inkomen.tegenrekening) ? null : (
                          <>
                            {inkomen.factuurId ? (
                              <Button variant="ghost" size="icon-sm" title="Ontkoppelen" onClick={() => ontkoppel(inkomen.id)}>
                                <Unlink className="h-4 w-4 text-gray-400" />
                              </Button>
                            ) : inkomen.bron === "Bankimport" && !inkomen.geboektAlsOmzet ? (
                              <>
                                <Button variant="ghost" size="icon-sm" title="Koppel aan factuur" onClick={() => openSmartKoppel(inkomen)}>
                                  <Link className="h-4 w-4 text-indigo-500" />
                                </Button>
                                <Button variant="ghost" size="icon-sm" title="Boek als losse zakelijke omzet" onClick={() => boekAlsOmzet(inkomen.id)}>
                                  <BookOpen className="h-4 w-4 text-green-600" />
                                </Button>
                              </>
                            ) : (
                              <Button variant="ghost" size="icon-sm" title="Koppel aan factuur" onClick={() => openSmartKoppel(inkomen)}>
                                <Link className="h-4 w-4 text-indigo-500" />
                              </Button>
                            )}
                          </>
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => openBewerken(inkomen)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => verwijder(inkomen.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Toevoegen / Bewerken Modal */}
      <Modal open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) resetFormulier(); }}>
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>{bewerkenId ? "Inkomen bewerken" : "Inkomen toevoegen"}</ModalTitle>
          </ModalHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Datum"
                type="date"
                value={formulier.datum}
                onChange={(e) => setFormulier({ ...formulier, datum: e.target.value })}
              />
              <Input
                label="Bedrag (€)"
                type="number"
                step="0.01"
                min="0"
                prefix="€"
                value={formulier.bedrag}
                onChange={(e) => setFormulier({ ...formulier, bedrag: e.target.value })}
              />
            </div>
            <Input
              label="Omschrijving"
              value={formulier.omschrijving}
              onChange={(e) => setFormulier({ ...formulier, omschrijving: e.target.value })}
              placeholder="Bijv. Betaling klant X"
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                value={formulier.bron}
                onValueChange={(v) => setFormulier({ ...formulier, bron: v })}
              >
                <SelectTrigger label="Bron">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRON_OPTIES.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={formulier.factuurId}
                onValueChange={(v) => setFormulier({ ...formulier, factuurId: v })}
              >
                <SelectTrigger label="Koppel aan factuur">
                  <SelectValue placeholder="Geen factuur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen factuur</SelectItem>
                  {facturen.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nummer} — {formatBedrag(f.totaal)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              label="Notities"
              value={formulier.notities}
              onChange={(e) => setFormulier({ ...formulier, notities: e.target.value })}
              placeholder="Optionele notities..."
              rows={3}
            />
          </div>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={slaOp}>
              {bewerkenId ? "Opslaan" : "Toevoegen"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Koppel Modal */}
      <Modal open={koppelModalOpen} onOpenChange={setKoppelModalOpen}>
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <ModalTitle>Koppel aan factuur</ModalTitle>
          </ModalHeader>
          <Select value={koppelFactuurId} onValueChange={setKoppelFactuurId}>
            <SelectTrigger label="Selecteer factuur">
              <SelectValue placeholder="Kies een factuur" />
            </SelectTrigger>
            <SelectContent>
              {facturen.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nummer}
                  {f.klant ? ` — ${f.klant.naam}` : ""} ({formatBedrag(f.totaal)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button onClick={slaKoppelOp} disabled={!koppelFactuurId}>
              Koppelen
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Smart Match Modal */}
      <Modal open={matchModalOpen} onOpenChange={setMatchModalOpen}>
        <ModalContent className="max-w-2xl">
          <ModalHeader>
            <ModalTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-indigo-500" />
              Koppel aan factuur
            </ModalTitle>
          </ModalHeader>
          {matchInkomen && (
            <div className="space-y-4">
              {/* Payment info */}
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
                <p className="text-gray-500 mb-1">Ontvangen betaling</p>
                <p className="font-medium text-gray-900">{matchInkomen.omschrijving}</p>
                <p className="text-gray-500 mt-0.5">
                  <span className="font-semibold text-gray-800">{formatBedrag(matchInkomen.bedrag)}</span>
                  {" "}·{" "}{formatDatum(matchInkomen.datum)}
                  {matchInkomen.tegenrekeningNaam ? ` · ${matchInkomen.tegenrekeningNaam}` : ""}
                </p>
                {(matchInkomen.mededelingen || matchInkomen.betalingskenmerk) && (
                  <p className="text-gray-400 text-xs mt-1 font-mono truncate">
                    {matchInkomen.betalingskenmerk || matchInkomen.mededelingen}
                  </p>
                )}
              </div>

              {matchLaden ? (
                <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Analyseren...</span>
                </div>
              ) : matchData && (
                <div className="space-y-4 max-h-[52vh] overflow-y-auto pr-1">

                  {/* Factuurnummer + bedrag match (meerdere) */}
                  {matchData.matchType === 'volledig' && matchData.volledigeMatches.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-2">
                        ✓ Factuurnummer én bedrag komen overeen
                      </p>
                      <div className="space-y-2">
                        {matchData.volledigeMatches.map(f => (
                          <FactuurMatchRij key={f.id} factuur={f} betaling={matchInkomen.bedrag}
                            geselecteerd={matchGeselecteerdeIds.includes(f.id)}
                            onToggle={() => toggleMatchSelectie(f.id)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Factuurnummer herkend maar bedrag wijkt af */}
                  {matchData.matchType === 'alleenNummer' && matchData.alleenNummerMatches.length > 0 && (
                    <div>
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 mb-2">
                        Factuurnummer herkend in de betalingsomschrijving, maar het bedrag wijkt af. Controleer voor je koppelt.
                      </div>
                      <div className="space-y-2">
                        {matchData.alleenNummerMatches.map(f => (
                          <FactuurMatchRij key={f.id} factuur={f} betaling={matchInkomen.bedrag}
                            geselecteerd={matchGeselecteerdeIds.includes(f.id)}
                            onToggle={() => toggleMatchSelectie(f.id)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alleen bedrag match */}
                  {matchData.matchType === 'bedrag' && matchData.bedragMatches.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 mb-2">
                        Overeenkomend bedrag
                      </p>
                      <div className="space-y-2">
                        {matchData.bedragMatches.map(f => (
                          <FactuurMatchRij key={f.id} factuur={f} betaling={matchInkomen.bedrag}
                            geselecteerd={matchGeselecteerdeIds.includes(f.id)}
                            onToggle={() => toggleMatchSelectie(f.id)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Geen match → toon direct alle facturen */}
                  {matchData.matchType === 'geen' && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                        Geen automatische overeenkomst — alle facturen
                      </p>
                      <div className="space-y-2">
                        {(matchData.alleFacturen ?? matchData.alleOpen).map(f => (
                          <FactuurMatchRij key={f.id} factuur={f} betaling={matchInkomen.bedrag}
                            geselecteerd={matchGeselecteerdeIds.includes(f.id)}
                            onToggle={() => toggleMatchSelectie(f.id)} />
                        ))}
                        {(matchData.alleFacturen ?? matchData.alleOpen).length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-4">Geen facturen gevonden.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Alle facturen knop / uitklapbaar (niet bij matchType 'geen') */}
                  {matchData.matchType !== 'geen' && (matchData.alleFacturen ?? []).length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setToontAlleFacturen(v => !v)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                      >
                        {toontAlleFacturen
                          ? "▲ Verberg alle facturen"
                          : `▼ Bekijk alle facturen (${(matchData.alleFacturen ?? []).length})`
                        }
                      </button>
                      {toontAlleFacturen && (
                        <div className="mt-2 space-y-2">
                          {(matchData.alleFacturen ?? []).map(f => (
                            <FactuurMatchRij key={f.id} factuur={f} betaling={matchInkomen.bedrag}
                              geselecteerd={matchGeselecteerdeIds.includes(f.id)}
                              onToggle={() => toggleMatchSelectie(f.id)} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Multi-select samenvatting */}
              {matchGeselecteerdeIds.length > 1 && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${
                  Math.abs(totaalGeselecteerdOpenstaand - matchInkomen.bedrag) <= 0.05
                    ? "bg-green-50 border-green-200 text-green-800"
                    : totaalGeselecteerdOpenstaand > matchInkomen.bedrag
                    ? "bg-red-50 border-red-200 text-red-800"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                }`}>
                  <p className="font-medium">
                    {matchGeselecteerdeIds.length} facturen geselecteerd &middot; Totaal: {formatBedrag(totaalGeselecteerdOpenstaand)}
                  </p>
                  {Math.abs(totaalGeselecteerdOpenstaand - matchInkomen.bedrag) > 0.05 && (
                    <p className="mt-0.5">
                      {totaalGeselecteerdOpenstaand > matchInkomen.bedrag
                        ? `Tekort: ${formatBedrag(totaalGeselecteerdOpenstaand - matchInkomen.bedrag)}`
                        : `Overschot: ${formatBedrag(matchInkomen.bedrag - totaalGeselecteerdOpenstaand)}`
                      }
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="outline">Annuleren</Button>
            </ModalClose>
            <Button
              onClick={koppelViaMatch}
              disabled={matchGeselecteerdeIds.length === 0 || matchLaden}
            >
              {matchGeselecteerdeIds.length > 1
                ? `Koppel aan ${matchGeselecteerdeIds.length} facturen`
                : matchData?.matchType === 'alleenNummer'
                ? "Toch koppelen"
                : "Koppelen"
              }
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  FileText,
  FileCheck,
  Calendar,
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
  Settings,
  LogOut,
  Building2,
  ChevronLeft,
  ChevronRight,
  Car,
  Landmark,
  Package,
  Cpu,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth";
import { HelpTip } from "@/components/ui/help-tip";

const navigatie = [
  { naam: "Dashboard", href: "/", icoon: LayoutDashboard, uitleg: "Overzicht van je omzet, openstaande facturen en recente activiteit." },
  { naam: "Klanten", href: "/klanten", icoon: Users, uitleg: "Beheer al je klantgegevens. Voeg klanten toe, bekijk hun factuurhistorie en contactinfo." },
  { naam: "Facturen", href: "/facturen", icoon: FileText, uitleg: "Maak en verstuur facturen. Volg de status (concept, verzonden, betaald) en stuur herinneringen." },
  { naam: "Offertes", href: "/offertes", icoon: FileCheck, uitleg: "Maak offertes aan en zet ze met één klik om naar een factuur zodra de klant akkoord gaat." },
  { naam: "Agenda", href: "/agenda", icoon: Calendar, uitleg: "Bekijk je Google Calendar afspraken en maak direct een factuur van een afspraak." },
  { naam: "Inkomen", href: "/inkomen", icoon: TrendingUp, uitleg: "Registreer en beheer al je inkomsten. Koppel betalingen aan facturen." },
  { naam: "Uitgaven", href: "/uitgaven", icoon: TrendingDown, uitleg: "Houd je zakelijke uitgaven bij per categorie. Koppel bonnen voor de belasting." },
  { naam: "Crediteuren", href: "/crediteuren", icoon: Receipt, uitleg: "Beheer inkomende leveranciersfacturen. Houd bij wat je nog moet betalen." },
  { naam: "Uren", href: "/uren", icoon: Clock, uitleg: "Registreer gewerkte uren per klant of project. Gebruik de timer of voer handmatig in." },
  { naam: "Kilometer", href: "/kilometer", icoon: Car, uitleg: "Registreer zakelijke ritten voor de kilometervergoeding (€0,23/km fiscaal aftrekbaar)." },
  { naam: "Bankimport", href: "/bank-import", icoon: Landmark, uitleg: "Importeer bankafschriften (CSV) van ABN AMRO, ING of Rabobank om transacties te matchen." },
  { naam: "Producten", href: "/producten", icoon: Package, uitleg: "Beheer een productcatalogus met vaste prijzen en BTW-tarieven voor sneller factureren." },
  { naam: "Vaste activa", href: "/vaste-activa", icoon: Cpu, uitleg: "Registreer bedrijfsmiddelen (laptop, auto) en volg de jaarlijkse afschrijvingen." },
  { naam: "Rapporten", href: "/rapporten", icoon: BarChart3, uitleg: "Bekijk winst & verlies, BTW-overzicht per kwartaal en jaaroverzichten voor de belastingaangifte." },
  { naam: "Instellingen", href: "/instellingen", icoon: Settings, uitleg: "Stel je bedrijfsgegevens, e-mail (SMTP), BTW-nummers, Mollie-koppeling en meer in." },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [ingeklapt, setIngeklapt] = useState(window.innerWidth < 1200);

  useEffect(() => {
    const handler = () => setIngeklapt(prev => window.innerWidth < 1200 ? true : prev);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-gray-900 dark:bg-gray-950 text-white transition-all duration-300 sticky top-0",
        ingeklapt ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        {!ingeklapt && (
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-600 rounded-lg">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">Streamline Facturatie</span>
          </div>
        )}
        {ingeklapt && (
          <div className="p-1.5 bg-indigo-600 rounded-lg mx-auto">
            <Building2 className="h-5 w-5 text-white" />
          </div>
        )}
        {!ingeklapt && (
          <button
            onClick={() => setIngeklapt(true)}
            className="p-1 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {ingeklapt && (
        <button
          onClick={() => setIngeklapt(false)}
          className="flex justify-center p-2 hover:bg-gray-700 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Navigatie */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navigatie.map((item) => {
          const actief =
            item.href === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.href);
          return (
            <HelpTip key={item.href} tekst={item.uitleg} className="w-full">
              <Link
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full",
                  actief
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:bg-gray-700 hover:text-white",
                  ingeklapt && "justify-center px-2"
                )}
                title={ingeklapt ? item.naam : undefined}
              >
                <item.icoon className="h-5 w-5 flex-shrink-0" />
                {!ingeklapt && <span>{item.naam}</span>}
              </Link>
            </HelpTip>
          );
        })}
      </nav>

      {/* Uitloggen */}
      <div className="p-3 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-700 hover:text-white transition-colors w-full",
            ingeklapt && "justify-center px-2"
          )}
          title={ingeklapt ? "Uitloggen" : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!ingeklapt && <span>Uitloggen</span>}
        </button>
      </div>
    </aside>
  );
}

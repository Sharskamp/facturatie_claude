import { useState, useEffect, useRef, useCallback } from "react";
import { User, Sun, Moon, Monitor, Search, X, HelpCircle } from "lucide-react";
import { useAuth } from "@/context/auth";
import { useTheme } from "@/context/theme";
import { useHelp } from "@/context/help";
import { useNavigate } from "react-router-dom";

interface HeaderProps {
  titel: string;
  subtitel?: string;
  acties?: React.ReactNode;
}

interface ZoekKlant {
  id: string;
  naam: string;
  bedrijf?: string | null;
}

interface ZoekFactuur {
  id: string;
  nummer: string;
  klant: { id: string; naam: string; bedrijf?: string | null };
}

export function Header({ titel, subtitel, acties }: HeaderProps) {
  const { user } = useAuth();
  const { modus, setModus } = useTheme();
  const { helpActief, toggleHelp } = useHelp();
  const navigate = useNavigate();

  const [zoekterm, setZoekterm] = useState("");
  const [klantResultaten, setKlantResultaten] = useState<ZoekKlant[]>([]);
  const [factuurResultaten, setFactuurResultaten] = useState<ZoekFactuur[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [zoekBezig, setZoekBezig] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setDropdownOpen(true);
      }
      if (e.key === "Escape") {
        setDropdownOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  const zoek = useCallback(async (term: string) => {
    if (!term.trim()) {
      setKlantResultaten([]);
      setFactuurResultaten([]);
      return;
    }
    setZoekBezig(true);
    try {
      const [klanten, facturen] = await Promise.all([
        window.api.klanten.list({ zoek: term }),
        window.api.facturen.list({ zoek: term }),
      ]);
      setKlantResultaten((Array.isArray(klanten) ? klanten as ZoekKlant[] : []).slice(0, 5));
      setFactuurResultaten((Array.isArray(facturen) ? facturen as ZoekFactuur[] : []).slice(0, 5));
    } catch (e) {
      console.error("Zoekfout:", e);
    } finally {
      setZoekBezig(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => zoek(zoekterm), 300);
    return () => clearTimeout(timer);
  }, [zoekterm, zoek]);

  function handleResultaatKlik(pad: string) {
    navigate(pad);
    setDropdownOpen(false);
    setZoekterm("");
    setKlantResultaten([]);
    setFactuurResultaten([]);
  }

  function wisselTheme() {
    if (modus === "systeem") setModus("licht");
    else if (modus === "licht") setModus("donker");
    else setModus("systeem");
  }

  const themeIcoon = modus === "licht"
    ? <Sun className="h-4 w-4" />
    : modus === "donker"
    ? <Moon className="h-4 w-4" />
    : <Monitor className="h-4 w-4" />;

  const heeftResultaten = klantResultaten.length > 0 || factuurResultaten.length > 0;

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 sticky top-0 z-30">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{titel}</h1>
        {subtitel && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitel}</p>}
      </div>

      <div className="flex items-center gap-3 flex-1 justify-end">
        {/* Globale zoekbalk */}
        <div className="relative w-72 hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Zoek klanten, facturen... (Ctrl+K)"
            value={zoekterm}
            onChange={(e) => {
              setZoekterm(e.target.value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            className="flex h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-9 pr-8 py-1 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
          />
          {zoekterm && (
            <button
              onClick={() => {
                setZoekterm("");
                setKlantResultaten([]);
                setFactuurResultaten([]);
                setDropdownOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Dropdown */}
          {dropdownOpen && zoekterm && (
            <div
              ref={dropdownRef}
              className="absolute top-full mt-1 left-0 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 overflow-hidden"
            >
              {zoekBezig ? (
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Zoeken...</div>
              ) : !heeftResultaten ? (
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Geen resultaten gevonden</div>
              ) : (
                <>
                  {klantResultaten.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                        Klanten
                      </div>
                      {klantResultaten.map((k) => (
                        <button
                          key={k.id}
                          onClick={() => handleResultaatKlik("/klanten")}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{k.naam}</p>
                          {k.bedrijf && (
                            <p className="text-xs text-gray-400 dark:text-gray-500">{k.bedrijf}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {factuurResultaten.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 border-t border-gray-100 dark:border-gray-700">
                        Facturen
                      </div>
                      {factuurResultaten.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => handleResultaatKlik(`/facturen/${f.id}`)}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">{f.nummer}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {f.klant.bedrijf ?? f.klant.naam}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {acties}

        {/* Help toggle */}
        <button
          onClick={toggleHelp}
          className={`p-2 rounded-lg transition-colors ${
            helpActief
              ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
          title={helpActief ? "Help-modus uitschakelen" : "Help-modus inschakelen – beweeg over functies voor uitleg"}
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={wisselTheme}
          className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title={`Thema: ${modus}`}
        >
          {themeIcoon}
        </button>

        <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200 dark:border-gray-700">
          <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
            <User className="h-4 w-4 text-indigo-700 dark:text-indigo-400" />
          </div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">
            {user?.naam ?? "Gebruiker"}
          </span>
        </div>
      </div>
    </header>
  );
}

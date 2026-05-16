"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navigatie = [
  { naam: "Dashboard", href: "/", icoon: LayoutDashboard },
  { naam: "Klanten", href: "/klanten", icoon: Users },
  { naam: "Facturen", href: "/facturen", icoon: FileText },
  { naam: "Offertes", href: "/offertes", icoon: FileCheck },
  { naam: "Agenda", href: "/agenda", icoon: Calendar },
  { naam: "Inkomen", href: "/inkomen", icoon: TrendingUp },
  { naam: "Uitgaven", href: "/uitgaven", icoon: TrendingDown },
  { naam: "Uren", href: "/uren", icoon: Clock },
  { naam: "Rapporten", href: "/rapporten", icoon: BarChart3 },
  { naam: "Instellingen", href: "/instellingen", icoon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [ingeklapt, setIngeklapt] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-gray-900 text-white transition-all duration-300 sticky top-0",
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
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
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
          );
        })}
      </nav>

      {/* Uitloggen */}
      <div className="p-3 border-t border-gray-700">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
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

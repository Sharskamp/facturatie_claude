import { Bell, Search, User } from "lucide-react";
import { useAuth } from "@/context/auth";

interface HeaderProps {
  titel: string;
  subtitel?: string;
  acties?: React.ReactNode;
}

export function Header({ titel, subtitel, acties }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-gray-200 bg-white sticky top-0 z-30">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{titel}</h1>
        {subtitel && <p className="text-sm text-gray-500">{subtitel}</p>}
      </div>

      <div className="flex items-center gap-3">
        {acties}
        <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
          <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <User className="h-4 w-4 text-indigo-700" />
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block">
            {user?.naam ?? "Gebruiker"}
          </span>
        </div>
      </div>
    </header>
  );
}

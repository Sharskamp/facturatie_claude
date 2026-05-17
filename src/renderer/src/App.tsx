import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/auth'
import { ThemeProvider } from './context/theme'
import { HelpProvider } from './context/help'
import { Loader2 } from 'lucide-react'

// Pages
import Login from './pages/Login'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import Klanten from './pages/Klanten'
import KlantDetail from './pages/KlantDetail'
import FacturenList from './pages/FacturenList'
import FactuurNieuw from './pages/FactuurNieuw'
import FactuurBewerken from './pages/FactuurBewerken'
import FactuurDetail from './pages/FactuurDetail'
import FactuurPrint from './pages/FactuurPrint'
import Offertes from './pages/Offertes'
import OfferteNieuw from './pages/OfferteNieuw'
import OfferteDetail from './pages/OfferteDetail'
import InkomenPage from './pages/InkomenPage'
import UitgavenPage from './pages/UitgavenPage'
import Agenda from './pages/Agenda'
import Uren from './pages/Uren'
import Rapporten from './pages/Rapporten'
import Instellingen from './pages/Instellingen'
import Kilometer from './pages/Kilometer'
import BankImport from './pages/BankImport'
import Producten from './pages/Producten'
import VasteActiva from './pages/VasteActiva'
import DashboardLayout from './components/layout/DashboardLayout'

function AppRoutes() {
  const { user, laden } = useAuth()

  if (laden) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/setup" element={!user ? <Setup /> : <Navigate to="/" replace />} />

      {user ? (
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/klanten" element={<Klanten />} />
          <Route path="/klanten/:id" element={<KlantDetail />} />
          <Route path="/facturen" element={<FacturenList />} />
          <Route path="/facturen/nieuw" element={<FactuurNieuw />} />
          <Route path="/facturen/:id/bewerken" element={<FactuurBewerken />} />
          <Route path="/facturen/:id" element={<FactuurDetail />} />
          <Route path="/facturen/:id/print" element={<FactuurPrint />} />
          <Route path="/offertes" element={<Offertes />} />
          <Route path="/offertes/nieuw" element={<OfferteNieuw />} />
          <Route path="/offertes/:id" element={<OfferteDetail />} />
          <Route path="/inkomen" element={<InkomenPage />} />
          <Route path="/uitgaven" element={<UitgavenPage />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/uren" element={<Uren />} />
          <Route path="/rapporten" element={<Rapporten />} />
          <Route path="/instellingen" element={<Instellingen />} />
          <Route path="/kilometer" element={<Kilometer />} />
          <Route path="/bank-import" element={<BankImport />} />
          <Route path="/producten" element={<Producten />} />
          <Route path="/vaste-activa" element={<VasteActiva />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <HelpProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </HelpProvider>
    </ThemeProvider>
  )
}

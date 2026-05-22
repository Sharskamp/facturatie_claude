import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type ThemeModus = 'licht' | 'donker' | 'systeem'

interface ThemeContextType {
  modus: ThemeModus
  isDonker: boolean
  setModus: (m: ThemeModus) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [modus, setModusState] = useState<ThemeModus>(() => {
    return (localStorage.getItem('sf_theme') as ThemeModus) ?? 'systeem'
  })

  const [systeemDonker, setSysteemDonker] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const isDonker = modus === 'donker' || (modus === 'systeem' && systeemDonker)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      setSysteemDonker(mediaQuery.matches)
      const donker = modus === 'donker' || (modus === 'systeem' && mediaQuery.matches)
      document.documentElement.classList.toggle('dark', donker)
    }
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [modus])

  function setModus(m: ThemeModus) {
    setModusState(m)
    localStorage.setItem('sf_theme', m)
  }

  return (
    <ThemeContext.Provider value={{ modus, isDonker, setModus }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme buiten ThemeProvider')
  return ctx
}

import { createContext, useContext, useState } from "react";

interface HelpContext {
  helpActief: boolean;
  toggleHelp: () => void;
}

const HelpCtx = createContext<HelpContext>({
  helpActief: false,
  toggleHelp: () => {},
});

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [helpActief, setHelpActief] = useState(false);
  return (
    <HelpCtx.Provider value={{ helpActief, toggleHelp: () => setHelpActief((v) => !v) }}>
      {children}
    </HelpCtx.Provider>
  );
}

export function useHelp() {
  return useContext(HelpCtx);
}

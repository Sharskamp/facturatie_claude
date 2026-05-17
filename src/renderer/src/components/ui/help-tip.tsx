import { useState, useRef } from "react";
import { useHelp } from "@/context/help";
import { cn } from "@/lib/utils";

interface HelpTipProps {
  tekst: string;
  children: React.ReactNode;
  className?: string;
}

type Positie = "rechts" | "links" | "onder" | "boven";

export function HelpTip({ tekst, children, className }: HelpTipProps) {
  const { helpActief } = useHelp();
  const [zichtbaar, setZichtbaar] = useState(false);
  const [positie, setPositie] = useState<Positie>("rechts");
  const wrapperRef = useRef<HTMLDivElement>(null);

  if (!helpActief) return <>{children}</>;

  function bepaalPositie() {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const ruimteRechts = window.innerWidth - rect.right;
    const ruimteLinks = rect.left;
    const ruimteOnder = window.innerHeight - rect.bottom;

    if (ruimteRechts >= 220) setPositie("rechts");
    else if (ruimteLinks >= 220) setPositie("links");
    else if (ruimteOnder >= 100) setPositie("onder");
    else setPositie("boven");
  }

  function handleMouseEnter() {
    bepaalPositie();
    setZichtbaar(true);
  }

  const tooltipKlassen: Record<Positie, string> = {
    rechts: "left-full ml-2 top-1/2 -translate-y-1/2",
    links: "right-full mr-2 top-1/2 -translate-y-1/2",
    onder: "top-full mt-2 left-1/2 -translate-x-1/2",
    boven: "bottom-full mb-2 left-1/2 -translate-x-1/2",
  };

  const pijlKlassen: Record<Positie, string> = {
    rechts: "right-full top-1/2 -translate-y-1/2 border-r-indigo-600 border-t-transparent border-b-transparent border-l-transparent",
    links: "left-full top-1/2 -translate-y-1/2 border-l-indigo-600 border-t-transparent border-b-transparent border-r-transparent",
    onder: "bottom-full left-1/2 -translate-x-1/2 border-b-indigo-600 border-t-transparent border-l-transparent border-r-transparent",
    boven: "top-full left-1/2 -translate-x-1/2 border-t-indigo-600 border-b-transparent border-l-transparent border-r-transparent",
  };

  return (
    <div
      ref={wrapperRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setZichtbaar(false)}
    >
      {children}

      {/* Help ring indicator */}
      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white dark:ring-gray-900 pointer-events-none" />

      {/* Tooltip balloon */}
      {zichtbaar && (
        <div
          className={cn(
            "absolute z-50 w-52 rounded-lg bg-indigo-600 text-white text-xs leading-relaxed px-3 py-2 shadow-lg pointer-events-none",
            tooltipKlassen[positie]
          )}
        >
          {/* Arrow */}
          <span
            className={cn(
              "absolute w-0 h-0 border-4",
              pijlKlassen[positie]
            )}
          />
          {tekst}
        </div>
      )}
    </div>
  );
}

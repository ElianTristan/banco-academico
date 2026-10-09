import type { ReactNode } from "react";

export function PageTransition({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`motion-shell ${className}`.trim()} data-motion-shell>
      {children}
    </div>
  );
}

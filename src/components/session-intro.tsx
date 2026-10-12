"use client";

import { useLayoutEffect, useState } from "react";
import { BrandLockup } from "@/components/brand-lockup";

const SESSION_INTRO_KEY = "ba-session-intro-v1";
const SESSION_INTRO_DURATION_MS = 2000;

export function SessionIntro({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);

  useLayoutEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_INTRO_KEY)) {
        setVisible(false);
        return;
      }
      window.sessionStorage.setItem(SESSION_INTRO_KEY, "shown");
    } catch (error) {
      console.error("Could not remember the Banco Académico intro for this session.", error);
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(
      () => setVisible(false),
      reducedMotion ? 240 : SESSION_INTRO_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <>
      {children}
      {visible && (
        <div className="session-intro" aria-hidden="true">
          <div className="session-intro-content">
            <div className="session-intro-lockup">
              <BrandLockup size="splash" />
            </div>
            <p className="session-intro-signature">PLATAFORMA ACADÉMICA DIGITAL</p>
          </div>
        </div>
      )}
    </>
  );
}

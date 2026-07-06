"use client";

import { useEffect, useLayoutEffect } from "react";

// Signals the headless-Chrome PDF renderer that the report has mounted and the
// Recharts SVGs have had a frame to draw. Puppeteer waits on window.__CHARTS_READY.
declare global {
  interface Window {
    __CHARTS_READY?: boolean;
  }
}

export function ReportReady() {
  // The app defaults to DARK theme (`.dark` on <html>, set pre-paint). The PDF
  // report must always render LIGHT, so strip it before the charts read tokens.
  // useTokens() observes the html class attribute and re-reads on this change.
  useLayoutEffect(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  }, []);

  useEffect(() => {
    // Two rAFs + a short timeout give Recharts' ResponsiveContainer time to
    // measure and render before we let Chrome snapshot the page.
    let raf1 = 0;
    let raf2 = 0;
    // Recharts' default mount animation runs ~1.5s; wait it out so value labels
    // and bars are fully drawn before Chrome snapshots.
    const t = setTimeout(() => {
      window.__CHARTS_READY = true;
    }, 1800);
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        // still gate on the timeout above for chart animations to settle
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t);
    };
  }, []);
  return null;
}

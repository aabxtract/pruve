"use client";

import { useEffect } from "react";

/**
 * Registers the service worker. Chrome on Android requires one with a fetch
 * handler before it will offer to install the app; iOS does not, but gets the
 * offline shell out of it either way.
 */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registering on a dev origin is fine and keeps the demo path identical to
    // production, but the worker itself is network-first so it never serves
    // stale code while you are iterating.
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] service worker registration failed:", err);
    });
  }, []);

  return null;
}

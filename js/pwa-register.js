// Registers SecureStep's root-scoped PWA service worker.
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then((registration) => console.info("SecureStep PWA registered:", registration.scope))
      .catch((error) => console.error("SecureStep PWA registration failed:", error));
  });
}

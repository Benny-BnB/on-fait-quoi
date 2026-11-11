// Enregistrement du "module hors ligne" (service worker) et annonce des mises à jour.
import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';

let installer: (() => void) | null = null;
const abonnes = new Set<() => void>();

export function useMiseAJour(): (() => void) | null {
  const [, rafraichir] = useState(0);
  useEffect(() => {
    const notifier = () => rafraichir((n) => n + 1);
    abonnes.add(notifier);
    return () => {
      abonnes.delete(notifier);
    };
  }, []);
  return installer;
}

// Événement envoyé quand l'app vient d'être enregistrée pour le mode avion
export const EVENEMENT_HORS_LIGNE_PRET = 'on-fait-quoi:hors-ligne-pret';

export function demarrerModuleHorsLigne(): void {
  let enregistrement: ServiceWorkerRegistration | undefined;

  const majSW: (rechargerPage?: boolean) => Promise<void> = registerSW({
    onOfflineReady() {
      window.dispatchEvent(new Event(EVENEMENT_HORS_LIGNE_PRET));
    },
    // Une nouvelle version est prête : on propose, on ne recharge jamais toute seule
    onNeedRefresh() {
      installer = () => {
        void majSW(true);
      };
      abonnes.forEach((notifier) => notifier());
    },
    onRegisteredSW(_url, reg) {
      enregistrement = reg;
    },
  });

  // Quand on revient sur l'app, on cherche s'il existe une version plus récente
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      enregistrement?.update().catch(() => undefined);
    }
  });
}

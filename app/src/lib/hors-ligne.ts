// Vérifie si l'app est bien enregistrée sur le téléphone pour le mode avion.

export type EtatHorsLigne = 'verification' | 'pret' | 'pas-pret' | 'indisponible';

export async function verifierHorsLigne(): Promise<EtatHorsLigne> {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return 'indisponible';
  try {
    const enregistrement = await navigator.serviceWorker.getRegistration();
    if (!enregistrement || !enregistrement.active) return 'pas-pret';

    // Le "precache" est la copie des fichiers de l'app gardée sur le téléphone
    const noms = await caches.keys();
    const nomPrecache = noms.find((nom) => nom.includes('precache'));
    if (!nomPrecache) return 'pas-pret';
    const cache = await caches.open(nomPrecache);
    const fichiers = await cache.keys();
    return fichiers.length > 0 ? 'pret' : 'pas-pret';
  } catch {
    return 'indisponible';
  }
}

// Vrai si l'app est lancée depuis l'écran d'accueil (et non dans un onglet Safari)
export function estInstallee(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

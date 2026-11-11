import { useEffect, useState } from 'preact/hooks';

// Navigation simple par l'adresse (#/vols, #/vols/abc...). Marche sans serveur.
export type Route =
  | { nom: 'accueil' }
  | { nom: 'vols' }
  | { nom: 'vol'; id: string }
  | { nom: 'compteurs' }
  | { nom: 'compteur'; id: string }
  | { nom: 'reglages' };

function decoder(morceau: string): string {
  try {
    return decodeURIComponent(morceau);
  } catch {
    return morceau;
  }
}

export function lireRoute(hash: string): Route {
  const morceaux = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decoder);
  const [a, b] = morceaux;
  if (a === 'vols') return b ? { nom: 'vol', id: b } : { nom: 'vols' };
  if (a === 'compteurs') return b ? { nom: 'compteur', id: b } : { nom: 'compteurs' };
  if (a === 'reglages') return { nom: 'reglages' };
  return { nom: 'accueil' };
}

export function useRoute(): Route {
  const [route, definirRoute] = useState<Route>(() => lireRoute(window.location.hash));
  useEffect(() => {
    const surChangement = () => {
      definirRoute(lireRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', surChangement);
    return () => window.removeEventListener('hashchange', surChangement);
  }, []);
  return route;
}

export function aller(chemin: string): void {
  window.location.hash = chemin;
}

export const lienVol = (id: string): string => `#/vols/${encodeURIComponent(id)}`;
export const lienCompteur = (id: string): string => `#/compteurs/${encodeURIComponent(id)}`;

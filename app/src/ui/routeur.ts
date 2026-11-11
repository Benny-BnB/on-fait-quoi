import { useEffect, useState } from 'preact/hooks';

// Navigation simple par l'adresse (#/vols, #/vols/abc...). Marche sans serveur.
export type Route =
  | { nom: 'accueil' }
  | { nom: 'vols' }
  | { nom: 'vol'; id: string }
  | { nom: 'compteurs' }
  | { nom: 'compteur'; id: string }
  | { nom: 'planning' }
  | { nom: 'trajets' }
  | { nom: 'trajet'; id: string; volId?: string }
  | { nom: 'sejour' }
  | { nom: 'etape'; id: string }
  | { nom: 'logement'; id: string; etapeId?: string }
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
  const [a, b, c, d] = morceaux;
  if (a === 'sejour') {
    if (b === 'etape' && c) return { nom: 'etape', id: c };
    if (b === 'logement' && c) return { nom: 'logement', id: c, etapeId: d };
    return { nom: 'sejour' };
  }
  if (a === 'planning') return { nom: 'planning' };
  if (a === 'trajets') return b ? { nom: 'trajet', id: b, volId: c } : { nom: 'trajets' };
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
export const lienTrajet = (id: string): string => `#/trajets/${encodeURIComponent(id)}`;
// Nouveau trajet, éventuellement déjà rattaché à un vol (pour aller à l'aéroport)
export const lienNouveauTrajet = (volId?: string): string => `#/trajets/nouveau${volId ? `/${encodeURIComponent(volId)}` : ''}`;
// Ouvre l'élément (vol, trajet ou logement) à l'origine d'un créneau ou d'une alerte
export const lienSource = (genre: 'vol' | 'trajet' | 'logement', id: string): string =>
  genre === 'vol' ? lienVol(id) : genre === 'trajet' ? lienTrajet(id) : lienLogement(id);
export const lienEtape =(id: string): string => `#/sejour/etape/${encodeURIComponent(id)}`;
export const lienLogement = (id: string): string => `#/sejour/logement/${encodeURIComponent(id)}`;
export const lienNouveauLogement = (etapeId: string): string => `#/sejour/logement/nouveau/${encodeURIComponent(etapeId)}`;

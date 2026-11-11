import { useEffect, useState } from 'preact/hooks';

// Navigation simple par l'adresse (#/vols, #/vols/abc...). Marche sans serveur.
export type Route =
  | { nom: 'accueil' }
  | { nom: 'vols' }
  | { nom: 'vol'; id: string }
  | { nom: 'compteurs' }
  | { nom: 'compteur'; id: string; cle?: string }
  | { nom: 'jour'; jour: string }
  | { nom: 'creneau'; id: string; mode?: 'jour' | 'planb' | 'copie'; ref?: string; periode?: string }
  | { nom: 'personnes' }
  | { nom: 'taches' }
  | { nom: 'emporter' }
  | { nom: 'tache'; id: string; liste?: string }
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
  if (a === 'taches') return b === 'emporter' ? { nom: 'emporter' } : { nom: 'taches' };
  if (a === 'tache' && b) return { nom: 'tache', id: b, liste: c };
  if (a === 'planning') return { nom: 'planning' };
  if (a === 'trajets') return b ? { nom: 'trajet', id: b, volId: c } : { nom: 'trajets' };
  if (a === 'vols') return b ? { nom: 'vol', id: b } : { nom: 'vols' };
  if (a === 'compteurs') return b ? { nom: 'compteur', id: b, cle: c } : { nom: 'compteurs' };
  if (a === 'jour' && b) return { nom: 'jour', jour: b };
  if (a === 'personnes') return { nom: 'personnes' };
  if (a === 'creneau' && b) {
    if (b !== 'nouveau') return { nom: 'creneau', id: b };
    if (c === 'planb' || c === 'copie') return { nom: 'creneau', id: b, mode: c, ref: d };
    return { nom: 'creneau', id: b, mode: 'jour', ref: c, periode: d };
  }
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
export const lienTache = (id: string): string => `#/tache/${encodeURIComponent(id)}`;
export const lienNouvelleTache = (liste: 'reste-a-faire' | 'a-emporter'): string => `#/tache/nouveau/${liste}`;
export const lienListe = (liste: 'reste-a-faire' | 'a-emporter'): string => (liste === 'a-emporter' ? '#/taches/emporter' : '#/taches');
export const lienTrajet =(id: string): string => `#/trajets/${encodeURIComponent(id)}`;
// Nouveau trajet, éventuellement déjà rattaché à un vol (pour aller à l'aéroport)
export const lienNouveauTrajet = (volId?: string): string => `#/trajets/nouveau${volId ? `/${encodeURIComponent(volId)}` : ''}`;
// Ouvre l'élément (vol, trajet ou logement) à l'origine d'un créneau ou d'une alerte
export const lienSource = (genre: 'vol' | 'trajet' | 'logement' | 'creneau', id: string): string =>
  genre === 'vol' ? lienVol(id) : genre === 'trajet' ? lienTrajet(id) : genre === 'creneau' ? lienCreneau(id) : lienLogement(id);
export const lienJour = (jour: string): string => `#/jour/${jour}`;
export const lienCreneau = (id: string): string => `#/creneau/${encodeURIComponent(id)}`;
export const lienNouveauCreneau = (jour: string, periode?: string): string => `#/creneau/nouveau/${jour}${periode ? `/${periode}` : ''}`;
export const lienPlanB = (id: string): string => `#/creneau/nouveau/planb/${encodeURIComponent(id)}`;
export const lienCopie = (id: string): string => `#/creneau/nouveau/copie/${encodeURIComponent(id)}`;
export const lienEtape =(id: string): string => `#/sejour/etape/${encodeURIComponent(id)}`;
export const lienLogement = (id: string): string => `#/sejour/logement/${encodeURIComponent(id)}`;
export const lienNouveauLogement = (etapeId: string): string => `#/sejour/logement/nouveau/${encodeURIComponent(etapeId)}`;

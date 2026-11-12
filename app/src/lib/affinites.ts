// Mettre en avant ce qui correspond aux priorités de chaque tranche d'âge (cahier, section 6).
// Ce sont des repères par catégorie et par mot de la fiche, pas un avis sur le lieu : ils ne cachent rien et ne garantissent rien.
// Les contraintes réelles (mobilité, chaleur, alimentation) restent traitées, avec leur raison, par lib/contraintes.ts.

import type { Categorie, Lieu, TrancheAge } from '../data/types.ts';
import { normaliserTexte } from './texte.ts';

export const LIBELLES_PLURIEL: Record<TrancheAge, string> = { enfant: 'enfants', adulte: 'adultes', senior: 'seniors' };

type Priorites = { categories: Categorie[]; mots: string[] };

export const PRIORITES: Record<TrancheAge, Priorites> = {
  // seniors : rythme calme, peu de marche, lieux climatisés, repas, culture, bien-être, accès facile
  senior: { categories: ['culture', 'nourriture', 'bien-etre'], mots: ['calme', 'climatise', 'accessible'] },
  // adultes : shopping, cafés et brunchs, spa, plage, rooftops, expériences, photo
  adulte: { categories: ['marches', 'nourriture', 'bien-etre', 'plages', 'nocturne', 'spots', 'sport'], mots: ['cafe', 'brunch', 'spa', 'rooftop', 'experience', 'photo', 'shopping'] },
  // enfants : parcs, aquariums, plage, piscine, ateliers, animaux, spectacles
  enfant: { categories: ['famille', 'plages'], mots: ['parc', 'aquarium', 'plage', 'piscine', 'atelier', 'animaux', 'spectacle', 'zoo', 'safari', 'jardin'] },
};

// mélange de groupes : repas, plage, promenades, marchés, spectacles, sorties à la journée
export const PRIORITES_MELANGE: Priorites & { journeeMin: number } = {
  categories: ['nourriture', 'plages', 'promenades', 'marches', 'famille'],
  mots: ['spectacle', 'repas', 'plage', 'promenade', 'marche'],
  journeeMin: 240,
};

function correspond(l: Lieu, p: Priorites): boolean {
  if (l.categories.some((c) => p.categories.includes(c))) return true;
  const mots = l.etiquettes.flatMap((e) => normaliserTexte(e).split(/[^a-z0-9]+/)).filter(Boolean);
  return p.mots.some((m) => mots.some((x) => x.startsWith(m)));
}

export type Affinites = { tranches: TrancheAge[]; pourTous: boolean };

// tranchesPresentes : les tranches d'âge des personnes choisies. « pourTous » n'a de sens que pour un groupe mélangé (au moins deux tranches).
export function affinitesLieu(l: Lieu, tranchesPresentes: TrancheAge[]): Affinites {
  const tranches = tranchesPresentes.filter((t) => correspond(l, PRIORITES[t]));
  const melange = tranchesPresentes.length >= 2;
  const pourTous = melange && (correspond(l, PRIORITES_MELANGE) || (l.duree !== null && l.duree.maxMin >= PRIORITES_MELANGE.journeeMin));
  return { tranches, pourTous };
}

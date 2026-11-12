// Contraintes des personnes et « À éviter » face à un lieu. Ce sont des signalements, jamais des interdits :
// l'utilisateur peut passer outre. Quand la fiche n'a pas l'information, on dit « à vérifier », on ne devine pas.

import type { AEviter, Lieu, ModeTrajet, Personne } from '../data/types.ts';
import { LIBELLES_MODE, LIBELLES_REGIME, LIBELLES_TRANCHE_AGE } from '../data/types.ts';
import { formatDureeMin } from './temps.ts';
import { normaliserTexte } from './texte.ts';
import { trancheDe } from './profils.ts';

// fort = la fiche contredit clairement une contrainte (sert au masquage facultatif) ; sinon : information ou point à vérifier
export type Signalement = { cle: string; genre: 'contrainte' | 'a-eviter' | 'acces'; texte: string; fort: boolean };

const prenoms = (ps: Personne[]): string => ps.map((p) => p.prenom).join(', ');

const MOTS_ACCES = /fauteuil|wheelchair|poussette|stroller|accessib|ascenseur|\blift\b|elevator|escalier|stair|\bpmr\b/;

const MOTS_REGIME: Record<string, string[]> = {
  vegetarien: ['vegetarien', 'vegetarian'],
  vegan: ['vegan'],
  halal: ['halal'],
  'sans-gluten': ['gluten'],
  'sans-lactose': ['lactose'],
  allergie: ['allergie', 'allergen', 'allergy'],
};

export function contraintesLieu(l: Lieu, personnes: Personne[]): Signalement[] {
  const s: Signalement[] = [];
  const chauds = personnes.filter((p) => p.confort.includes('chaud'));
  const froids = personnes.filter((p) => p.confort.includes('froid'));

  // Chaud / froid : intérieur ou extérieur, climatisation seulement si une source l'indique (aucune fiche ne l'indique encore)
  if (chauds.length > 0) {
    if (l.interieur === 'exterieur') s.push({ cle: 'chaud-ext', genre: 'contrainte', texte: `${prenoms(chauds)} (sensible à la chaleur) : lieu en extérieur.`, fort: true });
    else if (l.interieur === 'mixte') s.push({ cle: 'chaud-mixte', genre: 'contrainte', texte: `${prenoms(chauds)} (sensible à la chaleur) : lieu en partie en extérieur.`, fort: false });
    else if (l.interieur === '') s.push({ cle: 'chaud-inconnu', genre: 'contrainte', texte: `${prenoms(chauds)} (sensible à la chaleur) : intérieur ou extérieur à vérifier.`, fort: false });
    for (const a of l.attention.filter((x) => x.genre === 'chaleur')) s.push({ cle: `chaud-att:${a.texte}`, genre: 'contrainte', texte: `${prenoms(chauds)} (sensible à la chaleur) : ${a.texte} (${a.source.libelle}).`, fort: true });
  }
  if (froids.length > 0) {
    if (l.interieur === 'interieur' || l.interieur === 'mixte') {
      s.push({ cle: 'froid-int', genre: 'contrainte', texte: `${prenoms(froids)} (sensible au froid) : lieu ${l.interieur === 'interieur' ? 'en intérieur' : 'en partie en intérieur'} ; climatisation non indiquée par la fiche (à vérifier).`, fort: false });
    } else if (l.interieur === '') {
      s.push({ cle: 'froid-inconnu', genre: 'contrainte', texte: `${prenoms(froids)} (sensible au froid) : intérieur ou extérieur à vérifier.`, fort: false });
    }
  }

  // Mobilité
  const marche = personnes.filter((p) => p.mobilite.includes('marche-limitee') || p.mobilite.includes('debout-limite'));
  if (marche.length > 0) {
    if (l.duree && l.duree.maxMin >= 90) s.push({ cle: 'marche-longue', genre: 'contrainte', texte: `${prenoms(marche)} (marche ou station debout limitée) : visite longue, jusqu'à ${formatDureeMin(l.duree.maxMin)}.`, fort: true });
    else if (!l.duree) s.push({ cle: 'marche-duree', genre: 'contrainte', texte: `${prenoms(marche)} (marche ou station debout limitée) : durée de la visite à vérifier.`, fort: false });
  }
  const accessibilite = personnes.filter((p) => p.mobilite.some((m) => m === 'poussette' || m === 'fauteuil' || m === 'escaliers'));
  // La fiche doit parler d'accessibilité (fauteuil, poussette, ascenseur, escaliers…) pour que le point ne soit plus « à vérifier » ;
  // un texte « Pour qui » qui parle d'autre chose (tarifs, âges) ne répond pas à la question.
  const parleAcces = l.public !== null && MOTS_ACCES.test(normaliserTexte(l.public.texte));
  if (accessibilite.length > 0 && !parleAcces) {
    s.push({ cle: 'acces-pmr', genre: 'contrainte', texte: `${prenoms(accessibilite)} (poussette, fauteuil ou escaliers) : accessibilité à vérifier.`, fort: false });
  }
  // Une source qui parle d'escaliers : signalé pour ceux qui ne peuvent pas ou ne doivent pas en monter
  if (accessibilite.length > 0 && l.public && /escalier|stair/.test(normaliserTexte(l.public.texte))) {
    s.push({ cle: 'escaliers', genre: 'contrainte', texte: `${prenoms(accessibilite)} (poussette, fauteuil ou escaliers) : escaliers signalés (${l.public.source.libelle}).`, fort: true });
  }

  // Alimentation : seulement pour les lieux où l'on mange
  if (l.categories.includes('nourriture')) {
    const texte = l.public ? normaliserTexte(l.public.texte) : '';
    const manque: string[] = [];
    for (const regime of ['vegetarien', 'vegan', 'halal', 'sans-gluten', 'sans-lactose', 'allergie'] as const) {
      const concernes = personnes.filter((p) => p.regimes.includes(regime));
      if (concernes.length === 0) continue;
      if (!MOTS_REGIME[regime].some((m) => texte.includes(m))) manque.push(`${prenoms(concernes)} (${LIBELLES_REGIME[regime].toLowerCase()})`);
    }
    if (manque.length > 0) s.push({ cle: 'regimes', genre: 'contrainte', texte: `Alimentation à vérifier : ${manque.join(' ; ')}. La fiche ne l'indique pas.`, fort: false });
  }

  // Enfants et vie nocturne : on ne connaît pas la règle d'âge, on la signale à vérifier
  const enfants = personnes.filter((p) => trancheDe(p) === 'enfant');
  if (enfants.length > 0 && l.categories.includes('nocturne')) {
    s.push({ cle: 'enfant-nocturne', genre: 'contrainte', texte: `${prenoms(enfants)} (${LIBELLES_TRANCHE_AGE.enfant.toLowerCase()}) : règle d'âge du bar ou du lieu de sortie à vérifier.`, fort: false });
  }
  return s;
}

export type ContexteAEviter = { aEviter: AEviter[]; distanceKm: number | null; trajetLongKm: number };

export function aEviterLieu(l: Lieu, c: ContexteAEviter): Signalement[] {
  const s: Signalement[] = [];
  if (c.aEviter.includes('foule')) {
    for (const a of l.attention.filter((x) => x.genre === 'foule')) s.push({ cle: `foule:${a.texte}`, genre: 'a-eviter', texte: `Foule : ${a.texte} (${a.source.libelle}).`, fort: true });
  }
  if (c.aEviter.includes('chaleur')) {
    if (l.interieur === 'exterieur') s.push({ cle: 'chaleur-ext', genre: 'a-eviter', texte: 'Chaleur : lieu en extérieur.', fort: true });
    for (const a of l.attention.filter((x) => x.genre === 'chaleur')) s.push({ cle: `chaleur:${a.texte}`, genre: 'a-eviter', texte: `Chaleur : ${a.texte} (${a.source.libelle}).`, fort: true });
  }
  if (c.aEviter.includes('longs-trajets') && c.distanceKm !== null && c.distanceKm > c.trajetLongKm) {
    s.push({ cle: 'trajet-long', genre: 'a-eviter', texte: `Long trajet : à ${c.distanceKm.toFixed(1).replace('.', ',')} km du logement à vol d'oiseau (seuil réglé : ${String(c.trajetLongKm).replace('.', ',')} km).`, fort: true });
  }
  if (c.aEviter.includes('extreme')) {
    if (l.categories.includes('sport')) s.push({ cle: 'extreme-sport', genre: 'a-eviter', texte: 'Activité sportive ou d\'aventure.', fort: true });
    for (const a of l.attention.filter((x) => x.genre === 'extreme')) s.push({ cle: `extreme:${a.texte}`, genre: 'a-eviter', texte: `Activité extrême : ${a.texte} (${a.source.libelle}).`, fort: true });
  }
  return s;
}

// Transports acceptés : on ne signale que les lieux dont une source donne l'accès et dont aucun mode n'est accepté
export function accesLieu(l: Lieu, acceptes: ModeTrajet[]): Signalement[] {
  if (acceptes.length === 0 || l.acces.length === 0) return [];
  if (l.acces.some((a) => a.modes.some((m) => acceptes.includes(m)))) return [];
  const modes = [...new Set(l.acces.flatMap((a) => a.modes))].map((m) => LIBELLES_MODE[m].toLowerCase());
  return [{ cle: 'acces', genre: 'acces', texte: `Accès indiqué en ${modes.join(' ou ')} (${l.acces[0].source.libelle}) : pas dans tes transports acceptés.`, fort: true }];
}

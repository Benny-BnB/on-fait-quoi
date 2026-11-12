// Prix pour un groupe : chaque personne paie le tarif de son âge quand la source en donne un, sinon le prix standard du lieu.
// Rien n'est deviné : quand le tarif d'une personne n'est pas connu, le prix standard est utilisé et la raison est dite.

import type { Lieu, Personne, TarifAge } from '../data/types.ts';
import { LIBELLES_TRANCHE_AGE } from '../data/types.ts';
import { trancheDe } from './profils.ts';

type Prix = NonNullable<Lieu['prix']>;

export type PrixPersonne = { prenom: string; min: number; max: number; libelle: string; standard: boolean };
export type TotalGroupe = { min: number; max: number; devise: string; parPersonne: PrixPersonne[]; precisions: string[] };

// Le tarif de la source qui correspond à un âge ; s'il y en a plusieurs, le plus précis (la fourchette d'âges la plus étroite)
export function tarifPourAge(prix: Prix, age: number): TarifAge | null {
  const largeur = (t: TarifAge): number => (t.ageMax ?? 130) - (t.ageMin ?? 0);
  const candidats = (prix.tarifs ?? []).filter((t) => (t.ageMin === null || age >= t.ageMin) && (t.ageMax === null || age <= t.ageMax));
  if (candidats.length === 0) return null;
  return candidats.reduce((meilleur, t) => (largeur(t) < largeur(meilleur) ? t : meilleur));
}

export function totalGroupe(prix: Prix, personnes: Personne[]): TotalGroupe | null {
  if (personnes.length === 0) return null;
  const precisions: string[] = [];
  const parPersonne: PrixPersonne[] = [];
  const aDesTarifs = (prix.tarifs ?? []).length > 0;
  for (const p of personnes) {
    const t = p.ageAns !== null ? tarifPourAge(prix, p.ageAns) : null;
    if (t) {
      parPersonne.push({ prenom: p.prenom, min: t.min, max: t.max, libelle: t.libelle, standard: false });
      continue;
    }
    parPersonne.push({ prenom: p.prenom, min: prix.min, max: prix.max, libelle: 'Prix standard', standard: true });
    const tranche = trancheDe(p);
    if (aDesTarifs && p.ageAns === null) {
      precisions.push(`${p.prenom} : âge non renseigné, prix standard utilisé (la source donne des tarifs selon l'âge).`);
    } else if (tranche === 'enfant' || tranche === 'senior') {
      precisions.push(`${p.prenom} (${LIBELLES_TRANCHE_AGE[tranche].toLowerCase()}) : la source ne donne pas de tarif pour cet âge, prix standard utilisé.`);
    }
  }
  return {
    min: parPersonne.reduce((s, x) => s + x.min, 0),
    max: parPersonne.reduce((s, x) => s + x.max, 0),
    devise: prix.devise,
    parPersonne,
    precisions,
  };
}

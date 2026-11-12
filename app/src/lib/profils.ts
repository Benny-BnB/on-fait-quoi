// Personnes, groupes, présence : qui est là, qui est concerné par une proposition.

import type { Donnees, Groupe, Mobilite, Personne, PlagePresence, Regime, Reglages, TrancheAge } from '../data/types.ts';
import { A_EVITER, CONFORTS, MOBILITES, REGIMES, TRANCHES_AGE } from '../data/types.ts';
import { REGLAGES_PAR_DEFAUT, personneVide } from '../data/defauts.ts';
import { dateValide, heureValide } from './temps.ts';

function listeDe<T extends string>(brut: unknown, permis: readonly T[]): T[] {
  return Array.isArray(brut) ? permis.filter((v) => brut.includes(v)) : [];
}

// Remet une personne lue dans le téléphone (peut-être d'une ancienne version) dans un état complet
export function normaliserPersonne(brut: Partial<Personne> & { id: string; prenom: string }): Personne {
  const base = personneVide(brut.id, brut.prenom);
  const presence = Array.isArray(brut.presence) ? brut.presence.filter((x): x is PlagePresence => !!x && dateValide(x.du) && dateValide(x.au) && x.du <= x.au) : [];
  return {
    ...base,
    notes: typeof brut.notes === 'string' ? brut.notes : '',
    ageAns: typeof brut.ageAns === 'number' && Number.isFinite(brut.ageAns) && brut.ageAns >= 0 && brut.ageAns <= 130 ? brut.ageAns : null,
    tranche: TRANCHES_AGE.some((t) => t === brut.tranche) ? (brut.tranche as TrancheAge) : '',
    alimentation: typeof brut.alimentation === 'string' ? brut.alimentation : '',
    regimes: listeDe(brut.regimes, REGIMES),
    mobilite: listeDe(brut.mobilite, MOBILITES),
    confort: listeDe(brut.confort, CONFORTS),
    presence,
  };
}

export function normaliserReglages(brut: Partial<Reglages> | undefined): Reglages {
  const d = brut?.delaiAeroportMin;
  const defaut = REGLAGES_PAR_DEFAUT;
  const r = brut?.rythme;
  return {
    delaiAeroportMin: {
      international: d?.international ?? defaut.delaiAeroportMin.international,
      interieur: d?.interieur ?? defaut.delaiAeroportMin.interieur,
    },
    tauxChange: Array.isArray(brut?.tauxChange) ? brut.tauxChange : [],
    budget: Array.isArray(brut?.budget) ? brut.budget : [],
    rythme: {
      activitesMax: typeof r?.activitesMax === 'number' ? r.activitesMax : null,
      heureLever: typeof r?.heureLever === 'string' && heureValide(r.heureLever) ? r.heureLever : '',
      pauses: Array.isArray(r?.pauses) ? r.pauses : [],
    },
    aEviter: listeDe(brut?.aEviter, A_EVITER),
    trajetLongKm: typeof brut?.trajetLongKm === 'number' && brut.trajetLongKm > 0 ? brut.trajetLongKm : defaut.trajetLongKm,
    transports: Array.isArray(brut?.transports) ? brut.transports : [],
  };
}

// Âge connu → tranche ; sinon la tranche saisie
export function trancheDe(p: Personne): TrancheAge | '' {
  if (p.ageAns !== null) return p.ageAns < 18 ? 'enfant' : p.ageAns >= 65 ? 'senior' : 'adulte';
  return p.tranche;
}

export function presentLe(p: Personne, jour: string): boolean {
  return p.presence.length === 0 || p.presence.some((x) => x.du <= jour && jour <= x.au);
}

// Les personnes présentes un jour : le réglage de ce jour s'il existe, sinon celles dont la présence couvre le jour
export function idsPresentsLe(d: Donnees, jour: string): string[] {
  const j = d.joursPlan.find((x) => x.jour === jour);
  if (j) return j.participants;
  return d.personnes.filter((p) => presentLe(p, jour)).map((p) => p.id);
}

// Les personnes désignées par des groupes et des personnes (sans doublon, dans l'ordre de la liste des personnes)
export function personnesDe(d: Donnees, groupeIds: string[], personneIds: string[]): Personne[] {
  const ids = new Set<string>(personneIds);
  for (const g of d.groupes) if (groupeIds.includes(g.id)) for (const id of g.personneIds) ids.add(id);
  return d.personnes.filter((p) => ids.has(p.id));
}

// Un groupe est « choisi » quand toutes ses personnes le sont (et qu'il n'est pas vide)
export function groupeComplet(g: Groupe, ids: string[]): boolean {
  return g.personneIds.length > 0 && g.personneIds.every((id) => ids.includes(id));
}

export function resumeProfil(p: Personne, libelles: { regime: Record<Regime, string>; mobilite: Record<Mobilite, string> }): string[] {
  const lignes: string[] = [];
  if (p.ageAns !== null) lignes.push(`${p.ageAns} an${p.ageAns > 1 ? 's' : ''}`);
  else if (p.tranche !== '') lignes.push(p.tranche === 'enfant' ? 'Enfant' : p.tranche === 'senior' ? 'Senior' : 'Adulte');
  for (const r of p.regimes) lignes.push(libelles.regime[r]);
  for (const m of p.mobilite) lignes.push(libelles.mobilite[m]);
  return lignes;
}

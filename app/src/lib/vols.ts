// Logique des vols et des compteurs (sans affichage, donc facile à tester).

import type { Donnees, Reglages, Vol, Compteur } from '../data/types.ts';
import { instantLocal } from './temps.ts';

export function instantDepart(v: Vol): number {
  return instantLocal(v.depart.date, v.depart.heure, v.depart.fuseau);
}

export function instantArrivee(v: Vol): number {
  return instantLocal(v.arrivee.date, v.arrivee.heure, v.arrivee.fuseau);
}

// Durée du vol en minutes : arrivée moins départ, chacun converti en instant exact
export function dureeVolMin(v: Vol): number {
  return (instantArrivee(v) - instantDepart(v)) / 60000;
}

export function volsTries(vols: Vol[]): Vol[] {
  const cle = (v: Vol): number => {
    const t = instantDepart(v);
    return Number.isNaN(t) ? Infinity : t;
  };
  return [...vols].sort((a, b) => {
    const ca = cle(a);
    const cb = cle(b);
    return ca === cb ? 0 : ca < cb ? -1 : 1;
  });
}

// Le prochain vol à venir qui concerne l'utilisateur. Dès que l'heure de départ est
// passée, on passe au vol suivant. Les vols annulés ou d'une autre personne sont ignorés.
export function prochainVol(vols: Vol[], maintenantMs: number): Vol | undefined {
  let meilleur: Vol | undefined;
  let meilleurT = Infinity;
  for (const v of vols) {
    if (!v.pourMoi || v.statut === 'annule') continue;
    const t = instantDepart(v);
    if (Number.isNaN(t) || t <= maintenantMs) continue;
    if (t < meilleurT) {
      meilleur = v;
      meilleurT = t;
    }
  }
  return meilleur;
}

// Heure à laquelle il faut être à l'aéroport : décollage moins le délai du réglage.
// (Le trajet jusqu'à l'aéroport s'ajoutera à l'étape 4.)
export function instantArriveeAeroport(v: Vol, reglages: Reglages): number {
  return instantDepart(v) - reglages.delaiAeroportMin[v.portee] * 60000;
}

export function libelleVol(v: Vol): string {
  return `${v.numero} · ${v.depart.ville || v.depart.code} → ${v.arrivee.ville || v.arrivee.code}`;
}

export type CompteurResolu =
  | { etat: 'actif' | 'passe'; cibleMs: number; vol?: Vol }
  | { etat: 'aucun-vol' }
  | { etat: 'invalide'; raison: string };

// Transforme un compteur en instant cible exact. "passe" = l'heure est atteinte.
export function resoudre(c: Compteur, donnees: Donnees, maintenantMs: number): CompteurResolu {
  const decalage = c.delaiMin * 60000;
  const cible = c.cible;
  if (cible.type === 'prochain-vol') {
    const v = prochainVol(donnees.vols, maintenantMs);
    if (!v) return { etat: 'aucun-vol' };
    const cibleMs = instantDepart(v) - decalage;
    return { etat: cibleMs > maintenantMs ? 'actif' : 'passe', cibleMs, vol: v };
  }
  if (cible.type === 'vol') {
    const v = donnees.vols.find((x) => x.id === cible.volId);
    if (!v) return { etat: 'invalide', raison: 'Ce vol n\'existe plus.' };
    const depart = instantDepart(v);
    if (Number.isNaN(depart)) return { etat: 'invalide', raison: 'Date ou fuseau du vol invalide.' };
    const cibleMs = depart - decalage;
    return { etat: cibleMs > maintenantMs ? 'actif' : 'passe', cibleMs, vol: v };
  }
  const instant = instantLocal(cible.date, cible.heure, cible.fuseau);
  if (Number.isNaN(instant)) return { etat: 'invalide', raison: 'Date, heure ou fuseau invalide.' };
  const cibleMs = instant - decalage;
  return { etat: cibleMs > maintenantMs ? 'actif' : 'passe', cibleMs };
}

// Rappel de sauvegarde : les données ne vivent que dans le téléphone, et le navigateur peut les effacer.
// Ce fichier décide quand rappeler à l'utilisateur d'exporter une sauvegarde (cahier des charges, section 8).

import type { Donnees } from '../data/types.ts';
import { joursEntre } from './sejour.ts';
import { formatDateIso } from './temps.ts';

// Dates en texte ISO complet (ex. 2027-03-01T12:00:00.000Z), '' = jamais
export type MetaSauvegarde = { derniereSauvegarde: string; derniereModification: string };

export const META_VIDE: MetaSauvegarde = { derniereSauvegarde: '', derniereModification: '' };

export type NiveauSauvegarde = 'vide' | 'ok' | 'rappel' | 'urgent';
export type EtatSauvegarde = { niveau: NiveauSauvegarde; titre: string; detail: string };

const JOURS_RAPPEL = 7; // rappel simple : la dernière sauvegarde date de plus d'une semaine et il y a eu des changements
const JOURS_AVANT_DEPART = 14; // dans les deux semaines avant le départ, on insiste

// Y a-t-il quelque chose à sauvegarder ? (les compteurs par défaut ne comptent pas)
export function donneesVidesQ(d: Donnees): boolean {
  return (
    d.vols.length === 0 &&
    d.etapes.length === 0 &&
    d.logements.length === 0 &&
    d.trajets.length === 0 &&
    d.taches.length === 0 &&
    d.personnes.length === 0 &&
    d.groupes.length === 0 &&
    d.creneaux.length === 0 &&
    d.lieuxPerso.length === 0 &&
    d.suiviLieux.length === 0 &&
    d.pratiquePerso.length === 0
  );
}

// Le jour (AAAA-MM-JJ) de l'heure locale du téléphone pour un texte ISO
export function jourLocalDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ilYA(jours: number): string {
  if (jours <= 0) return "aujourd'hui";
  return jours === 1 ? 'hier' : `il y a ${jours} jours`;
}

// aujourdhui et debutVoyage sont des dates AAAA-MM-JJ ; debutVoyage vaut '' si le départ est inconnu
export function etatSauvegarde(meta: MetaSauvegarde, vide: boolean, aujourdhui: string, debutVoyage: string): EtatSauvegarde {
  if (vide) return { niveau: 'vide', titre: 'Rien à sauvegarder', detail: '' };
  const avantDepart = debutVoyage !== '' ? joursEntre(aujourdhui, debutVoyage) : null; // négatif ou 0 = déjà parti
  const procheDuDepart = avantDepart !== null && avantDepart >= 0 && avantDepart <= JOURS_AVANT_DEPART;
  const quand = avantDepart === null || avantDepart < 0 ? '' : avantDepart === 0 ? " Tu pars aujourd'hui." : ` Départ dans ${avantDepart} jour${avantDepart > 1 ? 's' : ''}.`;

  const jourSauvegarde = jourLocalDe(meta.derniereSauvegarde);
  if (jourSauvegarde === '') {
    return {
      niveau: procheDuDepart ? 'urgent' : 'rappel',
      titre: "Aucune sauvegarde pour l'instant",
      detail: `Tes données ne sont que dans ce téléphone. Exporte une sauvegarde (copie ou fichier) : si le navigateur efface ses données, tu ne perds rien.${quand}`,
    };
  }
  const age = joursEntre(jourSauvegarde, aujourdhui);
  const modifieDepuis = meta.derniereModification > meta.derniereSauvegarde;
  if (!modifieDepuis) {
    return { niveau: 'ok', titre: 'Sauvegarde à jour', detail: `Dernière sauvegarde : ${formatDateIso(jourSauvegarde)} (${ilYA(age)}). Rien n'a changé depuis.` };
  }
  if (procheDuDepart) {
    return {
      niveau: 'urgent',
      titre: 'Refais une sauvegarde avant le départ',
      detail: `Tu as modifié des données depuis ta dernière sauvegarde (${formatDateIso(jourSauvegarde)}, ${ilYA(age)}).${quand}`,
    };
  }
  if (age >= JOURS_RAPPEL) {
    return {
      niveau: 'rappel',
      titre: 'Pense à une nouvelle sauvegarde',
      detail: `Dernière sauvegarde : ${formatDateIso(jourSauvegarde)} (${ilYA(age)}). Tu as modifié des données depuis.`,
    };
  }
  return { niveau: 'ok', titre: 'Sauvegarde récente', detail: `Dernière sauvegarde : ${formatDateIso(jourSauvegarde)} (${ilYA(age)}). Des changements ont eu lieu depuis.` };
}

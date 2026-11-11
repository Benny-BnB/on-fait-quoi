// Logique des check-lists : urgence, regroupement, progression (sans affichage, donc testable).
//
// Règle du cahier : "ce qui peut être réglé tout de suite est réglé tout de suite".
// La DATE SOUHAITÉE est donc la date à laquelle on veut faire la tâche (la plus proche possible),
// l'ÉCHÉANCE est la limite. Une tâche est en retard quand son échéance est dépassée.

import type { Donnees, Tache } from '../data/types.ts';
import { ajouterJours, joursEntre } from './sejour.ts';
import { dateValide, formatDateIso } from './temps.ts';
import { instantDepart } from './vols.ts';

export type GroupeUrgence = 'en-retard' | 'aujourdhui' | 'semaine' | 'avant-depart' | 'voyage' | 'sans-date';

export const ORDRE_GROUPES: GroupeUrgence[] = ['en-retard', 'aujourdhui', 'semaine', 'avant-depart', 'voyage', 'sans-date'];

export const LIBELLES_GROUPE: Record<GroupeUrgence, string> = {
  'en-retard': 'En retard',
  aujourdhui: "Aujourd'hui",
  semaine: 'Cette semaine',
  'avant-depart': "D'ici le départ",
  voyage: 'Pendant le voyage',
  'sans-date': 'Sans date',
};

// La date qui décide du regroupement : celle où on veut faire la tâche, sinon l'échéance
export function dateUrgence(t: Tache): string {
  return t.dateSouhaitee !== '' ? t.dateSouhaitee : t.echeance;
}

// Le jour où le voyage commence : le décollage du premier vol (qui me concerne, non annulé),
// sinon le début de la première étape, sinon '' (inconnu)
export function debutVoyage(d: Donnees): string {
  let meilleur = '';
  let meilleurT = Infinity;
  for (const v of d.vols) {
    if (!v.pourMoi || v.statut === 'annule') continue;
    const t = instantDepart(v);
    if (!Number.isNaN(t) && t < meilleurT) {
      meilleurT = t;
      meilleur = v.depart.date;
    }
  }
  if (meilleur !== '') return meilleur;
  const debuts = d.etapes.map((e) => e.debut).filter(dateValide).sort();
  return debuts[0] ?? '';
}

// En retard = échéance dépassée (ou, sans échéance, date souhaitée dépassée). Une tâche faite n'est jamais en retard.
export function estEnRetard(t: Tache, aujourdhui: string): boolean {
  if (t.fait) return false;
  if (t.echeance !== '') return t.echeance < aujourdhui;
  return t.dateSouhaitee !== '' && t.dateSouhaitee < aujourdhui;
}

export function joursDeRetard(t: Tache, aujourdhui: string): number {
  const limite = t.echeance !== '' ? t.echeance : t.dateSouhaitee;
  return limite === '' ? 0 : Math.max(0, joursEntre(limite, aujourdhui));
}

export function groupeUrgence(t: Tache, aujourdhui: string, debut: string): GroupeUrgence {
  if (estEnRetard(t, aujourdhui)) return 'en-retard';
  const d = dateUrgence(t);
  if (d === '') return 'sans-date';
  if (d <= aujourdhui) return 'aujourdhui';
  if (d <= ajouterJours(aujourdhui, 6)) return 'semaine'; // les 7 jours qui viennent, aujourd'hui compris
  if (debut === '' || d <= debut) return 'avant-depart';
  return 'voyage';
}

export type GroupeTaches = { groupe: GroupeUrgence; taches: Tache[] };

// Les tâches PAS ENCORE faites, par groupe d'urgence (groupes vides omis), triées par date puis par titre
export function grouperTaches(taches: Tache[], aujourdhui: string, debut: string): GroupeTaches[] {
  const parGroupe = new Map<GroupeUrgence, Tache[]>();
  for (const t of taches) {
    if (t.fait) continue;
    const g = groupeUrgence(t, aujourdhui, debut);
    parGroupe.set(g, [...(parGroupe.get(g) ?? []), t]);
  }
  const trier = (a: Tache, b: Tache): number => {
    const da = dateUrgence(a);
    const db = dateUrgence(b);
    if (da !== db) return da === '' ? 1 : db === '' ? -1 : da.localeCompare(db);
    return a.titre.localeCompare(b.titre, 'fr');
  };
  return ORDRE_GROUPES.filter((g) => parGroupe.has(g)).map((g) => ({ groupe: g, taches: [...(parGroupe.get(g) ?? [])].sort(trier) }));
}

// Les tâches faites, la plus récemment faite en premier
export function tachesFaites(taches: Tache[]): Tache[] {
  return taches.filter((t) => t.fait).sort((a, b) => b.faitLe.localeCompare(a.faitLe) || a.titre.localeCompare(b.titre, 'fr'));
}

export type Progression = { total: number; faites: number; restantes: number; enRetard: number; aujourdhui: number };

export function progression(taches: Tache[], aujourdhui: string, debut: string): Progression {
  const restantes = taches.filter((t) => !t.fait);
  return {
    total: taches.length,
    faites: taches.length - restantes.length,
    restantes: restantes.length,
    enRetard: restantes.filter((t) => estEnRetard(t, aujourdhui)).length,
    aujourdhui: restantes.filter((t) => groupeUrgence(t, aujourdhui, debut) === 'aujourdhui').length,
  };
}

// "aujourd'hui", "demain", "dans 9 jours", "hier", "il y a 3 jours"
export function delaiRelatif(dateIso: string, aujourdhui: string): string {
  const n = joursEntre(aujourdhui, dateIso);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === -1) return 'hier';
  return n > 0 ? `dans ${n} jours` : `il y a ${-n} jours`;
}

// Lignes de dates affichées sous une tâche, et l'avertissement de retard s'il y en a un
export function descriptionDates(t: Tache, aujourdhui: string): { lignes: string[]; retard: string | null } {
  const lignes: string[] = [];
  if (t.fait) {
    if (t.faitLe !== '') lignes.push(`Faite le ${formatDateIso(t.faitLe)}`);
    return { lignes, retard: null };
  }
  if (t.dateSouhaitee !== '') lignes.push(`Souhaitée : ${formatDateIso(t.dateSouhaitee)} (${delaiRelatif(t.dateSouhaitee, aujourdhui)})`);
  if (t.echeance !== '') lignes.push(`Échéance : ${formatDateIso(t.echeance)} (${delaiRelatif(t.echeance, aujourdhui)})`);
  let retard: string | null = null;
  if (estEnRetard(t, aujourdhui)) {
    const n = joursDeRetard(t, aujourdhui);
    retard = `En retard de ${n} jour${n > 1 ? 's' : ''}`;
  }
  return { lignes, retard };
}

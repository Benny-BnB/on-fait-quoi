// Taux de change et budgets. Un taux est saisi avec sa date (jamais deviné) ; sans taux, on n'additionne pas des monnaies différentes.

import type { BudgetLigne, Donnees, TauxChange } from '../data/types.ts';
import { estActif, participantsEffectifs } from './creneaux.ts';
import { formatMontant } from './format.ts';
import { formatDateIso } from './temps.ts';
import type { Alerte } from './planning.ts';

// 1 unité de la devise vaut combien d'euros (EUR = 1) ; null si aucun taux n'est saisi
export function tauxVersEuro(taux: TauxChange[], devise: string): number | null {
  if (devise === 'EUR') return 1;
  return taux.find((t) => t.devise === devise)?.taux ?? null;
}

export function enEuros(montant: number, devise: string, taux: TauxChange[]): number | null {
  const t = tauxVersEuro(taux, devise);
  return t === null ? null : montant * t;
}

export function convertir(montant: number, de: string, vers: string, taux: TauxChange[]): number | null {
  if (de === vers) return montant;
  const eur = enEuros(montant, de, taux);
  const t = tauxVersEuro(taux, vers);
  return eur === null || t === null ? null : eur / t;
}

// « ≈ 7,89€ » à côté d'un prix en monnaie locale ; null sans taux (ou si le prix est déjà en euros)
export function libelleEuro(montant: number, devise: string, taux: TauxChange[]): string | null {
  if (devise === 'EUR') return null;
  const e = enEuros(montant, devise, taux);
  if (e === null) return null;
  return `≈ ${formatMontant(Math.round(e * 100) / 100, 'EUR')}`;
}

export function libelleTaux(t: TauxChange): string {
  // Quatre décimales : une devise faible comme le baht vaut 0,0267 € (deux décimales donneraient 0,03 €)
  return `1 ${t.devise} = ${(Math.round(t.taux * 1e4) / 1e4).toFixed(4).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')}€`;
}

// ---------- Dépenses ----------

type Cumul = { devise: string; estime: number; reel: number };

function ajouter(map: Map<string, Cumul>, devise: string, estime: number, reel: number): void {
  const c = map.get(devise) ?? { devise, estime: 0, reel: 0 };
  c.estime += estime;
  c.reel += reel;
  map.set(devise, c);
}

// Total d'un ensemble de montants dans une devise cible ; les montants sans taux sont comptés à part
function totalEn(map: Map<string, Cumul>, cible: string, taux: TauxChange[]): { estime: number; reel: number; sansTaux: string[] } {
  let estime = 0;
  let reel = 0;
  const sansTaux: string[] = [];
  for (const c of map.values()) {
    const e = convertir(c.estime, c.devise, cible, taux);
    const r = convertir(c.reel, c.devise, cible, taux);
    if (e === null || r === null) {
      sansTaux.push(c.devise);
      continue;
    }
    estime += e;
    reel += r;
  }
  return { estime, reel, sansTaux };
}

// Montants d'un jour, par personne (le budget d'un créneau est le total pour ses participants)
function depensesJourParPersonne(d: Donnees, jour: string): Map<string, Cumul> {
  const map = new Map<string, Cumul>();
  for (const c of d.creneaux) {
    if (c.jour !== jour || !estActif(c) || (c.budgetEstime === null && c.budgetReel === null)) continue;
    const n = Math.max(1, participantsEffectifs(c, d).length);
    ajouter(map, c.devise, (c.budgetEstime ?? 0) / n, (c.budgetReel ?? 0) / n);
  }
  return map;
}

function joursDuPays(d: Donnees, pays: string): { du: string; au: string }[] {
  const p = pays.trim().toLowerCase();
  return d.etapes.filter((e) => e.pays.trim().toLowerCase() === p).map((e) => ({ du: e.debut, au: e.fin }));
}

function depensesTotales(d: Donnees, filtre: (jour: string) => boolean): Map<string, Cumul> {
  const map = new Map<string, Cumul>();
  for (const c of d.creneaux) {
    if (!estActif(c) || (c.budgetEstime === null && c.budgetReel === null) || !filtre(c.jour)) continue;
    ajouter(map, c.devise, c.budgetEstime ?? 0, c.budgetReel ?? 0);
  }
  return map;
}

export type EtatBudget = { ligne: BudgetLigne; estime: number; reel: number; reste: number; depasse: boolean; sansTaux: string[] };

// Les budgets « pays » et « groupe » : total estimé et dépensé, comparé au montant fixé
export function etatBudgets(d: Donnees): EtatBudget[] {
  const lignes = d.reglages.budget.filter((b) => b.perimetre !== 'jour-personne');
  return lignes.map((ligne) => {
    const plages = ligne.perimetre === 'pays' ? joursDuPays(d, ligne.pays) : null;
    const map = depensesTotales(d, (jour) => (plages === null ? true : plages.some((p) => p.du <= jour && jour <= p.au)));
    const t = totalEn(map, ligne.devise, d.reglages.tauxChange);
    return { ligne, estime: t.estime, reel: t.reel, reste: ligne.montant - Math.max(t.estime, t.reel), depasse: Math.max(t.estime, t.reel) > ligne.montant, sansTaux: t.sansTaux };
  });
}

export function alertesBudget(d: Donnees): Alerte[] {
  const alertes: Alerte[] = [];
  const jours = [...new Set(d.creneaux.map((c) => c.jour))].sort();
  for (const ligne of d.reglages.budget.filter((b) => b.perimetre === 'jour-personne')) {
    for (const jour of jours) {
      const t = totalEn(depensesJourParPersonne(d, jour), ligne.devise, d.reglages.tauxChange);
      const total = Math.max(t.estime, t.reel);
      if (total > ligne.montant) {
        alertes.push({ cle: `budget:${ligne.id}:${jour}`, jour, message: `Budget du jour dépassé : ${formatMontant(Math.round(total), ligne.devise)} par personne prévus (${ligne.libelle || 'budget par jour et par personne'} : ${formatMontant(ligne.montant, ligne.devise)}), le ${formatDateIso(jour)}.` });
      }
    }
  }
  for (const e of etatBudgets(d)) {
    if (e.depasse) {
      alertes.push({ cle: `budget:${e.ligne.id}`, message: `Budget dépassé : ${e.ligne.libelle || (e.ligne.perimetre === 'pays' ? `budget ${e.ligne.pays}` : 'budget du groupe')} (${formatMontant(e.ligne.montant, e.ligne.devise)}) : ${formatMontant(Math.round(Math.max(e.estime, e.reel)), e.ligne.devise)} prévus ou dépensés.` });
    }
  }
  return alertes;
}

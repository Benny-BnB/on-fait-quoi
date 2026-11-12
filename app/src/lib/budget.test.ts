import assert from 'node:assert/strict';
import { test } from 'node:test';
import { donneesVides, personneVide } from '../data/defauts.ts';
import type { BudgetLigne, Creneau, Donnees, TauxChange } from '../data/types.ts';
import { alertesBudget, convertir, enEuros, etatBudgets, libelleEuro, libelleTaux, tauxVersEuro } from './budget.ts';
import { alertesRythme, activitesDuJour } from './rythme.ts';
import { lireReponseTaux } from './tauxEnLigne.ts';

const thb: TauxChange = { devise: 'THB', taux: 0.0267, date: '2026-11-11', source: 'Source test', lien: '' };
const aed: TauxChange = { devise: 'AED', taux: 0.2434, date: '2026-11-11', source: 'Source test', lien: '' };

test('taux : l\'euro vaut 1, une devise sans taux est inconnue (jamais devinée)', () => {
  assert.equal(tauxVersEuro([thb], 'EUR'), 1);
  assert.equal(tauxVersEuro([thb], 'THB'), 0.0267);
  assert.equal(tauxVersEuro([thb], 'AED'), null);
  assert.equal(Math.round(enEuros(500, 'THB', [thb])! * 100) / 100, 13.35);
  assert.equal(enEuros(500, 'AED', [thb]), null);
  assert.equal(enEuros(10, 'EUR', []), 10);
});

test('conversion entre deux devises : par l\'euro, seulement si les deux taux existent', () => {
  assert.equal(convertir(100, 'THB', 'THB', []), 100);
  assert.equal(Math.round(convertir(1000, 'THB', 'AED', [thb, aed])! * 100) / 100, 109.7);
  assert.equal(convertir(1000, 'THB', 'AED', [thb]), null);
  assert.equal(convertir(10, 'EUR', 'THB', [thb]) !== null, true);
});

test('affichage en euros : « ≈ 13,35€ » avec un taux, rien sans taux, rien pour un prix déjà en euros', () => {
  assert.equal(libelleEuro(500, 'THB', [thb]), '≈ 13,35€');
  assert.equal(libelleEuro(500, 'THB', []), null);
  assert.equal(libelleEuro(20, 'EUR', [thb]), null);
  assert.equal(libelleEuro(1000000, 'THB', [{ ...thb, taux: 0.0267 }]), '≈ 26.700€');
  assert.equal(libelleTaux(thb), '1 THB = 0,0267€');
});

// ---------- Budget ----------

const creneau = (id: string, jour: string, estime: number | null, devise: string, extra: Partial<Creneau> = {}): Creneau => ({
  id, jour, periode: 'matin', debut: '', fin: '', fuseau: 'Asia/Bangkok', titre: `Créneau ${id}`, note: '', statut: 'prevu', humeur: '', participants: [],
  budgetEstime: estime, budgetReel: null, devise, dureeMin: null, planBDe: '', lieuId: '', fixe: false, typeEvenement: '', ...extra,
});
const ligne = (extra: Partial<BudgetLigne>): BudgetLigne => ({ id: 'b', perimetre: 'jour-personne', libelle: '', pays: '', montant: 1000, devise: 'THB', ...extra });
const avec = (budget: BudgetLigne[], creneaux: Creneau[], extra: Partial<Donnees> = {}): Donnees => ({
  ...donneesVides(),
  personnes: [personneVide('a', 'A'), personneVide('b', 'B')],
  reglages: { ...donneesVides().reglages, budget, tauxChange: [thb, aed] },
  creneaux,
  ...extra,
});

test('budget par jour et par personne : le total d\'un créneau est partagé entre ses participants', () => {
  const c = [creneau('c1', '2026-12-08', 3000, 'THB')]; // 2 personnes présentes : 1 500 chacune
  assert.equal(alertesBudget(avec([ligne({ montant: 1000 })], c)).length, 1);
  assert.match(alertesBudget(avec([ligne({ montant: 1000 })], c))[0].message, /1\.500 THB par personne prévus.*1\.000 THB/);
  assert.equal(alertesBudget(avec([ligne({ montant: 2000 })], c)).length, 0);
  // un seul participant : 3 000 pour lui seul
  const seul = [creneau('c1', '2026-12-08', 3000, 'THB', { participants: ['a'] })];
  assert.equal(alertesBudget(avec([ligne({ montant: 2000 })], seul)).length, 1);
});

test('budget : les montants de plusieurs devises se comparent via les taux ; sans taux, ils ne sont pas additionnés', () => {
  const c = [creneau('c1', '2026-12-08', 20, 'EUR', { participants: ['a'] })]; // 20 € ≈ 749 THB
  assert.equal(alertesBudget(avec([ligne({ montant: 700 })], c)).length, 1);
  assert.equal(alertesBudget(avec([ligne({ montant: 800 })], c)).length, 0);
  const sansTaux = avec([ligne({ montant: 10 })], [creneau('c1', '2026-12-08', 20, 'JPY', { participants: ['a'] })]);
  assert.equal(alertesBudget(sansTaux).length, 0, 'JPY sans taux : pas de comparaison inventée');
  assert.deepEqual(etatBudgets(avec([ligne({ perimetre: 'groupe' })], [creneau('c1', '2026-12-08', 20, 'JPY')]))[0].sansTaux, ['JPY']);
});

test('budget pour un pays et pour le groupe : estimé, dépensé, reste, dépassement', () => {
  const etapes = [
    { id: 'e1', nom: 'Ville A', pays: 'Pays A', devise: 'THB', fuseau: 'Asia/Bangkok', debut: '2026-12-06', fin: '2026-12-10' },
    { id: 'e2', nom: 'Ville B', pays: 'Pays B', devise: 'AED', fuseau: 'Asia/Dubai', debut: '2026-12-10', fin: '2026-12-15' },
  ];
  const c = [creneau('c1', '2026-12-07', 2000, 'THB', { budgetReel: 1800 }), creneau('c2', '2026-12-12', 100, 'AED'), creneau('c3', '2026-12-08', 500, 'THB', { statut: 'annule' })];
  const d = avec([ligne({ id: 'p', perimetre: 'pays', pays: 'pays a', montant: 3000 }), ligne({ id: 'g', perimetre: 'groupe', devise: 'EUR', montant: 50 })], c, { etapes });
  const [pays, groupe] = etatBudgets(d);
  assert.equal(pays.estime, 2000);
  assert.equal(pays.reel, 1800);
  assert.equal(pays.reste, 1000);
  assert.ok(!pays.depasse);
  assert.equal(Math.round(groupe.estime * 100) / 100, Math.round((2000 * 0.0267 + 100 * 0.2434) * 100) / 100);
  assert.ok(groupe.depasse, '77,74 € prévus pour 50 €');
  assert.ok(alertesBudget(d).some((a) => a.cle === 'budget:g' && /Budget dépassé/.test(a.message)));
  assert.ok(!alertesBudget(d).some((a) => a.cle === 'budget:p'));
});

// ---------- Rythme ----------

test('rythme : trop d\'activités un jour, lever, pauses — les événements imposés ne comptent pas', () => {
  const r = { activitesMax: 2, heureLever: '08:30', pauses: [{ libelle: 'Sieste', debut: '13:00', fin: '15:00' }] };
  const creneaux = [
    creneau('a', '2026-12-08', null, '', { debut: '07:45', dureeMin: 60 }),
    creneau('b', '2026-12-08', null, '', { debut: '13:30', dureeMin: 60 }),
    creneau('c', '2026-12-08', null, ''),
    creneau('f', '2026-12-08', null, '', { fixe: true, debut: '07:00' }),
    creneau('x', '2026-12-08', null, '', { statut: 'annule' }),
    creneau('ok', '2026-12-09', null, '', { debut: '10:00', dureeMin: 60 }),
  ];
  const d: Donnees = { ...donneesVides(), reglages: { ...donneesVides().reglages, rythme: r }, creneaux };
  assert.equal(activitesDuJour(d, '2026-12-08'), 3);
  const messages = alertesRythme(d).map((a) => a.message);
  assert.ok(messages.some((m) => /^3 activités prévues ce jour pour 2 souhaitées/.test(m)));
  assert.ok(messages.some((m) => /« Créneau a » commence à 07:45, avant l'heure de lever réglée \(08:30\)/.test(m)));
  assert.ok(messages.some((m) => /« Créneau b » empiète sur la pause « Sieste » \(13:00–15:00\)/.test(m)));
  assert.equal(messages.length, 3, 'rien pour l\'événement imposé à 07:00, le créneau annulé, ni le 09/12');
});

test('rythme non réglé : aucune alerte', () => {
  const d: Donnees = { ...donneesVides(), creneaux: [creneau('a', '2026-12-08', null, '', { debut: '03:00', dureeMin: 60 })] };
  assert.deepEqual(alertesRythme(d), []);
});

// ---------- Taux en ligne ----------

const reponse = { result: 'success', time_last_update_unix: 1794355352, rates: { THB: 37.520011, AED: 4.108312, USD: 1.1 } };

test('taux en ligne : la réponse de la source devient un taux daté et sourcé (1 unité = x €)', () => {
  const r = lireReponseTaux(reponse, ['THB', 'AED']);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.taux.length, 2);
    assert.ok(Math.abs(r.taux[0].taux - 1 / 37.520011) < 1e-12);
    assert.equal(r.taux[0].date, new Date(1794355352 * 1000).toISOString().slice(0, 10));
    assert.equal(r.taux[0].source, 'ExchangeRate-API (open.er-api.com)');
    assert.match(r.taux[0].lien, /^https:\/\//);
    assert.deepEqual(r.manquantes, []);
  }
});

test('taux en ligne : devise absente signalée, réponse invalide ou en erreur refusée', () => {
  const r = lireReponseTaux(reponse, ['THB', 'XYZ']);
  assert.ok(r.ok && r.taux.length === 1 && r.manquantes[0] === 'XYZ');
  assert.equal(lireReponseTaux({ result: 'error' }, ['THB']).ok, false);
  assert.equal(lireReponseTaux(null, ['THB']).ok, false);
  assert.equal(lireReponseTaux({ ...reponse, time_last_update_unix: 'hier' }, ['THB']).ok, false);
  assert.equal(lireReponseTaux({ ...reponse, rates: null }, ['THB']).ok, false);
  const negatif = lireReponseTaux({ ...reponse, rates: { THB: -3, AED: 0 } }, ['THB', 'AED']);
  assert.ok(negatif.ok && negatif.taux.length === 0 && negatif.manquantes.length === 2);
});

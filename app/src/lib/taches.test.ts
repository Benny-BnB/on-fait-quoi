// Tests des check-lists. Données FICTIVES. "Aujourd'hui" est toujours passé en paramètre : aucun test ne dépend de la vraie date.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Donnees, Tache } from '../data/types.ts';
import { REGLAGES_PAR_DEFAUT } from '../data/defauts.ts';
import { debutVoyage, delaiRelatif, descriptionDates, estEnRetard, groupeUrgence, grouperTaches, joursDeRetard, progression, tachesFaites } from './taches.ts';

const AUJOURDHUI = '2027-03-10';
const DEBUT = '2027-04-01';

function tache(id: string, extra: Partial<Tache> = {}): Tache {
  return { id, titre: `Tâche ${id}`, liste: 'reste-a-faire', dateSouhaitee: '', echeance: '', fait: false, faitLe: '', note: '', lien: '', ...extra };
}

test('en retard = échéance dépassée ; sans échéance, date souhaitée dépassée', () => {
  assert.equal(estEnRetard(tache('a', { echeance: '2027-03-09' }), AUJOURDHUI), true);
  assert.equal(estEnRetard(tache('b', { echeance: '2027-03-10' }), AUJOURDHUI), false, 'l\'échéance du jour n\'est pas encore dépassée');
  assert.equal(estEnRetard(tache('c', { dateSouhaitee: '2027-03-09' }), AUJOURDHUI), true);
  assert.equal(estEnRetard(tache('d', { dateSouhaitee: '2027-03-01', echeance: '2027-03-20' }), AUJOURDHUI), false, 'date souhaitée passée mais échéance pas atteinte : pas en retard');
  assert.equal(estEnRetard(tache('e', { echeance: '2027-03-01', fait: true, faitLe: '2027-03-05' }), AUJOURDHUI), false, 'une tâche faite n\'est jamais en retard');
  assert.equal(estEnRetard(tache('f'), AUJOURDHUI), false);
  assert.equal(joursDeRetard(tache('a', { echeance: '2027-03-07' }), AUJOURDHUI), 3);
});

test('regroupement par urgence : aujourd\'hui, cette semaine, d\'ici le départ, pendant le voyage, sans date', () => {
  const g = (extra: Partial<Tache>) => groupeUrgence(tache('x', extra), AUJOURDHUI, DEBUT);
  assert.equal(g({ echeance: '2027-03-09' }), 'en-retard');
  assert.equal(g({ echeance: '2027-03-10' }), 'aujourdhui');
  assert.equal(g({ dateSouhaitee: '2027-03-10', echeance: '2027-03-25' }), 'aujourdhui', 'à faire dès que possible : la date souhaitée est arrivée');
  assert.equal(g({ dateSouhaitee: '2027-03-12' }), 'semaine');
  assert.equal(g({ dateSouhaitee: '2027-03-16' }), 'semaine', 'aujourd\'hui + 6 jours = dernier jour de la semaine glissante');
  assert.equal(g({ dateSouhaitee: '2027-03-17' }), 'avant-depart');
  assert.equal(g({ dateSouhaitee: '2027-04-01' }), 'avant-depart', 'le jour du départ compte encore "d\'ici le départ"');
  assert.equal(g({ dateSouhaitee: '2027-04-02' }), 'voyage');
  assert.equal(g({}), 'sans-date');
});

test('la date souhaitée décide du groupe, pas l\'échéance', () => {
  assert.equal(groupeUrgence(tache('x', { dateSouhaitee: '2027-03-12', echeance: '2027-03-30' }), AUJOURDHUI, DEBUT), 'semaine');
  assert.equal(groupeUrgence(tache('y', { echeance: '2027-03-12' }), AUJOURDHUI, DEBUT), 'semaine', 'sans date souhaitée, l\'échéance sert');
});

test('sans date de départ connue, ce qui n\'est pas pour cette semaine est "d\'ici le départ"', () => {
  assert.equal(groupeUrgence(tache('x', { dateSouhaitee: '2027-06-01' }), AUJOURDHUI, ''), 'avant-depart');
});

test('regroupement : groupes vides omis, ordre d\'urgence, tri par date puis titre, tâches faites exclues', () => {
  const liste = [
    tache('1', { titre: 'B', dateSouhaitee: '2027-03-12' }),
    tache('2', { titre: 'A', dateSouhaitee: '2027-03-12' }),
    tache('3', { titre: 'Z', echeance: '2027-03-01' }),
    tache('4', { titre: 'Fait', dateSouhaitee: '2027-03-12', fait: true, faitLe: '2027-03-09' }),
    tache('5', { titre: 'Sans' }),
    tache('6', { titre: 'Tôt', dateSouhaitee: '2027-03-11' }),
  ];
  const groupes = grouperTaches(liste, AUJOURDHUI, DEBUT);
  assert.deepEqual(groupes.map((g) => g.groupe), ['en-retard', 'semaine', 'sans-date']);
  assert.deepEqual(groupes[1].taches.map((t) => t.titre), ['Tôt', 'A', 'B']);
  assert.ok(!groupes.some((g) => g.taches.some((t) => t.fait)));
});

test('les tâches faites : la plus récente en premier', () => {
  const faites = tachesFaites([
    tache('1', { fait: true, faitLe: '2027-03-01' }),
    tache('2', { fait: true, faitLe: '2027-03-08' }),
    tache('3'),
  ]);
  assert.deepEqual(faites.map((t) => t.id), ['2', '1']);
});

test('progression : une tâche faite ne compte plus dans ce qui reste', () => {
  const liste = [
    tache('1', { echeance: '2027-03-01' }), // en retard
    tache('2', { dateSouhaitee: '2027-03-10' }), // aujourd'hui
    tache('3', { echeance: '2027-03-30' }),
    tache('4', { echeance: '2027-03-01', fait: true, faitLe: '2027-03-02' }), // faite : ni restante ni en retard
  ];
  assert.deepEqual(progression(liste, AUJOURDHUI, DEBUT), { total: 4, faites: 1, restantes: 3, enRetard: 1, aujourdhui: 1 });
  assert.deepEqual(progression([], AUJOURDHUI, DEBUT), { total: 0, faites: 0, restantes: 0, enRetard: 0, aujourdhui: 0 });
});

test('textes de délai', () => {
  assert.equal(delaiRelatif('2027-03-10', AUJOURDHUI), "aujourd'hui");
  assert.equal(delaiRelatif('2027-03-11', AUJOURDHUI), 'demain');
  assert.equal(delaiRelatif('2027-03-09', AUJOURDHUI), 'hier');
  assert.equal(delaiRelatif('2027-03-19', AUJOURDHUI), 'dans 9 jours');
  assert.equal(delaiRelatif('2027-03-05', AUJOURDHUI), 'il y a 5 jours');
  const d = descriptionDates(tache('x', { dateSouhaitee: '2027-03-08', echeance: '2027-03-09' }), AUJOURDHUI);
  assert.deepEqual(d.lignes, ['Souhaitée : 08/03/2027 (il y a 2 jours)', 'Échéance : 09/03/2027 (hier)']);
  assert.equal(d.retard, 'En retard de 1 jour');
  assert.equal(descriptionDates(tache('y', { echeance: '2027-03-01' }), AUJOURDHUI).retard, 'En retard de 9 jours');
  assert.deepEqual(descriptionDates(tache('z', { fait: true, faitLe: '2027-03-05' }), AUJOURDHUI), { lignes: ['Faite le 05/03/2027'], retard: null });
  assert.deepEqual(descriptionDates(tache('w'), AUJOURDHUI), { lignes: [], retard: null });
});

function donnees(partiel: Partial<Donnees>): Donnees {
  return { vols: [], compteurs: [], reglages: REGLAGES_PAR_DEFAUT, etapes: [], logements: [], trajets: [], taches: [], personnes: [], creneaux: [], joursPlan: [], lieuxPerso: [], suiviLieux: [], ...partiel };
}

const volTest = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id,
  compagnie: '',
  numero: id.toUpperCase(),
  reference: '',
  depart: { code: 'AAA', ville: '', date, heure: '10:00', fuseau: 'Europe/Brussels', terminal: '' },
  arrivee: { code: 'BBB', ville: '', date, heure: '12:00', fuseau: 'Europe/Brussels', terminal: '' },
  portee: 'international' as const,
  passagers: '',
  pourMoi: true,
  statut: 'confirme' as const,
  notes: '',
  ...extra,
});

test('début du voyage : premier vol qui me concerne, jamais un vol annulé ou celui d\'une autre personne', () => {
  const d = donnees({
    vols: [
      volTest('v3', '2027-04-10'),
      volTest('v1', '2027-03-28', { pourMoi: false }),
      volTest('v2', '2027-03-30', { statut: 'annule' }),
      volTest('v4', '2027-04-02'),
    ],
  });
  assert.equal(debutVoyage(d), '2027-04-02');
});

test('début du voyage : à défaut de vol, la première étape ; sinon inconnu', () => {
  const e = { id: 'e', nom: 'E', pays: '', devise: '', fuseau: 'Europe/Brussels', debut: '2027-05-03', fin: '2027-05-06' };
  assert.equal(debutVoyage(donnees({ etapes: [e, { ...e, id: 'e2', debut: '2027-05-01' }] })), '2027-05-01');
  assert.equal(debutVoyage(donnees({})), '');
});

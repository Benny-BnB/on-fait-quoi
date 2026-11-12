// Tests de « Avant le départ ». Données FICTIVES.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { donneesVides } from '../data/defauts.ts';
import type { Creneau, Donnees, Etape, FichePratique, Lieu } from '../data/types.ts';
import { JOURS_FICHE_ANCIENNE, fichesARelire, pointsControle } from './controle.ts';
import { META_VIDE } from './sauvegarde.ts';

const lieu = (id: string, verifieLe: string): Lieu => ({
  id, nom: `Lieu ${id}`, zone: 'Ville C', fuseau: 'Asia/Bangkok', quartier: '', adresse: '', gps: null, categories: [], etiquettes: [], incontournable: null, description: '', duree: null, prix: null,
  horaires: null, reservation: null, tenue: null, interieur: '', public: null, attention: [], acces: [], lienOfficiel: '', verifieLe, notes: '',
});
const fiche = (id: string, zone: string, verifieLe: string, rubrique: FichePratique['rubrique'] = 'argent'): FichePratique => ({ id, zone, rubrique, titre: `Fiche ${id}`, resume: '', faits: [], aVerifier: [], liens: [], verifieLe, notes: '' });
const etape: Etape = { id: 'e1', nom: 'Ville C', pays: 'Pays C', devise: 'THB', fuseau: 'Asia/Bangkok', debut: '2027-03-20', fin: '2027-03-25' };
const creneau = (id: string, lieuId: string, extra: Partial<Creneau> = {}): Creneau => ({
  id, jour: '2027-03-21', periode: '', debut: '', fin: '', fuseau: 'Asia/Bangkok', titre: id, note: '', statut: 'prevu', humeur: '', participants: [], budgetEstime: null, budgetReel: null, devise: '', dureeMin: null, planBDe: '', fixe: false, typeEvenement: '', lieuId, ...extra,
});

const AUJOURDHUI = '2027-03-10';
const donnees = (partiel: Partial<Donnees> = {}): Donnees => ({ ...donneesVides(), ...partiel });

test('seules les fiches utilisées sont à relire : lieux prévus ou souhaités, fiches Pratique des étapes', () => {
  const lieux = [lieu('a', '2027-03-01'), lieu('b', '2027-03-01'), lieu('c', '2027-03-01'), lieu('d', '2027-03-01'), lieu('e', '2027-03-01')];
  const d = donnees({
    etapes: [etape],
    creneaux: [creneau('c1', 'a'), creneau('c2', 'b', { statut: 'annule' }), creneau('c3', 'c', { planBDe: 'c1' }), creneau('c4', 'd', { statut: 'fait' })],
    suiviLieux: [{ lieuId: 'e', souhait: 'souhait', favori: false, fait: false, note: '' }],
  });
  const pratique = [fiche('p1', 'Pays C', '2027-03-01'), fiche('p2', 'Autre pays', '2027-03-01')];
  const cles = fichesARelire(d, lieux, pratique, AUJOURDHUI).map((f) => f.cle).sort();
  assert.deepEqual(cles, ['lieu:a', 'lieu:e', 'pratique:p1']); // pas b (annulé), c (plan B), d (déjà fait), ni p2 (autre pays)
});

test('les plus anciennes, ou jamais vérifiées, passent en premier ; au-delà de 30 jours, la fiche est à relire', () => {
  const lieux = [lieu('recent', '2027-03-05'), lieu('vieux', '2027-01-01'), lieu('jamais', ''), lieu('limite', '2027-02-08')];
  const d = donnees({ creneaux: lieux.map((l, i) => creneau(`c${i}`, l.id)) });
  const r = fichesARelire(d, lieux, [], AUJOURDHUI);
  assert.deepEqual(r.map((f) => f.cle), ['lieu:jamais', 'lieu:vieux', 'lieu:limite', 'lieu:recent']);
  assert.deepEqual(r.map((f) => f.jours), [null, 68, 30, 5]);
  assert.deepEqual(r.map((f) => f.ancienne), [true, true, false, false]); // 30 jours pile : pas encore ancienne
  assert.equal(JOURS_FICHE_ANCIENNE, 30);
});

test('les fiches « formalités et sécurité » sont repérées comme avis officiels', () => {
  const pratique = [fiche('avis', 'Pays C', '2027-03-09', 'formalites'), fiche('argent', 'Pays C', '2027-03-09')];
  const r = fichesARelire(donnees({ etapes: [etape] }), [], pratique, AUJOURDHUI);
  assert.equal(r.find((f) => f.cle === 'pratique:avis')?.avisOfficiel, true);
  assert.equal(r.find((f) => f.cle === 'pratique:argent')?.avisOfficiel, false);
});

test('sans donnée : seulement des points « info », jamais de fausse alerte', () => {
  const points = pointsControle(donnees(), [], [], META_VIDE, AUJOURDHUI);
  assert.deepEqual(points.map((p) => p.cle), ['sauvegarde', 'completer', 'alertes', 'vols', 'fiches']);
  assert.equal(points.find((p) => p.cle === 'sauvegarde')?.niveau, 'info');
  assert.equal(points.find((p) => p.cle === 'vols')?.niveau, 'info');
  assert.equal(points.find((p) => p.cle === 'fiches')?.niveau, 'info');
});

test("un vol « à vérifier » et une fiche ancienne demandent de l'attention", () => {
  const vol = {
    id: 'v1', compagnie: '', numero: 'XX100', reference: '',
    depart: { code: 'AAA', ville: '', date: '2027-03-20', heure: '08:00', fuseau: 'Europe/Brussels', terminal: '' },
    arrivee: { code: 'BBB', ville: '', date: '2027-03-20', heure: '17:00', fuseau: 'Asia/Bangkok', terminal: '' },
    portee: 'international' as const, passagers: '', pourMoi: true, statut: 'a-verifier' as const, notes: '',
  };
  const d = donnees({ vols: [vol], creneaux: [creneau('c1', 'vieux')] });
  const points = pointsControle(d, [lieu('vieux', '2027-01-01')], [], META_VIDE, AUJOURDHUI);
  const par = (cle: string) => points.find((p) => p.cle === cle);
  assert.equal(par('vols')?.niveau, 'attention');
  assert.match(par('vols')?.detail ?? '', /XX100/);
  assert.equal(par('fiches')?.niveau, 'attention');
  assert.equal(par('sauvegarde')?.niveau, 'attention'); // données saisies, jamais sauvegardées
});

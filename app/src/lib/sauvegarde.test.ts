// Tests du rappel de sauvegarde. Données FICTIVES.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { donneesVides, personneVide } from '../data/defauts.ts';
import { META_VIDE, donneesVidesQ, etatSauvegarde, jourLocalDe, type MetaSauvegarde } from './sauvegarde.ts';

// Midi UTC : le même jour quel que soit le fuseau du poste de test
const iso = (jour: string): string => `${jour}T12:00:00.000Z`;
const meta = (sauvegarde: string, modification: string): MetaSauvegarde => ({ derniereSauvegarde: sauvegarde === '' ? '' : iso(sauvegarde), derniereModification: modification === '' ? '' : iso(modification) });

test('rien à sauvegarder : aucun rappel', () => {
  assert.equal(etatSauvegarde(META_VIDE, true, '2027-03-01', '2027-03-20').niveau, 'vide');
  assert.equal(donneesVidesQ(donneesVides()), true);
  assert.equal(donneesVidesQ({ ...donneesVides(), personnes: [personneVide('p1', 'Alex')] }), false);
});

test("jamais sauvegardé : rappel, et rappel insistant dans les 14 jours avant le départ", () => {
  assert.equal(etatSauvegarde(META_VIDE, false, '2027-03-01', '2027-04-20').niveau, 'rappel');
  assert.equal(etatSauvegarde(META_VIDE, false, '2027-03-01', '').niveau, 'rappel');
  const proche = etatSauvegarde(META_VIDE, false, '2027-03-10', '2027-03-20');
  assert.equal(proche.niveau, 'urgent');
  assert.match(proche.detail, /Départ dans 10 jours/);
});

test('sauvegarde faite et rien modifié depuis : à jour, même longtemps après', () => {
  const e = etatSauvegarde(meta('2027-01-01', '2026-06-30'), false, '2027-03-10', '2027-03-20');
  assert.equal(e.niveau, 'ok');
  assert.match(e.detail, /01\/01\/2027/);
  assert.match(e.detail, /Rien n'a changé/);
});

test('modifié depuis la dernière sauvegarde : rappel après une semaine, calme avant', () => {
  assert.equal(etatSauvegarde(meta('2027-03-05', '2027-03-06'), false, '2027-03-08', '2027-05-01').niveau, 'ok');
  const rappel = etatSauvegarde(meta('2027-03-01', '2027-03-06'), false, '2027-03-08', '2027-05-01');
  assert.equal(rappel.niveau, 'rappel');
  assert.match(rappel.detail, /il y a 7 jours/);
});

test('modifié depuis, dans les 14 jours avant le départ : urgent, même si la sauvegarde est récente', () => {
  const e = etatSauvegarde(meta('2027-03-09', '2027-03-10'), false, '2027-03-10', '2027-03-20');
  assert.equal(e.niveau, 'urgent');
  assert.equal(e.titre, 'Refais une sauvegarde avant le départ');
});

test("pendant le voyage ou sans date de départ : pas de « départ dans… »", () => {
  const enVoyage = etatSauvegarde(meta('2027-03-01', '2027-03-15'), false, '2027-03-25', '2027-03-20');
  assert.equal(enVoyage.niveau, 'rappel');
  assert.ok(!enVoyage.detail.includes('Départ dans'));
});

test('le jour local est calculé depuis le texte ISO ; un texte invalide donne ""', () => {
  assert.equal(jourLocalDe(iso('2027-03-05')), '2027-03-05');
  assert.equal(jourLocalDe('pas une date'), '');
});

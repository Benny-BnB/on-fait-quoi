// Tests de la comparaison fichier ↔ téléphone. Données FICTIVES.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { donneesVides, personneVide } from '../data/defauts.ts';
import type { Donnees, Tache, Vol } from '../data/types.ts';
import { comparerAvecTelephone, contenuDuTelephone } from './comparaison.ts';

const vol = (id: string, heure = '08:00'): Vol => ({
  id, compagnie: '', numero: `XX${id}`, reference: '',
  depart: { code: 'AAA', ville: '', date: '2027-03-01', heure, fuseau: 'Europe/Brussels', terminal: '' },
  arrivee: { code: 'BBB', ville: '', date: '2027-03-01', heure: '12:00', fuseau: 'Asia/Dubai', terminal: '' },
  portee: 'international', passagers: '', pourMoi: true, statut: 'confirme', notes: '',
});
const tache = (id: string, fait = false): Tache => ({ id, titre: `Tâche ${id}`, liste: 'reste-a-faire', dateSouhaitee: '', echeance: '', fait, faitLe: '', note: '', lien: '' });
const telephone = (partiel: Partial<Donnees> = {}): Donnees => ({ ...donneesVides(), ...partiel });
const ligne = (lignes: ReturnType<typeof comparerAvecTelephone>, cle: string) => lignes.find((l) => l.cle === cle);

test('un fichier déjà importé : toutes ses sections sont « identiques »', () => {
  const fichier: Partial<Donnees> = { vols: [vol('1'), vol('2')], taches: [tache('a'), tache('b')] };
  const lignes = comparerAvecTelephone(fichier, telephone({ vols: [vol('1'), vol('2')], taches: [tache('a'), tache('b')] }));
  assert.deepEqual(lignes.map((l) => [l.cle, l.fichier, l.telephone, l.identique]), [['vols', 2, 2, true], ['taches', 2, 2, true]]);
});

test('un fichier oublié : la section est « différente », avec le nombre dans le fichier et dans le téléphone', () => {
  const fichier: Partial<Donnees> = { vols: [vol('1')], taches: [tache('a'), tache('b'), tache('c')] };
  const lignes = comparerAvecTelephone(fichier, telephone({ vols: [vol('1')] }));
  assert.equal(ligne(lignes, 'vols')?.identique, true);
  assert.deepEqual([ligne(lignes, 'taches')?.fichier, ligne(lignes, 'taches')?.telephone, ligne(lignes, 'taches')?.identique], [3, 0, false]);
});

test("une donnée modifiée depuis l'import (même nombre d'éléments) est repérée comme différente", () => {
  const lignes = comparerAvecTelephone({ vols: [vol('1', '08:00')], taches: [tache('a')] }, telephone({ vols: [vol('1', '09:15')], taches: [tache('a', true)] }));
  assert.equal(ligne(lignes, 'vols')?.identique, false);
  assert.equal(ligne(lignes, 'vols')?.fichier, 1);
  assert.equal(ligne(lignes, 'vols')?.telephone, 1);
  assert.equal(ligne(lignes, 'taches')?.identique, false, 'une tâche cochée depuis est une différence');
});

test("seules les sections présentes dans le fichier sont comparées ; le reste du téléphone n'entre pas en compte", () => {
  const lignes = comparerAvecTelephone({ vols: [vol('1')] }, telephone({ vols: [vol('1')], taches: [tache('a')], personnes: [personneVide('p1', 'Alex')] }));
  assert.deepEqual(lignes.map((l) => l.cle), ['vols']);
});

test('les personnes : celles d\'un autre fichier importé après sont « différentes » (cas du fichier des profils)', () => {
  const duPlanning = [personneVide('p1', 'Alex'), personneVide('p2', 'Charlie')];
  const desProfils = [{ ...personneVide('p1', 'Alex'), ageAns: 40 }, { ...personneVide('p2', 'Charlie'), ageAns: 8 }];
  assert.equal(ligne(comparerAvecTelephone({ personnes: duPlanning }, telephone({ personnes: desProfils })), 'personnes')?.identique, false);
  assert.equal(ligne(comparerAvecTelephone({ personnes: desProfils }, telephone({ personnes: desProfils })), 'personnes')?.identique, true);
});

test('les réglages sont comparés en entier (pas de nombre affiché) ; un taux saisi depuis est une différence', () => {
  const base = donneesVides().reglages;
  const identiques = comparerAvecTelephone({ reglages: base }, telephone({ reglages: base }));
  assert.deepEqual([ligne(identiques, 'reglages')?.fichier, ligne(identiques, 'reglages')?.identique], [null, true]);
  const modifies = { ...base, tauxChange: [{ devise: 'THB', taux: 0.027, date: '2027-03-01', source: 'test', lien: 'https://exemple.invalid' }] };
  assert.equal(ligne(comparerAvecTelephone({ reglages: base }, telephone({ reglages: modifies })), 'reglages')?.identique, false);
});

test("des données enregistrées avant une mise à jour de l'app (sections manquantes) se comparent sans erreur", () => {
  const ancien = { ...telephone({ vols: [vol('1')] }), pratiquePerso: undefined as unknown as Donnees['pratiquePerso'] };
  assert.doesNotThrow(() => comparerAvecTelephone({ vols: [vol('1')] }, ancien));
});

test('« ce que contient mon téléphone » : un nombre par section, zéro quand rien n\'est enregistré', () => {
  const lignes = contenuDuTelephone(telephone({ vols: [vol('1'), vol('2')], taches: [tache('a')] }));
  assert.equal(lignes.find((l) => l.libelle === 'Vols')?.nombre, 2);
  assert.equal(lignes.find((l) => l.libelle === 'Tâches')?.nombre, 1);
  assert.equal(lignes.find((l) => l.libelle === 'Trajets')?.nombre, 0);
  assert.ok(!lignes.some((l) => l.libelle === 'Réglages'));
});

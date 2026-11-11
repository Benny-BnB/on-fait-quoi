// Tests de la logique des vols et des compteurs. Vols FICTIFS (compagnie « XX »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Compteur, Donnees, Vol } from '../data/types.ts';
import { REGLAGES_PAR_DEFAUT } from '../data/defauts.ts';
import { dureeVolMin, instantArriveeAeroport, instantDepart, prochainVol, resoudre, volsTries } from './vols.ts';

function creerVol(id: string, numero: string, depart: [string, string, string], arrivee: [string, string, string], extra: Partial<Vol> = {}): Vol {
  return {
    id,
    compagnie: 'Compagnie fictive',
    numero,
    reference: '',
    depart: { code: 'AAA', ville: 'Ville A', date: depart[0], heure: depart[1], fuseau: depart[2], terminal: '' },
    arrivee: { code: 'BBB', ville: 'Ville B', date: arrivee[0], heure: arrivee[1], fuseau: arrivee[2], terminal: '' },
    portee: 'international',
    passagers: '',
    pourMoi: true,
    statut: 'confirme',
    notes: '',
    ...extra,
  };
}

// Aller : Bruxelles 08:00 -> Dubaï 17:30 le même jour = 6 h 30 de vol (07:00 UTC -> 13:30 UTC)
const aller = creerVol('v1', 'XX100', ['2027-01-15', '08:00', 'Europe/Brussels'], ['2027-01-15', '17:30', 'Asia/Dubai']);
// Nuit : Dubaï 22:00 -> Bangkok 07:15 le lendemain = 6 h 15 (18:00 UTC -> 00:15 UTC +1 jour)
const nuit = creerVol('v2', 'XX200', ['2027-01-15', '22:00', 'Asia/Dubai'], ['2027-01-16', '07:15', 'Asia/Bangkok']);
// Intérieur : Bangkok 18:15 -> Bangkok 19:40 = 1 h 25
const interieur = creerVol('v3', 'XX300', ['2027-01-20', '18:15', 'Asia/Bangkok'], ['2027-01-20', '19:40', 'Asia/Bangkok'], { portee: 'interieur' });

test('durée d\'un vol : on compare des instants exacts, pas des heures locales', () => {
  assert.equal(dureeVolMin(aller), 390);
  assert.equal(dureeVolMin(nuit), 375);
  assert.equal(dureeVolMin(interieur), 85);
});

test('les vols sont triés par instant de départ, pas par heure affichée', () => {
  // Heure locale 22:00 > 08:00, mais à Dubaï c'est plus tard : l'ordre reste aller, nuit, intérieur
  assert.deepEqual(volsTries([interieur, nuit, aller]).map((v) => v.id), ['v1', 'v2', 'v3']);
});

test('prochain vol : on passe au vol suivant dès que l\'heure de départ est passée', () => {
  const vols = [aller, nuit, interieur];
  const departAller = instantDepart(aller);
  assert.equal(prochainVol(vols, departAller - 1000)?.id, 'v1');
  assert.equal(prochainVol(vols, departAller - 1)?.id, 'v1');
  assert.equal(prochainVol(vols, departAller)?.id, 'v2'); // à l'heure pile, le vol est parti
  assert.equal(prochainVol(vols, instantDepart(interieur))?.id, undefined);
});

test('prochain vol : ignore les vols annulés et ceux d\'une autre personne', () => {
  const annule = { ...aller, statut: 'annule' as const };
  const autre = { ...nuit, pourMoi: false };
  assert.equal(prochainVol([annule, autre, interieur], 0)?.id, 'v3');
  assert.equal(prochainVol([annule, autre], 0), undefined);
});

test('heure d\'arrivée à l\'aéroport : décollage moins le délai (3 h international, 2 h intérieur)', () => {
  assert.equal(instantArriveeAeroport(aller, REGLAGES_PAR_DEFAUT), instantDepart(aller) - 3 * 3600 * 1000);
  assert.equal(instantArriveeAeroport(interieur, REGLAGES_PAR_DEFAUT), instantDepart(interieur) - 2 * 3600 * 1000);
});

function compteur(cible: Compteur['cible'], delaiMin = 0): Compteur {
  return { id: 'c', libelle: 'test', cible, visible: true, delaiMin };
}

const donnees: Donnees = { vols: [aller, nuit, interieur], compteurs: [], reglages: REGLAGES_PAR_DEFAUT, etapes: [], logements: [] };

test('compteur du prochain vol et compteur avec délai', () => {
  const t0 = instantDepart(aller) - 10 * 3600 * 1000; // 10 h avant le premier vol
  const direct = resoudre(compteur({ type: 'prochain-vol' }), donnees, t0);
  assert.deepEqual(direct.etat, 'actif');
  if (direct.etat === 'actif') assert.equal(direct.cibleMs - t0, 10 * 3600 * 1000);

  const avecDelai = resoudre(compteur({ type: 'prochain-vol' }, 180), donnees, t0);
  if (avecDelai.etat === 'actif') assert.equal(avecDelai.cibleMs - t0, 7 * 3600 * 1000);
  else assert.fail('le compteur avec délai devrait être actif');
});

test('compteur avec délai : "passé" quand l\'heure réglée est atteinte, même si le vol n\'est pas parti', () => {
  const t = instantDepart(aller) - 2 * 3600 * 1000; // 2 h avant le décollage, compteur réglé à 3 h avant
  const r = resoudre(compteur({ type: 'vol', volId: 'v1' }, 180), donnees, t);
  assert.equal(r.etat, 'passe');
});

test('compteur sur un vol supprimé ou sur une date libre invalide : erreur claire, pas de plantage', () => {
  assert.equal(resoudre(compteur({ type: 'vol', volId: 'inconnu' }), donnees, 0).etat, 'invalide');
  assert.equal(resoudre(compteur({ type: 'libre', date: '2027-13-01', heure: '10:00', fuseau: 'Asia/Dubai' }), donnees, 0).etat, 'invalide');
});

test('compteur sur une date libre', () => {
  const cible = Date.UTC(2027, 0, 24, 14, 0); // 18:00 à Dubaï
  const r = resoudre(compteur({ type: 'libre', date: '2027-01-24', heure: '18:00', fuseau: 'Asia/Dubai' }), donnees, cible - 5000);
  assert.equal(r.etat, 'actif');
  if (r.etat === 'actif') assert.equal(r.cibleMs, cible);
});

test('aucun vol à venir', () => {
  assert.equal(resoudre(compteur({ type: 'prochain-vol' }), donnees, instantDepart(interieur) + 1).etat, 'aucun-vol');
});

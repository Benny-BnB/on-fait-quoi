// Tests du planning : heures de trajet, créneaux imposés, alertes. Données FICTIVES.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Donnees, Etape, Logement, Trajet, Vol } from '../data/types.ts';
import { REGLAGES_PAR_DEFAUT } from '../data/defauts.ts';
import { alertesPlanning, calculerTrajet, creneauxImposes, etapesDuJour, plageJours } from './planning.ts';
import { jourSemaine, joursEntre, listeJours, premierLien } from './sejour.ts';

// XX100 : Bruxelles 08:00 -> Abu Dhabi 17:30 le même jour = 07:00Z -> 13:30Z (6 h 30), vol international (3 h d'avance)
function creerVol(id: string, numero: string, dep: [string, string, string, string], arr: [string, string, string, string], extra: Partial<Vol> = {}): Vol {
  return {
    id,
    compagnie: 'Compagnie fictive',
    numero,
    reference: '',
    depart: { code: dep[3], ville: '', date: dep[0], heure: dep[1], fuseau: dep[2], terminal: '' },
    arrivee: { code: arr[3], ville: '', date: arr[0], heure: arr[1], fuseau: arr[2], terminal: '' },
    portee: 'international',
    passagers: '',
    pourMoi: true,
    statut: 'confirme',
    notes: '',
    ...extra,
  };
}

function creerTrajet(id: string, extra: Partial<Trajet> = {}): Trajet {
  return {
    id,
    de: 'Lieu A',
    a: 'Lieu B',
    mode: '',
    date: '2027-01-15',
    heure: '',
    fuseau: 'Europe/Brussels',
    dureeMin: null,
    dureeEstimee: false,
    prixMin: null,
    prixMax: null,
    devise: '',
    source: '',
    consulteLe: '',
    volId: '',
    lienVol: 'vers',
    logementId: '',
    notes: '',
    ...extra,
  };
}

function creerDonnees(partiel: Partial<Donnees> = {}): Donnees {
  return { vols: [], compteurs: [], reglages: REGLAGES_PAR_DEFAUT, etapes: [], logements: [], trajets: [], taches: [], personnes: [], creneaux: [], joursPlan: [], ...partiel };
}

const xx100 = creerVol('v1', 'XX100', ['2027-01-15', '08:00', 'Europe/Brussels', 'AAA'], ['2027-01-15', '17:30', 'Asia/Dubai', 'BBB']);
const decollage = Date.UTC(2027, 0, 15, 7, 0);

test('heure conseillée = décollage - délai d\'aéroport - durée du trajet', () => {
  const t = creerTrajet('t1', { volId: 'v1', dureeMin: 45 });
  const c = calculerTrajet(t, creerDonnees({ vols: [xx100], trajets: [t] }));
  assert.equal(c.aeroportAvantMs, decollage - 180 * 60000);
  assert.equal(c.conseilleMs, decollage - 180 * 60000 - 45 * 60000); // 03:15 UTC = 04:15 à Bruxelles
  assert.equal(c.origine, 'conseillee');
  assert.equal(c.debutMs, c.conseilleMs);
  assert.equal(c.finMs, c.aeroportAvantMs);
});

test('le délai d\'aéroport suit le réglage et le type de vol (intérieur = 2 h)', () => {
  const interieur = { ...xx100, portee: 'interieur' as const };
  const t = creerTrajet('t1', { volId: 'v1', dureeMin: 60 });
  const c = calculerTrajet(t, creerDonnees({ vols: [interieur], trajets: [t] }));
  assert.equal(c.conseilleMs, decollage - 120 * 60000 - 60 * 60000);
});

test('durée inconnue : on connaît l\'heure limite à l\'aéroport mais pas l\'heure de départ (rien n\'est inventé)', () => {
  const t = creerTrajet('t1', { volId: 'v1' });
  const d = creerDonnees({ vols: [xx100], trajets: [t] });
  const c = calculerTrajet(t, d);
  assert.equal(c.aeroportAvantMs, decollage - 180 * 60000);
  assert.equal(c.conseilleMs, null);
  assert.equal(c.debutMs, null);
  assert.equal(c.origine, 'inconnue');
  const creneau = creneauxImposes(d).find((x) => x.cle === 'trajet:t1');
  assert.equal(creneau?.heure, '');
  assert.ok(creneau?.details.some((x) => x.includes('durée du trajet inconnue')));
  assert.ok(creneau?.details.some((x) => x.includes("Être à l'aéroport avant 05:00"))); // 04:00 UTC = 05:00 à Bruxelles en janvier
});

test('heure saisie : elle l\'emporte, et un trajet qui arrive trop tard est signalé', () => {
  // Départ saisi 04:00 à Bruxelles (03:00Z). Limite à l'aéroport : 04:00Z.
  const ok = creerTrajet('ok', { volId: 'v1', heure: '04:00', dureeMin: 60 });
  const tard = creerTrajet('tard', { volId: 'v1', heure: '04:00', dureeMin: 90 });
  const d = creerDonnees({ vols: [xx100], trajets: [ok, tard] });
  assert.equal(calculerTrajet(ok, d).origine, 'saisie');
  assert.equal(calculerTrajet(ok, d).debutMs, Date.UTC(2027, 0, 15, 3, 0));
  const alertes = alertesPlanning(d);
  assert.ok(!alertes.some((a) => a.cle === 'trop-tard:ok'), 'pile à l\'heure limite : pas d\'alerte');
  assert.ok(alertes.some((a) => a.cle === 'trop-tard:tard'), 'une demi-heure trop tard : alerte');
});

test('trajet après l\'atterrissage : il commence à l\'heure d\'arrivée du vol, dans le fuseau d\'arrivée', () => {
  const t = creerTrajet('t1', { volId: 'v1', lienVol: 'depuis' });
  const d = creerDonnees({ vols: [xx100], trajets: [t] });
  const c = calculerTrajet(t, d);
  assert.equal(c.origine, 'arrivee-vol');
  assert.equal(c.debutMs, Date.UTC(2027, 0, 15, 13, 30));
  const creneau = creneauxImposes(d).find((x) => x.cle === 'trajet:t1');
  assert.equal(creneau?.heure, '17:30'); // heure d'Abu Dhabi
  assert.equal(creneau?.jour, '2027-01-15');
});

test('date saisie incohérente avec le vol : signalée', () => {
  const t = creerTrajet('t1', { volId: 'v1', lienVol: 'depuis', date: '2027-01-16' });
  const alertes = alertesPlanning(creerDonnees({ vols: [xx100], trajets: [t] }));
  assert.ok(alertes.some((a) => a.cle === 'date:t1'));
});

test('vol sans trajet : signalé, sauf correspondance, vol annulé ou vol d\'une autre personne', () => {
  const correspondance = creerVol('v2', 'XX200', ['2027-01-15', '20:00', 'Asia/Dubai', 'BBB'], ['2027-01-16', '06:00', 'Asia/Bangkok', 'CCC']); // 16:00Z, 2 h 30 après l'atterrissage de XX100
  const loin = creerVol('v3', 'XX300', ['2027-01-20', '10:00', 'Asia/Bangkok', 'CCC'], ['2027-01-20', '12:00', 'Asia/Bangkok', 'DDD']);
  const annule = creerVol('v4', 'XX400', ['2027-01-25', '10:00', 'Europe/Brussels', 'AAA'], ['2027-01-25', '12:00', 'Europe/Brussels', 'EEE'], { statut: 'annule' });
  const autre = creerVol('v5', 'XX500', ['2027-01-26', '10:00', 'Europe/Brussels', 'AAA'], ['2027-01-26', '12:00', 'Europe/Brussels', 'EEE'], { pourMoi: false });
  const alertes = alertesPlanning(creerDonnees({ vols: [xx100, correspondance, loin, annule, autre] }));
  const sansTrajet = alertes.filter((a) => a.cle.startsWith('sans-trajet:')).map((a) => a.id);
  assert.deepEqual(sansTrajet.sort(), ['v1', 'v3']);
});

test('un trajet vers l\'aéroport supprime l\'alerte "sans trajet"', () => {
  const t = creerTrajet('t1', { volId: 'v1' });
  assert.ok(!alertesPlanning(creerDonnees({ vols: [xx100], trajets: [t] })).some((a) => a.cle === 'sans-trajet:v1'));
  const apres = creerTrajet('t2', { volId: 'v1', lienVol: 'depuis' }); // un trajet "depuis" ne compte pas
  assert.ok(alertesPlanning(creerDonnees({ vols: [xx100], trajets: [apres] })).some((a) => a.cle === 'sans-trajet:v1'));
});

const e1: Etape = { id: 'e1', nom: 'Étape 1', pays: '', devise: '', fuseau: 'Europe/Brussels', debut: '2027-03-01', fin: '2027-03-04' };
const e2: Etape = { id: 'e2', nom: 'Étape 2', pays: '', devise: '', fuseau: 'Asia/Dubai', debut: '2027-03-04', fin: '2027-03-08' };

test('étapes qui se suivent sans trajet entre elles : signalé', () => {
  const sans = alertesPlanning(creerDonnees({ etapes: [e2, e1] }));
  assert.ok(sans.some((a) => a.cle === 'entre-etapes:e1:e2'));
  assert.match(sans.find((a) => a.cle === 'entre-etapes:e1:e2')?.message ?? '', /« Étape 1 » vers « Étape 2 »/);
  const avec = alertesPlanning(creerDonnees({ etapes: [e1, e2], trajets: [creerTrajet('t', { date: '2027-03-04' })] }));
  assert.ok(!avec.some((a) => a.cle.startsWith('entre-etapes')));
  const mauvaiseDate = alertesPlanning(creerDonnees({ etapes: [e1, e2], trajets: [creerTrajet('t', { date: '2027-03-06' })] }));
  assert.ok(mauvaiseDate.some((a) => a.cle.startsWith('entre-etapes')), 'un trajet hors de la période de transition ne compte pas');
});

test('chevauchements : deux trajets qui se superposent, mais pas deux trajets qui se touchent', () => {
  const a = creerTrajet('a', { heure: '10:00', dureeMin: 60 });
  const b = creerTrajet('b', { heure: '10:30', dureeMin: 60 });
  const c = creerTrajet('c', { heure: '11:30', dureeMin: 30 }); // commence à 11:30, quand b se termine
  const alertes = alertesPlanning(creerDonnees({ trajets: [a, b, c] }));
  const chevauchements = alertes.filter((x) => x.cle.startsWith('chevauche:'));
  assert.equal(chevauchements.length, 1); // a et b seulement : c touche b sans la chevaucher
  assert.match(chevauchements[0].message, /Chevauchement/);
});

test('chevauchement avec un vol : un trajet pendant mon vol est signalé, celui d\'une autre personne non', () => {
  const pendant = creerTrajet('p', { heure: '09:00', dureeMin: 30 }); // 08:00Z-08:30Z, le vol part à 07:00Z et arrive à 13:30Z
  const alertes = alertesPlanning(creerDonnees({ vols: [xx100], trajets: [pendant] }));
  assert.ok(alertes.some((x) => x.cle.startsWith('chevauche:')));
  const autre = alertesPlanning(creerDonnees({ vols: [{ ...xx100, pourMoi: false }], trajets: [pendant] }));
  assert.ok(!autre.some((x) => x.cle.startsWith('chevauche:')));
});

test('créneaux imposés : un vol de nuit apparaît le jour de départ et le jour d\'arrivée', () => {
  const nuit = creerVol('n', 'XX900', ['2027-01-15', '22:00', 'Asia/Dubai', 'BBB'], ['2027-01-16', '07:15', 'Asia/Bangkok', 'CCC']);
  const liste = creneauxImposes(creerDonnees({ vols: [nuit] }));
  assert.deepEqual(liste.map((c) => [c.type, c.jour, c.heure]), [
    ['vol-depart', '2027-01-15', '22:00'],
    ['vol-arrivee', '2027-01-16', '07:15'],
  ]);
});

test('créneaux imposés : tri par instant dans la journée, ceux sans heure en dernier, vols annulés exclus', () => {
  const l: Logement = {
    id: 'l1', etapeId: 'e1', nom: 'Hôtel test', statut: 'a-trouver', lien: '', adresse: '', gps: null,
    arrivee: { date: '2027-03-01', heure: '' }, depart: { date: '2027-03-04', heure: '11:00' }, reference: '', notes: '',
  };
  const t = creerTrajet('t', { date: '2027-03-04', heure: '09:00', fuseau: 'Europe/Brussels' });
  const annule = creerVol('a', 'XX1', ['2027-03-04', '10:00', 'Europe/Brussels', 'AAA'], ['2027-03-04', '12:00', 'Europe/Brussels', 'BBB'], { statut: 'annule' });
  const liste = creneauxImposes(creerDonnees({ etapes: [e1], logements: [l], trajets: [t], vols: [annule] }));
  assert.ok(!liste.some((c) => c.titre.includes('XX1')), 'un vol annulé n\'apparaît pas');
  const du4 = liste.filter((c) => c.jour === '2027-03-04').map((c) => c.cle);
  assert.deepEqual(du4, ['trajet:t', 'logement:l1:depart']); // 09:00 puis 11:00
  const arrivee = liste.find((c) => c.cle === 'logement:l1:arrivee');
  assert.equal(arrivee?.debutMs, null); // pas d'heure d'arrivée connue
  assert.ok(arrivee?.attention);
  assert.ok(arrivee?.details.includes('À trouver'));
  assert.equal(liste.find((c) => c.cle === 'logement:l1:depart')?.debutMs, Date.UTC(2027, 2, 4, 10, 0)); // 11:00 à Bruxelles en mars = 10:00Z
});

test('créneaux imposés : un trajet sans heure vers l\'aéroport se range avant le décollage, pas en fin de journée', () => {
  const t = creerTrajet('t', { volId: 'v1', date: '2027-01-15' }); // durée inconnue : pas d'heure de départ
  const apres = creerTrajet('apres', { date: '2027-01-15', heure: '12:00', dureeMin: 30 });
  const sansLien = creerTrajet('sansLien', { date: '2027-01-15' });
  const liste = creneauxImposes(creerDonnees({ vols: [xx100], trajets: [sansLien, apres, t] }));
  const ordre = liste.filter((c) => c.jour === '2027-01-15' && c.fuseau === 'Europe/Brussels').map((c) => c.cle);
  assert.deepEqual(ordre, ['trajet:t', 'vol:v1:depart', 'trajet:apres', 'trajet:sansLien']);
});

test('créneaux imposés : un vol d\'une autre personne est affiché mais marqué', () => {
  const autre = creerVol('x', 'XX7', ['2027-03-04', '10:00', 'Europe/Brussels', 'AAA'], ['2027-03-04', '12:00', 'Europe/Brussels', 'BBB'], { pourMoi: false, passagers: 'Camille' });
  const c = creneauxImposes(creerDonnees({ vols: [autre] }))[0];
  assert.equal(c.secondaire, true);
  assert.match(c.titre, /vol de Camille/);
  assert.ok(!c.details.some((x) => x.includes("Être à l'aéroport")), 'pas de conseil d\'aéroport pour le vol de quelqu\'un d\'autre');
});

test('plage de jours : couvre les étapes même sans créneau, et reste vide sans données', () => {
  assert.deepEqual(plageJours(creerDonnees(), []), []);
  const d = creerDonnees({ etapes: [e1] });
  assert.deepEqual(plageJours(d, creneauxImposes(d)), ['2027-03-01', '2027-03-02', '2027-03-03', '2027-03-04']);
  assert.deepEqual(etapesDuJour('2027-03-04', [e1, e2]).map((e) => e.id), ['e1', 'e2']); // jour de transition : les deux étapes
  assert.deepEqual(etapesDuJour('2027-03-02', [e1, e2]).map((e) => e.id), ['e1']);
});

test('petits outils de dates et de liens', () => {
  assert.equal(jourSemaine('2027-01-15'), 'ven.');
  assert.equal(jourSemaine('2028-02-29'), 'mar.');
  assert.equal(joursEntre('2027-01-15', '2027-01-20'), 5);
  assert.deepEqual(listeJours('2027-02-27', '2027-03-02'), ['2027-02-27', '2027-02-28', '2027-03-01', '2027-03-02']);
  assert.equal(listeJours('2027-01-01', '9999-12-31').length, 400, 'limite de sécurité');
  assert.equal(premierLien('Source : Journal, 01/01/2027 : https://exemple.org/a/b.'), 'https://exemple.org/a/b');
  assert.equal(premierLien('(voir https://exemple.org/x)'), 'https://exemple.org/x');
  assert.equal(premierLien('Aucun lien ici'), null);
  assert.equal(premierLien('javascript:alert(1)'), null);
});

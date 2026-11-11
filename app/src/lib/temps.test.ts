// Tests du calcul des heures. Toutes les valeurs de ce fichier sont FICTIVES.
// Les valeurs attendues sont calculées à la main : Bruxelles = UTC+1 l'hiver et UTC+2 l'été,
// Dubaï = UTC+4 toute l'année, Bangkok = UTC+7 toute l'année.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateValide,
  decomposer,
  fuseauValide,
  formatDateHeureDansFuseau,
  formatDureeMin,
  formatUtc,
  heureValide,
  instantLocal,
  nomFuseau,
} from './temps.ts';

test('Bruxelles en hiver = UTC+1', () => {
  assert.equal(instantLocal('2027-01-15', '08:00', 'Europe/Brussels'), Date.UTC(2027, 0, 15, 7, 0));
});

test('Bruxelles en été = UTC+2', () => {
  assert.equal(instantLocal('2027-07-15', '12:00', 'Europe/Brussels'), Date.UTC(2027, 6, 15, 10, 0));
});

test('Dubaï = UTC+4, hiver comme été', () => {
  assert.equal(instantLocal('2027-01-15', '12:00', 'Asia/Dubai'), Date.UTC(2027, 0, 15, 8, 0));
  assert.equal(instantLocal('2027-07-15', '12:00', 'Asia/Dubai'), Date.UTC(2027, 6, 15, 8, 0));
});

test('Bangkok = UTC+7', () => {
  assert.equal(instantLocal('2027-01-15', '06:30', 'Asia/Bangkok'), Date.UTC(2027, 0, 14, 23, 30));
});

test('passage à l\'heure d\'été de Bruxelles (29 mars 2026, 02:00 -> 03:00)', () => {
  // Avant le changement : 01:30 locale = 00:30 UTC. Après : 03:30 locale = 01:30 UTC.
  assert.equal(instantLocal('2026-03-29', '01:30', 'Europe/Brussels'), Date.UTC(2026, 2, 29, 0, 30));
  assert.equal(instantLocal('2026-03-29', '03:30', 'Europe/Brussels'), Date.UTC(2026, 2, 29, 1, 30));
});

test('une donnée invalide donne NaN, jamais une fausse heure', () => {
  assert.ok(Number.isNaN(instantLocal('2027-02-30', '08:00', 'Europe/Brussels')));
  assert.ok(Number.isNaN(instantLocal('2027-01-15', '25:00', 'Europe/Brussels')));
  assert.ok(Number.isNaN(instantLocal('2027-01-15', '08:00', 'Pays/Inconnu')));
  assert.ok(Number.isNaN(instantLocal('15/01/2027', '08:00', 'Europe/Brussels')));
});

test('le résultat ne dépend PAS du fuseau du téléphone', () => {
  const avant = process.env.TZ;
  const reference = Date.UTC(2027, 0, 15, 7, 0);
  const decalagesVus = new Set<number>();
  try {
    for (const tz of ['UTC', 'Europe/Brussels', 'Asia/Tokyo', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata']) {
      process.env.TZ = tz;
      decalagesVus.add(new Date(reference).getTimezoneOffset());
      assert.equal(instantLocal('2027-01-15', '08:00', 'Europe/Brussels'), reference, `fuseau du téléphone : ${tz}`);
      assert.equal(formatDateHeureDansFuseau(reference, 'Asia/Dubai'), '15/01/2027 à 11:00', `fuseau du téléphone : ${tz}`);
    }
  } finally {
    if (avant === undefined) delete process.env.TZ;
    else process.env.TZ = avant;
  }
  // Preuve que le test change vraiment de fuseau (sinon il ne prouverait rien)
  assert.ok(decalagesVus.size >= 4, 'le fuseau du processus de test aurait dû changer');
});

test('décomposition du compteur', () => {
  assert.deepEqual(decomposer(90061000), { jours: 1, heures: 1, minutes: 1, secondes: 1 });
  assert.deepEqual(decomposer(0), { jours: 0, heures: 0, minutes: 0, secondes: 0 });
  assert.deepEqual(decomposer(-5000), { jours: 0, heures: 0, minutes: 0, secondes: 0 });
});

test('le compteur arrive à 0 seconde exactement à l\'heure de la cible', () => {
  assert.equal(decomposer(1000).secondes, 1);
  assert.equal(decomposer(999).secondes, 1); // il reste moins d'une seconde : on affiche encore 1
  assert.equal(decomposer(1).secondes, 1);
  assert.equal(decomposer(0).secondes, 0);
});

test('formats des durées', () => {
  assert.equal(formatDureeMin(395), '6 h 35');
  assert.equal(formatDureeMin(180), '3 h');
  assert.equal(formatDureeMin(45), '45 min');
  assert.equal(formatDureeMin(65), '1 h 05');
  assert.equal(formatDureeMin(Number.NaN), '?');
});

test('formats des dates et heures (JJ/MM/AAAA, 24 h)', () => {
  const instant = Date.UTC(2027, 0, 15, 7, 0);
  assert.equal(formatDateHeureDansFuseau(instant, 'Europe/Brussels'), '15/01/2027 à 08:00');
  assert.equal(formatDateHeureDansFuseau(instant, 'Asia/Bangkok'), '15/01/2027 à 14:00');
  assert.equal(formatDateHeureDansFuseau(Date.UTC(2027, 0, 15, 20, 0), 'Asia/Bangkok'), '16/01/2027 à 03:00');
  assert.equal(formatUtc(instant), '15/01/2027 07:00 UTC');
});

test('validations de saisie', () => {
  assert.ok(dateValide('2027-02-28'));
  assert.ok(!dateValide('2027-02-29'));
  assert.ok(dateValide('2028-02-29'));
  assert.ok(heureValide('00:00') && heureValide('23:59'));
  assert.ok(!heureValide('24:00') && !heureValide('9:30') && !heureValide('12:60'));
  assert.ok(fuseauValide('Asia/Dubai'));
  assert.ok(!fuseauValide('') && !fuseauValide('Dubai'));
  assert.equal(nomFuseau('America/New_York'), 'New York');
});

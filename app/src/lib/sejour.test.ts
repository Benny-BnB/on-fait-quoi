// Tests des étapes et des logements. Données FICTIVES.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Etape, Logement } from '../data/types.ts';
import { ajouterJours, analyserGps, etapesTriees, formatGps, liensCartes, lienSur, logementsTries, nbNuits, nuitsSansLogement } from './sejour.ts';

const etape: Etape = { id: 'e1', nom: 'Étape test', pays: 'Pays', devise: 'EUR', fuseau: 'Europe/Brussels', debut: '2027-03-01', fin: '2027-03-05' };

function logement(id: string, du: string, au: string, extra: Partial<Logement> = {}): Logement {
  return {
    id,
    etapeId: 'e1',
    nom: `Logement ${id}`,
    statut: 'reserve',
    lien: '',
    adresse: '',
    gps: null,
    arrivee: { date: du, heure: '' },
    depart: { date: au, heure: '' },
    reference: '',
    notes: '',
    ...extra,
  };
}

test('calculs de dates : fin de mois, fin d\'année, année bissextile', () => {
  assert.equal(ajouterJours('2027-02-28', 1), '2027-03-01'); // 2027 n'est pas bissextile
  assert.equal(ajouterJours('2028-02-28', 1), '2028-02-29');
  assert.equal(ajouterJours('2026-12-31', 1), '2027-01-01');
  assert.equal(ajouterJours('2027-03-01', -1), '2027-02-28');
  assert.equal(nbNuits('2027-03-01', '2027-03-05'), 4);
  assert.equal(nbNuits('2026-12-30', '2027-01-02'), 3);
  assert.equal(nbNuits('2027-03-01', '2027-03-01'), 0);
});

test('nuits sans logement : tout est couvert par deux logements qui se suivent', () => {
  const l = [logement('a', '2027-03-01', '2027-03-03'), logement('b', '2027-03-03', '2027-03-05')];
  assert.deepEqual(nuitsSansLogement(etape, l), []);
});

test('nuits sans logement : une nuit manque au milieu', () => {
  const l = [logement('a', '2027-03-01', '2027-03-03'), logement('b', '2027-03-04', '2027-03-05')];
  assert.deepEqual(nuitsSansLogement(etape, l), [{ du: '2027-03-03', au: '2027-03-04', nuits: 1 }]);
});

test('nuits sans logement : aucun logement = toutes les nuits manquent', () => {
  assert.deepEqual(nuitsSansLogement(etape, []), [{ du: '2027-03-01', au: '2027-03-05', nuits: 4 }]);
});

test('nuits sans logement : début et fin non couverts, deux trous', () => {
  const l = [logement('a', '2027-03-02', '2027-03-03')];
  assert.deepEqual(nuitsSansLogement(etape, l), [
    { du: '2027-03-01', au: '2027-03-02', nuits: 1 },
    { du: '2027-03-03', au: '2027-03-05', nuits: 2 },
  ]);
});

test('nuits sans logement : un logement qui dépasse l\'étape ne crée pas de faux trou ni de calcul infini', () => {
  const l = [logement('a', '2020-01-01', '9999-12-31')];
  assert.deepEqual(nuitsSansLogement(etape, l), []);
});

test('nuits sans logement : un logement "à trouver" compte comme une place prévue', () => {
  const l = [logement('a', '2027-03-01', '2027-03-05', { statut: 'a-trouver' })];
  assert.deepEqual(nuitsSansLogement(etape, l), []);
});

test('nuits sans logement : une étape d\'un seul jour n\'a pas de nuit', () => {
  assert.deepEqual(nuitsSansLogement({ ...etape, debut: '2027-03-01', fin: '2027-03-01' }, []), []);
});

test('tri des étapes par date, des logements par arrivée puis heure', () => {
  const e2 = { ...etape, id: 'e2', nom: 'Avant', debut: '2027-02-20', fin: '2027-03-01' };
  assert.deepEqual(etapesTriees([etape, e2]).map((e) => e.id), ['e2', 'e1']);
  const l = [logement('tard', '2027-03-01', '2027-03-02', { arrivee: { date: '2027-03-01', heure: '18:00' } }), logement('tot', '2027-03-01', '2027-03-02', { arrivee: { date: '2027-03-01', heure: '09:00' } }), logement('sans', '2027-03-01', '2027-03-02')];
  assert.deepEqual(logementsTries(l).map((x) => x.id), ['tot', 'tard', 'sans']);
});

test('liens : seuls http et https sont acceptés', () => {
  assert.equal(lienSur('https://exemple.org/page'), 'https://exemple.org/page');
  assert.equal(lienSur('  http://exemple.org  '), 'http://exemple.org');
  assert.equal(lienSur('javascript:alert(1)'), null);
  assert.equal(lienSur('data:text/html,<b>x</b>'), null);
  assert.equal(lienSur('exemple.org'), null);
  assert.equal(lienSur(''), null);
});

test('coordonnées GPS : formats acceptés et refusés', () => {
  assert.deepEqual(analyserGps('13.7563, 100.5018'), { ok: true, gps: { lat: 13.7563, lng: 100.5018 } });
  assert.deepEqual(analyserGps('13.7563 100.5018'), { ok: true, gps: { lat: 13.7563, lng: 100.5018 } });
  assert.deepEqual(analyserGps('-33.86,151.21'), { ok: true, gps: { lat: -33.86, lng: 151.21 } });
  assert.deepEqual(analyserGps('  '), { ok: true, gps: null });
  assert.equal(analyserGps('91, 10').ok, false);
  assert.equal(analyserGps('10, 181').ok, false);
  assert.equal(analyserGps('abc').ok, false);
  assert.equal(analyserGps('13,7563, 100,5018').ok, false);
  assert.equal(formatGps({ lat: 1.5, lng: -2.25 }), '1.5, -2.25');
  assert.equal(formatGps(null), '');
});

test('liens de cartes : avec coordonnées, avec adresse, ou rien', () => {
  const avecGps = liensCartes({ nom: 'Hôtel', adresse: '', gps: { lat: 1.5, lng: 2.5 } });
  assert.match(avecGps?.google ?? '', /query=1\.5%2C2\.5/);
  const avecAdresse = liensCartes({ nom: 'Hôtel', adresse: '12 rue de Test', gps: null });
  assert.match(avecAdresse?.plans ?? '', /q=12%20rue%20de%20Test/);
  assert.equal(liensCartes({ nom: 'Hôtel', adresse: '  ', gps: null }), null);
});

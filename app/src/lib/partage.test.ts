// Tests du partage par lien et par QR code. Données FICTIVES.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EvenementAgenda } from './agenda.ts';
import { decoderPlanning, encoderPlanning, evenementsDepuisPlanning, lienDePartage, planningDepuisEvenements } from './partage.ts';
import { cheminSvgQr, creerQr } from './qr.ts';

const evenement = (i: number, extra: Partial<EvenementAgenda> = {}): EvenementAgenda => ({
  uid: `creneau-${i}`,
  genre: 'planning',
  titre: `Activité n°${i} · café, thé & croissants`,
  details: ['Statut : Prévu', `Une note avec accents éàü et un point-virgule ; n°${i}`],
  lieu: 'Lieu fictif, 1 rue Fictive',
  fuseau: i % 2 === 0 ? 'Asia/Bangkok' : 'Europe/Brussels',
  debutMs: Date.UTC(2027, 2, 1 + (i % 10), 8 + (i % 8), 30),
  finMs: Date.UTC(2027, 2, 1 + (i % 10), 10 + (i % 8), 0),
  jour: `2027-03-${String(1 + (i % 10)).padStart(2, '0')}`,
  ...extra,
});

const tailleJson = (e: EvenementAgenda[]): number => JSON.stringify(planningDepuisEvenements(e)).length;

test('aller-retour : ce qui est encodé est retrouvé tel quel', async () => {
  const sources = [
    evenement(1),
    evenement(2, { genre: 'vol', debutMs: Date.UTC(2027, 2, 5, 7, 0), finMs: Date.UTC(2027, 2, 5, 13, 30) }),
    evenement(3, { debutMs: null, finMs: null, fuseau: '', details: [], lieu: '' }), // « toute la journée »
  ];
  const code = await encoderPlanning(planningDepuisEvenements(sources));
  const r = await decoderPlanning(code);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const retrouves = evenementsDepuisPlanning(r.planning);
  assert.equal(retrouves.length, 3);
  retrouves.forEach((e, i) => {
    const s = sources[i];
    assert.equal(e.titre, s.titre);
    assert.deepEqual(e.details, s.details);
    assert.equal(e.lieu, s.lieu);
    assert.equal(e.fuseau, s.fuseau);
    assert.equal(e.debutMs, s.debutMs);
    assert.equal(e.finMs, s.finMs);
    assert.equal(e.jour, s.jour);
    assert.equal(e.genre, s.genre);
  });
});

test('les check-lists ne sont jamais dans un lien de partage', () => {
  const p = planningDepuisEvenements([evenement(1), evenement(2, { genre: 'tache', debutMs: null, finMs: null })]);
  assert.equal(p.e.length, 1);
});

test('un même événement reçu deux fois a le même identifiant (réimport sans doublon)', () => {
  const a = evenementsDepuisPlanning(planningDepuisEvenements([evenement(1)]));
  const b = evenementsDepuisPlanning(planningDepuisEvenements([evenement(1)]));
  assert.equal(a[0].uid, b[0].uid);
  assert.notEqual(a[0].uid, evenementsDepuisPlanning(planningDepuisEvenements([evenement(2)]))[0].uid);
});

test('le code ne contient que des caractères sûrs pour une adresse et reste plus court que le texte brut', async () => {
  const liste = Array.from({ length: 60 }, (_, i) => evenement(i + 1));
  const code = await encoderPlanning(planningDepuisEvenements(liste));
  assert.match(code, /^[01]\.[A-Za-z0-9_-]+$/);
  assert.ok(code.startsWith('1.'));
  assert.ok(code.length < tailleJson(liste) / 2, `compressé : ${code.length} contre ${tailleJson(liste)}`);
});

test('un code non compressé (0.) est lu aussi', async () => {
  const json = JSON.stringify(planningDepuisEvenements([evenement(1)]));
  const code = `0.${Buffer.from(json, 'utf8').toString('base64url')}`;
  const r = await decoderPlanning(code);
  assert.equal(r.ok, true);
});

test('un lien abîmé ou piégé est refusé avec un message clair, sans erreur', async () => {
  const valide = await encoderPlanning(planningDepuisEvenements([evenement(1)]));
  const mauvais = [
    '',
    'n importe quoi',
    '2.AAAA',
    '1.',
    '1.@@@@',
    `${valide}ZZZ`, // données en trop après la fin du flux compressé
    `1.${valide.slice(2, 12)}`, // flux tronqué
    `0.${Buffer.from('pas du json').toString('base64url')}`,
    `0.${Buffer.from(JSON.stringify({ v: 2, z: [], e: [] })).toString('base64url')}`,
    `0.${Buffer.from(JSON.stringify({ v: 1, z: ['Pas/UnFuseau'], e: [] })).toString('base64url')}`,
    `0.${Buffer.from(JSON.stringify({ v: 1, z: [], e: [['p', '2027-13-45', null, null, -1, 'x', '', '']] })).toString('base64url')}`,
    `0.${Buffer.from(JSON.stringify({ v: 1, z: [], e: [['p', '2027-01-01', null, null, 5, 'x', '', '']] })).toString('base64url')}`,
    `0.${Buffer.from(JSON.stringify({ v: 1, z: [], e: [['?', '2027-01-01', null, null, -1, 'x', '', '']] })).toString('base64url')}`,
    `0.${Buffer.from(JSON.stringify({ v: 1, z: [], e: [['p', '2027-01-01', null, null, -1, 'x'.repeat(500), '', '']] })).toString('base64url')}`,
  ];
  for (const code of mauvais) {
    const r = await decoderPlanning(code);
    assert.equal(r.ok, false, `devrait être refusé : ${code.slice(0, 40)}`);
    if (!r.ok) assert.ok(r.erreur.length > 10);
  }
});

test('un lien qui gonfle énormément à la décompression est refusé', async () => {
  const gros = new Uint8Array(5_000_000); // 5 Mo de zéros : très petit une fois compressé
  const flux = new Blob([gros]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const compresse = new Uint8Array(await new Response(flux).arrayBuffer());
  assert.ok(compresse.length < 20_000);
  const r = await decoderPlanning(`1.${Buffer.from(compresse).toString('base64url')}`);
  assert.equal(r.ok, false);
});

test("le lien garde l'adresse de l'app et remplace sa partie « # »", () => {
  assert.equal(lienDePartage('https://exemple.invalid/appli/#/planning', '1.abc'), 'https://exemple.invalid/appli/#/recu/1.abc');
  assert.equal(lienDePartage('https://exemple.invalid/appli/', '0.x'), 'https://exemple.invalid/appli/#/recu/0.x');
});

test('QR : un petit lien tient, un énorme est refusé (on propose alors le fichier)', () => {
  const petit = creerQr('https://exemple.invalid/appli/#/recu/1.abcdef');
  assert.ok(petit);
  assert.ok((petit?.taille ?? 0) >= 21);
  assert.equal(petit?.sombre(0, 0), true, 'le coin du motif de repérage est sombre');
  assert.equal(creerQr(`https://exemple.invalid/#/recu/${'a'.repeat(1500)}`), null);
  assert.equal(creerQr('x'.repeat(5000), 40), null);
});

test('QR : le dessin contient exactement les carrés sombres de la matrice', () => {
  const m = creerQr('https://exemple.invalid/appli/#/recu/1.abcdef');
  assert.ok(m);
  if (!m) return;
  let sombres = 0;
  for (let l = 0; l < m.taille; l++) for (let c = 0; c < m.taille; c++) if (m.sombre(l, c)) sombres++;
  const { chemin, viewBox } = cheminSvgQr(m);
  const dansLeChemin = [...chemin.matchAll(/h(\d+)v1/g)].reduce((somme, x) => somme + Number(x[1]), 0);
  assert.equal(dansLeChemin, sombres);
  assert.equal(viewBox, `0 0 ${m.taille + 8} ${m.taille + 8}`);
});

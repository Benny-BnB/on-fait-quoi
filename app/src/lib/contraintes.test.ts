import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { donneesVides, personneVide } from '../data/defauts.ts';
import type { Creneau, Donnees, Lieu, Personne } from '../data/types.ts';
import { alertesContraintes, toutesLesAlertes } from './alertes.ts';
import { accesLieu, aEviterLieu, contraintesLieu } from './contraintes.ts';
import { demandeVide, filtrerLieux, validerFichierLieux } from './lieux.ts';

const base: Lieu[] = ['bangkok', 'pattaya'].flatMap((zone) => {
  const r = validerFichierLieux(JSON.parse(readFileSync(new URL(`../data/lieux/${zone}.json`, import.meta.url), 'utf8')));
  assert.ok(r.ok, zone);
  return r.ok ? r.lieux : [];
});
const lieu = (id: string): Lieu => {
  const l = base.find((x) => x.id === id);
  assert.ok(l, id);
  return l;
};

const alex: Personne = { ...personneVide('alex', 'Alex'), mobilite: ['marche-limitee', 'debout-limite'], confort: ['chaud'] };
const charlie: Personne = { ...personneVide('charlie', 'Charlie'), confort: ['froid'] };
const robin: Personne = { ...personneVide('robin', 'Robin'), regimes: ['vegetarien'] };
const mini: Personne = { ...personneVide('mini', 'Mini'), ageAns: 6 };

const cles = (s: { cle: string }[]) => s.map((x) => x.cle);

test('chaleur : un lieu en extérieur est signalé pour la personne sensible à la chaleur, pas pour celle qui a froid', () => {
  const yaowarat = lieu('bkk-yaowarat'); // extérieur
  const s = contraintesLieu(yaowarat, [alex, charlie]);
  assert.ok(cles(s).includes('chaud-ext'));
  assert.match(s.find((x) => x.cle === 'chaud-ext')!.texte, /^Alex \(sensible à la chaleur\) : lieu en extérieur/);
  assert.ok(s.find((x) => x.cle === 'chaud-ext')!.fort);
  assert.ok(!cles(contraintesLieu(yaowarat, [charlie])).includes('froid-int'));
  assert.deepEqual(contraintesLieu(yaowarat, [charlie]), [], 'un lieu en extérieur ne gêne pas celui qui a froid');
});

test('intérieur ou extérieur inconnu : « à vérifier », jamais un verdict inventé ; la climatisation n\'est pas inventée non plus', () => {
  const octave = lieu('bkk-octave'); // interieur non renseigné
  const s = contraintesLieu(octave, [alex, charlie]);
  assert.ok(cles(s).includes('chaud-inconnu') && cles(s).includes('froid-inconnu'));
  assert.ok(s.filter((x) => x.cle.endsWith('inconnu')).every((x) => !x.fort));
  const interieur: Lieu = { ...octave, interieur: 'interieur' };
  const t = contraintesLieu(interieur, [charlie]).find((x) => x.cle === 'froid-int')!;
  assert.match(t.texte, /climatisation non indiquée par la fiche \(à vérifier\)/);
  assert.ok(!t.fort);
});

test('une mise en garde sourcée sur la chaleur s\'applique à la personne sensible à la chaleur', () => {
  const s = contraintesLieu(lieu('bkk-chatuchak'), [alex]);
  const chaleur = s.find((x) => x.cle.startsWith('chaud-att'))!;
  assert.match(chaleur.texte, /midi à 14:00.*Thai Holiday Guide/);
  assert.ok(chaleur.fort);
});

test('mobilité : visite longue signalée (durée de la fiche), durée inconnue à vérifier', () => {
  assert.ok(cles(contraintesLieu(lieu('bkk-chatuchak'), [alex])).includes('marche-longue')); // 3 h à 4 h
  assert.match(contraintesLieu(lieu('bkk-chatuchak'), [alex]).find((x) => x.cle === 'marche-longue')!.texte, /jusqu'à 4 h/);
  assert.ok(cles(contraintesLieu(lieu('bkk-octave'), [alex])).includes('marche-duree')); // durée inconnue
  const courte: Lieu = { ...lieu('bkk-khaosan'), duree: { ...lieu('bkk-khaosan').duree!, minMin: 30, maxMin: 60 } };
  assert.ok(!cles(contraintesLieu(courte, [alex])).includes('marche-longue'), 'une visite d\'une heure au plus n\'est pas longue');
});

test('poussette, fauteuil, escaliers : accessibilité à vérifier tant que la fiche ne dit rien', () => {
  const poussette: Personne = { ...personneVide('p', 'Parent'), mobilite: ['poussette'] };
  assert.ok(cles(contraintesLieu(lieu('bkk-wat-arun'), [poussette])).includes('acces-pmr'));
  const avecPublic: Lieu = { ...lieu('bkk-wat-arun'), public: { texte: 'Accessible aux poussettes', source: lieu('bkk-wat-arun').duree!.source } };
  assert.ok(!cles(contraintesLieu(avecPublic, [poussette])).includes('acces-pmr'));
  // un texte « Pour qui » qui parle d'autre chose (tarifs, âges) ne répond pas à la question : l'accessibilité reste à vérifier
  const autreTexte: Lieu = { ...lieu('bkk-wat-arun'), public: { texte: 'Gratuit pour les moins de 3 ans', source: lieu('bkk-wat-arun').duree!.source } };
  assert.ok(cles(contraintesLieu(autreTexte, [poussette])).includes('acces-pmr'));
  const fauteuil: Lieu = { ...lieu('bkk-wat-arun'), public: { texte: 'Fauteuils roulants disponibles', source: lieu('bkk-wat-arun').duree!.source } };
  assert.ok(!cles(contraintesLieu(fauteuil, [{ ...poussette, mobilite: ['fauteuil'] }])).includes('acces-pmr'));
});

test('alimentation : seulement pour les lieux où l\'on mange, et seulement si la fiche ne dit rien', () => {
  const s = contraintesLieu(lieu('bkk-view-arun'), [robin]);
  assert.match(s.find((x) => x.cle === 'regimes')!.texte, /Robin \(végétarien\).*La fiche ne l'indique pas/);
  assert.deepEqual(contraintesLieu(lieu('bkk-wat-arun'), [robin]), [], 'un temple n\'est pas un restaurant');
  const dit: Lieu = { ...lieu('bkk-view-arun'), public: { texte: 'Plats végétariens proposés', source: lieu('bkk-view-arun').horaires!.source } };
  assert.ok(!cles(contraintesLieu(dit, [robin])).includes('regimes'));
});

test('enfant et vie nocturne : règle d\'âge à vérifier (jamais inventée)', () => {
  const s = contraintesLieu(lieu('bkk-sky-bar-lebua'), [mini]);
  assert.match(s.find((x) => x.cle === 'enfant-nocturne')!.texte, /règle d'âge.*à vérifier/);
  assert.ok(!s.some((x) => x.fort));
  assert.deepEqual(contraintesLieu(lieu('bkk-wat-arun'), [mini]), []);
});

test('sans personne, aucune contrainte', () => {
  for (const l of base) assert.deepEqual(contraintesLieu(l, []), [], l.nom);
});

test('à éviter : foule, chaleur, longs trajets, activités extrêmes — seulement quand la fiche ou la distance le dit', () => {
  const ctx = (aEviter: Parameters<typeof aEviterLieu>[1]['aEviter'], km: number | null = null) => ({ aEviter, distanceKm: km, trajetLongKm: 15 });
  assert.ok(cles(aEviterLieu(lieu('bkk-chatuchak'), ctx(['foule']))).some((c) => c.startsWith('foule')));
  assert.deepEqual(aEviterLieu(lieu('bkk-chatuchak'), ctx([])), [], 'rien à éviter = aucun signalement');
  assert.deepEqual(aEviterLieu(lieu('bkk-wat-arun'), ctx(['foule'])), [], 'pas d\'information sur la foule = pas de signalement');
  assert.ok(cles(aEviterLieu(lieu('bkk-yaowarat'), ctx(['chaleur']))).includes('chaleur-ext'));
  assert.ok(cles(aEviterLieu(lieu('bkk-chatuchak'), ctx(['chaleur']))).some((c) => c.startsWith('chaleur:')));
  assert.ok(cles(aEviterLieu(lieu('bkk-wat-arun'), ctx(['longs-trajets'], 20))).includes('trajet-long'));
  assert.deepEqual(aEviterLieu(lieu('bkk-wat-arun'), ctx(['longs-trajets'], 15)), [], 'au seuil, pas au-delà');
  assert.deepEqual(aEviterLieu(lieu('bkk-wat-arun'), ctx(['longs-trajets'], null)), [], 'distance inconnue');
  const sport: Lieu = { ...lieu('bkk-wat-arun'), categories: ['sport'] };
  assert.ok(cles(aEviterLieu(sport, ctx(['extreme']))).includes('extreme-sport'));
  assert.deepEqual(aEviterLieu(lieu('bkk-wat-arun'), ctx(['extreme'])), []);
});

test('transports acceptés : signalé seulement si la source donne un accès et qu\'aucun mode n\'est accepté', () => {
  assert.deepEqual(accesLieu(lieu('bkk-yaowarat'), []), [], 'tous acceptés');
  assert.deepEqual(accesLieu(lieu('bkk-yaowarat'), ['metro', 'taxi']), []);
  const s = accesLieu(lieu('bkk-yaowarat'), ['taxi']);
  assert.equal(s.length, 1);
  assert.match(s[0].texte, /Accès indiqué en métro .*pas dans tes transports acceptés/);
  assert.deepEqual(accesLieu(lieu('bkk-view-arun'), ['taxi']), [], 'accès non renseigné : pas de signalement');
  assert.deepEqual(accesLieu(lieu('bkk-grand-palace'), ['a-pied']), [], 'bateau ou à pied');
  assert.equal(accesLieu(lieu('bkk-grand-palace'), ['vtc']).length, 1);
});

test('propositions : contraintes signalées avec la raison, masquées seulement sur demande', () => {
  const demande = { ...demandeVide(), personnes: [alex, charlie] };
  const toutes = filtrerLieux(base, demande, [], []);
  assert.equal(toutes.length, base.length, 'signalées, pas masquées');
  assert.ok(toutes.find((p) => p.lieu.id === 'bkk-chatuchak')!.signalements.some((s) => s.fort));
  const masque = filtrerLieux(base, { ...demande, masquerContraintes: true }, [], []).map((p) => p.lieu.id);
  assert.ok(!masque.includes('bkk-chatuchak') && !masque.includes('bkk-yaowarat'));
  assert.ok(masque.includes('bkk-view-arun'), 'seuls les lieux qui contredisent clairement sont masqués');
  const sansContrainte = filtrerLieux(base, { ...demandeVide(), masquerContraintes: true }, [], []);
  assert.equal(sansContrainte.length, base.length, 'sans personne ni réglage, rien n\'est masqué');
  const transport = filtrerLieux(base, { ...demandeVide(), transports: ['taxi'], masquerContraintes: true }, [], []).map((p) => p.lieu.id);
  assert.ok(!transport.includes('bkk-yaowarat') && !transport.includes('bkk-chatuchak') && !transport.includes('bkk-grand-palace'));
});

// ---------- Alertes sur le planning ----------

const creneauLieu = (id: string, lieuId: string, extra: Partial<Creneau> = {}): Creneau => ({
  id, jour: '2026-12-08', periode: 'matin', debut: '', fin: '', fuseau: 'Asia/Bangkok', titre: `Créneau ${id}`, note: '', statut: 'prevu', humeur: '', participants: [],
  budgetEstime: null, budgetReel: null, devise: '', dureeMin: null, planBDe: '', lieuId, fixe: false, typeEvenement: '', ...extra,
});

test('alerte sur le planning : un lieu prévu qui contredit clairement une contrainte des participants', () => {
  const d: Donnees = { ...donneesVides(), personnes: [alex, charlie], creneaux: [creneauLieu('c1', 'bkk-chatuchak', { participants: ['alex'] }), creneauLieu('c2', 'bkk-yaowarat', { participants: ['charlie'] }), creneauLieu('c3', 'bkk-chatuchak', { participants: ['charlie'] })] };
  const a = alertesContraintes(d, base);
  assert.ok(a.some((x) => x.id === 'c1' && /Contrainte du groupe pour « Créneau c1 » : Alex/.test(x.message)));
  assert.ok(!a.some((x) => x.id === 'c2'), 'Charlie n\'est pas gêné par un lieu en extérieur');
  assert.ok(!a.some((x) => x.id === 'c3'), 'les points « à vérifier » ne déclenchent pas d\'alerte');
  // créneau sans participants : ceux présents ce jour-là
  const dJour: Donnees = { ...d, creneaux: [creneauLieu('c4', 'bkk-yaowarat')] };
  assert.ok(alertesContraintes(dJour, base).some((x) => x.id === 'c4'));
  const absente: Donnees = { ...dJour, personnes: [{ ...alex, presence: [{ du: '2026-12-20', au: '2026-12-22' }] }, charlie] };
  assert.equal(alertesContraintes(absente, base).length, 0, 'Alex n\'est pas là ce jour-là');
  assert.ok(toutesLesAlertes(dJour, base).some((x) => x.id === 'c4'));
});

test('escaliers : signalés pour poussette, fauteuil ou escaliers difficiles quand la source en parle (Pattaya)', () => {
  const escaliers: Personne = { ...personneVide('e', 'Prudent'), mobilite: ['escaliers'] };
  for (const id of ['pat-sanctuary-of-truth', 'pat-big-buddha']) {
    const s = contraintesLieu(lieu(id), [escaliers]).find((x) => x.cle === 'escaliers');
    assert.ok(s && s.fort, id);
    assert.match(s.texte, /escaliers signalés/);
  }
  assert.ok(!cles(contraintesLieu(lieu('pat-floating-market'), [escaliers])).includes('escaliers'));
});

test('Pattaya : chaleur signalée pour la personne sensible à la chaleur, île et marché sans faux verdict', () => {
  assert.ok(cles(contraintesLieu(lieu('pat-nong-nooch'), [alex])).some((c) => c.startsWith('chaud-att')), 'jardin : peu d\'ombre de 11:00 à 14:00');
  assert.ok(cles(contraintesLieu(lieu('pat-koh-larn'), [alex])).includes('chaud-ext'));
  assert.ok(cles(contraintesLieu(lieu('pat-floating-market'), [alex])).includes('chaud-inconnu'), 'intérieur ou extérieur non renseigné : à vérifier');
  assert.ok(cles(aEviterLieu(lieu('pat-walking-street'), { aEviter: ['foule'], distanceKm: null, trajetLongKm: 15 })).some((c) => c.startsWith('foule')));
  assert.equal(accesLieu(lieu('pat-koh-larn'), ['taxi']).length, 1, 'île : accès par bateau seulement');
  assert.equal(accesLieu(lieu('pat-koh-larn'), ['bateau']).length, 0);
});

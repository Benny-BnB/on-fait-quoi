import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personneVide } from '../data/defauts.ts';
import type { Lieu, Personne } from '../data/types.ts';
import { validerFichierLieux } from './lieux.ts';
import { tarifPourAge, totalGroupe } from './tarifs.ts';

type Prix = NonNullable<Lieu['prix']>;
const source = { lien: 'https://exemple.test/page', libelle: 'Exemple', consulteLe: '2026-11-12', officielle: true };
const prix = (extra: Partial<Prix> = {}): Prix => ({
  min: 100, max: 100, devise: 'THB', note: '', source,
  tarifs: [
    { libelle: 'Enfant de 3 à 12 ans', ageMin: 3, ageMax: 12, min: 40, max: 40 },
    { libelle: 'Moins de 3 ans (gratuit)', ageMin: 0, ageMax: 2, min: 0, max: 0 },
    { libelle: '65 ans et plus', ageMin: 65, ageMax: null, min: 0, max: 0 },
  ],
  ...extra,
});
const personne = (prenom: string, age: number | null, extra: Partial<Personne> = {}): Personne => ({ ...personneVide(prenom.toLowerCase(), prenom), ageAns: age, ...extra });

test("le tarif d'un âge : bornes incluses, aucun tarif hors des tranches", () => {
  const p = prix();
  assert.equal(tarifPourAge(p, 2)?.libelle, 'Moins de 3 ans (gratuit)');
  assert.equal(tarifPourAge(p, 3)?.libelle, 'Enfant de 3 à 12 ans');
  assert.equal(tarifPourAge(p, 12)?.libelle, 'Enfant de 3 à 12 ans');
  assert.equal(tarifPourAge(p, 13), null);
  assert.equal(tarifPourAge(p, 64), null);
  assert.equal(tarifPourAge(p, 65)?.libelle, '65 ans et plus');
  assert.equal(tarifPourAge(prix({ tarifs: undefined }), 5), null);
});

test('deux tarifs possibles pour un âge : le plus précis (fourchette la plus étroite) l\'emporte', () => {
  const p = prix({ tarifs: [{ libelle: 'Moins de 18 ans', ageMin: null, ageMax: 17, min: 70, max: 70 }, { libelle: 'Enfant de 3 à 12 ans', ageMin: 3, ageMax: 12, min: 40, max: 40 }] });
  assert.equal(tarifPourAge(p, 8)?.libelle, 'Enfant de 3 à 12 ans');
  assert.equal(tarifPourAge(p, 15)?.libelle, 'Moins de 18 ans');
});

test('total du groupe : chacun paie le tarif de son âge', () => {
  const t = totalGroupe(prix(), [personne('Alex', 40), personne('Robin', 8), personne('Mini', 1), personne('Charlie', 70)]);
  assert.ok(t);
  assert.equal(t.min, 140); // 100 + 40 + 0 + 0
  assert.equal(t.max, 140);
  assert.equal(t.devise, 'THB');
  assert.deepEqual(t.parPersonne.map((x) => [x.prenom, x.min, x.standard]), [['Alex', 100, true], ['Robin', 40, false], ['Mini', 0, false], ['Charlie', 0, false]]);
  assert.deepEqual(t.precisions, []);
});

test("sans âge connu alors que la source donne des tarifs : prix standard et la raison est dite", () => {
  const t = totalGroupe(prix(), [personne('Alex', 40), personne('Robin', null, { tranche: 'enfant' })]);
  assert.ok(t);
  assert.equal(t.min, 200);
  assert.equal(t.precisions.length, 1);
  assert.match(t.precisions[0], /Robin : âge non renseigné, prix standard utilisé/);
});

test("sans tarif par âge dans la source : un enfant ou un senior paie le prix standard, et la fiche le dit sans le deviner", () => {
  const t = totalGroupe(prix({ tarifs: undefined }), [personne('Alex', 40), personne('Robin', 8), personne('Charlie', 70)]);
  assert.ok(t);
  assert.equal(t.min, 300);
  assert.equal(t.precisions.length, 2);
  assert.match(t.precisions[0], /Robin \(enfant\) : la source ne donne pas de tarif pour cet âge/);
  assert.match(t.precisions[1], /Charlie \(senior\)/);
});

test('une fourchette de prix se cumule : minimum avec minimum, maximum avec maximum', () => {
  const t = totalGroupe(prix({ min: 50, max: 117, tarifs: undefined }), [personne('Alex', 40), personne('Robin', 30)]);
  assert.ok(t);
  assert.equal(t.min, 100);
  assert.equal(t.max, 234);
});

test('aucune personne : pas de total', () => {
  assert.equal(totalGroupe(prix(), []), null);
});

// ---------- Validation des tarifs dans une fiche ----------

const fichier = (tarifs: unknown) => ({
  format: 'on-fait-quoi-lieux', version: 1,
  lieux: [{ id: 't', nom: 'Test', zone: 'Dubaï', fuseau: 'Asia/Dubai', categories: ['famille'], prix: { min: 100, max: 100, devise: 'AED', note: '', tarifs, source } }],
});

test('des tarifs valides sont lus tels quels', () => {
  const r = validerFichierLieux(fichier([{ libelle: 'Enfant', ageMin: 3, ageMax: 12, min: 40, max: 40 }, { libelle: 'Senior', ageMin: 65, min: 0, max: 0 }]));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.lieux[0].prix?.tarifs, [{ libelle: 'Enfant', ageMin: 3, ageMax: 12, min: 40, max: 40 }, { libelle: 'Senior', ageMin: 65, ageMax: null, min: 0, max: 0 }]);
});

test('des tarifs incohérents sont refusés avec un message clair', () => {
  const refuse = (tarifs: unknown, extrait: RegExp) => {
    const r = validerFichierLieux(fichier(tarifs));
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.erreurs.some((e) => extrait.test(e)), r.erreurs.join(' / '));
  };
  refuse('enfant', /« tarifs » doit être une liste/);
  refuse([{ ageMin: 3, ageMax: 12, min: 40, max: 40 }], /libellé est obligatoire/);
  refuse([{ libelle: 'X', min: 40, max: 40 }], /au moins un âge/);
  refuse([{ libelle: 'X', ageMin: 12, ageMax: 3, min: 40, max: 40 }], /âge minimum dépasse l'âge maximum/);
  refuse([{ libelle: 'X', ageMin: 3.5, ageMax: 12, min: 40, max: 40 }], /nombres entiers/);
  refuse([{ libelle: 'X', ageMin: 3, ageMax: 12, min: 50, max: 40 }], /minimum dépasse le maximum/);
  refuse([{ libelle: 'X', ageMin: 3, ageMax: 12, min: -1, max: 40 }], /« min » doit être un nombre/);
});

test("une fiche sans tarifs reste valide (anciennes fiches)", () => {
  const r = validerFichierLieux({ ...fichier(undefined), lieux: [{ id: 't', nom: 'Test', zone: 'Dubaï', fuseau: 'Asia/Dubai', categories: ['famille'], prix: { min: 1, max: 2, devise: 'AED', note: '', source } }] });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.lieux[0].prix?.tarifs, undefined);
});

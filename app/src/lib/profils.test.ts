import assert from 'node:assert/strict';
import { test } from 'node:test';
import { donneesVides, personneVide, REGLAGES_PAR_DEFAUT } from '../data/defauts.ts';
import type { Donnees, Groupe } from '../data/types.ts';
import { validerImport } from '../data/validation.ts';
import { groupeComplet, idsPresentsLe, normaliserPersonne, normaliserReglages, personnesDe, presentLe, trancheDe } from './profils.ts';

const imp = (extra: Record<string, unknown>) => validerImport({ format: 'on-fait-quoi', version: 1, ...extra });

test('une personne enregistrée avant l\'étape 8 est complétée sans rien perdre', () => {
  const p = normaliserPersonne({ id: 'p', prenom: 'Ami', notes: 'une note' });
  assert.deepEqual(p, { ...personneVide('p', 'Ami'), notes: 'une note' });
});

test('une personne lue avec des valeurs absurdes est nettoyée', () => {
  const p = normaliserPersonne({
    id: 'p',
    prenom: 'Ami',
    ageAns: -3,
    tranche: 'martien' as never,
    regimes: ['vegetarien', 'carnivore'] as never,
    mobilite: ['fauteuil', 42] as never,
    confort: ['chaud', 'froid', 'chaud'],
    presence: [{ du: '2026-12-05', au: '2026-12-10' }, { du: '2026-12-10', au: '2026-12-05' }, { du: 'x', au: 'y' }] as never,
  });
  assert.equal(p.ageAns, null);
  assert.equal(p.tranche, '');
  assert.deepEqual(p.regimes, ['vegetarien']);
  assert.deepEqual(p.mobilite, ['fauteuil']);
  assert.deepEqual(p.confort, ['froid', 'chaud']);
  assert.deepEqual(p.presence, [{ du: '2026-12-05', au: '2026-12-10' }]);
});

test('des réglages anciens (seulement les délais d\'aéroport) sont complétés avec les valeurs de départ', () => {
  const r = normaliserReglages({ delaiAeroportMin: { international: 200, interieur: 90 } } as never);
  assert.equal(r.delaiAeroportMin.international, 200);
  assert.deepEqual(r.tauxChange, []);
  assert.deepEqual(r.budget, []);
  assert.deepEqual(r.rythme, { activitesMax: null, heureLever: '', pauses: [] });
  assert.deepEqual(r.aEviter, []);
  assert.deepEqual(r.transports, []);
  assert.equal(r.trajetLongKm, REGLAGES_PAR_DEFAUT.trajetLongKm);
  assert.deepEqual(normaliserReglages(undefined), REGLAGES_PAR_DEFAUT);
});

test('tranche d\'âge : l\'âge exact l\'emporte, sinon la tranche saisie', () => {
  assert.equal(trancheDe({ ...personneVide('a'), ageAns: 6 }), 'enfant');
  assert.equal(trancheDe({ ...personneVide('a'), ageAns: 17 }), 'enfant');
  assert.equal(trancheDe({ ...personneVide('a'), ageAns: 18 }), 'adulte');
  assert.equal(trancheDe({ ...personneVide('a'), ageAns: 65 }), 'senior');
  assert.equal(trancheDe({ ...personneVide('a'), tranche: 'senior' }), 'senior');
  assert.equal(trancheDe(personneVide('a')), '');
});

test('présence : sans période, présent tout le voyage ; avec périodes, seulement dedans (bornes incluses)', () => {
  const tous = personneVide('a');
  const partielle = { ...personneVide('b'), presence: [{ du: '2026-12-05', au: '2026-12-10' }, { du: '2026-12-20', au: '2026-12-22' }] };
  assert.ok(presentLe(tous, '2030-01-01'));
  assert.ok(presentLe(partielle, '2026-12-05') && presentLe(partielle, '2026-12-10') && presentLe(partielle, '2026-12-21'));
  assert.ok(!presentLe(partielle, '2026-12-04') && !presentLe(partielle, '2026-12-11'));
});

test('qui est là un jour : le réglage du jour l\'emporte, sinon la présence de chacun', () => {
  const d: Donnees = {
    ...donneesVides(),
    personnes: [personneVide('a', 'A'), { ...personneVide('b', 'B'), presence: [{ du: '2026-12-05', au: '2026-12-10' }] }, personneVide('c', 'C')],
    joursPlan: [{ jour: '2026-12-07', participants: ['c'] }],
  };
  assert.deepEqual(idsPresentsLe(d, '2026-12-06'), ['a', 'b', 'c']);
  assert.deepEqual(idsPresentsLe(d, '2026-12-12'), ['a', 'c']);
  assert.deepEqual(idsPresentsLe(d, '2026-12-07'), ['c'], 'le réglage du jour passe avant la présence');
});

test('groupes : les personnes de plusieurs groupes se cumulent sans doublon', () => {
  const g1: Groupe = { id: 'g1', nom: 'Un', personneIds: ['a', 'b'] };
  const g2: Groupe = { id: 'g2', nom: 'Deux', personneIds: ['b', 'c'] };
  const d: Donnees = { ...donneesVides(), personnes: [personneVide('a'), personneVide('b'), personneVide('c'), personneVide('z')], groupes: [g1, g2] };
  assert.deepEqual(personnesDe(d, ['g1', 'g2'], []).map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(personnesDe(d, ['g1'], ['z']).map((p) => p.id), ['a', 'b', 'z']);
  assert.deepEqual(personnesDe(d, [], []).map((p) => p.id), []);
  assert.ok(groupeComplet(g1, ['a', 'b', 'c']) && !groupeComplet(g1, ['a']) && !groupeComplet({ id: 'v', nom: 'Vide', personneIds: [] }, ['a']));
});

// ---------- Import ----------

test('import : un profil complet, des groupes et des réglages complets sont acceptés', () => {
  const r = imp({
    personnes: [{ id: 'a', prenom: 'Ami', ageAns: 6, regimes: ['halal'], mobilite: ['poussette'], confort: ['chaud'], alimentation: 'sans arachide', presence: [{ du: '2026-12-05', au: '2026-12-20' }], notes: 'n' }, { id: 'b', prenom: 'Autre' }],
    groupes: [{ id: 'g', nom: 'Tous', personneIds: ['a', 'b'] }],
    reglages: {
      delaiAeroportMin: { international: 180, interieur: 120 },
      tauxChange: [{ devise: 'thb', taux: 0.027, date: '2026-11-11', source: 'Source test', lien: 'https://exemple.test' }],
      budget: [{ id: 'b1', perimetre: 'pays', libelle: 'Pays A', pays: 'Pays A', montant: 500, devise: 'EUR' }],
      rythme: { activitesMax: 3, heureLever: '08:30', pauses: [{ libelle: 'Sieste', debut: '13:00', fin: '15:00' }] },
      aEviter: ['foule', 'chaleur'],
      trajetLongKm: 20,
      transports: ['taxi', 'metro'],
    },
  });
  assert.equal(r.ok, true, r.ok ? '' : r.erreurs.join(' / '));
  if (r.ok) {
    assert.equal(r.donnees.personnes?.[0].ageAns, 6);
    assert.equal(r.donnees.personnes?.[1].regimes.length, 0);
    assert.deepEqual(r.donnees.groupes, [{ id: 'g', nom: 'Tous', personneIds: ['a', 'b'] }]);
    assert.equal(r.donnees.reglages?.tauxChange[0].devise, 'THB');
    assert.deepEqual(r.donnees.reglages?.transports, ['taxi', 'metro']);
    assert.equal(r.avertissements.length, 0);
  }
});

test('import : des réglages anciens (seulement les délais) restent valides', () => {
  const r = imp({ reglages: { delaiAeroportMin: { international: 180, interieur: 120 } } });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.donnees.reglages?.aEviter, []);
});

function refuse(extra: Record<string, unknown>, extrait: RegExp): void {
  const r = imp(extra);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.erreurs.some((e) => extrait.test(e)), r.erreurs.join(' / '));
}

test('import : valeurs absurdes refusées avec un message clair', () => {
  refuse({ personnes: [{ id: 'a', prenom: 'Ami', ageAns: 200 }] }, /âge invalide/);
  refuse({ personnes: [{ id: 'a', prenom: 'Ami', regimes: ['carnivore'] }] }, /valeur inconnue « carnivore »/);
  refuse({ personnes: [{ id: 'a', prenom: 'Ami', mobilite: 'fauteuil' }] }, /doit être une liste/);
  refuse({ personnes: [{ id: 'a', prenom: 'Ami', presence: [{ du: '2026-12-10', au: '2026-12-05' }] }] }, /période de présence invalide/);
  refuse({ personnes: [{ id: 'a', prenom: 'Ami', tranche: 'martien' }] }, /tranche d'âge invalide/);
  refuse({ personnes: [{ id: 'a', prenom: 'A' }], groupes: [{ id: 'g', nom: 'G', personneIds: ['inconnu'] }] }, /n'existe pas dans le fichier/);
  refuse({ groupes: [{ id: 'g', nom: '', personneIds: [] }] }, /nom manquant/);
  refuse({ groupes: [{ id: 'g', nom: 'A', personneIds: [] }, { id: 'g', nom: 'B', personneIds: [] }] }, /utilisé deux fois/);
  const delais = { international: 180, interieur: 120 };
  refuse({ reglages: { delaiAeroportMin: delais, tauxChange: [{ devise: 'THB', taux: -1, date: '2026-11-11' }] } }, /taux de change invalide/);
  refuse({ reglages: { delaiAeroportMin: delais, tauxChange: [{ devise: 'THB', taux: 0.03, date: 'hier' }] } }, /taux de change invalide/);
  refuse({ reglages: { delaiAeroportMin: delais, tauxChange: [{ devise: 'THB', taux: 0.03, date: '2026-11-11', lien: 'javascript:alert(1)' }] } }, /lien de la source/);
  refuse({ reglages: { delaiAeroportMin: delais, budget: [{ perimetre: 'planete', montant: 10, devise: 'EUR' }] } }, /budget n°1 invalide/);
  refuse({ reglages: { delaiAeroportMin: delais, rythme: { activitesMax: 2.5 } } }, /nombre d'activités/);
  refuse({ reglages: { delaiAeroportMin: delais, rythme: { heureLever: '25:00' } } }, /heure de lever/);
  refuse({ reglages: { delaiAeroportMin: delais, rythme: { pauses: [{ debut: '14:00', fin: '13:00' }] } } }, /pause invalide/);
  refuse({ reglages: { delaiAeroportMin: delais, aEviter: ['les-lundis'] } }, /valeur inconnue/);
  refuse({ reglages: { delaiAeroportMin: delais, transports: ['fusee'] } }, /valeur inconnue/);
  refuse({ reglages: { delaiAeroportMin: delais, trajetLongKm: 0 } }, /seuil de long trajet/);
});

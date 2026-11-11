// Tests de la validation du fichier d'import. Données FICTIVES.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireTexteImport, validerImport } from './validation.ts';

const volValide = {
  id: 'vol-1',
  numero: 'XX100',
  compagnie: 'Compagnie fictive',
  depart: { code: 'bru', ville: 'Ville A', date: '2027-01-15', heure: '08:00', fuseau: 'Europe/Brussels' },
  arrivee: { code: 'AUH', ville: 'Ville B', date: '2027-01-15', heure: '17:30', fuseau: 'Asia/Dubai', terminal: 'A' },
};

const fichier = (extra: Record<string, unknown> = {}) => ({ format: 'on-fait-quoi', version: 1, vols: [volValide], ...extra });

test('un fichier valide est accepté, avec valeurs par défaut', () => {
  const r = validerImport(fichier());
  assert.equal(r.ok, true);
  if (r.ok) {
    const v = r.donnees.vols?.[0];
    assert.equal(v?.depart.code, 'BRU'); // mis en majuscules
    assert.equal(v?.portee, 'international');
    assert.equal(v?.pourMoi, true);
    assert.equal(v?.statut, 'confirme');
    assert.equal(v?.arrivee.terminal, 'A');
  }
});

test('un fichier qui n\'est pas de ce format est refusé', () => {
  assert.equal(validerImport({ vols: [] }).ok, false);
  assert.equal(validerImport({ format: 'autre', version: 1 }).ok, false);
  assert.equal(validerImport([1, 2, 3]).ok, false);
  assert.equal(validerImport(null).ok, false);
});

test('un fichier d\'une version plus récente est refusé avec un message clair', () => {
  const r = validerImport({ format: 'on-fait-quoi', version: 99, vols: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.erreurs[0], /plus récente/);
});

test('fuseau inconnu, date impossible, heure invalide : chaque erreur est expliquée', () => {
  const mauvais = { ...volValide, depart: { ...volValide.depart, fuseau: 'Pays/Inconnu', date: '2027-02-30', heure: '25:00' } };
  const r = validerImport(fichier({ vols: [mauvais] }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    const tout = r.erreurs.join(' | ');
    assert.match(tout, /XX100/);
    assert.match(tout, /fuseau horaire inconnu/);
    assert.match(tout, /date invalide/);
    assert.match(tout, /heure invalide/);
  }
});

test('arrivée avant le départ : refusé', () => {
  const r = validerImport(fichier({ vols: [{ ...volValide, arrivee: { ...volValide.arrivee, heure: '07:00' } }] }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.erreurs.join(' '), /avant le départ/);
});

test('identifiants de vol en double : refusé', () => {
  const r = validerImport(fichier({ vols: [volValide, volValide] }));
  assert.equal(r.ok, false);
});

test('compteurs : un compteur sur un vol absent du fichier est refusé', () => {
  const r = validerImport(fichier({ compteurs: [{ id: 'c1', libelle: 'Test', cible: { type: 'vol', volId: 'absent' } }] }));
  assert.equal(r.ok, false);
  const ok = validerImport(fichier({ compteurs: [{ id: 'c1', libelle: 'Test', cible: { type: 'vol', volId: 'vol-1' }, visible: true, delaiMin: 180 }] }));
  assert.equal(ok.ok, true);
});

test('réglages : délais invalides refusés', () => {
  assert.equal(validerImport(fichier({ reglages: { delaiAeroportMin: { international: -5, interieur: 120 } } })).ok, false);
  assert.equal(validerImport(fichier({ reglages: { delaiAeroportMin: { international: 180, interieur: 120 } } })).ok, true);
});

test('une section inconnue est signalée mais n\'empêche pas l\'import', () => {
  const r = validerImport(fichier({ evenements: [] }));
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.avertissements.join(' '), /evenements/);
});

const etapeValide = { id: 'e1', nom: 'Étape test', pays: 'Pays', devise: 'eur', fuseau: 'Europe/Brussels', debut: '2027-03-01', fin: '2027-03-05' };
const logementValide = {
  id: 'l1',
  etapeId: 'e1',
  nom: 'Logement test',
  statut: 'reserve',
  lien: 'https://exemple.org/annonce',
  adresse: '12 rue de Test',
  gps: { lat: 1.5, lng: 2.5 },
  arrivee: { date: '2027-03-01', heure: '15:00' },
  depart: { date: '2027-03-05', heure: '' },
};
const fichierSejour = (extra: Record<string, unknown> = {}) => ({ format: 'on-fait-quoi', version: 1, etapes: [etapeValide], logements: [logementValide], ...extra });

test('étapes et logements valides : acceptés, devise en majuscules, heure vide permise', () => {
  const r = validerImport(fichierSejour());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.donnees.etapes?.[0].devise, 'EUR');
    assert.equal(r.donnees.logements?.[0].depart.heure, '');
    assert.equal(r.donnees.vols, undefined); // un fichier sans vols ne touche pas aux vols
  }
});

test('logement rattaché à une étape inconnue : refusé', () => {
  const r = validerImport(fichierSejour({ logements: [{ ...logementValide, etapeId: 'absente' }] }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.erreurs.join(' '), /n'existe pas dans le fichier/);
});

test('logements sans la section étapes : refusé avec explication', () => {
  const r = validerImport({ format: 'on-fait-quoi', version: 1, logements: [logementValide] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.erreurs.join(' '), /ont besoin des étapes/);
});

test('lien dangereux ou départ avant arrivée : refusé', () => {
  const dangereux = validerImport(fichierSejour({ logements: [{ ...logementValide, lien: 'javascript:alert(1)' }] }));
  assert.equal(dangereux.ok, false);
  const inverse = validerImport(fichierSejour({ logements: [{ ...logementValide, depart: { date: '2027-03-01', heure: '' } }] }));
  assert.equal(inverse.ok, false);
  if (!inverse.ok) assert.match(inverse.erreurs.join(' '), /après l'arrivée/);
});

test('étape : fin avant début, fuseau inconnu, devise invalide : refusé', () => {
  const r = validerImport(fichierSejour({ etapes: [{ ...etapeValide, debut: '2027-03-05', fin: '2027-03-01', fuseau: 'Pays/Inconnu', devise: 'EURO' }], logements: undefined }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    const tout = r.erreurs.join(' | ');
    assert.match(tout, /fin est avant le début/);
    assert.match(tout, /fuseau horaire inconnu/);
    assert.match(tout, /devise invalide/);
  }
});

test('GPS hors limites, heure impossible : refusé', () => {
  assert.equal(validerImport(fichierSejour({ logements: [{ ...logementValide, gps: { lat: 95, lng: 0 } }] })).ok, false);
  assert.equal(validerImport(fichierSejour({ logements: [{ ...logementValide, arrivee: { date: '2027-03-01', heure: '25:00' } }] })).ok, false);
});

const trajetValide = {
  id: 't1',
  de: 'Lieu A',
  a: 'Lieu B',
  mode: 'train',
  date: '2027-03-04',
  heure: '',
  fuseau: 'Europe/Brussels',
  dureeMin: 57,
  prixMin: 10,
  prixMax: 20,
  devise: 'eur',
  source: 'Journal fictif, 01/01/2027 : https://exemple.org/article',
  consulteLe: '2027-01-02',
};
const fichierTrajets = (extra: Record<string, unknown> = {}) => ({ format: 'on-fait-quoi', version: 1, trajets: [trajetValide], ...extra });

test('trajets valides : acceptés, mode vide permis, valeurs par défaut', () => {
  const r = validerImport(fichierTrajets({ trajets: [trajetValide, { id: 't2', de: 'X', a: 'Y', date: '2027-03-05', fuseau: 'Asia/Dubai' }] }));
  assert.equal(r.ok, true);
  if (r.ok) {
    const [t1, t2] = r.donnees.trajets ?? [];
    assert.equal(t1.devise, 'EUR');
    assert.equal(t1.dureeEstimee, false);
    assert.equal(t2.mode, '');
    assert.equal(t2.dureeMin, null);
    assert.equal(t2.prixMin, null);
    assert.equal(t2.lienVol, 'vers');
    assert.equal(r.donnees.vols, undefined);
  }
});

test('trajets : mode inconnu, prix incohérents, devise manquante, date de source invalide : refusés', () => {
  const r = validerImport(fichierTrajets({ trajets: [{ ...trajetValide, mode: 'fusée', prixMin: 30, devise: '', consulteLe: '2027-13-01', heure: '25:00' }] }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    const tout = r.erreurs.join(' | ');
    assert.match(tout, /mode invalide/);
    assert.match(tout, /dépasse le prix maximum/);
    assert.match(tout, /devise manquante/);
    assert.match(tout, /date de consultation invalide/);
    assert.match(tout, /heure invalide/);
  }
  assert.equal(validerImport(fichierTrajets({ trajets: [{ ...trajetValide, prixMax: undefined }] })).ok, false, 'un seul des deux prix');
  assert.equal(validerImport(fichierTrajets({ trajets: [{ ...trajetValide, dureeMin: -5 }] })).ok, false);
});

test('trajets liés à un vol ou un logement : vérifiés seulement si la section est dans le même fichier', () => {
  const lie = { ...trajetValide, volId: 'absent', logementId: 'absent' };
  assert.equal(validerImport(fichierTrajets({ trajets: [lie] })).ok, true, 'sans les vols dans le fichier, on ne peut pas vérifier');
  const avecVols = validerImport(fichierTrajets({ trajets: [lie], vols: [volValide] }));
  assert.equal(avecVols.ok, false);
  if (!avecVols.ok) assert.match(avecVols.erreurs.join(' '), /le vol « absent » n'existe pas/);
  const bon = validerImport(fichierTrajets({ trajets: [{ ...trajetValide, volId: 'vol-1', lienVol: 'depuis' }], vols: [volValide] }));
  assert.equal(bon.ok, true);
});

const tacheValide = { id: 'k1', titre: 'Tâche test', liste: 'reste-a-faire', dateSouhaitee: '2027-03-01', echeance: '2027-03-05', lien: 'https://exemple.org' };
const fichierTaches = (extra: Record<string, unknown> = {}) => ({ format: 'on-fait-quoi', version: 1, taches: [tacheValide], ...extra });

test('tâches valides : acceptées, valeurs par défaut, "faitLe" ignoré tant que la tâche n\'est pas faite', () => {
  const r = validerImport(fichierTaches({ taches: [tacheValide, { titre: 'Sans dates', faitLe: '2027-03-02' }, { ...tacheValide, id: 'k3', fait: true, faitLe: '2027-03-02' }] }));
  assert.equal(r.ok, true);
  if (r.ok) {
    const [a, b, c] = r.donnees.taches ?? [];
    assert.equal(a.fait, false);
    assert.equal(b.liste, 'reste-a-faire');
    assert.equal(b.dateSouhaitee, '');
    assert.equal(b.faitLe, '');
    assert.equal(c.fait, true);
    assert.equal(c.faitLe, '2027-03-02');
    assert.equal(r.donnees.vols, undefined);
  }
});

test('tâches invalides : titre manquant, liste inconnue, dates impossibles, souhaitée après échéance, lien dangereux', () => {
  const r = validerImport(fichierTaches({ taches: [{ titre: '', liste: 'autre', dateSouhaitee: '2027-02-30', echeance: 'demain', lien: 'javascript:alert(1)', fait: 'oui' }] }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    const tout = r.erreurs.join(' | ');
    assert.match(tout, /titre manquant/);
    assert.match(tout, /liste invalide/);
    assert.match(tout, /date souhaitée invalide/);
    assert.match(tout, /échéance invalide/);
    assert.match(tout, /https:\/\//);
    assert.match(tout, /« fait » doit valoir/);
  }
  const inverse = validerImport(fichierTaches({ taches: [{ ...tacheValide, dateSouhaitee: '2027-03-10', echeance: '2027-03-05' }] }));
  assert.equal(inverse.ok, false);
  if (!inverse.ok) assert.match(inverse.erreurs.join(' '), /souhaitée est après l'échéance/);
  assert.equal(validerImport(fichierTaches({ taches: [tacheValide, tacheValide] })).ok, false, 'identifiants en double');
});

test('texte collé : JSON coupé ou invalide donne un message clair', () => {
  const r = lireTexteImport('{"format": "on-fait-quoi", "vols": [');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.erreurs[0], /coupé/);
  assert.equal(lireTexteImport(JSON.stringify(fichier())).ok, true);
});

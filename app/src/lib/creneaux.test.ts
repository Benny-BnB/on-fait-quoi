// Tests des créneaux libres du planning. Données FICTIVES.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Compteur, Creneau, Donnees, Etape, Personne, Trajet, Vol } from '../data/types.ts';
import { REGLAGES_PAR_DEFAUT } from '../data/defauts.ts';
import { creneauxImposes } from './planning.ts';
import {
  alertesCreneaux,
  cleTriCreneau,
  copierCreneau,
  creerAlternative,
  creneauxDatables,
  dureeCreneauMin,
  echanger,
  elementsDuJour,
  historique,
  libelleHoraire,
  participantsEffectifs,
  promouvoirPlanB,
  resoudreCompteurComplet,
  suivrePlace,
  totauxJour,
  totauxSejour,
  zoneDuJour,
} from './creneaux.ts';

const JOUR = '2027-03-10';

function creneau(id: string, extra: Partial<Creneau> = {}): Creneau {
  return {
    id,
    jour: JOUR,
    periode: '',
    debut: '',
    fin: '',
    fuseau: 'Europe/Brussels',
    titre: `Créneau ${id}`,
    note: '',
    statut: 'prevu',
    humeur: '',
    participants: [],
    budgetEstime: null,
    budgetReel: null,
    devise: '',
    dureeMin: null,
    planBDe: '',
    fixe: false,
    typeEvenement: '',
    lieuId: '',
    ...extra,
  };
}

function donnees(partiel: Partial<Donnees> = {}): Donnees {
  return { vols: [], compteurs: [], reglages: REGLAGES_PAR_DEFAUT, etapes: [], logements: [], trajets: [], taches: [], personnes: [], creneaux: [], joursPlan: [], lieuxPerso: [], suiviLieux: [], ...partiel };
}

// Vol fictif : Bruxelles 10:00 -> Bruxelles 12:00 le 10/03/2027 (mars : UTC+1), international (3 h d'avance : limite 07:00)
const vol: Vol = {
  id: 'v1',
  compagnie: '',
  numero: 'XX100',
  reference: '',
  depart: { code: 'AAA', ville: '', date: JOUR, heure: '10:00', fuseau: 'Europe/Brussels', terminal: '' },
  arrivee: { code: 'BBB', ville: '', date: JOUR, heure: '12:00', fuseau: 'Europe/Brussels', terminal: '' },
  portee: 'international',
  passagers: '',
  pourMoi: true,
  statut: 'confirme',
  notes: '',
};

const trajetVers: Trajet = {
  id: 't1',
  de: 'Lieu A',
  a: 'Aéroport',
  mode: '',
  date: JOUR,
  heure: '',
  fuseau: 'Europe/Brussels',
  dureeMin: 60,
  dureeEstimee: false,
  prixMin: null,
  prixMax: null,
  devise: '',
  source: '',
  consulteLe: '',
  volId: 'v1',
  lienVol: 'vers',
  logementId: '',
  notes: '',
};

const e1: Etape = { id: 'e1', nom: 'E1', pays: '', devise: 'EUR', fuseau: 'Europe/Brussels', debut: '2027-03-01', fin: '2027-03-04' };
const e2: Etape = { id: 'e2', nom: 'E2', pays: '', devise: 'AED', fuseau: 'Asia/Dubai', debut: '2027-03-04', fin: '2027-03-08' };

test('fuseau d\'un jour : l\'étape où l\'on dort, sinon celle que l\'on quitte, sinon le défaut', () => {
  assert.equal(zoneDuJour('2027-03-02', [e2, e1]), 'Europe/Brussels');
  assert.equal(zoneDuJour('2027-03-04', [e1, e2]), 'Asia/Dubai', 'jour de transition : on arrive dans la nouvelle étape');
  assert.equal(zoneDuJour('2027-03-08', [e1, e2]), 'Asia/Dubai', 'dernier jour : on est encore là');
  assert.equal(zoneDuJour('2027-03-20', [e1, e2], 'Asia/Tokyo'), 'Asia/Tokyo');
  assert.equal(zoneDuJour('2027-03-20', []), '');
});

test('durée d\'un créneau : fin - début, sinon la durée saisie, sinon inconnue', () => {
  assert.equal(dureeCreneauMin(creneau('a', { debut: '09:00', fin: '10:30' })), 90);
  assert.equal(dureeCreneauMin(creneau('b', { debut: '09:00', dureeMin: 45 })), 45);
  assert.equal(dureeCreneauMin(creneau('c')), null);
  assert.equal(dureeCreneauMin(creneau('d', { debut: '10:00', fin: '09:00' })), null, 'fin avant début : pas de durée inventée');
});

test('rangement dans la journée : heure précise > période > événement fixe en tête > sans info à la fin', () => {
  const cle = (extra: Partial<Creneau>) => cleTriCreneau(creneau('x', extra));
  assert.ok(cle({ periode: 'matin' }) < cle({ periode: 'midi' }));
  assert.ok(cle({ periode: 'midi' }) < cle({ periode: 'apres-midi' }));
  assert.ok(cle({ periode: 'apres-midi' }) < cle({ periode: 'soir' }));
  assert.ok(cle({ periode: 'soir' }) < cle({ periode: 'nuit' }));
  assert.ok(cle({ periode: 'matin' }) < cle({ debut: '10:00' }), 'le matin (09:00 de rangement) passe avant 10:00');
  assert.ok(cle({ debut: '10:00' }) < cle({ periode: 'midi' }), '10:00 passe avant midi');
  assert.ok(cle({ fixe: true }) < cle({ debut: '00:30' }), 'un événement fixe sans heure ouvre la journée');
  assert.equal(cle({}), Infinity);
  assert.equal(cle({ debut: '09:00' }), Date.UTC(2027, 2, 10, 8, 0), '09:00 à Bruxelles en mars = 08:00 UTC');
});

test('libellé d\'horaire', () => {
  assert.equal(libelleHoraire(creneau('a', { debut: '09:00', fin: '10:30' })), '09:00–10:30');
  assert.equal(libelleHoraire(creneau('b', { debut: '09:00' })), '09:00');
  assert.equal(libelleHoraire(creneau('c', { periode: 'apres-midi' })), 'Après-midi');
  assert.equal(libelleHoraire(creneau('d', { fixe: true })), 'Toute la journée');
  assert.equal(libelleHoraire(creneau('e')), 'Heure à définir');
});

const p1: Personne = { id: 'p1', prenom: 'Un', notes: '' };
const p2: Personne = { id: 'p2', prenom: 'Deux', notes: '' };
const p3: Personne = { id: 'p3', prenom: 'Trois', notes: '' };

test('participants : ceux du créneau, sinon ceux du jour, sinon tout le monde', () => {
  const d = donnees({ personnes: [p1, p2, p3], joursPlan: [{ jour: JOUR, participants: ['p1', 'p2'] }] });
  assert.deepEqual(participantsEffectifs(creneau('a'), d).map((p) => p.id), ['p1', 'p2'], 'les participants du jour');
  assert.deepEqual(participantsEffectifs(creneau('b', { jour: '2027-03-11' }), d).map((p) => p.id), ['p1', 'p2', 'p3'], 'un jour sans réglage : tout le monde');
  assert.deepEqual(participantsEffectifs(creneau('c', { participants: ['p3'] }), d).map((p) => p.id), ['p3'], 'le créneau l\'emporte sur le jour');
  assert.deepEqual(participantsEffectifs(creneau('d', { participants: ['p3', 'inconnu'] }), d).map((p) => p.id), ['p3'], 'une personne supprimée est ignorée');
});

test('totaux : un total par devise, les créneaux annulés et les plans B ne comptent pas', () => {
  const d = donnees({
    creneaux: [
      creneau('a', { debut: '09:00', fin: '10:00', budgetEstime: 100, budgetReel: 90, devise: 'THB' }),
      creneau('b', { periode: 'soir', budgetEstime: 50, devise: 'THB' }),
      creneau('c', { debut: '12:00', fin: '13:00', budgetEstime: 10, devise: 'EUR' }),
      creneau('d', { debut: '14:00', fin: '15:00', budgetEstime: 999, devise: 'THB', statut: 'annule' }),
      creneau('e', { debut: '14:00', fin: '15:00', budgetEstime: 999, devise: 'THB', planBDe: 'a' }),
      creneau('f', { jour: '2027-03-11', debut: '09:00', fin: '09:30', budgetEstime: 5, devise: 'THB' }),
    ],
  });
  const j = totauxJour(d, JOUR, []);
  assert.deepEqual(j.budgets, [
    { devise: 'EUR', estime: 10, reel: 0 },
    { devise: 'THB', estime: 150, reel: 90 },
  ]);
  assert.equal(j.activitesMin, 120);
  assert.equal(j.sansDuree, 1, 'le créneau du soir n\'a pas de durée connue');
  const s = totauxSejour(d, []);
  assert.equal(s.budgets.find((b) => b.devise === 'THB')?.estime, 155);
  assert.equal(s.activitesMin, 150);
});

test('totaux : un événement fixe sans durée n\'est pas compté comme "sans durée" ; les trajets et vols comptent en déplacements', () => {
  const d = donnees({ vols: [vol], trajets: [trajetVers], creneaux: [creneau('f', { fixe: true, typeEvenement: 'festival' })] });
  const t = totauxJour(d, JOUR, creneauxImposes(d));
  assert.equal(t.sansDuree, 0);
  assert.equal(t.deplacementsMin, 60 + 120, 'trajet de 60 min + vol de 2 h (10:00 -> 12:00)');
});

test('alerte de chevauchement : deux créneaux, ou un créneau et un trajet ; pas s\'ils se touchent', () => {
  const d = donnees({ creneaux: [creneau('a', { debut: '09:00', fin: '10:00' }), creneau('b', { debut: '09:30', fin: '11:00' }), creneau('c', { debut: '11:00', fin: '12:00' })] });
  const a = alertesCreneaux(d).filter((x) => x.cle.startsWith('chevauche:'));
  assert.equal(a.length, 1);
  assert.match(a[0].message, /« Créneau a » et « Créneau b »/);
  // Un trajet saisi 20:00-21:00 (heure de Bruxelles)
  const tr: Trajet = { ...trajetVers, volId: '', heure: '20:00', dureeMin: 60 };
  const avecTrajet = alertesCreneaux(donnees({ trajets: [tr], creneaux: [creneau('x', { debut: '20:30', fin: '21:30' })] }));
  assert.ok(avecTrajet.some((x) => x.cle.startsWith('chevauche:') && /trajet « Lieu A → Aéroport »/.test(x.message)));
});

test('alerte "trop proche d\'un vol" : on ne peut pas faire autre chose pendant qu\'on rejoint l\'aéroport', () => {
  // Vol à 10:00, il faut être à l'aéroport à 07:00
  const proche = (extra: Partial<Creneau>, d: Partial<Donnees> = {}) => alertesCreneaux(donnees({ vols: [vol], ...d, creneaux: [creneau('c', extra)] })).filter((x) => x.cle.startsWith('proche-vol:'));
  assert.equal(proche({ debut: '06:30', fin: '07:30' }).length, 1, 'chevauche la période d\'arrivée à l\'aéroport');
  assert.equal(proche({ debut: '08:00' }).length, 1, 'un créneau sans fin pendant la fenêtre');
  assert.equal(proche({ debut: '05:00', fin: '06:00' }).length, 0, 'assez tôt avant');
  assert.equal(proche({ debut: '10:30', fin: '11:00' }).length, 0, 'après le décollage');
  assert.equal(proche({ periode: 'matin' }).length, 0, 'une période sans heure précise n\'est pas contrôlée');
  assert.equal(proche({ debut: '08:00', statut: 'annule' }).length, 0, 'un créneau annulé est ignoré');
  assert.match(proche({ debut: '08:00' })[0].message, /être à l'aéroport avant 07:00/);
  // Avec un trajet de 60 min : il faut partir à 06:00
  const avecTrajet = { trajets: [trajetVers] };
  assert.equal(proche({ debut: '05:30', fin: '06:30' }, avecTrajet).length, 1);
  assert.match(proche({ debut: '05:30', fin: '06:30' }, avecTrajet)[0].message, /partir pour l'aéroport vers 06:00/);
  assert.equal(proche({ debut: '05:00', fin: '05:45' }, avecTrajet).length, 0);
  // Le vol de quelqu'un d'autre ne compte pas
  assert.equal(alertesCreneaux(donnees({ vols: [{ ...vol, pourMoi: false }], creneaux: [creneau('c', { debut: '08:00' })] })).length, 0);
});

test('échange de deux créneaux : ils échangent leur place, pas leur contenu', () => {
  const a = creneau('a', { jour: '2027-03-10', periode: 'matin', titre: 'Plage' });
  const b = creneau('b', { jour: '2027-03-12', debut: '15:00', fin: '17:00', titre: 'Marché' });
  const [a2, b2] = echanger(a, b);
  assert.deepEqual([a2.jour, a2.debut, a2.fin, a2.periode, a2.titre], ['2027-03-12', '15:00', '17:00', '', 'Plage']);
  assert.deepEqual([b2.jour, b2.debut, b2.fin, b2.periode, b2.titre], ['2027-03-10', '', '', 'matin', 'Marché']);
});

test('plan B : il prend la place du principal et l\'ancien principal devient son plan B', () => {
  const principal = creneau('p', { periode: 'matin', titre: 'Plage' });
  const alt = creerAlternative(principal, 'alt');
  assert.equal(alt.planBDe, 'p');
  assert.equal(alt.periode, 'matin');
  assert.equal(alt.titre, '');
  assert.equal(alt.statut, 'idee');
  const [ancienPrincipal, nouveauPrincipal] = promouvoirPlanB(principal, { ...alt, titre: 'Musée', jour: '2027-03-11' });
  assert.equal(ancienPrincipal.planBDe, 'alt');
  assert.equal(nouveauPrincipal.planBDe, '');
  assert.equal(nouveauPrincipal.jour, JOUR, 'le plan B prend la place du principal');
  assert.equal(nouveauPrincipal.titre, 'Musée');
});

test('copie et suivi de place', () => {
  const c = creneau('c', { statut: 'fait', budgetReel: 30, fixe: true, typeEvenement: 'fete', planBDe: '', participants: ['p1'] });
  const copie = copierCreneau(c, 'copie');
  assert.deepEqual([copie.id, copie.statut, copie.budgetReel, copie.fixe, copie.typeEvenement], ['copie', 'idee', null, false, '']);
  copie.participants.push('p2');
  assert.deepEqual(c.participants, ['p1'], 'les participants sont copiés, pas partagés');
  assert.equal(suivrePlace(creneau('b', { jour: '2027-03-15' }), creneau('a', { jour: '2027-03-11', periode: 'soir' })).periode, 'soir');
});

test('contenu d\'une journée : imposés et libres dans l\'ordre, les plans B ne sont pas listés à part', () => {
  const d = donnees({
    vols: [vol],
    creneaux: [
      creneau('tot', { debut: '06:00', fin: '06:30' }),
      creneau('matin', { periode: 'matin' }),
      creneau('alt', { periode: 'matin', planBDe: 'matin' }),
      creneau('ailleurs', { jour: '2027-03-11', debut: '09:00' }),
    ],
  });
  const el = elementsDuJour(d, JOUR, creneauxImposes(d));
  assert.deepEqual(el.map((x) => x.cle), ['creneau:tot', 'creneau:matin', 'vol:v1:depart', 'vol:v1:arrivee']);
  const matin = el.find((x) => x.cle === 'creneau:matin');
  assert.ok(matin && 'libre' in matin && matin.alternatif?.id === 'alt', 'le plan B est rattaché à son principal');
});

test('historique : les créneaux faits, le plus récent en premier', () => {
  const d = donnees({ creneaux: [creneau('a', { statut: 'fait', jour: '2027-03-01' }), creneau('b', { statut: 'fait', jour: '2027-03-05' }), creneau('c')] });
  assert.deepEqual(historique(d).map((c) => c.id), ['b', 'a']);
});

test('compteur sur un créneau : libre (par son heure) ou imposé (par sa clé), erreur claire sinon', () => {
  const libre = creneau('l', { debut: '10:00' });
  const d = donnees({ vols: [vol], creneaux: [libre, creneau('sans-heure', { periode: 'matin' })] });
  const compteur = (cle: string, delaiMin = 0): Compteur => ({ id: 'c', libelle: 'test', cible: { type: 'creneau', cle }, visible: true, delaiMin });
  const dix = Date.UTC(2027, 2, 10, 9, 0); // 10:00 à Bruxelles
  const r = resoudreCompteurComplet(compteur('creneau:l', 30), d, dix - 3600 * 1000);
  assert.equal(r.etat, 'actif');
  if (r.etat === 'actif') assert.equal(r.cibleMs, dix - 30 * 60000);
  const imp = resoudreCompteurComplet(compteur('vol:v1:depart'), d, 0);
  assert.equal(imp.etat, 'actif');
  assert.equal(resoudreCompteurComplet(compteur('creneau:sans-heure'), d, 0).etat, 'invalide', 'un créneau sans heure précise ne peut pas avoir de compteur');
  assert.equal(resoudreCompteurComplet(compteur('creneau:supprime'), d, 0).etat, 'invalide');
  assert.equal(resoudreCompteurComplet({ id: 'p', libelle: 'p', cible: { type: 'prochain-vol' }, visible: true, delaiMin: 0 }, d, 0).etat, 'actif', 'les autres compteurs marchent comme avant');
  const cles = creneauxDatables(d).map((x) => x.cle);
  assert.ok(cles.includes('creneau:l') && cles.includes('vol:v1:depart') && !cles.includes('creneau:sans-heure'));
});

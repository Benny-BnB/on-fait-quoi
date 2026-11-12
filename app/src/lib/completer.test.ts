import assert from 'node:assert/strict';
import { test } from 'node:test';
import { donneesVides, personneVide } from '../data/defauts.ts';
import type { Creneau, Donnees, Etape, Lieu, Logement, Tache, Trajet, Vol } from '../data/types.ts';
import { elementsACompleter } from './completer.ts';

const etape: Etape = { id: 'e1', nom: 'Ville A', pays: '', devise: 'THB', fuseau: 'Asia/Bangkok', debut: '2026-12-16', fin: '2026-12-20' };
const logement = (extra: Partial<Logement> = {}): Logement => ({
  id: 'l1', etapeId: 'e1', nom: 'Chez moi', statut: 'confirme', lien: '', adresse: '1 rue test', gps: null,
  arrivee: { date: '2026-12-16', heure: '15:00' }, depart: { date: '2026-12-20', heure: '11:00' }, reference: '', notes: '', ...extra,
});
// Un voyage où tout est renseigné : taux de change, budget, rythme
const reglagesComplets = () => ({
  ...donneesVides().reglages,
  tauxChange: [{ devise: 'THB', taux: 0.027, date: '2026-11-11', source: 'Source test', lien: '' }],
  budget: [{ id: 'b1', perimetre: 'groupe' as const, libelle: '', pays: '', montant: 1000, devise: 'EUR' }],
  rythme: { activitesMax: 3, heureLever: '', pauses: [] },
});
const base = (): Donnees => ({ ...donneesVides(), reglages: reglagesComplets(), etapes: [etape], logements: [logement()] });

test('rien à compléter quand tout est renseigné', () => {
  assert.deepEqual(elementsACompleter(base(), [], '2026-11-11'), []);
});

test('logement : à trouver, à vérifier, adresse, heures ; nuits sans logement', () => {
  const d = base();
  const cles = (x: Donnees) => elementsACompleter(x, [], '2026-11-11').map((e) => e.cle);
  // un logement « à trouver » ne réclame ni adresse ni heures : seulement d'être trouvé
  assert.deepEqual(cles({ ...d, logements: [logement({ statut: 'a-trouver', adresse: '', arrivee: { date: '2026-12-16', heure: '' } })] }), ['log-trouver:l1']);
  assert.ok(cles({ ...d, logements: [logement({ statut: 'a-verifier' })] }).includes('log-verifier:l1'));
  const manques = cles({ ...d, logements: [logement({ adresse: '', arrivee: { date: '2026-12-16', heure: '' }, depart: { date: '2026-12-20', heure: '' } })] });
  assert.deepEqual(manques, ['log-adresse:l1', 'log-arrivee:l1', 'log-depart:l1']);
  const trou = elementsACompleter({ ...d, logements: [logement({ depart: { date: '2026-12-18', heure: '11:00' } })] }, [], '2026-11-11');
  assert.equal(trou.length, 1);
  assert.match(trou[0].message, /2 nuits sans logement \(du 18\/12\/2026 au 20\/12\/2026\)/);
  assert.equal(trou[0].genre, 'etape');
});

test('vol à vérifier, trajet sans durée ni mode, événement imposé sans heure, tâches en retard', () => {
  const vol = { id: 'v1', compagnie: '', numero: 'XX1', reference: '', depart: { code: 'AAA', ville: '', date: '2026-12-16', heure: '10:00', fuseau: 'Asia/Bangkok', terminal: '' }, arrivee: { code: 'BBB', ville: '', date: '2026-12-16', heure: '12:00', fuseau: 'Asia/Bangkok', terminal: '' }, portee: 'international', passagers: '', pourMoi: true, statut: 'a-verifier', notes: '' } as Vol;
  const trajet = { id: 't1', de: 'A', a: 'B', mode: '', date: '2026-12-17', heure: '', fuseau: 'Asia/Bangkok', dureeMin: null, dureeEstimee: false, prixMin: null, prixMax: null, devise: '', source: '', consulteLe: '', volId: '', lienVol: 'vers', logementId: '', notes: '' } as Trajet;
  const evt = { id: 'c1', jour: '2026-12-18', periode: '', debut: '', fin: '', fuseau: 'Asia/Bangkok', titre: 'Fête', note: '', statut: 'prevu', humeur: '', participants: [], budgetEstime: null, budgetReel: null, devise: '', dureeMin: null, planBDe: '', lieuId: '', fixe: true, typeEvenement: 'fete' } as Creneau;
  const tache = (id: string, echeance: string, fait = false) => ({ id, titre: id, liste: 'reste-a-faire', dateSouhaitee: '', echeance, fait, faitLe: '', note: '', lien: '' }) as Tache;
  const d: Donnees = { ...base(), vols: [vol], trajets: [trajet], creneaux: [evt], taches: [tache('a', '2026-11-01'), tache('b', '2026-11-01', true), tache('c', '2026-12-01')] };
  const r = elementsACompleter(d, [], '2026-11-11');
  assert.deepEqual(r.map((e) => e.cle), ['vol:v1', 'traj-duree:t1', 'traj-mode:t1', 'evt-heure:c1', 'taches-retard']);
  assert.match(r[4].message, /^1 tâche en retard/);
});

test('lieux : seulement ceux de tes envies ou liés à un créneau, avec ce qui reste à vérifier', () => {
  const lieu = { id: 'x', nom: 'Lieu X', horaires: null, prix: null, duree: null, reservation: null, gps: null } as unknown as Lieu;
  const sansManque = { ...lieu, id: 'y', nom: 'Lieu Y', horaires: {}, prix: {}, duree: {}, reservation: {}, gps: {} } as unknown as Lieu;
  const d: Donnees = { ...base(), suiviLieux: [{ lieuId: 'x', souhait: 'prioritaire', favori: false, fait: false, note: '' }, { lieuId: 'y', souhait: 'souhait', favori: false, fait: false, note: '' }] };
  const r = elementsACompleter(d, [lieu, sansManque], '2026-11-11');
  assert.deepEqual(r.map((e) => e.cle), ['lieu:x']);
  assert.match(r[0].message, /horaires, prix, durée, réservation, emplacement GPS/);
  const fait = { ...d, suiviLieux: [{ lieuId: 'x', souhait: 'prioritaire' as const, favori: false, fait: true, note: '' }] };
  assert.equal(elementsACompleter(fait, [lieu], '2026-11-11').length, 0);
});

test('profils, groupes et réglages : ce que seul l\'utilisateur peut saisir', () => {
  const vide: Donnees = { ...donneesVides(), etapes: [etape], logements: [logement()] };
  const cles = (x: Donnees) => elementsACompleter(x, [], '2026-11-11').map((e) => e.cle);
  // sans rien : taux de la devise du voyage, rythme et budget à régler
  assert.deepEqual(cles(vide), ['taux:THB', 'rythme', 'budget']);
  // deux personnes sans détail et sans groupe : profils et groupes à compléter
  const deux: Donnees = { ...base(), personnes: [personneVide('a', 'Un'), personneVide('b', 'Deux')] };
  assert.deepEqual(cles(deux), ['profils', 'groupes']);
  assert.match(elementsACompleter(deux, [], '2026-11-11')[0].message, /^2 profils sans âge ni contrainte/);
  // un profil renseigné et un groupe créé : plus rien
  const complet: Donnees = { ...deux, personnes: [{ ...personneVide('a', 'Un'), ageAns: 40 }, { ...personneVide('b', 'Deux'), confort: ['chaud'] }], groupes: [{ id: 'g', nom: 'Tous', personneIds: ['a', 'b'] }] };
  assert.deepEqual(cles(complet), []);
  // un rythme réglé ou un « à éviter » choisi suffit pour le rythme
  assert.ok(!cles({ ...vide, reglages: { ...vide.reglages, aEviter: ['foule'] } }).includes('rythme'));
});

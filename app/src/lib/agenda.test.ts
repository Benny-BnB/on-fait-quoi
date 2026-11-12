// Tests de l'export d'agenda (.ics). Données FICTIVES.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { donneesVides, personneVide } from '../data/defauts.ts';
import type { Creneau, Donnees, Etape, Lieu, Logement, Tache, Trajet, Vol } from '../data/types.ts';
import { CONTENU_PAR_DEFAUT, evenementsAgenda, type ContenuAgenda } from './agenda.ts';
import { construireIcs, declencheurAvant, echapperTexteIcs, formatInstantIcs, plierLigne, type OptionsIcs } from './ics.ts';

// XX100 : Bruxelles 08:00 -> Dubaï 17:30 le même jour = 07:00Z -> 13:30Z, vol international (3 h d'avance)
const vol = (extra: Partial<Vol> = {}): Vol => ({
  id: 'v1',
  compagnie: 'Compagnie fictive',
  numero: 'XX100',
  reference: 'ABC123',
  depart: { code: 'AAA', ville: 'Ville A', date: '2027-01-15', heure: '08:00', fuseau: 'Europe/Brussels', terminal: '1' },
  arrivee: { code: 'BBB', ville: 'Ville B', date: '2027-01-15', heure: '17:30', fuseau: 'Asia/Dubai', terminal: '' },
  portee: 'international',
  passagers: '',
  pourMoi: true,
  statut: 'confirme',
  notes: '',
  ...extra,
});

const creneau = (id: string, extra: Partial<Creneau> = {}): Creneau => ({
  id,
  jour: '2027-01-16',
  periode: '',
  debut: '10:00',
  fin: '11:30',
  fuseau: 'Asia/Bangkok',
  titre: `Activité ${id}`,
  note: '',
  statut: 'prevu',
  humeur: '',
  participants: [],
  budgetEstime: null,
  budgetReel: null,
  devise: '',
  dureeMin: null,
  planBDe: '',
  lieuId: '',
  fixe: false,
  typeEvenement: '',
  ...extra,
});

const etape: Etape = { id: 'e1', nom: 'Ville C', pays: 'Pays C', devise: 'THB', fuseau: 'Asia/Bangkok', debut: '2027-01-16', fin: '2027-01-20' };
const logement = (extra: Partial<Logement> = {}): Logement => ({
  id: 'l1',
  etapeId: 'e1',
  nom: 'Logement fictif',
  statut: 'confirme',
  lien: 'https://exemple.invalid/reservation?code=SECRET',
  adresse: '1 rue Fictive, Ville C',
  gps: null,
  arrivee: { date: '2027-01-16', heure: '15:00' },
  depart: { date: '2027-01-20', heure: '' },
  reference: 'REF999',
  notes: '',
  ...extra,
});

const tache = (extra: Partial<Tache> = {}): Tache => ({
  id: 't1',
  titre: 'Renouveler un document',
  liste: 'reste-a-faire',
  dateSouhaitee: '',
  echeance: '2027-01-10',
  fait: false,
  faitLe: '',
  note: '',
  lien: 'https://exemple.invalid/prive',
  ...extra,
});

const trajet = (extra: Partial<Trajet> = {}): Trajet => ({
  id: 'tr1',
  de: 'Lieu A',
  a: 'Lieu B',
  mode: 'taxi',
  date: '2027-01-17',
  heure: '09:00',
  fuseau: 'Asia/Bangkok',
  dureeMin: 45,
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
});

function donnees(partiel: Partial<Donnees> = {}): Donnees {
  return { ...donneesVides(), ...partiel };
}

const OPTIONS: OptionsIcs = {
  maintenantMs: Date.UTC(2027, 1, 1, 12, 0),
  rappelsDeplacementsMin: [1440, 180],
  rappelsAutresMin: [30],
  rappelTaches: true,
  nomCalendrier: 'Voyage fictif',
};

const sans = (extra: Partial<ContenuAgenda> = {}): ContenuAgenda => ({ ...CONTENU_PAR_DEFAUT, ...extra });

// Remet les lignes pliées bout à bout, comme le fait un agenda en lisant le fichier
const deplier = (ics: string): string[] => ics.replace(/\r\n /g, '').split('\r\n').filter((l) => l !== '');

test('un vol devient un seul événement, en UTC, avec la durée réelle', () => {
  const r = evenementsAgenda(donnees({ vols: [vol()] }), sans(), []);
  assert.equal(r.evenements.length, 1);
  const lignes = deplier(construireIcs(r.evenements, OPTIONS));
  assert.ok(lignes.includes('DTSTART:20270115T070000Z')); // 08:00 à Bruxelles en janvier
  assert.ok(lignes.includes('DTEND:20270115T133000Z')); // 17:30 à Dubaï (UTC+4)
  assert.ok(lignes.includes('SUMMARY:Vol XX100 · AAA → BBB'));
  const description = lignes.find((l) => l.startsWith('DESCRIPTION:')) ?? '';
  assert.match(description, /Décollage : 08:00\\, heure locale de Ville A/); // la virgule est protégée par une barre oblique
  assert.match(description, /Atterrissage : 17:30 le 15\/01\/2027\\, heure locale de Ville B/);
  assert.match(description, /Être à l'aéroport avant 05:00/); // 3 h avant 08:00
});

test("la référence de réservation et les liens ne sortent jamais dans l'agenda", () => {
  const d = donnees({ vols: [vol()], logements: [logement()], etapes: [etape], taches: [tache()] });
  const ics = construireIcs(evenementsAgenda(d, sans(), []).evenements, OPTIONS);
  for (const secret of ['ABC123', 'REF999', 'SECRET', 'exemple.invalid']) assert.ok(!ics.includes(secret), `« ${secret} » ne doit pas être dans le fichier`);
});

test("les vols d'autres personnes et les vols annulés sont écartés, sauf choix contraire", () => {
  const autre = vol({ id: 'v2', numero: 'XX200', pourMoi: false, passagers: 'Ami' });
  const annule = vol({ id: 'v3', numero: 'XX300', statut: 'annule' });
  const d = donnees({ vols: [vol(), autre, annule] });
  assert.deepEqual(evenementsAgenda(d, sans(), []).evenements.map((e) => e.uid), ['vol-v1']);
  const avec = evenementsAgenda(d, sans({ volsAutres: true }), []).evenements;
  assert.deepEqual(avec.map((e) => e.uid), ['vol-v1', 'vol-v2']);
  assert.match(avec[1].titre, /vol de Ami/);
});

test('les rappels : plusieurs avant un vol, aucun sur un événement « toute la journée »', () => {
  const d = donnees({ vols: [vol()], creneaux: [creneau('c1', { debut: '', fin: '', periode: 'matin' })] });
  const lignes = deplier(construireIcs(evenementsAgenda(d, sans(), []).evenements, OPTIONS));
  const premier = lignes.indexOf('BEGIN:VEVENT');
  const secondIdx = lignes.indexOf('BEGIN:VEVENT', premier + 1);
  const volLignes = lignes.slice(premier, secondIdx);
  assert.deepEqual(volLignes.filter((l) => l.startsWith('TRIGGER:')), ['TRIGGER:-P1D', 'TRIGGER:-PT3H']);
  assert.ok(volLignes.includes('ACTION:DISPLAY'));
  const journee = lignes.slice(secondIdx);
  assert.ok(journee.some((l) => l.startsWith('DTSTART;VALUE=DATE:20270116')));
  assert.equal(journee.filter((l) => l.startsWith('TRIGGER:')).length, 0);
});

test('un créneau avec heure est converti depuis son fuseau ; sans heure, il dure toute la journée (rien d\'inventé)', () => {
  const d = donnees({ creneaux: [creneau('c1'), creneau('c2', { debut: '', fin: '', periode: 'soir', titre: 'Dîner' })] });
  const e = evenementsAgenda(d, sans(), []).evenements;
  const lignes = deplier(construireIcs(e, OPTIONS));
  assert.ok(lignes.includes('DTSTART:20270116T030000Z')); // 10:00 à Bangkok (UTC+7)
  assert.ok(lignes.includes('DTEND:20270116T043000Z'));
  assert.ok(lignes.includes('SUMMARY:Soir · Dîner'));
  assert.ok(lignes.includes('DTSTART;VALUE=DATE:20270116'));
  assert.ok(lignes.includes('DTEND;VALUE=DATE:20270117')); // la fin d'un événement « toute la journée » est le lendemain
});

test("sans heure de fin, la durée connue est utilisée ; sinon l'événement n'a pas de fin", () => {
  const d = donnees({ creneaux: [creneau('c1', { fin: '', dureeMin: 90 }), creneau('c2', { fin: '' })] });
  const [a, b] = evenementsAgenda(d, sans(), []).evenements;
  assert.equal((a.finMs ?? 0) - (a.debutMs ?? 0), 90 * 60000);
  assert.equal(b.finMs, null);
  const brut = construireIcs([b], OPTIONS);
  assert.ok(!brut.includes('DTEND'));
});

test('plans B, créneaux annulés et idées ne partent pas (les idées seulement sur demande)', () => {
  const d = donnees({
    creneaux: [creneau('c1'), creneau('c2', { planBDe: 'c1' }), creneau('c3', { statut: 'annule' }), creneau('c4', { statut: 'idee' })],
  });
  assert.deepEqual(evenementsAgenda(d, sans(), []).evenements.map((e) => e.uid), ['creneau-c1']);
  assert.deepEqual(evenementsAgenda(d, sans({ idees: true }), []).evenements.map((e) => e.uid), ['creneau-c1', 'creneau-c4']);
});

test("participants et lieu d'une fiche sont repris", () => {
  const lieu = { id: 'lieu-1', nom: 'Lieu fictif', adresse: '2 avenue Fictive' } as Lieu;
  const d = donnees({ personnes: [personneVide('p1', 'Alex'), personneVide('p2', 'Charlie')], creneaux: [creneau('c1', { participants: ['p1', 'p2'], lieuId: 'lieu-1', note: 'Prendre de l\'eau' })] });
  const [e] = evenementsAgenda(d, sans(), [lieu]).evenements;
  assert.equal(e.lieu, 'Lieu fictif, 2 avenue Fictive');
  assert.ok(e.details.includes('Avec : Alex, Charlie'));
  assert.ok(e.details.includes("Prendre de l'eau"));
});

test('logements : arrivée avec heure en UTC, départ sans heure « toute la journée », logement à trouver écarté', () => {
  const d = donnees({ etapes: [etape], logements: [logement(), logement({ id: 'l2', statut: 'a-trouver' })] });
  const e = evenementsAgenda(d, sans(), []).evenements;
  assert.deepEqual(e.map((x) => x.uid), ['logement-l1-arrivee', 'logement-l1-depart']);
  assert.equal(e[0].debutMs, Date.UTC(2027, 0, 16, 8, 0)); // 15:00 à Bangkok
  assert.equal(e[0].lieu, '1 rue Fictive, Ville C');
  assert.equal(e[1].debutMs, null);
});

test('trajet : heure saisie et durée connue', () => {
  const d = donnees({ trajets: [trajet(), trajet({ id: 'tr2', date: '' })] });
  const r = evenementsAgenda(d, sans(), []);
  assert.equal(r.evenements.length, 1);
  assert.equal(r.evenements[0].debutMs, Date.UTC(2027, 0, 17, 2, 0)); // 09:00 à Bangkok
  assert.equal(r.evenements[0].finMs, Date.UTC(2027, 0, 17, 2, 45));
  assert.equal(r.ignores.length, 1, 'le trajet sans date est signalé, pas oublié en silence');
});

test('tâches : seulement celles non faites avec une échéance, rappel la veille à 9 h', () => {
  const d = donnees({ taches: [tache(), tache({ id: 't2', fait: true }), tache({ id: 't3', echeance: '' }), tache({ id: 't4', liste: 'a-emporter', titre: 'Adaptateur' })] });
  const r = evenementsAgenda(d, sans(), []);
  assert.deepEqual(r.evenements.map((e) => e.uid), ['tache-t4', 'tache-t1']); // même jour : rangées par titre
  const lignes = deplier(construireIcs(r.evenements, OPTIONS));
  assert.equal(lignes.filter((l) => l === 'TRIGGER:-PT15H').length, 2);
  assert.ok(lignes.includes('SUMMARY:À emporter : Adaptateur'));
  const sansRappel = deplier(construireIcs(r.evenements, { ...OPTIONS, rappelTaches: false }));
  assert.equal(sansRappel.filter((l) => l.startsWith('TRIGGER:')).length, 0);
});

test('choix du contenu et de la période', () => {
  const d = donnees({ vols: [vol()], creneaux: [creneau('c1'), creneau('c2', { jour: '2027-02-01' })], taches: [tache()] });
  assert.deepEqual(evenementsAgenda(d, sans({ vols: false, taches: false }), []).evenements.map((e) => e.uid), ['creneau-c1', 'creneau-c2']);
  assert.deepEqual(evenementsAgenda(d, sans({ du: '2027-01-16', au: '2027-01-31' }), []).evenements.map((e) => e.uid), ['creneau-c1']);
});

test('les événements sont rangés par jour puis par heure', () => {
  const d = donnees({ vols: [vol()], creneaux: [creneau('tard', { jour: '2027-01-15', debut: '22:00', fin: '', fuseau: 'Asia/Dubai' }), creneau('journee', { jour: '2027-01-15', debut: '', fin: '', periode: '' })] });
  assert.deepEqual(evenementsAgenda(d, sans(), []).evenements.map((e) => e.uid), ['creneau-journee', 'vol-v1', 'creneau-tard']);
});

test("l'identifiant d'un événement ne change pas d'un export à l'autre : réimporter met à jour sans dupliquer", () => {
  const e = evenementsAgenda(donnees({ vols: [vol()] }), sans(), []).evenements;
  const a = deplier(construireIcs(e, OPTIONS)).find((l) => l.startsWith('UID:'));
  const b = deplier(construireIcs(e, { ...OPTIONS, maintenantMs: OPTIONS.maintenantMs + 86400000 })).find((l) => l.startsWith('UID:'));
  assert.equal(a, 'UID:vol-v1@on-fait-quoi');
  assert.equal(a, b);
});

test('format du fichier : fins de ligne CRLF, début et fin, aucune ligne de plus de 75 octets', () => {
  const longue = creneau('c1', { titre: 'É'.repeat(80), note: 'Une longue note, avec des virgules; des points-virgules\net un retour à la ligne. '.repeat(5) });
  const ics = construireIcs(evenementsAgenda(donnees({ creneaux: [longue] }), sans(), []).evenements, OPTIONS);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'chaque saut de ligne est un CRLF');
  const encodeur = new TextEncoder();
  const decodeur = new TextDecoder('utf-8', { fatal: true });
  for (const ligne of ics.split('\r\n')) {
    assert.ok(encodeur.encode(ligne).length <= 75, `ligne trop longue : ${ligne.length} caractères`);
    decodeur.decode(encodeur.encode(ligne)); // jamais de caractère coupé en deux
  }
  // une fois dépliée, la description retrouve son contenu complet
  const resume = deplier(ics).find((l) => l.startsWith('SUMMARY:'));
  assert.equal(resume, `SUMMARY:${'É'.repeat(80)}`);
});

test("échappement des caractères spéciaux et pliage d'une ligne", () => {
  assert.equal(echapperTexteIcs('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const plies = plierLigne(`X:${'a'.repeat(200)}`);
  assert.ok(plies.length > 1);
  assert.equal(plies.map((l, i) => (i === 0 ? l : l.slice(1))).join(''), `X:${'a'.repeat(200)}`);
});

test('formats de date et de rappel', () => {
  assert.equal(formatInstantIcs(Date.UTC(2027, 11, 31, 23, 5, 9)), '20271231T230509Z');
  assert.equal(declencheurAvant(15), '-PT15M');
  assert.equal(declencheurAvant(180), '-PT3H');
  assert.equal(declencheurAvant(90), '-PT1H30M');
  assert.equal(declencheurAvant(1440), '-P1D');
  assert.equal(declencheurAvant(1500), '-P1DT1H');
});

test('un « toute la journée » le 31 décembre finit le 1er janvier', () => {
  const d = donnees({ creneaux: [creneau('c1', { jour: '2027-12-31', debut: '', fin: '', periode: '' })] });
  const lignes = deplier(construireIcs(evenementsAgenda(d, sans(), []).evenements, OPTIONS));
  assert.ok(lignes.includes('DTSTART;VALUE=DATE:20271231'));
  assert.ok(lignes.includes('DTEND;VALUE=DATE:20280101'));
});

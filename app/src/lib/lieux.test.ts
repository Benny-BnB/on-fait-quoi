import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { donneesVides } from '../data/defauts.ts';
import type { Donnees, Logement, Lieu, SuiviLieu, Trajet, Vol } from '../data/types.ts';
import { validerImport } from '../data/validation.ts';
import {
  aCategorie,
  alertesLieux,
  creneauDepuisLieu,
  fenetresVols,
  pointDeDepart,
  zonesProposees,
  correspondAuxMots,
  demandeVide,
  distanceKm,
  faitsAVerifier,
  filtrerLieux,
  formatDistance,
  fraicheurLieu,
  fusionnerLieux,
  jourSemaineDe,
  lieuxDeLaZone,
  mettreAJourSuivi,
  normaliserTexte,
  ouvertA,
  ouvertLe,
  validerFichierLieux,
} from './lieux.ts';
import { instantLocal } from './temps.ts';

const DOSSIER = new URL('../data/lieux/', import.meta.url);

function lireBase(): Lieu[] {
  const lieux: Lieu[] = [];
  for (const nom of readdirSync(DOSSIER).filter((n) => n.endsWith('.json'))) {
    const brut: unknown = JSON.parse(readFileSync(new URL(nom, DOSSIER), 'utf8'));
    const r = validerFichierLieux(brut);
    assert.equal(r.ok, true, `${nom} : ${r.ok ? '' : r.erreurs.join(' / ')}`);
    if (r.ok) lieux.push(...r.lieux);
  }
  return lieux;
}

const base = lireBase();
const lieu = (id: string): Lieu => {
  const l = base.find((x) => x.id === id);
  assert.ok(l, `lieu ${id} introuvable dans la base`);
  return l;
};

// ---------- La base publique elle-même ----------

test('la base publique est valide, sans doublon, et contient les lieux de Bangkok attendus', () => {
  const ids = base.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['bkk-grand-palace', 'bkk-wat-pho', 'bkk-wat-arun', 'bkk-supanniga-tha-tien', 'bkk-view-arun', 'bkk-yaowarat', 'bkk-khaosan', 'bkk-sky-bar-lebua', 'bkk-octave', 'bkk-vertigo-moon-bar']) {
    assert.ok(ids.includes(id), `${id} manque`);
  }
});

test('chaque fait de la base a un lien https, une date de consultation et un statut officiel/secondaire', () => {
  for (const l of base) {
    const sources = [l.gps?.source, l.incontournable?.source, l.duree?.source, l.prix?.source, l.horaires?.source, l.reservation?.source, l.tenue?.source, l.public?.source];
    for (const s of sources) {
      if (!s) continue;
      assert.match(s.lien, /^https:\/\//, `${l.nom} : lien de source`);
      assert.match(s.consulteLe, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof s.officielle, 'boolean');
    }
    assert.match(l.verifieLe, /^2026-11-1[12]$/, `${l.nom} : date de vérification`);
  }
});

test("la base publique ne contient aucun souhait ni note personnelle (le dépôt est public)", () => {
  const json = readdirSync(DOSSIER)
    .filter((n) => n.endsWith('.json'))
    .map((n) => readFileSync(new URL(n, DOSSIER), 'utf8'))
    .join('\n');
  assert.ok(!/"souhait"|"favori"|"prioritaire"/.test(json));
  assert.ok(!/"lieuId"/.test(json), 'pas de suivi personnel dans la base publique');
});

test("un prix de source secondaire n'est jamais présenté comme confirmé : seuls les prix officiels sont marqués vérifiés", () => {
  const officiels = base.filter((l) => l.prix?.source.officielle).map((l) => l.id);
  assert.deepEqual(officiels, ['bkk-grand-palace', 'dxb-miracle-garden', 'dxb-safari-park', 'dxb-dubai-frame', 'dxb-burj-khalifa', 'dxb-legoland']);
  // un guide, un blog ou un revendeur n'est jamais déclaré officiel
  for (const l of base) if (l.prix?.source.officielle) assert.ok(!/guide|blog|revendeur/i.test(l.prix.source.libelle), `${l.nom} : source du prix`);
});

// ---------- Base de Dubaï (étape 9) ----------

test('Dubaï : les fiches lues sont là, et ce qui n\'a pas pu être lu reste « à vérifier » (aucun prix ni horaire inventé)', () => {
  const dubai = base.filter((l) => l.zone === 'Dubaï');
  assert.equal(dubai.length, 10);
  for (const id of ['dxb-miracle-garden', 'dxb-global-village', 'dxb-safari-park', 'dxb-dubai-frame', 'dxb-expo-city', 'dxb-burj-khalifa', 'dxb-aquarium', 'dxb-fountain', 'dxb-museum-future', 'dxb-legoland']) {
    assert.ok(dubai.some((l) => l.id === id), `${id} manque`);
  }
  // sites officiels refusés (403) ou sans chiffres : rien n'est retenu
  assert.equal(lieu('dxb-aquarium').prix, null);
  assert.equal(lieu('dxb-aquarium').horaires, null);
  assert.equal(lieu('dxb-expo-city').prix, null);
  assert.equal(lieu('dxb-fountain').horaires, null);
  // Global Village : la page n'écrit pas la devise, donc pas de prix
  assert.equal(lieu('dxb-global-village').prix, null);
  assert.ok(faitsAVerifier(lieu('dxb-global-village')).includes('prix'));
});

test('Dubaï : le Museum of the Future est fermé à la fin de 2026 (site officiel), les autres lieux restent ouverts', () => {
  const musee = lieu('dxb-museum-future');
  assert.equal(ouvertLe(musee, '2026-11-26').etat, 'non');
  assert.match(ouvertLe(musee, '2026-11-26').detail, /réouverture annoncée en 2027/);
  assert.equal(ouvertA(lieu('dxb-miracle-garden'), '2026-11-26', '10:00').etat, 'oui');
  assert.equal(ouvertA(lieu('dxb-miracle-garden'), '2026-11-26', '21:30').etat, 'non');
  assert.equal(ouvertA(lieu('dxb-safari-park'), '2026-11-26', '16:30').etat, 'oui');
  // dernière entrée à 17:00 (site officiel) : à 17:30 le parc est encore ouvert mais on n'y entre plus
  assert.equal(ouvertA(lieu('dxb-safari-park'), '2026-11-26', '17:30').etat, 'non');
  assert.equal(ouvertA(lieu('dxb-safari-park'), '2026-11-26', '18:30').etat, 'non');
});

test('Dubaï : Global Village ferme à 01:00 du jeudi au samedi et à minuit les autres jours', () => {
  const gv = lieu('dxb-global-village');
  // 26/11/2026 = jeudi, 24/11/2026 = mardi
  assert.equal(jourSemaineDe('2026-11-26'), 'jeudi');
  assert.equal(ouvertA(gv, '2026-11-26', '00:30').etat, 'non', 'avant 16:00 : fermé (la plage de la veille est suivie à part)');
  assert.equal(ouvertA(gv, '2026-11-26', '23:30').etat, 'oui');
  assert.equal(ouvertA(gv, '2026-11-24', '23:30').etat, 'oui');
  assert.equal(ouvertA(gv, '2026-11-24', '15:00').etat, 'non');
  assert.match(gv.horaires?.note ?? '', /mardi est réservé aux dames et aux familles/);
});

// ---------- Base de Krabi et Railay (étape 10) ----------

test("Krabi et Railay : 9 fiches, Railay à part ; aucune source officielle lue (pages du tourisme thaïlandais refusées), donc rien n'est présenté comme vérifié", () => {
  const krabi = base.filter((l) => l.id.startsWith('krb-'));
  assert.equal(krabi.length, 9);
  assert.deepEqual(krabi.filter((l) => l.zone === 'Railay').map((l) => l.id), ['krb-railay-beach', 'krb-phra-nang-beach', 'krb-railay-lagoon-viewpoint']);
  assert.equal(krabi.filter((l) => l.zone === 'Krabi').length, 6);
  for (const l of krabi) {
    assert.equal(l.lienOfficiel, '', `${l.nom} : aucun site officiel lu`);
    for (const s of [l.duree?.source, l.prix?.source, l.horaires?.source, l.public?.source, l.tenue?.source]) if (s) assert.equal(s.officielle, false, `${l.nom} : source secondaire`);
  }
  // « Krabi (étape) » ne ramène pas les lieux de Railay, et inversement
  assert.equal(lieuxDeLaZone(base, 'Krabi').length, 6);
  assert.equal(lieuxDeLaZone(base, 'Railay Beach').length, 3);
});

test("Tiger Cave Temple : entrée gratuite, 06:00-18:00, chaleur signalée ; on n'y monte pas à midi sans le savoir", () => {
  const l = lieu('krb-tiger-cave-temple');
  assert.equal(l.prix?.min, 0);
  assert.equal(l.prix?.source.officielle, false);
  assert.equal(ouvertA(l, '2027-03-10', '07:00').etat, 'oui');
  assert.equal(ouvertA(l, '2027-03-10', '18:30').etat, 'non');
  assert.ok(l.attention.some((a) => a.genre === 'chaleur' && /à midi/.test(a.texte)));
  assert.match(l.tenue?.texte ?? '', /Épaules et genoux couverts/);
  assert.match(l.description, /1 260 marches/);
});

test('Sa Morakot et les îles Hong : droits d\'entrée lus chez un guide (adulte et enfant), les horaires divergents sont dits', () => {
  const e = lieu('krb-sa-morakot');
  assert.equal(e.prix?.min, 400);
  assert.match(e.prix?.note ?? '', /enfant étranger : 200 THB/);
  assert.match(e.horaires?.note ?? '', /16:30/);
  assert.equal(e.gps?.lat, 7.92424);
  const h = lieu('krb-hong-islands');
  assert.equal(h.prix?.min, 300);
  assert.match(h.prix?.note ?? '', /enfant étranger 150 THB/);
  assert.match(h.prix?.note ?? '', /Le bateau est en plus/);
  assert.equal(ouvertA(h, '2027-03-10', '16:45').etat, 'non');
});

test("Railay : accès en bateau seulement, dit dans la fiche ; ce que la source ne dit pas (durée, tarif, position du point de vue) reste « à vérifier »", () => {
  const r = lieu('krb-railay-beach');
  assert.deepEqual(r.acces[0].modes, ['bateau']);
  assert.match(r.acces[0].texte, /Longtail uniquement/);
  assert.match(r.acces[0].texte, /s'arrêtent vers le coucher du soleil/);
  assert.equal(r.prix, null);
  assert.ok(faitsAVerifier(r).includes('prix'));
  const point = lieu('krb-railay-lagoon-viewpoint');
  assert.equal(point.gps, null);
  assert.ok(faitsAVerifier(point).includes('emplacement GPS') && faitsAVerifier(point).includes('durée'));
  // le cimetière de coquillages : la même page se contredit sur le prix, donc aucun prix
  const coquillages = lieu('krb-shell-cemetery');
  assert.equal(coquillages.prix, null);
  assert.match(coquillages.horaires?.note ?? '', /prix non retenu/);
});

test('les tarifs par âge de Dubaï viennent de la page : enfant de 3 à 12 ans, gratuit avant 3 ans', () => {
  const mg = lieu('dxb-miracle-garden').prix;
  assert.deepEqual(mg?.tarifs, [{ libelle: 'Enfant de 3 à 12 ans', ageMin: 3, ageMax: 12, min: 84, max: 84 }]);
  assert.equal(mg?.min, 105);
  const frame = lieu('dxb-dubai-frame').prix;
  assert.equal(frame?.min, 50);
  assert.equal(frame?.tarifs?.length, 2);
});

test("les faits non lus restent « à vérifier » : Supanniga Tha Tien n'a ni horaire, ni prix, ni GPS inventés", () => {
  const s = lieu('bkk-supanniga-tha-tien');
  assert.equal(s.horaires, null);
  assert.equal(s.prix, null);
  assert.equal(s.gps, null);
  assert.deepEqual(faitsAVerifier(s), ['horaires', 'prix', 'durée', 'emplacement GPS']);
  assert.equal(lieu('bkk-wat-pho').horaires, null, 'Wat Pho : sources en désaccord, donc pas d\'horaire');
  assert.equal(lieu('bkk-octave').horaires, null, 'Octave : fermeture en désaccord, donc pas d\'horaire');
});

// ---------- Validation stricte ----------

const source = { lien: 'https://exemple.test/page', libelle: 'Exemple', consulteLe: '2026-11-11', officielle: true };
const brutValide = (): Record<string, unknown> => ({
  id: 'test-1',
  nom: 'Lieu test',
  zone: 'Bangkok',
  fuseau: 'Asia/Bangkok',
  categories: ['culture'],
});
const fichier = (...lieux: unknown[]) => ({ format: 'on-fait-quoi-lieux', version: 1, lieux });

test('une fiche minimale valide est acceptée, tout le reste vaut « à vérifier »', () => {
  const r = validerFichierLieux(fichier(brutValide()));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.lieux[0].prix, null);
    assert.equal(r.lieux[0].horaires, null);
    assert.equal(r.lieux[0].gps, null);
    assert.equal(r.lieux[0].incontournable, null);
  }
});

function refuse(brut: Record<string, unknown>, extrait: RegExp): void {
  const r = validerFichierLieux(fichier(brut));
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.erreurs.some((e) => extrait.test(e)), r.erreurs.join(' / '));
}

test('un prix sans source, une source sans date ou sans statut, un lien dangereux sont refusés', () => {
  refuse({ ...brutValide(), prix: { min: 10, max: 20, devise: 'THB', note: '' } }, /source est obligatoire/);
  refuse({ ...brutValide(), prix: { min: 10, max: 20, devise: 'THB', note: '', source: { ...source, consulteLe: '' } } }, /date de consultation/);
  refuse({ ...brutValide(), prix: { min: 10, max: 20, devise: 'THB', note: '', source: { ...source, officielle: 'oui' } } }, /officielle/);
  refuse({ ...brutValide(), prix: { min: 10, max: 20, devise: 'THB', note: '', source: { ...source, lien: 'javascript:alert(1)' } } }, /https/);
  refuse({ ...brutValide(), lienOfficiel: 'javascript:alert(1)' }, /lien officiel/);
});

test('catégorie, fuseau, durée, prix, GPS, identifiant : les valeurs absurdes sont refusées', () => {
  refuse({ ...brutValide(), categories: ['n-importe-quoi'] }, /catégorie inconnue/);
  refuse({ ...brutValide(), categories: [] }, /au moins une catégorie/);
  refuse({ ...brutValide(), fuseau: 'Mars/Olympus' }, /fuseau/);
  refuse({ ...brutValide(), duree: { minMin: 90, maxMin: 30, estimee: false, base: '', source } }, /minimum dépasse/);
  refuse({ ...brutValide(), duree: { minMin: 30, maxMin: 90, estimee: true, base: '', source } }, /base du calcul/);
  refuse({ ...brutValide(), prix: { min: 30, max: 10, devise: 'THB', note: '', source } }, /minimum dépasse/);
  refuse({ ...brutValide(), prix: { min: 10, max: 30, devise: 'baht', note: '', source } }, /devise/);
  refuse({ ...brutValide(), prix: { min: -5, max: 30, devise: 'THB', note: '', source } }, /entre 0 et/);
  refuse({ ...brutValide(), gps: { lat: 200, lng: 0, source } }, /GPS/);
  refuse({ ...brutValide(), id: '' }, /identifiant manquant/);
  refuse({ ...brutValide(), interieur: 'dedans' }, /interieur/);
});

test('deux fiches de même identifiant sont refusées', () => {
  const r = validerFichierLieux(fichier(brutValide(), brutValide()));
  assert.equal(r.ok, false);
});

test('horaires : jour inconnu, plage inversée à zéro, dernière entrée invalide, fermeture sans motif sont refusés', () => {
  const h = (extra: Record<string, unknown>) => ({ nature: 'ouverture', jours: { lundi: [{ ouvre: '09:00', ferme: '18:00' }] }, source, ...extra });
  refuse({ ...brutValide(), horaires: h({ jours: { lundy: 'ferme' } }) }, /jour inconnu/);
  refuse({ ...brutValide(), horaires: h({ jours: { lundi: [{ ouvre: '09:00', ferme: '09:00' }] } }) }, /plage invalide/);
  refuse({ ...brutValide(), horaires: h({ jours: { lundi: [{ ouvre: '9h', ferme: '18:00' }] } }) }, /plage invalide/);
  refuse({ ...brutValide(), horaires: h({ derniereEntree: '25:00' }) }, /dernière entrée/);
  refuse({ ...brutValide(), horaires: h({ fermetures: [{ du: '2026-12-01', au: '2026-12-02', motif: '' }] }) }, /fermeture invalide/);
  refuse({ ...brutValide(), horaires: h({ nature: 'parfois' }) }, /nature/);
});

test("un fichier d'un autre format ou d'une version plus récente est refusé", () => {
  assert.equal(validerFichierLieux({ format: 'autre', version: 1, lieux: [] }).ok, false);
  assert.equal(validerFichierLieux({ format: 'on-fait-quoi-lieux', version: 99, lieux: [] }).ok, false);
  assert.equal(validerFichierLieux(null).ok, false);
});

// ---------- Import / export des lieux de l'utilisateur ----------

test("l'import accepte lieuxPerso, suiviLieux et lieuId sur un créneau ; un suivi en double est refusé", () => {
  const creneau = { id: 'c1', jour: '2026-12-20', periode: 'soir', fuseau: 'Asia/Bangkok', titre: 'Dîner', lieuId: 'bkk-view-arun' };
  const ok = validerImport({
    format: 'on-fait-quoi',
    version: 1,
    creneaux: [creneau],
    lieuxPerso: [brutValide()],
    suiviLieux: [{ lieuId: 'bkk-view-arun', souhait: 'prioritaire', note: 'note' }],
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.donnees.creneaux?.[0].lieuId, 'bkk-view-arun');
    assert.equal(ok.donnees.lieuxPerso?.length, 1);
    assert.deepEqual(ok.donnees.suiviLieux, [{ lieuId: 'bkk-view-arun', souhait: 'prioritaire', favori: false, fait: false, note: 'note' }]);
    assert.equal(ok.avertissements.length, 0);
  }
  const doublon = validerImport({ format: 'on-fait-quoi', version: 1, suiviLieux: [{ lieuId: 'a' }, { lieuId: 'a' }] });
  assert.equal(doublon.ok, false);
  const mauvais = validerImport({ format: 'on-fait-quoi', version: 1, suiviLieux: [{ lieuId: 'a', souhait: 'urgent' }] });
  assert.equal(mauvais.ok, false);
  const sansSource = validerImport({ format: 'on-fait-quoi', version: 1, lieuxPerso: [{ ...brutValide(), prix: { min: 1, max: 2, devise: 'THB', note: '' } }] });
  assert.equal(sansSource.ok, false);
});

test("un créneau d'un ancien fichier (sans lieuId) reste valide : aucune fiche liée", () => {
  const r = validerImport({ format: 'on-fait-quoi', version: 1, creneaux: [{ id: 'c1', jour: '2026-12-20', fuseau: 'Asia/Bangkok', titre: 'Balade' }] });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.donnees.creneaux?.[0].lieuId, '');
});

// ---------- Suivi personnel ----------

test('suivi : ajout, modification, et disparition quand il ne reste rien à garder', () => {
  let suivis: SuiviLieu[] = [];
  suivis = mettreAJourSuivi(suivis, 'a', { souhait: 'prioritaire' });
  assert.deepEqual(suivis, [{ lieuId: 'a', souhait: 'prioritaire', favori: false, fait: false, note: '' }]);
  suivis = mettreAJourSuivi(suivis, 'a', { favori: true, note: 'vers 17:00' });
  assert.equal(suivis.length, 1);
  assert.equal(suivis[0].souhait, 'prioritaire');
  assert.equal(suivis[0].favori, true);
  suivis = mettreAJourSuivi(suivis, 'b', { fait: true });
  assert.equal(suivis.length, 2);
  suivis = mettreAJourSuivi(mettreAJourSuivi(suivis, 'a', { souhait: '', favori: false }), 'a', { note: '   ' });
  assert.deepEqual(suivis.map((s) => s.lieuId), ['b']);
});

test('un lieu ajouté remplace la fiche publique de même identifiant', () => {
  const perso = { ...lieu('bkk-wat-pho'), nom: 'Ma version' };
  const fusion = fusionnerLieux(base, [perso]);
  assert.equal(fusion.length, base.length);
  assert.equal(fusion.find((l) => l.id === 'bkk-wat-pho')?.nom, 'Ma version');
});

// ---------- Recherche par mots-clés ----------

test('recherche : sans accents ni majuscules, tous les mots doivent correspondre', () => {
  assert.equal(normaliserTexte('Épaules Été'), 'epaules ete');
  assert.ok(correspondAuxMots(lieu('bkk-view-arun'), 'VUE wat arun'));
  assert.ok(!correspondAuxMots(lieu('bkk-view-arun'), 'grand palace'));
  assert.ok(correspondAuxMots(lieu('bkk-chatuchak'), 'chat'), 'début de mot');
  assert.ok(!correspondAuxMots(lieu('bkk-chatuchak'), 'ata'), 'pas au milieu d\'un mot');
  assert.ok(correspondAuxMots(lieu('bkk-yaowarat'), 'chinatown néons'));
  assert.ok(correspondAuxMots(lieu('bkk-chatuchak'), 'marches'), 'la catégorie compte dans la recherche');
  assert.ok(correspondAuxMots(lieu('bkk-chatuchak'), ''), 'recherche vide = tout');
});

test('catégories : « incontournables » = cité par un guide nommé', () => {
  assert.ok(aCategorie(lieu('bkk-wat-arun'), 'incontournables'));
  assert.ok(!aCategorie(lieu('bkk-yaowarat'), 'incontournables'));
  assert.ok(aCategorie(lieu('bkk-yaowarat'), 'nourriture'));
});

test("les lieux d'une étape : « Bangkok (centre) » ramène les lieux de Bangkok, « Pattaya » ceux de Pattaya, une ville sans fiche aucun", () => {
  const bangkok = base.filter((l) => l.zone === 'Bangkok');
  const pattaya = base.filter((l) => l.zone === 'Pattaya');
  assert.ok(bangkok.length === 13 && pattaya.length > 0);
  assert.deepEqual(lieuxDeLaZone(base, 'Bangkok (centre)').map((l) => l.id), bangkok.map((l) => l.id));
  assert.deepEqual(lieuxDeLaZone(base, 'Pattaya').map((l) => l.id), pattaya.map((l) => l.id));
  assert.equal(lieuxDeLaZone(base, 'Ville sans fiche').length, 0);
  assert.equal(lieuxDeLaZone(base, '').length, base.length);
});

// ---------- Distance ----------

test('distance à vol d\'oiseau : Wat Pho – Wat Arun environ 530 m, formats lisibles', () => {
  const d = distanceKm(lieu('bkk-wat-pho').gps!, lieu('bkk-wat-arun').gps!);
  assert.ok(d > 0.5 && d < 0.56, String(d));
  assert.equal(formatDistance(0.5313), '500 m');
  assert.equal(formatDistance(6.876), '6,9 km');
  assert.equal(distanceKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 }), 0);
});

// ---------- Ouverture ----------

// 2026-12-14 = lundi, 2026-12-16 = mercredi, 2026-12-18 = vendredi, 2026-12-19 = samedi
test('jour de la semaine à partir de la date', () => {
  assert.equal(jourSemaineDe('2026-12-14'), 'lundi');
  assert.equal(jourSemaineDe('2026-12-20'), 'dimanche');
  assert.equal(jourSemaineDe('2027-03-01'), 'lundi');
});

test("Grand Palace : ouvert à 10:00, plus de billet après 15:30, fermé à 17:00 ; réponse officielle", () => {
  const gp = lieu('bkk-grand-palace');
  assert.deepEqual([ouvertA(gp, '2026-12-14', '10:00').etat, ouvertA(gp, '2026-12-14', '10:00').officielle], ['oui', true]);
  assert.equal(ouvertA(gp, '2026-12-14', '15:45').etat, 'non');
  assert.match(ouvertA(gp, '2026-12-14', '15:45').detail, /Dernière entrée à 15:30/);
  assert.equal(ouvertA(gp, '2026-12-14', '17:00').etat, 'non');
  assert.equal(ouvertA(gp, '2026-12-14', '08:00').etat, 'non');
});

test("Wat Arun : ouvert, mais la réponse repose sur un guide (non officielle) ; sans horaire = à vérifier", () => {
  const o = ouvertA(lieu('bkk-wat-arun'), '2026-12-14', '09:00');
  assert.deepEqual([o.etat, o.officielle], ['oui', false]);
  assert.equal(ouvertA(lieu('bkk-wat-pho'), '2026-12-14', '09:00').etat, 'a-verifier');
  assert.equal(ouvertLe(lieu('bkk-octave'), '2026-12-14').etat, 'a-verifier');
});

test('horaire après minuit : Khaosan Road ouvert mardi à 01:00 (suite du lundi), pas mardi à 04:00', () => {
  const k = lieu('bkk-khaosan');
  assert.equal(ouvertA(k, '2026-12-15', '01:00').etat, 'oui');
  assert.equal(ouvertA(k, '2026-12-14', '16:00').etat, 'oui');
  assert.equal(ouvertA(k, '2026-12-15', '04:00').etat, 'a-verifier', 'lieu "animation" : jamais "fermé" hors des heures animées');
});

test('Chatuchak : fermé lundi, jours de semaine intermédiaires à vérifier, vendredi soir et week-end ouverts', () => {
  const c = lieu('bkk-chatuchak');
  assert.equal(ouvertA(c, '2026-12-14', '11:00').etat, 'non');
  assert.equal(ouvertA(c, '2026-12-16', '11:00').etat, 'a-verifier');
  assert.equal(ouvertA(c, '2026-12-18', '19:00').etat, 'oui');
  assert.equal(ouvertA(c, '2026-12-18', '11:00').etat, 'non');
  assert.equal(ouvertA(c, '2026-12-19', '11:00').etat, 'oui');
  assert.equal(ouvertA(c, '2026-12-19', '08:30').etat, 'non');
  assert.equal(ouvertLe(c, '2026-12-14').etat, 'non');
  assert.equal(ouvertLe(c, '2026-12-19').etat, 'oui');
});

test("une fermeture exceptionnelle (dates précises) l'emporte sur les horaires habituels", () => {
  const l: Lieu = { ...lieu('bkk-grand-palace'), horaires: { ...lieu('bkk-grand-palace').horaires!, fermetures: [{ du: '2026-12-14', au: '2026-12-15', motif: 'cérémonie' }] } };
  assert.equal(ouvertA(l, '2026-12-14', '10:00').etat, 'non');
  assert.equal(ouvertLe(l, '2026-12-15').etat, 'non');
  assert.equal(ouvertA(l, '2026-12-16', '10:00').etat, 'oui');
});

// ---------- Fraîcheur ----------

test('fraîcheur de la fiche', () => {
  const l = lieu('bkk-wat-arun');
  assert.equal(fraicheurLieu(l, '2026-11-11'), "Vérifié aujourd'hui");
  assert.equal(fraicheurLieu(l, '2026-11-12'), 'Vérifié hier');
  assert.equal(fraicheurLieu(l, '2026-12-11'), 'Vérifié il y a 30 jours');
  assert.equal(fraicheurLieu({ ...l, verifieLe: '' }, '2026-11-11'), 'À vérifier');
});

// ---------- « Quoi faire, quand ? » ----------

const suivis: SuiviLieu[] = [{ lieuId: 'bkk-view-arun', souhait: 'prioritaire', favori: false, fait: false, note: '' }];

test('demande vide : tout Bangkok, les lieux souhaités en premier, jamais de filtre caché', () => {
  const r = filtrerLieux(base, demandeVide(), suivis, []);
  assert.equal(r.length, base.length);
  assert.equal(r[0].lieu.id, 'bkk-view-arun');
  assert.equal(r[0].souhait, 'prioritaire');
});

test("filtre par catégorie, mots-clés, budget et durée ; les lieux sans prix ou sans durée connus ne sont pas écartés à tort", () => {
  const nourriture = filtrerLieux(base, { ...demandeVide(), categories: ['nourriture'] }, [], []).map((p) => p.lieu.id);
  assert.ok(nourriture.includes('bkk-view-arun') && nourriture.includes('bkk-yaowarat') && !nourriture.includes('bkk-wat-arun'));
  const mots = filtrerLieux(base, { ...demandeVide(), mots: 'vue wat arun' }, [], []).map((p) => p.lieu.id);
  assert.deepEqual(mots, ['bkk-view-arun']);
  const budget = filtrerLieux(base, { ...demandeVide(), budgetMax: 250 }, [], []).map((p) => p.lieu.id);
  assert.ok(!budget.includes('bkk-grand-palace') && !budget.includes('bkk-wat-pho'));
  assert.ok(budget.includes('bkk-wat-arun') && budget.includes('bkk-view-arun'), 'prix inconnu = gardé, signalé à vérifier');
  const court = filtrerLieux(base, { ...demandeVide(), dureeMax: 30 }, [], []).map((p) => p.lieu.id);
  assert.ok(!court.includes('bkk-wat-arun'));
  assert.ok(court.includes('bkk-view-arun'));
});

test('jour et heure : un lieu fermé est signalé (ou masqué si demandé), le reste est trié ouvert d\'abord', () => {
  const lundiMatin = { ...demandeVide(), jour: '2026-12-14', debut: '10:00' };
  const tout = filtrerLieux(base, lundiMatin, [], []);
  const chatuchak = tout.find((p) => p.lieu.id === 'bkk-chatuchak')!;
  assert.equal(chatuchak.ouvert.etat, 'non');
  assert.ok(chatuchak.avertissements.some((a) => /Fermé à ce moment/.test(a)));
  assert.equal(tout.find((p) => p.lieu.id === 'bkk-grand-palace')!.ouvert.etat, 'oui');
  const ordre = tout.map((p) => p.ouvert.etat);
  assert.deepEqual(ordre, [...ordre].sort((a, b) => ({ oui: 0, 'a-verifier': 1, non: 2 })[a] - ({ oui: 0, 'a-verifier': 1, non: 2 })[b]));
  const ouverts = filtrerLieux(base, { ...lundiMatin, seulementOuverts: true }, [], []).map((p) => p.lieu.id);
  assert.ok(!ouverts.includes('bkk-chatuchak') && ouverts.includes('bkk-grand-palace') && ouverts.includes('bkk-octave'), 'à vérifier = gardé');
});

test('la période sert à vérifier l\'ouverture quand il n\'y a pas d\'heure précise', () => {
  const soir = filtrerLieux(base, { ...demandeVide(), jour: '2026-12-14', periode: 'soir' }, [], []);
  assert.equal(soir.find((p) => p.lieu.id === 'bkk-grand-palace')!.ouvert.etat, 'non'); // 19:00 : fermé
  assert.equal(soir.find((p) => p.lieu.id === 'bkk-khaosan')!.ouvert.etat, 'oui');
});

test("jamais de proposition qui empêche d'attraper un vol", () => {
  // Vol qui décolle le 14/12/2026 à 14:00 heure de Bangkok ; arrivée à l'aéroport conseillée 3 h avant
  const decollageMs = instantLocal('2026-12-14', '14:00', 'Asia/Bangkok');
  const vol = { numero: 'XX1', debutMs: decollageMs - 3 * 3600000, finMs: decollageMs + 2 * 3600000 };
  const demande = { ...demandeVide(), jour: '2026-12-14', debut: '09:30' };
  // Grand Palace : durée inconnue → on prend seulement l'heure de début ; Wat Arun dure jusqu'à 2 h → 11:30, dans la fenêtre [11:00, 14:00]
  const ids = filtrerLieux(base, demande, [], [vol]).map((p) => p.lieu.id);
  assert.ok(!ids.includes('bkk-wat-arun'), 'Wat Arun (09:30 + 2 h) empiète sur la fenêtre de l\'aéroport');
  assert.ok(ids.includes('bkk-grand-palace'));
  const apres = filtrerLieux(base, { ...demande, debut: '17:00' }, [], [vol]).map((p) => p.lieu.id);
  assert.ok(apres.includes('bkk-wat-arun'), "après l'atterrissage, plus de conflit");
});

test('tri par distance depuis le logement : le plus proche d\'abord, les lieux sans GPS à la fin', () => {
  const depuis = lieu('bkk-wat-pho').gps!;
  const r = filtrerLieux(base, { ...demandeVide(), depuis, tri: 'distance' }, [], []);
  assert.deepEqual(r.slice(0, 4).map((p) => p.lieu.id), ['bkk-wat-pho', 'bkk-view-arun', 'bkk-grand-palace', 'bkk-wat-arun']);
  assert.equal(r[r.length - 1].distanceKm, null);
  assert.equal(r[r.length - 1].lieu.id, 'bkk-supanniga-tha-tien');
});

test('tri par prix : le moins cher d\'abord, prix inconnu à la fin', () => {
  const r = filtrerLieux(base, { ...demandeVide(), tri: 'prix' }, [], []);
  assert.equal(r[0].lieu.prix?.min, 0);
  assert.equal(r[r.length - 1].lieu.prix, null);
});

// ---------- Liens avec le planning ----------

const volBkk = (extra: Partial<Vol> = {}): Vol => ({
  id: 'v1',
  compagnie: '',
  numero: 'XX100',
  reference: '',
  depart: { code: 'BKK', ville: '', date: '2026-12-20', heure: '14:00', fuseau: 'Asia/Bangkok', terminal: '' },
  arrivee: { code: 'DXB', ville: '', date: '2026-12-20', heure: '18:00', fuseau: 'Asia/Dubai', terminal: '' },
  portee: 'international',
  passagers: '',
  pourMoi: true,
  statut: 'confirme',
  notes: '',
  ...extra,
});

const trajetVersAeroport: Trajet = {
  id: 't1',
  de: 'Hôtel',
  a: 'Aéroport',
  mode: '',
  date: '2026-12-20',
  heure: '',
  fuseau: 'Asia/Bangkok',
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

const logementTest = (extra: Partial<Logement> = {}): Logement => ({
  id: 'l1',
  etapeId: 'e1',
  nom: 'Hôtel test',
  statut: 'reserve',
  lien: '',
  adresse: '',
  gps: { lat: 13.75, lng: 100.49 },
  arrivee: { date: '2026-12-16', heure: '' },
  depart: { date: '2026-12-20', heure: '' },
  reference: '',
  notes: '',
  ...extra,
});

test('fenêtre de vol : du trajet vers l\'aéroport (3 h + 1 h avant) à l\'atterrissage ; un vol annulé ou des autres ne bloque rien', () => {
  const d: Donnees = { ...donneesVides(), vols: [volBkk()], trajets: [trajetVersAeroport] };
  const [f] = fenetresVols(d);
  const decollage = instantLocal('2026-12-20', '14:00', 'Asia/Bangkok');
  assert.equal(f.debutMs, decollage - 4 * 3600000);
  assert.equal(f.finMs, instantLocal('2026-12-20', '18:00', 'Asia/Dubai'));
  assert.equal(fenetresVols({ ...d, trajets: [] })[0].debutMs, decollage - 3 * 3600000);
  assert.equal(fenetresVols({ ...d, vols: [volBkk({ statut: 'annule' })] }).length, 0);
  assert.equal(fenetresVols({ ...d, vols: [volBkk({ pourMoi: false })] }).length, 0);
});

test('point de départ : le logement où l\'on dort, avec ses coordonnées ; rien sans coordonnées', () => {
  const d: Donnees = { ...donneesVides(), logements: [logementTest()] };
  assert.equal(pointDeDepart(d, '2026-12-18')?.nom, 'Hôtel test');
  assert.equal(pointDeDepart(d, '2026-12-20')?.nom, 'Hôtel test', 'le jour du départ, on est encore là le matin');
  assert.equal(pointDeDepart(d, '2026-12-25'), null);
  assert.equal(pointDeDepart({ ...d, logements: [logementTest({ gps: null })] }, '2026-12-18'), null);
  const deux = { ...d, logements: [logementTest({ id: 'a', nom: 'Avant', depart: { date: '2026-12-18', heure: '' } }), logementTest({ id: 'b', nom: 'Après', arrivee: { date: '2026-12-18', heure: '' } })] };
  assert.equal(pointDeDepart(deux, '2026-12-18')?.nom, 'Après', 'le soir du changement, on dort dans le nouveau logement');
});

test('créneau depuis une fiche : statut idée, fuseau du lieu, durée de la fiche, aucun budget inventé', () => {
  const c = creneauDepuisLieu(lieu('bkk-wat-arun'), 'c1', '2027-03-10', 'matin', '', 'THB');
  assert.equal(c.titre, 'Wat Arun');
  assert.equal(c.lieuId, 'bkk-wat-arun');
  assert.equal(c.statut, 'idee');
  assert.equal(c.fuseau, 'Asia/Bangkok');
  assert.equal(c.dureeMin, 120);
  assert.equal(c.budgetEstime, null);
  assert.equal(c.devise, 'THB');
  const avecHeure = creneauDepuisLieu(lieu('bkk-wat-arun'), 'c2', '2027-03-10', '', '09:00', 'THB');
  assert.equal(avecHeure.dureeMin, null, 'avec une heure précise, pas de durée posée d\'office');
  assert.equal(creneauDepuisLieu(lieu('bkk-supanniga-tha-tien'), 'c3', '2027-03-10', 'soir', '', '').dureeMin, null);
});

test('alerte « lieu fermé » : seulement quand la fiche dit fermé, jamais sur un simple « à vérifier »', () => {
  const base1 = { ...creneauDepuisLieu(lieu('bkk-grand-palace'), 'c1', '2026-12-14', '', '17:00', 'THB'), statut: 'prevu' as const };
  const d: Donnees = { ...donneesVides(), creneaux: [base1] };
  const alertes = alertesLieux(d, base);
  assert.equal(alertes.length, 1);
  assert.match(alertes[0].message, /^Lieu fermé : « Grand Palace \(Wat Phra Kaew\) » est prévu à 17:00\. Selon la fiche : Fermé à 17:00/);
  assert.equal(alertes[0].id, 'c1');
  // ouvert à 10:00 : pas d'alerte
  assert.equal(alertesLieux({ ...d, creneaux: [{ ...base1, debut: '10:00' }] }, base).length, 0);
  // Wat Pho : horaires inconnus, pas d'alerte
  const pho = { ...creneauDepuisLieu(lieu('bkk-wat-pho'), 'c2', '2026-12-14', '', '23:00', 'THB'), statut: 'prevu' as const };
  assert.equal(alertesLieux({ ...d, creneaux: [pho] }, base).length, 0);
  // Chatuchak le lundi sans heure : fermé ce jour-là
  const chatu = { ...creneauDepuisLieu(lieu('bkk-chatuchak'), 'c3', '2026-12-14', 'matin', '', 'THB'), statut: 'prevu' as const };
  assert.match(alertesLieux({ ...d, creneaux: [chatu] }, base)[0].message, /Selon la fiche \(source secondaire\) : Fermé ce jour-là/);
  // créneau annulé ou fait : silence ; fiche absente : silence
  assert.equal(alertesLieux({ ...d, creneaux: [{ ...base1, statut: 'annule' }] }, base).length, 0);
  assert.equal(alertesLieux({ ...d, creneaux: [{ ...base1, statut: 'fait' }] }, base).length, 0);
  assert.equal(alertesLieux(d, []).length, 0);
});

test('zones proposées : seulement les étapes dont la base connaît le lieu', () => {
  const d: Donnees = {
    ...donneesVides(),
    etapes: [
      { id: 'e1', nom: 'Bangkok (centre)', pays: '', devise: 'THB', fuseau: 'Asia/Bangkok', debut: '2026-12-16', fin: '2026-12-19' },
      { id: 'e2', nom: 'Ville sans fiche', pays: '', devise: 'THB', fuseau: 'Asia/Bangkok', debut: '2026-12-19', fin: '2026-12-24' },
    ],
  };
  assert.deepEqual(zonesProposees(d, base, ''), ['Bangkok (centre)']);
  assert.deepEqual(zonesProposees(d, base, '2026-12-20'), []);
});

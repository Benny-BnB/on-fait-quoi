import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { donneesVides } from '../data/defauts.ts';
import type { Etape, FichePratique } from '../data/types.ts';
import { normaliser } from '../data/store.ts';
import { validerImport } from '../data/validation.ts';
import { ficheConcerneEtape, fraicheurPratique, fusionnerPratique, grouperPratique, pratiqueAVerifier, validerFichierPratique } from './pratique.ts';

const DOSSIER = new URL('../data/pratique/', import.meta.url);

function lireBase(): FichePratique[] {
  const fiches: FichePratique[] = [];
  for (const nom of readdirSync(DOSSIER).filter((n) => n.endsWith('.json'))) {
    const r = validerFichierPratique(JSON.parse(readFileSync(new URL(nom, DOSSIER), 'utf8')));
    assert.equal(r.ok, true, `${nom} : ${r.ok ? '' : r.erreurs.join(' / ')}`);
    if (r.ok) fiches.push(...r.fiches);
  }
  return fiches;
}
const base = lireBase();
const fiche = (id: string): FichePratique => {
  const f = base.find((x) => x.id === id);
  assert.ok(f, `fiche ${id} introuvable`);
  return f;
};

// ---------- La base publique ----------

test('la base Pratique est valide, sans doublon ; chaque fait a un lien https, une date de consultation et un statut officiel ou secondaire', () => {
  const ids = base.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(base.length >= 13);
  for (const f of base) {
    for (const s of [...f.faits.map((x) => x.source), ...f.liens]) {
      assert.match(s.lien, /^https:\/\//, `${f.titre} : lien`);
      assert.match(s.consulteLe, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof s.officielle, 'boolean');
    }
    assert.match(f.verifieLe, /^2026-11-1\d$/, `${f.titre} : date de vérification`);
  }
});

test("un prix, un horaire ou une durée ne vient jamais d'une source secondaire seule : le train Abou Dabi – Dubaï n'a ni prix ni durée, seulement « à vérifier »", () => {
  const train = fiche('ae-train');
  assert.ok(train.faits.every((x) => !/AED|minutes?|prix|tarif/i.test(`${x.libelle} ${x.valeur}`) || /réservation/i.test(x.libelle)), 'aucun chiffre de prix ni de durée dans les faits');
  assert.ok(train.faits.every((x) => x.source.officielle === false), 'la presse est marquée source secondaire');
  assert.ok(train.aVerifier.some((x) => /Prix et durée/.test(x)));
  // tout fait de prix chiffré vient d'une source officielle
  for (const f of base) for (const x of f.faits) if (/\b\d+(,\d+)? ?(AED|THB)\b/.test(x.valeur)) assert.equal(x.source.officielle, true, `${f.titre} : ${x.libelle}`);
});

test("l'avis du SPF pour les Émirats est dans la base, avec sa source officielle et sa date, à relire avant le départ", () => {
  const f = fiche('ae-securite');
  const consigne = f.faits.find((x) => x.libelle === 'Consigne de voyage');
  assert.ok(consigne);
  assert.match(consigne.valeur, /déconseille/);
  assert.equal(consigne.source.officielle, true);
  assert.match(consigne.source.libelle, /05\/08\/2026/);
  assert.ok(f.aVerifier.some((x) => /juste avant le départ/.test(x)));
});

test("la durée de séjour sans visa en Thaïlande vient de l'office du tourisme thaïlandais, pas de la page du SPF qui ne la donne pas", () => {
  const f = fiche('th-formalites');
  const sejour = f.faits.find((x) => x.libelle.startsWith('Séjour sans visa'));
  assert.ok(sejour);
  assert.match(sejour.valeur, /30 jours à partir du 15\/09\/2026/);
  assert.match(sejour.source.libelle, /Tourism Authority of Thailand/);
  assert.ok(f.aVerifier.some((x) => /ne donne pas la durée/.test(x)));
});

test("le retrait d'argent donne le tarif de la banque, avec les deux tarifs lus (Mastercard et Visa) et ce qui reste à demander à sa banque", () => {
  const f = fiche('th-argent');
  assert.equal(f.faits.length, 1);
  assert.match(f.faits[0].valeur, /350 THB.*Mastercard.*250 THB.*Visa/);
  assert.ok(f.aVerifier.some((x) => /ta propre banque/.test(x)));
});

test('la base Pratique ne contient aucun numéro de passeport, de billet ou de carte, ni référence de réservation', () => {
  const json = readdirSync(DOSSIER).filter((n) => n.endsWith('.json')).map((n) => readFileSync(new URL(n, DOSSIER), 'utf8')).join('\n');
  assert.ok(!/passeport n°|numéro de passeport|referenc|réservation n°/i.test(json));
  assert.ok(!/\b[A-Z0-9]{6}\b.*(PNR|booking)/i.test(json));
});

// ---------- Validation stricte ----------

const source = { lien: 'https://exemple.test/page', libelle: 'Exemple', consulteLe: '2026-11-12', officielle: true };
const brutValide = (): Record<string, unknown> => ({ id: 't1', zone: 'Ville A', rubrique: 'argent', titre: 'Test' });
const fichier = (...fiches: unknown[]) => ({ format: 'on-fait-quoi-pratique', version: 1, fiches });
function refuse(brut: unknown, extrait: RegExp): void {
  const r = validerFichierPratique(brut);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.erreurs.some((e) => extrait.test(e)), r.erreurs.join(' / '));
}

test('une fiche minimale est acceptée : sans fait, elle est « à vérifier »', () => {
  const r = validerFichierPratique(fichier(brutValide()));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(pratiqueAVerifier(r.fiches[0]), ["aucun fait sourcé pour l'instant"]);
});

test('un fait sans source, une source sans date, un lien dangereux, une rubrique inconnue ou un doublon sont refusés', () => {
  refuse(fichier({ ...brutValide(), faits: [{ libelle: 'Prix', valeur: '10' }] }), /source est obligatoire/);
  refuse(fichier({ ...brutValide(), faits: [{ libelle: 'Prix', valeur: '10', source: { ...source, consulteLe: '' } }] }), /date de consultation/);
  refuse(fichier({ ...brutValide(), faits: [{ libelle: 'Prix', valeur: '10', source: { ...source, lien: 'javascript:alert(1)' } }] }), /commencer par https/);
  refuse(fichier({ ...brutValide(), faits: [{ libelle: 'Prix', valeur: '', source }] }), /libellé et une valeur/);
  refuse(fichier({ ...brutValide(), rubrique: 'cuisine' }), /rubrique inconnue/);
  refuse(fichier({ ...brutValide(), zone: '' }), /« zone » manquante/);
  refuse(fichier({ ...brutValide(), titre: '' }), /titre manquant/);
  refuse(fichier(brutValide(), brutValide()), /utilisé deux fois/);
  refuse(fichier({ ...brutValide(), liens: [{ ...source, officielle: 'oui' }] }), /officielle/);
  refuse(fichier({ ...brutValide(), aVerifier: [3] }), /liste de textes/);
  refuse({ format: 'autre', version: 1, fiches: [] }, /Ce n'est pas un fichier Pratique/);
  refuse({ format: 'on-fait-quoi-pratique', version: 9, fiches: [] }, /Version/);
});

// ---------- Fusion et regroupement par étape ----------

test('une fiche ajoutée remplace la fiche publique de même identifiant', () => {
  const publique = fiche('th-argent');
  const perso: FichePratique = { ...publique, titre: 'Ma version' };
  const fusion = fusionnerPratique(base, [perso]);
  assert.equal(fusion.filter((f) => f.id === 'th-argent').length, 1);
  assert.equal(fusion.find((f) => f.id === 'th-argent')?.titre, 'Ma version');
  assert.equal(fusion.length, base.length);
});

const etape = (id: string, nom: string, pays: string, debut: string): Etape => ({ id, nom, pays, devise: 'THB', fuseau: 'Asia/Bangkok', debut, fin: debut });
const etapes = [etape('e2', 'Ville B', 'Émirats arabes unis', '2027-03-10'), etape('e1', 'Ville A (centre)', 'Thaïlande', '2027-03-01')];
const f = (id: string, zone: string): FichePratique => ({ id, zone, rubrique: 'argent', titre: id, resume: '', faits: [], aVerifier: [], liens: [], verifieLe: '', notes: '' });

test("une fiche concerne une étape par le nom de l'étape ou par son pays, sans tenir compte des accents ni des majuscules", () => {
  assert.equal(ficheConcerneEtape(f('a', 'ville a'), etapes[1]), true);
  assert.equal(ficheConcerneEtape(f('b', 'Thailande'), etapes[1]), true);
  assert.equal(ficheConcerneEtape(f('c', 'Emirats'), etapes[0]), true);
  assert.equal(ficheConcerneEtape(f('d', 'Ville B'), etapes[1]), false);
  assert.equal(ficheConcerneEtape(f('e', ''), etapes[1]), false);
});

test("le regroupement suit l'ordre des dates, une fiche rattachée par le pays n'apparaît qu'une fois, les autres vont dans « Autres fiches »", () => {
  const groupes = grouperPratique([f('pays-th', 'Thaïlande'), f('ville-a', 'Ville A'), f('ville-b', 'Ville B'), f('ailleurs', 'Lune')], etapes);
  assert.deepEqual(groupes.map((g) => [g.titre, g.fiches.map((x) => x.id)]), [
    ['Ville A (centre)', ['pays-th', 'ville-a']],
    ['Ville B', ['ville-b']],
    ['Autres fiches', ['ailleurs']],
  ]);
});

test("une fiche rattachée par le nom de la ville apparaît sous chaque étape qui porte ce nom (« Ville A » et « Ville A, près de l'aéroport »)", () => {
  const deux: Etape[] = [etape('e1', 'Ville A', 'Pays X', '2027-03-01'), etape('e2', 'Ville B', 'Pays X', '2027-03-05'), etape('e3', "Ville A, près de l'aéroport", 'Pays X', '2027-03-09')];
  const groupes = grouperPratique([f('pays-x', 'Pays X'), f('ville-a', 'Ville A')], deux);
  assert.deepEqual(groupes.map((g) => [g.titre, g.fiches.map((x) => x.id)]), [
    ['Ville A', ['pays-x', 'ville-a']],
    ['Ville B', []],
    ["Ville A, près de l'aéroport", ['ville-a']], // la fiche du pays reste sous la première étape seulement
  ]);
});

test('sans aucune étape, toutes les fiches vont dans « Autres fiches » ; une étape sans fiche est quand même listée', () => {
  assert.deepEqual(grouperPratique([f('x', 'Lune')], []).map((g) => g.titre), ['Autres fiches']);
  assert.deepEqual(grouperPratique([], etapes).map((g) => [g.titre, g.fiches.length]), [['Ville A (centre)', 0], ['Ville B', 0]]);
});

test("la base publique couvre des étapes par le nom ou le pays : Thaïlande, villes thaïlandaises, Dubaï, Émirats", () => {
  const nomsEtapes: Etape[] = [
    etape('e1', 'Dubaï', 'Émirats arabes unis', '2027-03-01'),
    etape('e2', 'Krabi', 'Thaïlande', '2027-03-05'),
    etape('e3', 'Bangkok', 'Thaïlande', '2027-03-08'),
    etape('e4', 'Railay', 'Thaïlande', '2027-03-11'),
    etape('e5', 'Pattaya', 'Thaïlande', '2027-03-14'),
  ];
  const groupes = grouperPratique(base, nomsEtapes);
  assert.deepEqual(groupes.map((g) => g.titre), ['Dubaï', 'Krabi', 'Bangkok', 'Railay', 'Pattaya']);
  // les fiches « Thaïlande » (6) sont sous la première étape du pays, ici Krabi ; chaque ville a sa fiche de transfert
  assert.deepEqual(groupes.map((g) => g.fiches.length), [7, 7, 1, 1, 1]);
});

// ---------- Transferts thaïlandais (étape 10) ----------

test("les transferts thaïlandais ont leurs 4 fiches : aéroport de Bangkok, Pattaya, aéroport de Krabi, bateau de Railay", () => {
  for (const [id, zone] of [['th-bkk-aeroport', 'Bangkok'], ['th-bkk-pattaya', 'Pattaya'], ['th-krabi-aeroport', 'Krabi'], ['th-railay-bateau', 'Railay']]) {
    const f = fiche(id);
    assert.equal(f.zone, zone);
    assert.equal(f.rubrique, 'trajets');
    assert.ok(f.aVerifier.length >= 3, `${id} : ce qui reste à vérifier est dit`);
    assert.ok(f.liens.length >= 3, `${id} : renvois vers les sources`);
  }
  assert.match(fiche('th-transport').aVerifier.join(' '), /ont leurs propres fiches/);
});

test("aéroport Suvarnabhumi : les tarifs viennent de la page officielle d'AOT, avec la prise en charge et les suppléments du taxi", () => {
  const f = fiche('th-bkk-aeroport');
  const taxis = f.faits.find((x) => x.libelle === 'Taxis');
  assert.ok(taxis);
  assert.match(taxis.valeur, /35 ou 40 THB/);
  assert.match(taxis.valeur, /supplément aéroport de 50 THB/);
  assert.match(taxis.valeur, /ticket de file d'attente est obligatoire/);
  assert.equal(taxis.source.officielle, true);
  assert.match(taxis.source.lien, /^https:\/\/suvarnabhumi\.airportthai\.co\.th\//);
  const rail = f.faits.find((x) => x.libelle === 'Airport Rail Link');
  assert.match(rail?.valeur ?? '', /05:30 à 24:00/);
  // la page ne donne pas de tarif par destination ni de durée : c'est dit
  assert.ok(f.aVerifier.some((x) => /pas de tarif par destination/.test(x)));
  assert.ok(f.aVerifier.some((x) => /aucune/.test(x) && /durées/i.test(x)));
});

test("Bangkok ↔ Pattaya : le tarif de l'autocar vient d'AOT, le sens retour et la durée restent « à vérifier »", () => {
  const f = fiche('th-bkk-pattaya');
  const bks = f.faits.find((x) => x.libelle === 'Autocar Bor Khor Sor');
  assert.ok(bks);
  assert.match(bks.valeur, /06:30 à 21:00/);
  assert.match(bks.valeur, /140 à 190 THB/);
  assert.match(bks.valeur, /ne dit pas si la ligne circule aussi dans l'autre sens/);
  assert.equal(bks.source.officielle, true);
  assert.ok(f.aVerifier.some((x) => /Sens Pattaya → aéroport/.test(x)));
  assert.ok(f.aVerifier.some((x) => /Durée du trajet/.test(x) && /estimées/.test(x)));
  // le train : aucune heure ni aucun tarif retenu (la page n'est pas lisible de façon fiable)
  const train = f.faits.find((x) => x.libelle === 'Train (SRT)');
  assert.ok(train);
  assert.ok(!/\d{2}:\d{2}|THB/.test(train.valeur.replace('1690', '')));
});

test("aéroport de Krabi et bateau de Railay : aucune source officielle sur les prix ni les horaires, donc aucun prix retenu", () => {
  for (const id of ['th-krabi-aeroport', 'th-railay-bateau']) {
    const f = fiche(id);
    for (const x of f.faits) {
      assert.ok(!/\bTHB\b|baht|฿/i.test(x.valeur), `${id} : « ${x.libelle} » ne doit contenir aucun prix`);
      // seul l'avis de sécurité du SPF est une source officielle ici
      if (x.source.officielle) assert.match(x.source.lien, /diplomatie\.belgium\.be/);
    }
  }
  assert.ok(fiche('th-railay-bateau').aVerifier.some((x) => /Tarif d'une traversée/.test(x)));
  assert.ok(fiche('th-railay-bateau').aVerifier.some((x) => /dernier bateau/.test(x) && /vol en soirée/.test(x)));
  assert.ok(fiche('th-krabi-aeroport').aVerifier.some((x) => /Prix et durée/.test(x)));
});

test('fraîcheur : « vérifié il y a N jours » ou « à vérifier »', () => {
  assert.equal(fraicheurPratique({ ...f('x', 'z'), verifieLe: '' }, '2026-11-12'), 'À vérifier');
  assert.equal(fraicheurPratique({ ...f('x', 'z'), verifieLe: '2026-11-12' }, '2026-11-12'), "Vérifié aujourd'hui");
  assert.equal(fraicheurPratique({ ...f('x', 'z'), verifieLe: '2026-11-11' }, '2026-11-12'), 'Vérifié hier');
  assert.equal(fraicheurPratique({ ...f('x', 'z'), verifieLe: '2026-11-02' }, '2026-11-12'), 'Vérifié il y a 10 jours');
});

// ---------- Import et données du téléphone ----------

const imp = (extra: Record<string, unknown>) => validerImport({ format: 'on-fait-quoi', version: 1, ...extra });

test("l'import accepte pratiquePerso (mêmes règles de source) et le refuse mal formé ; un fichier avec seulement des fiches Pratique est valide", () => {
  const ok = imp({ pratiquePerso: [{ ...brutValide(), faits: [{ libelle: 'Prix', valeur: '10', source }] }] });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.donnees.pratiquePerso?.length, 1);
  assert.equal(imp({ pratiquePerso: 'non' }).ok, false);
  assert.equal(imp({ pratiquePerso: [{ ...brutValide(), faits: [{ libelle: 'Prix', valeur: '10' }] }] }).ok, false);
  assert.equal(imp({}).ok, false);
});

test("des données enregistrées avant l'étape 9 (sans pratiquePerso) se chargent : liste vide ; une fiche à moitié remplie est complétée", () => {
  assert.deepEqual(normaliser(undefined).pratiquePerso, []);
  assert.deepEqual(normaliser({}).pratiquePerso, []);
  const d = normaliser({ pratiquePerso: [{ id: 'x', zone: 'Z', rubrique: 'argent', titre: 'T' } as FichePratique] });
  assert.deepEqual([d.pratiquePerso[0].faits, d.pratiquePerso[0].aVerifier, d.pratiquePerso[0].liens], [[], [], []]);
  assert.deepEqual(donneesVides().pratiquePerso, []);
});

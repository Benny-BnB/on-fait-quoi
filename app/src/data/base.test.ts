// Contrôle de forme de toute la base publique (lieux et Pratique) : adresses et dates des sources.
// (Le contenu des faits est contrôlé par lieux.test.ts et pratique.test.ts. Le test des liens eux-mêmes se fait
// à la main avec « npm run controle-liens », car il demande Internet.)

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const DOSSIERS = ['lieux', 'pratique'];

type Trouve = { fichier: string; id: string; cle: string; valeur: string };

function parcourir(valeur: unknown, fichier: string, id: string, sortie: Trouve[]): void {
  if (Array.isArray(valeur)) {
    for (const v of valeur) parcourir(v, fichier, id, sortie);
    return;
  }
  if (valeur === null || typeof valeur !== 'object') return;
  const objet = valeur as Record<string, unknown>;
  const idLocal = typeof objet.id === 'string' ? objet.id : id;
  for (const [cle, v] of Object.entries(objet)) {
    if (typeof v === 'string') sortie.push({ fichier, id: idLocal, cle, valeur: v });
    else parcourir(v, fichier, idLocal, sortie);
  }
}

function toutesLesValeurs(): Trouve[] {
  const sortie: Trouve[] = [];
  for (const dossier of DOSSIERS) {
    const url = new URL(`./${dossier}/`, import.meta.url);
    for (const nom of readdirSync(url).filter((n) => n.endsWith('.json'))) {
      parcourir(JSON.parse(readFileSync(new URL(nom, url), 'utf8')), `${dossier}/${nom}`, '', sortie);
    }
  }
  return sortie;
}

const valeurs = toutesLesValeurs();
const aujourdhui = new Date().toISOString().slice(0, 10);

test('toute adresse de la base est en https, lisible, sans identifiant ni mot de passe dedans', () => {
  const adresses = valeurs.filter((v) => v.cle === 'lien' || v.cle === 'lienOfficiel').filter((v) => v.valeur !== '');
  assert.ok(adresses.length > 50, `la base cite beaucoup de sources (${adresses.length})`);
  for (const a of adresses) {
    const u = new URL(a.valeur); // lève une erreur si illisible
    assert.equal(u.protocol, 'https:', `${a.fichier} ${a.id} : ${a.valeur}`);
    assert.equal(u.username + u.password, '', `${a.fichier} ${a.id} : identifiants dans l'adresse`);
  }
});

test("aucune date de consultation ou de vérification n'est dans le futur ni avant 2026", () => {
  const dates = valeurs.filter((v) => v.cle === 'consulteLe' || v.cle === 'verifieLe').filter((v) => v.valeur !== '');
  assert.ok(dates.length > 200);
  for (const d of dates) {
    assert.match(d.valeur, /^\d{4}-\d{2}-\d{2}$/, `${d.fichier} ${d.id} : ${d.cle}`);
    assert.ok(d.valeur <= aujourdhui, `${d.fichier} ${d.id} : ${d.cle} ${d.valeur} est dans le futur`);
    assert.ok(d.valeur >= '2026-01-01', `${d.fichier} ${d.id} : ${d.cle} ${d.valeur} est trop ancienne`);
  }
});

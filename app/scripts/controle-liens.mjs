// Contrôle des liens de la base publique (lieux et rubrique Pratique).
// À lancer à la main, avec Internet : npm run controle-liens
// (jamais dans le déploiement automatique : les sites répondent de façon capricieuse, et un lien refusé
// à un robot n'est pas forcément un lien cassé.)
//
// Ce script lit seulement les fichiers publics de app/src/data/lieux et app/src/data/pratique.
// Option : --json chemin/du/rapport.json pour garder le résultat.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../src/data/', import.meta.url));
const DOSSIERS = ['lieux', 'pratique'];
const CLES_LIEN = new Set(['lien', 'lienOfficiel']);
const SIMULTANES = 5;
const DELAI_MS = 25000;
const argJson = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

// ---------- 1. Les liens de la base, avec les fiches qui les utilisent ----------
const liens = new Map(); // url -> [{ fichier, id }]

function parcourir(valeur, contexte) {
  if (Array.isArray(valeur)) return valeur.forEach((v) => parcourir(v, contexte));
  if (valeur === null || typeof valeur !== 'object') return;
  const idLocal = typeof valeur.id === 'string' ? valeur.id : contexte.id;
  for (const [cle, v] of Object.entries(valeur)) {
    if (CLES_LIEN.has(cle) && typeof v === 'string' && v !== '') {
      const liste = liens.get(v) ?? [];
      liste.push({ fichier: contexte.fichier, id: idLocal });
      liens.set(v, liste);
    } else parcourir(v, { fichier: contexte.fichier, id: idLocal });
  }
}

for (const dossier of DOSSIERS) {
  for (const nom of readdirSync(join(RACINE, dossier)).filter((n) => n.endsWith('.json'))) {
    parcourir(JSON.parse(readFileSync(join(RACINE, dossier, nom), 'utf8')), { fichier: `${dossier}/${nom}`, id: '' });
  }
}

// ---------- 2. Forme des adresses ----------
const mauvaisesFormes = [];
for (const url of liens.keys()) {
  let u;
  try {
    u = new URL(url);
  } catch {
    mauvaisesFormes.push([url, 'adresse illisible']);
    continue;
  }
  if (u.protocol !== 'https:') mauvaisesFormes.push([url, 'pas en https']);
  if (u.username || u.password) mauvaisesFormes.push([url, 'identifiants dans l\'adresse']);
}

// ---------- 3. Test réseau ----------
async function tester(url) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    const reponse = await fetch(url, {
      redirect: 'follow',
      signal: controleur.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; controle-liens on-fait-quoi)', accept: 'text/html,application/pdf,*/*;q=0.8', 'accept-language': 'fr,en;q=0.8' },
    });
    await reponse.body?.cancel();
    const s = reponse.status;
    const final = reponse.url;
    const redirige = final !== url && new URL(final).pathname.replace(/\/$/, '') !== new URL(url).pathname.replace(/\/$/, '');
    if (s >= 200 && s < 300) return { url, etat: redirige ? 'redirige' : 'ok', statut: s, final };
    if ([401, 403, 405, 406, 429, 451, 503, 520, 521, 999].includes(s)) return { url, etat: 'bloque', statut: s, final };
    if (s === 404 || s === 410) return { url, etat: 'casse', statut: s, final };
    return { url, etat: 'erreur', statut: s, final };
  } catch (e) {
    const cause = e?.cause?.code ?? e?.name ?? 'erreur';
    // Un site qui coupe la connexion d'un robot (mais répond à un navigateur) n'est pas un lien cassé
    if (['UND_ERR_SOCKET', 'ECONNRESET'].includes(String(cause))) return { url, etat: 'bloque', statut: 0, final: '', detail: `connexion coupée par le site (${cause})` };
    return { url, etat: 'injoignable', statut: 0, final: '', detail: String(cause) };
  } finally {
    clearTimeout(minuteur);
  }
}

const urls = [...liens.keys()];
const resultats = [];
let suivant = 0;
await Promise.all(
  Array.from({ length: SIMULTANES }, async () => {
    while (suivant < urls.length) {
      const i = suivant++;
      resultats[i] = await tester(urls[i]);
    }
  }),
);

// ---------- 4. Rapport ----------
const titres = {
  ok: 'RÉPONDENT',
  redirige: 'REDIRIGÉS (la page a peut-être changé d\'adresse : à ouvrir à la main)',
  bloque: 'REFUSENT LES ROBOTS (à ouvrir à la main, pas forcément cassés)',
  casse: 'CASSÉS (404/410)',
  erreur: 'AUTRES ERREURS',
  injoignable: 'INJOIGNABLES (réseau, certificat, délai)',
};
console.log(`\n${urls.length} adresses distinctes dans ${DOSSIERS.join(' + ')}\n`);
if (mauvaisesFormes.length > 0) {
  console.log('MAUVAISE FORME :');
  for (const [u, raison] of mauvaisesFormes) console.log(`  - ${u} : ${raison}`);
  console.log('');
}
for (const etat of Object.keys(titres)) {
  const liste = resultats.filter((r) => r.etat === etat);
  console.log(`${titres[etat]} : ${liste.length}`);
  if (etat === 'ok') continue;
  for (const r of liste) {
    const ou = [...new Set(liens.get(r.url).map((x) => `${basename(x.fichier)}:${x.id}`))].join(', ');
    console.log(`  - [${r.statut || r.detail}] ${r.url}${r.etat === 'redirige' ? `\n      → ${r.final}` : ''}\n      utilisé par : ${ou}`);
  }
}
if (argJson) writeFileSync(argJson, JSON.stringify({ le: new Date().toISOString(), mauvaisesFormes, resultats }, null, 2));
process.exitCode = resultats.some((r) => r.etat === 'casse') || mauvaisesFormes.length > 0 ? 1 : 0;

// Partage du planning par un lien (et donc par un QR code) : les événements sont compactés,
// compressés puis écrits dans la PARTIE « # » de l'adresse. Cette partie n'est jamais envoyée à un
// serveur : le lien contient les données, et rien d'autre ne les reçoit.
//
// Format du code : « 1.<texte> » = JSON compressé (deflate) ; « 0.<texte> » = JSON non compressé
// (si le téléphone ne sait pas compresser). Le texte est en base64 « sûr pour une adresse ».

import type { EvenementAgenda, GenreEvenement } from './agenda.ts';
import { dateValide, fuseauValide } from './temps.ts';

const MS_MINUTE = 60000;
const TAILLE_MAX_DECOMPRESSEE = 2_000_000; // octets : protège contre un lien piégé qui gonfle à l'ouverture
const MAX_EVENEMENTS = 3000;
const GENRES_PARTAGEABLES: GenreEvenement[] = ['vol', 'trajet', 'logement', 'planning']; // jamais les check-lists
const CODE_GENRE: Record<string, GenreEvenement> = { v: 'vol', t: 'trajet', l: 'logement', p: 'planning' };
const GENRE_CODE: Record<string, string> = { vol: 'v', trajet: 't', logement: 'l', planning: 'p' };

// [genre, jour, début (minutes depuis 1970), fin, n° de fuseau (-1 = aucun), titre, lieu, détails séparés par un retour à la ligne]
export type LignePartagee = [string, string, number | null, number | null, number, string, string, string];
export type PlanningPartage = { v: 1; z: string[]; e: LignePartagee[] };

export function planningDepuisEvenements(evenements: EvenementAgenda[]): PlanningPartage {
  const fuseaux: string[] = [];
  const lignes: LignePartagee[] = [];
  for (const e of evenements) {
    if (!GENRES_PARTAGEABLES.includes(e.genre)) continue;
    let z = -1;
    if (e.fuseau !== '') {
      z = fuseaux.indexOf(e.fuseau);
      if (z < 0) {
        fuseaux.push(e.fuseau);
        z = fuseaux.length - 1;
      }
    }
    lignes.push([
      GENRE_CODE[e.genre],
      e.jour,
      e.debutMs === null ? null : Math.round(e.debutMs / MS_MINUTE),
      e.finMs === null ? null : Math.round(e.finMs / MS_MINUTE),
      z,
      e.titre,
      e.lieu,
      e.details.join('\n'),
    ]);
  }
  return { v: 1, z: fuseaux, e: lignes };
}

// Empreinte courte et stable (FNV-1a) : sert à donner le même identifiant au même événement reçu deux fois
function empreinte(texte: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function evenementsDepuisPlanning(p: PlanningPartage): EvenementAgenda[] {
  return p.e.map((l) => {
    const [g, jour, debut, fin, z, titre, lieu, details] = l;
    return {
      uid: `recu-${empreinte(`${g}|${jour}|${debut}|${titre}`)}`,
      genre: CODE_GENRE[g] ?? 'planning',
      titre,
      details: details === '' ? [] : details.split('\n'),
      lieu,
      fuseau: z >= 0 ? (p.z[z] ?? '') : '',
      debutMs: debut === null ? null : debut * MS_MINUTE,
      finMs: fin === null ? null : fin * MS_MINUTE,
      jour,
    };
  });
}

// ---------- Compression et texte ----------

function versBase64Url(octets: Uint8Array): string {
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function depuisBase64Url(texte: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(texte)) return null;
  const standard = texte.replaceAll('-', '+').replaceAll('_', '/');
  try {
    const binaire = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4));
    return Uint8Array.from(binaire, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function lireFlux(flux: ReadableStream<Uint8Array>, limite: number): Promise<Uint8Array | null> {
  const lecteur = flux.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.length;
    if (total > limite) {
      await lecteur.cancel();
      return null;
    }
    morceaux.push(value);
  }
  const tout = new Uint8Array(total);
  let position = 0;
  for (const m of morceaux) {
    tout.set(m, position);
    position += m.length;
  }
  return tout;
}

// Fait passer des octets dans un flux de compression ou de décompression. On écrit et on lit en même temps
// (sans attendre l'écriture avant de lire, sinon le flux se bloque).
async function transformer(octets: Uint8Array, flux: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> }, limite: number): Promise<Uint8Array | null> {
  const ecrivain = flux.writable.getWriter();
  ecrivain.write(octets as Uint8Array<ArrayBuffer>).catch(() => undefined); // l'erreur éventuelle (données abîmées) ressort à la lecture
  ecrivain.close().catch(() => undefined);
  return lireFlux(flux.readable, limite);
}

const compressionDisponible = (): boolean => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export async function encoderPlanning(p: PlanningPartage): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  if (compressionDisponible()) {
    try {
      const compresse = await transformer(json, new CompressionStream('deflate-raw'), TAILLE_MAX_DECOMPRESSEE);
      if (compresse) return `1.${versBase64Url(compresse)}`;
    } catch {
      // on retombe sur le texte non compressé
    }
  }
  return `0.${versBase64Url(json)}`;
}

export type ResultatDecodage = { ok: true; planning: PlanningPartage } | { ok: false; erreur: string };

const ERREUR_LIEN = "Ce lien n'a pas pu être lu. Demande à la personne de t'en envoyer un nouveau.";

const estTexte = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
const estMinutes = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0 && x < 20_000_000_000 / 60; // avant l'an 2600

function validerPlanning(brut: unknown): PlanningPartage | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const o = brut as { v?: unknown; z?: unknown; e?: unknown };
  if (o.v !== 1 || !Array.isArray(o.z) || !Array.isArray(o.e)) return null;
  if (o.z.length > 50 || o.e.length > MAX_EVENEMENTS) return null;
  const fuseaux: string[] = [];
  for (const z of o.z) {
    if (!estTexte(z, 80) || !fuseauValide(z)) return null;
    fuseaux.push(z);
  }
  const lignes: LignePartagee[] = [];
  for (const l of o.e) {
    if (!Array.isArray(l) || l.length !== 8) return null;
    const [g, jour, debut, fin, z, titre, lieu, details] = l as unknown[];
    if (typeof g !== 'string' || !(g in CODE_GENRE)) return null;
    if (typeof jour !== 'string' || !dateValide(jour)) return null;
    if (debut !== null && !estMinutes(debut)) return null;
    if (fin !== null && !estMinutes(fin)) return null;
    if (typeof z !== 'number' || !Number.isInteger(z) || z < -1 || z >= fuseaux.length) return null;
    if (!estTexte(titre, 400) || !estTexte(lieu, 400) || !estTexte(details, 4000)) return null;
    lignes.push([g, jour, debut as number | null, fin as number | null, z, titre, lieu, details]);
  }
  return { v: 1, z: fuseaux, e: lignes };
}

export async function decoderPlanning(code: string): Promise<ResultatDecodage> {
  const erreur: ResultatDecodage = { ok: false, erreur: ERREUR_LIEN };
  const m = /^([01])\.(.*)$/.exec(code.trim());
  if (!m) return erreur;
  const octets = depuisBase64Url(m[2]);
  if (!octets) return erreur;
  let json: Uint8Array | null = octets;
  if (m[1] === '1') {
    if (!compressionDisponible()) return { ok: false, erreur: "Ce téléphone ne sait pas ouvrir ce lien. Demande plutôt le fichier d'agenda (.ics)." };
    try {
      json = await transformer(octets, new DecompressionStream('deflate-raw'), TAILLE_MAX_DECOMPRESSEE);
    } catch {
      return erreur;
    }
  } else if (octets.length > TAILLE_MAX_DECOMPRESSEE) {
    return erreur;
  }
  if (!json) return erreur;
  let brut: unknown;
  try {
    brut = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json));
  } catch {
    return erreur;
  }
  const planning = validerPlanning(brut);
  return planning ? { ok: true, planning } : erreur;
}

// Le lien complet : l'adresse de l'app (sans sa partie « # ») + le code
export function lienDePartage(adresseApp: string, code: string): string {
  return `${adresseApp.split('#')[0]}#/recu/${code}`;
}

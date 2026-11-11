// Contrôle d'un fichier d'import avant de toucher aux données : un fichier erroné
// est refusé avec un message clair, il n'abîme jamais les données déjà enregistrées.

import type { Aeroport, Compteur, CibleCompteur, Donnees, Vol } from './types.ts';
import { PORTEES, STATUTS_VOL } from './types.ts';
import { dateValide, fuseauValide, heureValide, instantLocal } from '../lib/temps.ts';

export const FORMAT_FICHIER = 'on-fait-quoi';
export const VERSION_FORMAT = 1;

const CLES_CONNUES = ['format', 'version', 'exporteLe', 'vols', 'compteurs', 'reglages'];

export type ResultatImport =
  | { ok: true; donnees: Partial<Donnees>; avertissements: string[] }
  | { ok: false; erreurs: string[] };

type Objet = Record<string, unknown>;

const estObjet = (x: unknown): x is Objet => typeof x === 'object' && x !== null && !Array.isArray(x);

function texte(o: Objet, cle: string): string {
  const v = o[cle];
  return typeof v === 'string' ? v.trim() : '';
}

function lireAeroport(brut: unknown, qui: string, erreurs: string[]): Aeroport | null {
  if (!estObjet(brut)) {
    erreurs.push(`${qui} : section manquante.`);
    return null;
  }
  const code = texte(brut, 'code').toUpperCase();
  const date = texte(brut, 'date');
  const heure = texte(brut, 'heure');
  const fuseau = texte(brut, 'fuseau');
  let ok = true;
  if (!/^[A-Z]{3}$/.test(code)) {
    erreurs.push(`${qui} : code d'aéroport invalide « ${code} » (3 lettres attendues).`);
    ok = false;
  }
  if (!dateValide(date)) {
    erreurs.push(`${qui} : date invalide « ${date} » (format AAAA-MM-JJ attendu).`);
    ok = false;
  }
  if (!heureValide(heure)) {
    erreurs.push(`${qui} : heure invalide « ${heure} » (format HH:MM sur 24 h attendu).`);
    ok = false;
  }
  if (!fuseauValide(fuseau)) {
    erreurs.push(`${qui} : fuseau horaire inconnu « ${fuseau} » (exemple : Europe/Brussels).`);
    ok = false;
  }
  if (!ok) return null;
  return { code, ville: texte(brut, 'ville'), date, heure, fuseau, terminal: texte(brut, 'terminal') };
}

function lireVol(brut: unknown, index: number, erreurs: string[], ids: Set<string>): Vol | null {
  const nom = `Vol n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas un vol valide.`);
    return null;
  }
  const numero = texte(brut, 'numero');
  const qui = numero ? `${nom} (${numero})` : nom;
  const avant = erreurs.length;

  if (!numero) erreurs.push(`${qui} : numéro de vol manquant.`);
  const id = texte(brut, 'id') || `vol-import-${index + 1}`;
  if (ids.has(id)) erreurs.push(`${qui} : identifiant « ${id} » utilisé deux fois.`);
  ids.add(id);

  const depart = lireAeroport(brut.depart, `${qui}, départ`, erreurs);
  const arrivee = lireAeroport(brut.arrivee, `${qui}, arrivée`, erreurs);

  const porteeBrute = brut.portee ?? 'international';
  const statutBrut = brut.statut ?? 'confirme';
  if (!PORTEES.some((p) => p === porteeBrute)) {
    erreurs.push(`${qui} : portée invalide « ${String(porteeBrute)} » (international ou interieur).`);
  }
  if (!STATUTS_VOL.some((s) => s === statutBrut)) {
    erreurs.push(`${qui} : statut invalide « ${String(statutBrut)} » (confirme, a-verifier ou annule).`);
  }
  if (brut.pourMoi !== undefined && typeof brut.pourMoi !== 'boolean') {
    erreurs.push(`${qui} : « pourMoi » doit valoir true ou false.`);
  }

  if (depart && arrivee) {
    const duree = instantLocal(arrivee.date, arrivee.heure, arrivee.fuseau) - instantLocal(depart.date, depart.heure, depart.fuseau);
    if (!(duree > 0)) {
      erreurs.push(`${qui} : l'arrivée est avant le départ (compare les heures locales et les fuseaux).`);
    }
  }
  if (erreurs.length > avant || !depart || !arrivee) return null;

  return {
    id,
    compagnie: texte(brut, 'compagnie'),
    numero,
    reference: texte(brut, 'reference'),
    depart,
    arrivee,
    portee: porteeBrute as Vol['portee'],
    passagers: texte(brut, 'passagers'),
    pourMoi: brut.pourMoi !== false,
    statut: statutBrut as Vol['statut'],
    notes: texte(brut, 'notes'),
  };
}

function lireCompteur(brut: unknown, index: number, erreurs: string[], ids: Set<string>, idsVols: Set<string> | null): Compteur | null {
  const nom = `Compteur n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas un compteur valide.`);
    return null;
  }
  const avant = erreurs.length;
  const id = texte(brut, 'id');
  if (!id) erreurs.push(`${nom} : identifiant manquant.`);
  else if (ids.has(id)) erreurs.push(`${nom} : identifiant « ${id} » utilisé deux fois.`);
  ids.add(id);
  const libelle = texte(brut, 'libelle');
  if (!libelle) erreurs.push(`${nom} : libellé manquant.`);

  const delai = brut.delaiMin ?? 0;
  if (typeof delai !== 'number' || !Number.isFinite(delai) || delai < 0 || delai > 7 * 24 * 60) {
    erreurs.push(`${nom} : « delaiMin » doit être un nombre de minutes entre 0 et 10 080.`);
  }

  let cible: CibleCompteur | null = null;
  const c = brut.cible;
  if (!estObjet(c)) {
    erreurs.push(`${nom} : cible manquante.`);
  } else if (c.type === 'prochain-vol') {
    cible = { type: 'prochain-vol' };
  } else if (c.type === 'vol') {
    const volId = texte(c, 'volId');
    if (!volId) erreurs.push(`${nom} : « volId » manquant.`);
    else if (idsVols && !idsVols.has(volId)) erreurs.push(`${nom} : le vol « ${volId} » n'existe pas dans le fichier.`);
    else cible = { type: 'vol', volId };
  } else if (c.type === 'libre') {
    const date = texte(c, 'date');
    const heure = texte(c, 'heure');
    const fuseau = texte(c, 'fuseau');
    if (!dateValide(date) || !heureValide(heure) || !fuseauValide(fuseau)) {
      erreurs.push(`${nom} : date, heure ou fuseau invalide.`);
    } else {
      cible = { type: 'libre', date, heure, fuseau };
    }
  } else {
    erreurs.push(`${nom} : type de cible inconnu « ${String(c.type)} ».`);
  }

  if (erreurs.length > avant || !cible) return null;
  return { id, libelle, cible, visible: brut.visible === true, delaiMin: delai as number };
}

export function validerImport(brut: unknown): ResultatImport {
  if (!estObjet(brut)) return { ok: false, erreurs: ['Le fichier ne contient pas de données reconnaissables.'] };
  if (brut.format !== FORMAT_FICHIER) {
    return { ok: false, erreurs: [`Ce fichier n'est pas un fichier « On fait quoi ? » (champ « format » attendu : ${FORMAT_FICHIER}).`] };
  }
  if (typeof brut.version !== 'number' || brut.version > VERSION_FORMAT) {
    return { ok: false, erreurs: ['Ce fichier vient d\'une version plus récente de l\'app. Mets l\'app à jour, puis réessaie.'] };
  }

  const erreurs: string[] = [];
  const avertissements: string[] = [];
  const donnees: Partial<Donnees> = {};

  for (const cle of Object.keys(brut)) {
    if (!CLES_CONNUES.includes(cle)) avertissements.push(`Section « ${cle} » ignorée (pas encore gérée par cette version).`);
  }

  let idsVols: Set<string> | null = null;
  if (brut.vols !== undefined) {
    if (!Array.isArray(brut.vols)) {
      erreurs.push('« vols » doit être une liste.');
    } else {
      const ids = new Set<string>();
      const vols = brut.vols.map((v, i) => lireVol(v, i, erreurs, ids));
      idsVols = ids;
      donnees.vols = vols.filter((v): v is Vol => v !== null);
    }
  }

  if (brut.compteurs !== undefined) {
    if (!Array.isArray(brut.compteurs)) {
      erreurs.push('« compteurs » doit être une liste.');
    } else {
      const ids = new Set<string>();
      const compteurs = brut.compteurs.map((c, i) => lireCompteur(c, i, erreurs, ids, idsVols));
      donnees.compteurs = compteurs.filter((c): c is Compteur => c !== null);
    }
  }

  if (brut.reglages !== undefined) {
    const r = brut.reglages;
    const d = estObjet(r) && estObjet(r.delaiAeroportMin) ? r.delaiAeroportMin : null;
    const valide = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1440;
    if (!d || !valide(d.international) || !valide(d.interieur)) {
      erreurs.push('« reglages » : délais d\'aéroport invalides (nombres de minutes entre 0 et 1 440 attendus).');
    } else {
      donnees.reglages = { delaiAeroportMin: { international: d.international, interieur: d.interieur } };
    }
  }

  if (erreurs.length > 0) return { ok: false, erreurs };
  if (!donnees.vols && !donnees.compteurs && !donnees.reglages) {
    return { ok: false, erreurs: ['Le fichier ne contient ni vols, ni compteurs, ni réglages.'] };
  }
  return { ok: true, donnees, avertissements };
}

// Point d'entrée pour du texte collé ou lu dans un fichier
export function lireTexteImport(contenu: string): ResultatImport {
  let brut: unknown;
  try {
    brut = JSON.parse(contenu);
  } catch {
    return { ok: false, erreurs: ['Le texte n\'est pas un fichier valide. Il a peut-être été coupé : recopie-le en entier.'] };
  }
  return validerImport(brut);
}

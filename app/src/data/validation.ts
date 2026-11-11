// Contrôle d'un fichier d'import avant de toucher aux données : un fichier erroné
// est refusé avec un message clair, il n'abîme jamais les données déjà enregistrées.

import type { Aeroport, Compteur, CibleCompteur, Coordonnees, Creneau, Donnees, Etape, JourPlan, Logement, MomentLogement, Personne, Tache, Trajet, Vol } from './types.ts';
import { HUMEURS, LISTES_TACHE, MODES_TRAJET, PERIODES, PORTEES, STATUTS_CRENEAU, STATUTS_LOGEMENT, STATUTS_VOL, TYPES_EVENEMENT } from './types.ts';
import { dateValide, fuseauValide, heureValide, instantLocal } from '../lib/temps.ts';
import { lienSur } from '../lib/sejour.ts';
import { lireLieux, lireSuivis } from '../lib/lieux.ts';

export const FORMAT_FICHIER = 'on-fait-quoi';
// Les sections ajoutées plus tard sont facultatives : un ancien fichier reste valide, la version ne change pas
export const VERSION_FORMAT = 1;

const CLES_CONNUES = ['format', 'version', 'exporteLe', 'vols', 'compteurs', 'reglages', 'etapes', 'logements', 'trajets', 'taches', 'personnes', 'creneaux', 'joursPlan', 'lieuxPerso', 'suiviLieux'];

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
  } else if (c.type === 'creneau') {
    const cle = texte(c, 'cle');
    if (!cle) erreurs.push(`${nom} : « cle » du créneau manquante.`);
    else cible = { type: 'creneau', cle };
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

function lireEtape(brut: unknown, index: number, erreurs: string[], ids: Set<string>): Etape | null {
  const nom = `Étape n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas une étape valide.`);
    return null;
  }
  const libelle = texte(brut, 'nom');
  const qui = libelle ? `${nom} (${libelle})` : nom;
  const avant = erreurs.length;

  if (!libelle) erreurs.push(`${qui} : nom manquant.`);
  const id = texte(brut, 'id') || `etape-import-${index + 1}`;
  if (ids.has(id)) erreurs.push(`${qui} : identifiant « ${id} » utilisé deux fois.`);
  ids.add(id);

  const devise = texte(brut, 'devise').toUpperCase();
  if (devise !== '' && !/^[A-Z]{3}$/.test(devise)) erreurs.push(`${qui} : devise invalide « ${devise} » (3 lettres attendues, exemple : THB).`);
  const fuseau = texte(brut, 'fuseau');
  if (!fuseauValide(fuseau)) erreurs.push(`${qui} : fuseau horaire inconnu « ${fuseau} » (exemple : Asia/Bangkok).`);
  const debut = texte(brut, 'debut');
  const fin = texte(brut, 'fin');
  if (!dateValide(debut)) erreurs.push(`${qui} : date de début invalide « ${debut} » (format AAAA-MM-JJ attendu).`);
  if (!dateValide(fin)) erreurs.push(`${qui} : date de fin invalide « ${fin} » (format AAAA-MM-JJ attendu).`);
  if (dateValide(debut) && dateValide(fin) && fin < debut) erreurs.push(`${qui} : la fin est avant le début.`);

  if (erreurs.length > avant) return null;
  return { id, nom: libelle, pays: texte(brut, 'pays'), devise, fuseau, debut, fin };
}

function lireMoment(brut: unknown, qui: string, erreurs: string[]): MomentLogement | null {
  if (!estObjet(brut)) {
    erreurs.push(`${qui} : section manquante.`);
    return null;
  }
  const date = texte(brut, 'date');
  const heure = texte(brut, 'heure');
  let ok = true;
  if (!dateValide(date)) {
    erreurs.push(`${qui} : date invalide « ${date} » (format AAAA-MM-JJ attendu).`);
    ok = false;
  }
  if (heure !== '' && !heureValide(heure)) {
    erreurs.push(`${qui} : heure invalide « ${heure} » (format HH:MM, ou vide si elle n'est pas connue).`);
    ok = false;
  }
  return ok ? { date, heure } : null;
}

function lireGps(brut: unknown, qui: string, erreurs: string[]): Coordonnees | null {
  if (brut === undefined || brut === null) return null;
  if (
    !estObjet(brut) ||
    typeof brut.lat !== 'number' ||
    typeof brut.lng !== 'number' ||
    !(brut.lat >= -90 && brut.lat <= 90) ||
    !(brut.lng >= -180 && brut.lng <= 180)
  ) {
    erreurs.push(`${qui} : coordonnées GPS invalides (latitude entre -90 et 90, longitude entre -180 et 180).`);
    return null;
  }
  return { lat: brut.lat, lng: brut.lng };
}

function lireLogement(brut: unknown, index: number, erreurs: string[], ids: Set<string>, idsEtapes: Set<string>): Logement | null {
  const nom = `Logement n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas un logement valide.`);
    return null;
  }
  const libelle = texte(brut, 'nom');
  const qui = libelle ? `${nom} (${libelle})` : nom;
  const avant = erreurs.length;

  if (!libelle) erreurs.push(`${qui} : nom manquant.`);
  const id = texte(brut, 'id') || `logement-import-${index + 1}`;
  if (ids.has(id)) erreurs.push(`${qui} : identifiant « ${id} » utilisé deux fois.`);
  ids.add(id);

  const etapeId = texte(brut, 'etapeId');
  if (!etapeId) erreurs.push(`${qui} : « etapeId » manquant.`);
  else if (!idsEtapes.has(etapeId)) erreurs.push(`${qui} : l'étape « ${etapeId} » n'existe pas dans le fichier.`);

  const statutBrut = brut.statut ?? 'a-verifier';
  if (!STATUTS_LOGEMENT.some((s) => s === statutBrut)) {
    erreurs.push(`${qui} : statut invalide « ${String(statutBrut)} » (a-trouver, a-verifier, reserve ou confirme).`);
  }

  const lien = texte(brut, 'lien');
  if (lien !== '' && lienSur(lien) === null) erreurs.push(`${qui} : le lien doit commencer par https:// ou http://.`);

  const gps = lireGps(brut.gps, qui, erreurs);
  const arrivee = lireMoment(brut.arrivee, `${qui}, arrivée`, erreurs);
  const depart = lireMoment(brut.depart, `${qui}, départ`, erreurs);
  if (arrivee && depart && !(depart.date > arrivee.date)) {
    erreurs.push(`${qui} : le départ doit être après l'arrivée (au moins une nuit).`);
  }

  if (erreurs.length > avant || !arrivee || !depart) return null;
  return {
    id,
    etapeId,
    nom: libelle,
    statut: statutBrut as Logement['statut'],
    lien,
    adresse: texte(brut, 'adresse'),
    gps,
    arrivee,
    depart,
    reference: texte(brut, 'reference'),
    notes: texte(brut, 'notes'),
  };
}

function lireNombre(o: Objet, cle: string, max: number, qui: string, erreurs: string[]): number | null {
  const v = o[cle];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) {
    erreurs.push(`${qui} : « ${cle} » doit être un nombre entre 0 et ${max}.`);
    return null;
  }
  return v;
}

function lireTrajet(
  brut: unknown,
  index: number,
  erreurs: string[],
  ids: Set<string>,
  idsVols: Set<string> | null,
  idsLogements: Set<string> | null,
): Trajet | null {
  const nom = `Trajet n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas un trajet valide.`);
    return null;
  }
  const de = texte(brut, 'de');
  const a = texte(brut, 'a');
  const qui = de && a ? `${nom} (${de} → ${a})` : nom;
  const avant = erreurs.length;

  if (!de) erreurs.push(`${qui} : lieu de départ manquant.`);
  if (!a) erreurs.push(`${qui} : lieu d'arrivée manquant.`);
  const id = texte(brut, 'id') || `trajet-import-${index + 1}`;
  if (ids.has(id)) erreurs.push(`${qui} : identifiant « ${id} » utilisé deux fois.`);
  ids.add(id);

  const modeBrut = brut.mode ?? '';
  if (modeBrut !== '' && !MODES_TRAJET.some((m) => m === modeBrut)) {
    erreurs.push(`${qui} : mode invalide « ${String(modeBrut)} » (${MODES_TRAJET.join(', ')}, ou vide si pas encore choisi).`);
  }
  const date = texte(brut, 'date');
  if (!dateValide(date)) erreurs.push(`${qui} : date invalide « ${date} » (format AAAA-MM-JJ attendu).`);
  const heure = texte(brut, 'heure');
  if (heure !== '' && !heureValide(heure)) erreurs.push(`${qui} : heure invalide « ${heure} » (format HH:MM, ou vide si elle n'est pas fixée).`);
  const fuseau = texte(brut, 'fuseau');
  if (!fuseauValide(fuseau)) erreurs.push(`${qui} : fuseau horaire inconnu « ${fuseau} » (exemple : Asia/Bangkok).`);

  const dureeMin = lireNombre(brut, 'dureeMin', 10080, qui, erreurs);
  const prixMin = lireNombre(brut, 'prixMin', 10000000, qui, erreurs);
  const prixMax = lireNombre(brut, 'prixMax', 10000000, qui, erreurs);
  if ((prixMin === null) !== (prixMax === null)) erreurs.push(`${qui} : « prixMin » et « prixMax » vont ensemble.`);
  else if (prixMin !== null && prixMax !== null && prixMin > prixMax) erreurs.push(`${qui} : le prix minimum dépasse le prix maximum.`);
  const devise = texte(brut, 'devise').toUpperCase();
  if (prixMin !== null && !/^[A-Z]{3}$/.test(devise)) erreurs.push(`${qui} : devise manquante ou invalide pour le prix (3 lettres, exemple : THB).`);
  if (brut.dureeEstimee !== undefined && typeof brut.dureeEstimee !== 'boolean') erreurs.push(`${qui} : « dureeEstimee » doit valoir true ou false.`);

  const consulteLe = texte(brut, 'consulteLe');
  if (consulteLe !== '' && !dateValide(consulteLe)) erreurs.push(`${qui} : date de consultation invalide « ${consulteLe} » (format AAAA-MM-JJ attendu).`);

  const volId = texte(brut, 'volId');
  if (volId !== '' && idsVols && !idsVols.has(volId)) erreurs.push(`${qui} : le vol « ${volId} » n'existe pas dans le fichier.`);
  const lienVol = brut.lienVol ?? 'vers';
  if (lienVol !== 'vers' && lienVol !== 'depuis') erreurs.push(`${qui} : « lienVol » doit valoir vers ou depuis.`);
  const logementId = texte(brut, 'logementId');
  if (logementId !== '' && idsLogements && !idsLogements.has(logementId)) erreurs.push(`${qui} : le logement « ${logementId} » n'existe pas dans le fichier.`);

  if (erreurs.length > avant) return null;
  return {
    id,
    de,
    a,
    mode: modeBrut as Trajet['mode'],
    date,
    heure,
    fuseau,
    dureeMin,
    dureeEstimee: brut.dureeEstimee === true,
    prixMin,
    prixMax,
    devise: prixMin !== null ? devise : '',
    source: texte(brut, 'source'),
    consulteLe,
    volId,
    lienVol: lienVol as Trajet['lienVol'],
    logementId,
    notes: texte(brut, 'notes'),
  };
}

function lireTache(brut: unknown, index: number, erreurs: string[], ids: Set<string>): Tache | null {
  const nom = `Tâche n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas une tâche valide.`);
    return null;
  }
  const titre = texte(brut, 'titre');
  const qui = titre ? `${nom} (${titre.slice(0, 40)})` : nom;
  const avant = erreurs.length;

  if (!titre) erreurs.push(`${qui} : titre manquant.`);
  const id = texte(brut, 'id') || `tache-import-${index + 1}`;
  if (ids.has(id)) erreurs.push(`${qui} : identifiant « ${id} » utilisé deux fois.`);
  ids.add(id);

  const listeBrute = brut.liste ?? 'reste-a-faire';
  if (!LISTES_TACHE.some((l) => l === listeBrute)) {
    erreurs.push(`${qui} : liste invalide « ${String(listeBrute)} » (${LISTES_TACHE.join(' ou ')}).`);
  }
  const dateSouhaitee = texte(brut, 'dateSouhaitee');
  if (dateSouhaitee !== '' && !dateValide(dateSouhaitee)) erreurs.push(`${qui} : date souhaitée invalide « ${dateSouhaitee} » (format AAAA-MM-JJ attendu).`);
  const echeance = texte(brut, 'echeance');
  if (echeance !== '' && !dateValide(echeance)) erreurs.push(`${qui} : échéance invalide « ${echeance} » (format AAAA-MM-JJ attendu).`);
  if (dateValide(dateSouhaitee) && dateValide(echeance) && dateSouhaitee > echeance) {
    erreurs.push(`${qui} : la date souhaitée est après l'échéance.`);
  }
  if (brut.fait !== undefined && typeof brut.fait !== 'boolean') erreurs.push(`${qui} : « fait » doit valoir true ou false.`);
  const faitLe = texte(brut, 'faitLe');
  if (faitLe !== '' && !dateValide(faitLe)) erreurs.push(`${qui} : date « faitLe » invalide « ${faitLe} » (format AAAA-MM-JJ attendu).`);
  const lien = texte(brut, 'lien');
  if (lien !== '' && lienSur(lien) === null) erreurs.push(`${qui} : le lien doit commencer par https:// ou http://.`);

  if (erreurs.length > avant) return null;
  const fait = brut.fait === true;
  return {
    id,
    titre,
    liste: listeBrute as Tache['liste'],
    dateSouhaitee,
    echeance,
    fait,
    faitLe: fait ? faitLe : '',
    note: texte(brut, 'note'),
    lien,
  };
}

function lirePersonne(brut: unknown, index: number, erreurs: string[], ids: Set<string>): Personne | null {
  const nom = `Personne n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas une personne valide.`);
    return null;
  }
  const prenom = texte(brut, 'prenom');
  const avant = erreurs.length;
  if (!prenom) erreurs.push(`${nom} : prénom manquant.`);
  const id = texte(brut, 'id') || `personne-import-${index + 1}`;
  if (ids.has(id)) erreurs.push(`${nom} (${prenom}) : identifiant « ${id} » utilisé deux fois.`);
  ids.add(id);
  if (erreurs.length > avant) return null;
  return { id, prenom, notes: texte(brut, 'notes') };
}

function lireListeIds(brut: unknown, qui: string, erreurs: string[], idsPersonnes: Set<string> | null): string[] {
  if (brut === undefined) return [];
  if (!Array.isArray(brut) || brut.some((x) => typeof x !== 'string')) {
    erreurs.push(`${qui} : « participants » doit être une liste d'identifiants de personnes.`);
    return [];
  }
  const ids = brut as string[];
  if (idsPersonnes) for (const id of ids) if (!idsPersonnes.has(id)) erreurs.push(`${qui} : la personne « ${id} » n'existe pas dans le fichier.`);
  return ids;
}

function lireCreneau(brut: unknown, index: number, erreurs: string[], ids: Set<string>, idsPersonnes: Set<string> | null): Creneau | null {
  const nom = `Créneau n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas un créneau valide.`);
    return null;
  }
  const titre = texte(brut, 'titre');
  const qui = titre ? `${nom} (${titre.slice(0, 40)})` : nom;
  const avant = erreurs.length;

  if (!titre) erreurs.push(`${qui} : titre manquant.`);
  const id = texte(brut, 'id') || `creneau-import-${index + 1}`;
  if (ids.has(id)) erreurs.push(`${qui} : identifiant « ${id} » utilisé deux fois.`);
  ids.add(id);

  const jour = texte(brut, 'jour');
  if (!dateValide(jour)) erreurs.push(`${qui} : jour invalide « ${jour} » (format AAAA-MM-JJ attendu).`);
  const periode = brut.periode ?? '';
  if (periode !== '' && !PERIODES.some((p) => p === periode)) erreurs.push(`${qui} : période invalide « ${String(periode)} » (${PERIODES.join(', ')}).`);
  const debut = texte(brut, 'debut');
  const fin = texte(brut, 'fin');
  if (debut !== '' && !heureValide(debut)) erreurs.push(`${qui} : heure de début invalide « ${debut} » (HH:MM).`);
  if (fin !== '' && !heureValide(fin)) erreurs.push(`${qui} : heure de fin invalide « ${fin} » (HH:MM).`);
  if (fin !== '' && debut === '') erreurs.push(`${qui} : une heure de fin demande une heure de début.`);
  if (heureValide(debut) && heureValide(fin) && fin <= debut) erreurs.push(`${qui} : la fin doit être après le début (même jour).`);
  const fuseau = texte(brut, 'fuseau');
  if (!fuseauValide(fuseau)) erreurs.push(`${qui} : fuseau horaire inconnu « ${fuseau} » (exemple : Asia/Bangkok).`);

  const statutBrut = brut.statut ?? 'prevu';
  if (!STATUTS_CRENEAU.some((s) => s === statutBrut)) erreurs.push(`${qui} : statut invalide « ${String(statutBrut)} » (${STATUTS_CRENEAU.join(', ')}).`);
  const humeur = brut.humeur ?? '';
  if (humeur !== '' && !HUMEURS.some((h) => h === humeur)) erreurs.push(`${qui} : humeur invalide « ${String(humeur)} » (${HUMEURS.join(', ')}).`);
  const typeEvenement = brut.typeEvenement ?? '';
  if (typeEvenement !== '' && !TYPES_EVENEMENT.some((t) => t === typeEvenement)) erreurs.push(`${qui} : type d'événement invalide « ${String(typeEvenement)} » (${TYPES_EVENEMENT.join(', ')}).`);
  if (brut.fixe !== undefined && typeof brut.fixe !== 'boolean') erreurs.push(`${qui} : « fixe » doit valoir true ou false.`);

  const participants = lireListeIds(brut.participants, qui, erreurs, idsPersonnes);
  const budgetEstime = lireNombre(brut, 'budgetEstime', 10000000, qui, erreurs);
  const budgetReel = lireNombre(brut, 'budgetReel', 10000000, qui, erreurs);
  const devise = texte(brut, 'devise').toUpperCase();
  if ((budgetEstime !== null || budgetReel !== null) && !/^[A-Z]{3}$/.test(devise)) erreurs.push(`${qui} : devise manquante ou invalide pour le budget (3 lettres, exemple : THB).`);
  const dureeMin = lireNombre(brut, 'dureeMin', 1440, qui, erreurs);

  if (erreurs.length > avant) return null;
  const aBudget = budgetEstime !== null || budgetReel !== null;
  return {
    id,
    jour,
    periode: periode as Creneau['periode'],
    debut,
    fin,
    fuseau,
    titre,
    note: texte(brut, 'note'),
    statut: statutBrut as Creneau['statut'],
    humeur: humeur as Creneau['humeur'],
    participants,
    budgetEstime,
    budgetReel,
    devise: aBudget ? devise : '',
    dureeMin,
    planBDe: texte(brut, 'planBDe'),
    fixe: brut.fixe === true,
    typeEvenement: typeEvenement as Creneau['typeEvenement'],
    lieuId: texte(brut, 'lieuId'),
  };
}

function lireJourPlan(brut: unknown, index: number, erreurs: string[], idsPersonnes: Set<string> | null): JourPlan | null {
  const nom = `Jour n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas un jour valide.`);
    return null;
  }
  const avant = erreurs.length;
  const jour = texte(brut, 'jour');
  if (!dateValide(jour)) erreurs.push(`${nom} : jour invalide « ${jour} » (format AAAA-MM-JJ attendu).`);
  const participants = lireListeIds(brut.participants, nom, erreurs, idsPersonnes);
  return erreurs.length > avant ? null : { jour, participants };
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

  let idsEtapes: Set<string> | null = null;
  if (brut.etapes !== undefined) {
    if (!Array.isArray(brut.etapes)) {
      erreurs.push('« etapes » doit être une liste.');
    } else {
      const ids = new Set<string>();
      const etapes = brut.etapes.map((e, i) => lireEtape(e, i, erreurs, ids));
      idsEtapes = ids;
      donnees.etapes = etapes.filter((e): e is Etape => e !== null);
    }
  }

  if (brut.logements !== undefined) {
    if (!Array.isArray(brut.logements)) {
      erreurs.push('« logements » doit être une liste.');
    } else if (!idsEtapes) {
      erreurs.push('Les logements ont besoin des étapes : ajoute la section « etapes » dans le même fichier.');
    } else {
      const ids = new Set<string>();
      const logements = brut.logements.map((l, i) => lireLogement(l, i, erreurs, ids, idsEtapes));
      donnees.logements = logements.filter((l): l is Logement => l !== null);
    }
  }

  if (brut.trajets !== undefined) {
    if (!Array.isArray(brut.trajets)) {
      erreurs.push('« trajets » doit être une liste.');
    } else {
      const ids = new Set<string>();
      const idsLogements = donnees.logements ? new Set(donnees.logements.map((l) => l.id)) : null;
      const trajets = brut.trajets.map((t, i) => lireTrajet(t, i, erreurs, ids, idsVols, idsLogements));
      donnees.trajets = trajets.filter((t): t is Trajet => t !== null);
    }
  }

  if (brut.taches !== undefined) {
    if (!Array.isArray(brut.taches)) {
      erreurs.push('« taches » doit être une liste.');
    } else {
      const ids = new Set<string>();
      const taches = brut.taches.map((t, i) => lireTache(t, i, erreurs, ids));
      donnees.taches = taches.filter((t): t is Tache => t !== null);
    }
  }

  let idsPersonnes: Set<string> | null = null;
  if (brut.personnes !== undefined) {
    if (!Array.isArray(brut.personnes)) {
      erreurs.push('« personnes » doit être une liste.');
    } else {
      const ids = new Set<string>();
      const personnes = brut.personnes.map((p, i) => lirePersonne(p, i, erreurs, ids));
      idsPersonnes = ids;
      donnees.personnes = personnes.filter((p): p is Personne => p !== null);
    }
  }

  if (brut.creneaux !== undefined) {
    if (!Array.isArray(brut.creneaux)) {
      erreurs.push('« creneaux » doit être une liste.');
    } else {
      const ids = new Set<string>();
      const lus = brut.creneaux.map((c, i) => lireCreneau(c, i, erreurs, ids, idsPersonnes));
      const creneaux = lus.filter((c): c is Creneau => c !== null);
      // Un plan B doit dépendre d'un créneau principal qui existe (et qui n'est pas lui-même un plan B)
      for (const c of creneaux) {
        if (c.planBDe === '') continue;
        const principal = creneaux.find((x) => x.id === c.planBDe);
        if (!principal) erreurs.push(`Créneau « ${c.titre} » : son principal « ${c.planBDe} » n'existe pas dans le fichier.`);
        else if (principal.planBDe !== '') erreurs.push(`Créneau « ${c.titre} » : un plan B ne peut pas avoir lui-même un plan B.`);
      }
      donnees.creneaux = creneaux;
    }
  }

  if (brut.joursPlan !== undefined) {
    if (!Array.isArray(brut.joursPlan)) {
      erreurs.push('« joursPlan » doit être une liste.');
    } else {
      const jours = brut.joursPlan.map((j, i) => lireJourPlan(j, i, erreurs, idsPersonnes));
      donnees.joursPlan = jours.filter((j): j is JourPlan => j !== null);
    }
  }

  // Lieux ajoutés par l'utilisateur : mêmes règles que la base publique (source obligatoire pour chaque fait chiffré)
  if (brut.lieuxPerso !== undefined) {
    if (!Array.isArray(brut.lieuxPerso)) {
      erreurs.push('« lieuxPerso » doit être une liste.');
    } else {
      donnees.lieuxPerso = lireLieux(brut.lieuxPerso, erreurs);
    }
  }

  if (brut.suiviLieux !== undefined) {
    if (!Array.isArray(brut.suiviLieux)) {
      erreurs.push('« suiviLieux » doit être une liste.');
    } else {
      donnees.suiviLieux = lireSuivis(brut.suiviLieux, erreurs);
    }
  }

  if (erreurs.length > 0) return { ok: false, erreurs };
  if (!donnees.vols && !donnees.compteurs && !donnees.reglages && !donnees.etapes && !donnees.logements && !donnees.trajets && !donnees.taches && !donnees.personnes && !donnees.creneaux && !donnees.joursPlan && !donnees.lieuxPerso && !donnees.suiviLieux) {
    return { ok: false, erreurs: ['Le fichier ne contient ni vols, ni compteurs, ni réglages, ni étapes, ni logements, ni trajets, ni tâches, ni personnes, ni créneaux, ni lieux.'] };
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

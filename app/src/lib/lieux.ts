// Fiches de lieux : validation stricte, recherche, ouverture, distance, filtres.
// Règle du cahier : une information sans source n'existe pas, elle est « à vérifier ».

import type { AccesLieu, AEviter, AttentionLieu, Categorie, ModeTrajet, Personne, Creneau, TarifAge, TrancheAge, Donnees, HorairesLieu, JourSemaine, Lieu, PlageHoraire, Periode, SouhaitLieu, SourceLieu, SuiviLieu } from '../data/types.ts';
import { CATEGORIES, JOURS_SEMAINE, LIBELLES_CATEGORIE, MODES_TRAJET } from '../data/types.ts';
import { HEURE_PERIODE } from './periodes.ts';
import { affinitesLieu } from './affinites.ts';
import { accesLieu, aEviterLieu, contraintesLieu } from './contraintes.ts';
import { trancheDe } from './profils.ts';
import type { Signalement } from './contraintes.ts';
import { normaliserTexte } from './texte.ts';
import type { Alerte } from './planning.ts';
import { calculerTrajet, etapesDuJour } from './planning.ts';
import { instantArrivee, instantDepart } from './vols.ts';
import { joursEntre, lienSur } from './sejour.ts';
import { dateValide, fuseauValide, heureValide, instantLocal } from './temps.ts';

export const FORMAT_LIEUX = 'on-fait-quoi-lieux';
export const VERSION_LIEUX = 1;

// ---------- Validation ----------

type Objet = Record<string, unknown>;
const estObjet = (x: unknown): x is Objet => typeof x === 'object' && x !== null && !Array.isArray(x);
const texte = (o: Objet, cle: string): string => (typeof o[cle] === 'string' ? (o[cle] as string).trim() : '');

function heureHoraire(s: string): boolean {
  return heureValide(s) || s === '24:00';
}

export function lireSource(brut: unknown, qui: string, erreurs: string[]): SourceLieu | null {
  if (!estObjet(brut)) {
    erreurs.push(`${qui} : la source est obligatoire (lien, nom, date de consultation, officielle ou non).`);
    return null;
  }
  const avant = erreurs.length;
  const lien = texte(brut, 'lien');
  if (lienSur(lien) === null) erreurs.push(`${qui} : le lien de la source doit commencer par https:// ou http://.`);
  const libelle = texte(brut, 'libelle');
  if (!libelle) erreurs.push(`${qui} : le nom de la source est manquant.`);
  const consulteLe = texte(brut, 'consulteLe');
  if (!dateValide(consulteLe)) erreurs.push(`${qui} : la date de consultation de la source est invalide « ${consulteLe} » (AAAA-MM-JJ).`);
  if (typeof brut.officielle !== 'boolean') erreurs.push(`${qui} : « officielle » doit valoir true ou false.`);
  if (erreurs.length > avant) return null;
  return { lien, libelle, consulteLe, officielle: brut.officielle as boolean };
}

function nombre(o: Objet, cle: string, qui: string, erreurs: string[], max: number): number | null {
  const v = o[cle];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) {
    erreurs.push(`${qui} : « ${cle} » doit être un nombre entre 0 et ${max}.`);
    return null;
  }
  return v;
}

// Tarifs selon l'âge : chacun a un libellé, des âges cohérents et un prix ; ils partagent la source du prix du lieu
function lireTarifs(brut: unknown, qui: string, erreurs: string[]): TarifAge[] {
  if (brut === undefined || brut === null) return [];
  if (!Array.isArray(brut)) {
    erreurs.push(`${qui} : « tarifs » doit être une liste.`);
    return [];
  }
  const tarifs: TarifAge[] = [];
  brut.forEach((t, i) => {
    const nom = `${qui}, tarif n°${i + 1}`;
    if (!estObjet(t) || !texte(t, 'libelle')) {
      erreurs.push(`${nom} : un libellé est obligatoire (ex. « Enfant de 3 à 12 ans »).`);
      return;
    }
    const age = (cle: string): number | null | undefined => {
      const v = t[cle];
      if (v === undefined || v === null) return null;
      return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 130 ? v : undefined;
    };
    const ageMin = age('ageMin');
    const ageMax = age('ageMax');
    if (ageMin === undefined || ageMax === undefined) {
      erreurs.push(`${nom} : les âges doivent être des nombres entiers d'années (ou absents).`);
      return;
    }
    if (ageMin === null && ageMax === null) {
      erreurs.push(`${nom} : indique au moins un âge (minimum ou maximum).`);
      return;
    }
    if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
      erreurs.push(`${nom} : l'âge minimum dépasse l'âge maximum.`);
      return;
    }
    const avant = erreurs.length;
    const min = nombre(t, 'min', nom, erreurs, 10000000);
    const max = nombre(t, 'max', nom, erreurs, 10000000);
    if (min !== null && max !== null && min > max) erreurs.push(`${nom} : le minimum dépasse le maximum.`);
    if (erreurs.length > avant || min === null || max === null) return;
    tarifs.push({ libelle: texte(t, 'libelle'), ageMin, ageMax, min, max });
  });
  return tarifs;
}

function lireHoraires(brut: unknown, qui: string, erreurs: string[]): HorairesLieu | null {
  if (!estObjet(brut)) {
    erreurs.push(`${qui} : horaires invalides.`);
    return null;
  }
  const avant = erreurs.length;
  const source = lireSource(brut.source, `${qui} (horaires)`, erreurs);
  const nature = brut.nature;
  if (nature !== 'ouverture' && nature !== 'animation') erreurs.push(`${qui} (horaires) : « nature » doit valoir ouverture ou animation.`);
  const jours: HorairesLieu['jours'] = {};
  if (!estObjet(brut.jours)) {
    erreurs.push(`${qui} (horaires) : « jours » manquant.`);
  } else {
    for (const cle of Object.keys(brut.jours)) {
      if (!JOURS_SEMAINE.some((j) => j === cle)) {
        erreurs.push(`${qui} (horaires) : jour inconnu « ${cle} ».`);
        continue;
      }
      const valeur = brut.jours[cle];
      if (valeur === 'ferme') {
        jours[cle as JourSemaine] = 'ferme';
      } else if (Array.isArray(valeur) && valeur.length > 0) {
        const plages: PlageHoraire[] = [];
        for (const p of valeur) {
          if (!estObjet(p) || !heureHoraire(texte(p, 'ouvre')) || !heureHoraire(texte(p, 'ferme')) || texte(p, 'ouvre') === texte(p, 'ferme')) {
            erreurs.push(`${qui} (horaires, ${cle}) : plage invalide (HH:MM, avec ouverture différente de la fermeture).`);
          } else {
            plages.push({ ouvre: texte(p, 'ouvre'), ferme: texte(p, 'ferme') });
          }
        }
        jours[cle as JourSemaine] = plages;
      } else {
        erreurs.push(`${qui} (horaires, ${cle}) : attendu « ferme » ou une liste de plages.`);
      }
    }
  }
  const fermetures: HorairesLieu['fermetures'] = [];
  if (brut.fermetures !== undefined) {
    if (!Array.isArray(brut.fermetures)) {
      erreurs.push(`${qui} (horaires) : « fermetures » doit être une liste.`);
    } else {
      for (const f of brut.fermetures) {
        if (!estObjet(f) || !dateValide(texte(f, 'du')) || !dateValide(texte(f, 'au')) || texte(f, 'au') < texte(f, 'du') || texte(f, 'motif') === '') {
          erreurs.push(`${qui} (horaires) : fermeture invalide (du, au en AAAA-MM-JJ, et un motif).`);
        } else {
          fermetures.push({ du: texte(f, 'du'), au: texte(f, 'au'), motif: texte(f, 'motif') });
        }
      }
    }
  }
  const derniereEntree = texte(brut, 'derniereEntree');
  if (derniereEntree !== '' && !heureValide(derniereEntree)) erreurs.push(`${qui} (horaires) : dernière entrée invalide « ${derniereEntree} » (HH:MM).`);
  if (erreurs.length > avant || !source) return null;
  return { nature: nature as HorairesLieu['nature'], jours, fermetures, derniereEntree, note: texte(brut, 'note'), source };
}

function lireLieu(brut: unknown, index: number, erreurs: string[], ids: Set<string>): Lieu | null {
  const nom = `Lieu n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas une fiche valide.`);
    return null;
  }
  const titre = texte(brut, 'nom');
  const qui = titre ? `${nom} (${titre})` : nom;
  const avant = erreurs.length;

  if (!titre) erreurs.push(`${qui} : nom manquant.`);
  const id = texte(brut, 'id');
  if (!id) erreurs.push(`${qui} : identifiant manquant.`);
  else if (ids.has(id)) erreurs.push(`${qui} : identifiant « ${id} » utilisé deux fois.`);
  ids.add(id);
  const zone = texte(brut, 'zone');
  if (!zone) erreurs.push(`${qui} : « zone » manquante (ville ou région, ex. Bangkok).`);
  const fuseau = texte(brut, 'fuseau');
  if (!fuseauValide(fuseau)) erreurs.push(`${qui} : fuseau horaire inconnu « ${fuseau} ».`);

  const categories: Categorie[] = [];
  if (!Array.isArray(brut.categories) || brut.categories.length === 0) {
    erreurs.push(`${qui} : au moins une catégorie est obligatoire.`);
  } else {
    for (const c of brut.categories) {
      if (CATEGORIES.some((x) => x === c)) categories.push(c as Categorie);
      else erreurs.push(`${qui} : catégorie inconnue « ${String(c)} ».`);
    }
  }
  const etiquettes = Array.isArray(brut.etiquettes) && brut.etiquettes.every((e) => typeof e === 'string') ? (brut.etiquettes as string[]) : [];
  if (brut.etiquettes !== undefined && etiquettes.length !== (brut.etiquettes as unknown[]).length) erreurs.push(`${qui} : « etiquettes » doit être une liste de textes.`);

  // Chaque information chiffrée ou datée vient avec sa source. Absente (null) = « à vérifier ».
  let gps: Lieu['gps'] = null;
  if (brut.gps !== undefined && brut.gps !== null) {
    if (!estObjet(brut.gps) || typeof brut.gps.lat !== 'number' || typeof brut.gps.lng !== 'number' || !(brut.gps.lat >= -90 && brut.gps.lat <= 90) || !(brut.gps.lng >= -180 && brut.gps.lng <= 180)) {
      erreurs.push(`${qui} : coordonnées GPS invalides.`);
    } else {
      const s = lireSource(brut.gps.source, `${qui} (GPS)`, erreurs);
      if (s) gps = { lat: brut.gps.lat, lng: brut.gps.lng, source: s };
    }
  }
  let incontournable: Lieu['incontournable'] = null;
  if (brut.incontournable !== undefined && brut.incontournable !== null) {
    if (!estObjet(brut.incontournable) || !texte(brut.incontournable, 'raison')) {
      erreurs.push(`${qui} : « incontournable » demande une raison et une source citée.`);
    } else {
      const s = lireSource(brut.incontournable.source, `${qui} (incontournable)`, erreurs);
      if (s) incontournable = { raison: texte(brut.incontournable, 'raison'), source: s };
    }
  }
  let duree: Lieu['duree'] = null;
  if (brut.duree !== undefined && brut.duree !== null) {
    if (!estObjet(brut.duree)) {
      erreurs.push(`${qui} : durée invalide.`);
    } else {
      const min = nombre(brut.duree, 'minMin', `${qui} (durée)`, erreurs, 1440);
      const max = nombre(brut.duree, 'maxMin', `${qui} (durée)`, erreurs, 1440);
      if (min !== null && max !== null && min > max) erreurs.push(`${qui} (durée) : le minimum dépasse le maximum.`);
      if (typeof brut.duree.estimee !== 'boolean') erreurs.push(`${qui} (durée) : « estimee » doit valoir true ou false.`);
      if (brut.duree.estimee === true && !texte(brut.duree, 'base')) erreurs.push(`${qui} (durée) : une durée estimée demande la base du calcul.`);
      const s = lireSource(brut.duree.source, `${qui} (durée)`, erreurs);
      if (s && min !== null && max !== null) duree = { minMin: min, maxMin: max, estimee: brut.duree.estimee === true, base: texte(brut.duree, 'base'), source: s };
    }
  }
  let prix: Lieu['prix'] = null;
  if (brut.prix !== undefined && brut.prix !== null) {
    if (!estObjet(brut.prix)) {
      erreurs.push(`${qui} : prix invalide.`);
    } else {
      const min = nombre(brut.prix, 'min', `${qui} (prix)`, erreurs, 10000000);
      const max = nombre(brut.prix, 'max', `${qui} (prix)`, erreurs, 10000000);
      if (min !== null && max !== null && min > max) erreurs.push(`${qui} (prix) : le minimum dépasse le maximum.`);
      const devise = texte(brut.prix, 'devise').toUpperCase();
      if (!/^[A-Z]{3}$/.test(devise)) erreurs.push(`${qui} (prix) : devise invalide (3 lettres, ex. THB).`);
      const tarifs = lireTarifs(brut.prix.tarifs, `${qui} (prix)`, erreurs);
      const s = lireSource(brut.prix.source, `${qui} (prix)`, erreurs);
      if (s && min !== null && max !== null && /^[A-Z]{3}$/.test(devise)) prix = { min, max, devise, note: texte(brut.prix, 'note'), ...(tarifs.length > 0 ? { tarifs } : {}), source: s };
    }
  }
  const horaires = brut.horaires !== undefined && brut.horaires !== null ? lireHoraires(brut.horaires, qui, erreurs) : null;
  let reservation: Lieu['reservation'] = null;
  if (brut.reservation !== undefined && brut.reservation !== null) {
    if (!estObjet(brut.reservation) || (brut.reservation.necessaire !== null && typeof brut.reservation.necessaire !== 'boolean')) {
      erreurs.push(`${qui} : réservation invalide (« necessaire » : true, false ou null si non précisé).`);
    } else {
      const lien = texte(brut.reservation, 'lien');
      if (lien !== '' && lienSur(lien) === null) erreurs.push(`${qui} (réservation) : le lien doit commencer par https://.`);
      const s = lireSource(brut.reservation.source, `${qui} (réservation)`, erreurs);
      if (s) reservation = { necessaire: brut.reservation.necessaire as boolean | null, lien, note: texte(brut.reservation, 'note'), source: s };
    }
  }
  let tenue: Lieu['tenue'] = null;
  if (brut.tenue !== undefined && brut.tenue !== null) {
    if (!estObjet(brut.tenue) || !texte(brut.tenue, 'texte')) {
      erreurs.push(`${qui} : tenue invalide.`);
    } else {
      const s = lireSource(brut.tenue.source, `${qui} (tenue)`, erreurs);
      if (s) tenue = { texte: texte(brut.tenue, 'texte'), source: s };
    }
  }
  let publicLieu: Lieu['public'] = null;
  if (brut.public !== undefined && brut.public !== null) {
    if (!estObjet(brut.public) || !texte(brut.public, 'texte')) {
      erreurs.push(`${qui} : public invalide.`);
    } else {
      const s = lireSource(brut.public.source, `${qui} (public)`, erreurs);
      if (s) publicLieu = { texte: texte(brut.public, 'texte'), source: s };
    }
  }

  const attention: AttentionLieu[] = [];
  if (brut.attention !== undefined) {
    if (!Array.isArray(brut.attention)) erreurs.push(`${qui} : « attention » doit être une liste.`);
    else {
      for (const a of brut.attention) {
        if (!estObjet(a) || !['foule', 'chaleur', 'extreme'].includes(a.genre as string) || !texte(a, 'texte')) {
          erreurs.push(`${qui} : mise en garde invalide (genre foule, chaleur ou extreme, et un texte).`);
          continue;
        }
        const s = lireSource(a.source, `${qui} (mise en garde)`, erreurs);
        if (s) attention.push({ genre: a.genre as AttentionLieu['genre'], texte: texte(a, 'texte'), source: s });
      }
    }
  }
  const acces: AccesLieu[] = [];
  if (brut.acces !== undefined) {
    if (!Array.isArray(brut.acces)) erreurs.push(`${qui} : « acces » doit être une liste.`);
    else {
      for (const a of brut.acces) {
        const modes = estObjet(a) && Array.isArray(a.modes) ? a.modes : [];
        if (!estObjet(a) || modes.length === 0 || !modes.every((m) => MODES_TRAJET.some((x) => x === m)) || !texte(a, 'texte')) {
          erreurs.push(`${qui} : accès invalide (au moins un mode de transport connu, et un texte).`);
          continue;
        }
        const s = lireSource(a.source, `${qui} (accès)`, erreurs);
        if (s) acces.push({ modes: modes as AccesLieu['modes'], texte: texte(a, 'texte'), source: s });
      }
    }
  }

  const interieur = brut.interieur ?? '';
  if (!['', 'interieur', 'exterieur', 'mixte'].includes(interieur as string)) erreurs.push(`${qui} : « interieur » doit valoir interieur, exterieur, mixte ou être vide.`);
  const lienOfficiel = texte(brut, 'lienOfficiel');
  if (lienOfficiel !== '' && lienSur(lienOfficiel) === null) erreurs.push(`${qui} : le lien officiel doit commencer par https://.`);
  const verifieLe = texte(brut, 'verifieLe');
  if (verifieLe !== '' && !dateValide(verifieLe)) erreurs.push(`${qui} : date de vérification invalide.`);

  if (erreurs.length > avant) return null;
  return {
    id,
    nom: titre,
    zone,
    fuseau,
    quartier: texte(brut, 'quartier'),
    adresse: texte(brut, 'adresse'),
    gps,
    categories,
    etiquettes,
    incontournable,
    description: texte(brut, 'description'),
    duree,
    prix,
    horaires,
    reservation,
    tenue,
    interieur: interieur as Lieu['interieur'],
    public: publicLieu,
    attention,
    acces,
    lienOfficiel,
    verifieLe,
    notes: texte(brut, 'notes'),
  };
}

// Lit une liste de fiches (fichier de la base publique, ou lieux ajoutés par l'utilisateur dans un import)
export function lireLieux(brut: unknown[], erreurs: string[]): Lieu[] {
  const ids = new Set<string>();
  return brut.map((l, i) => lireLieu(l, i, erreurs, ids)).filter((l): l is Lieu => l !== null);
}

export function lireSuivis(brut: unknown[], erreurs: string[]): SuiviLieu[] {
  const resultat: SuiviLieu[] = [];
  const vus = new Set<string>();
  brut.forEach((s, i) => {
    const nom = `Suivi de lieu n°${i + 1}`;
    if (!estObjet(s) || !texte(s, 'lieuId')) {
      erreurs.push(`${nom} : « lieuId » manquant.`);
      return;
    }
    const lieuId = texte(s, 'lieuId');
    if (vus.has(lieuId)) erreurs.push(`${nom} : le lieu « ${lieuId} » apparaît deux fois.`);
    vus.add(lieuId);
    const souhait = s.souhait ?? '';
    if (!['', 'souhait', 'prioritaire'].includes(souhait as string)) {
      erreurs.push(`${nom} : « souhait » doit valoir souhait, prioritaire ou être vide.`);
      return;
    }
    resultat.push({ lieuId, souhait: souhait as SouhaitLieu, favori: s.favori === true, fait: s.fait === true, note: texte(s, 'note') });
  });
  return resultat;
}

export type ResultatFichierLieux = { ok: true; lieux: Lieu[] } | { ok: false; erreurs: string[] };

export function validerFichierLieux(brut: unknown): ResultatFichierLieux {
  if (!estObjet(brut) || brut.format !== FORMAT_LIEUX) return { ok: false, erreurs: [`Ce n'est pas un fichier de lieux (champ « format » attendu : ${FORMAT_LIEUX}).`] };
  if (typeof brut.version !== 'number' || brut.version > VERSION_LIEUX) return { ok: false, erreurs: ['Version du fichier de lieux inconnue.'] };
  if (!Array.isArray(brut.lieux)) return { ok: false, erreurs: ['« lieux » doit être une liste.'] };
  const erreurs: string[] = [];
  const lieux = lireLieux(brut.lieux, erreurs);
  return erreurs.length > 0 ? { ok: false, erreurs } : { ok: true, lieux };
}

// ---------- Suivi personnel (souhait, favori, fait, note) ----------

// Ajoute ou met à jour le suivi d'un lieu ; un suivi entièrement vide disparaît (rien à garder)
export function mettreAJourSuivi(suivis: SuiviLieu[], lieuId: string, changement: Partial<Omit<SuiviLieu, 'lieuId'>>): SuiviLieu[] {
  const actuel = suivis.find((s) => s.lieuId === lieuId) ?? { lieuId, souhait: '' as SouhaitLieu, favori: false, fait: false, note: '' };
  const suivant: SuiviLieu = { ...actuel, ...changement, lieuId };
  const autres = suivis.filter((s) => s.lieuId !== lieuId);
  const vide = suivant.souhait === '' && !suivant.favori && !suivant.fait && suivant.note.trim() === '';
  return vide ? autres : [...autres, suivant];
}

// ---------- Fusion base publique + lieux ajoutés ----------

// Un lieu ajouté par l'utilisateur prend la place d'une fiche publique de même identifiant
export function fusionnerLieux(publics: Lieu[], perso: Lieu[]): Lieu[] {
  return [...perso, ...publics.filter((l) => !perso.some((p) => p.id === l.id))];
}

// ---------- Texte et recherche ----------

export { normaliserTexte };

function mots(s: string): string[] {
  return normaliserTexte(s).split(/[^a-z0-9]+/).filter(Boolean);
}

function texteRecherche(l: Lieu): string {
  return [l.nom, l.quartier, l.adresse, l.description, l.zone, ...l.etiquettes, ...l.categories.map((c) => LIBELLES_CATEGORIE[c])].join(' ');
}

// Recherche par mots-clés : chaque mot cherché doit être le début d'un mot de la fiche,
// sans tenir compte des accents ni des majuscules (« chat » trouve Chatuchak, mais « ata » ne le trouve pas).
export function correspondAuxMots(l: Lieu, recherche: string): boolean {
  const voulus = mots(recherche);
  if (voulus.length === 0) return true;
  const present = mots(texteRecherche(l));
  return voulus.every((m) => present.some((p) => p.startsWith(m)));
}

export function aCategorie(l: Lieu, c: Categorie): boolean {
  return l.categories.includes(c) || (c === 'incontournables' && l.incontournable !== null);
}

// Les lieux d'une étape : une étape nommée « Bangkok (centre) » ramène les lieux de la zone « Bangkok ». '' = toutes les zones.
export function lieuxDeLaZone(lieux: Lieu[], nomEtape: string): Lieu[] {
  if (nomEtape.trim() === '') return lieux;
  const e = normaliserTexte(nomEtape);
  return lieux.filter((l) => e.includes(normaliserTexte(l.zone)));
}

// ---------- Distance ----------

export type Point = { lat: number; lng: number };

// Distance "à vol d'oiseau" en kilomètres
export function distanceKm(a: Point, b: Point): number {
  const rad = (x: number): number => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 10) * 100} m`;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

// ---------- Ouverture ----------

// officielle = vrai quand la réponse repose sur une source officielle ; faux = source secondaire (guide) ou rien : à confirmer
export type Ouverture = { etat: 'oui' | 'non' | 'a-verifier'; detail: string; officielle: boolean };

const enMinutes = (hhmm: string): number => (hhmm === '24:00' ? 1440 : Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)));

export function jourSemaineDe(dateIso: string): JourSemaine {
  const [a, m, j] = dateIso.split('-').map(Number);
  const dimancheZero = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
  return JOURS_SEMAINE[(dimancheZero + 6) % 7];
}

const traverseMinuit = (p: PlageHoraire): boolean => enMinutes(p.ferme) <= enMinutes(p.ouvre);

// Le lieu est-il ouvert ce jour-là à cette heure ? "a-verifier" si on ne sait pas : jamais un "oui" ou un "non" inventé.
export function ouvertA(l: Lieu, dateIso: string, heure: string): Ouverture {
  const h = l.horaires;
  if (!h) return { etat: 'a-verifier', detail: 'Horaires à vérifier', officielle: false };
  const officielle = h.source.officielle;
  const fermeture = h.fermetures.find((f) => f.du <= dateIso && dateIso <= f.au);
  if (fermeture) return { etat: 'non', detail: `Fermé : ${fermeture.motif}`, officielle };
  const t = enMinutes(heure);
  const jour = jourSemaineDe(dateIso);
  const veille = JOURS_SEMAINE[(JOURS_SEMAINE.indexOf(jour) + 6) % 7];
  // Une plage de la veille peut déborder après minuit
  const plagesVeille = h.jours[veille];
  if (Array.isArray(plagesVeille)) {
    const debordement = plagesVeille.find((p) => traverseMinuit(p) && t < enMinutes(p.ferme));
    if (debordement) return { etat: 'oui', detail: `${h.nature === 'animation' ? 'Animé' : 'Ouvert'} jusqu'à ${debordement.ferme}`, officielle };
  }
  const plages = h.jours[jour];
  if (plages === undefined) return { etat: 'a-verifier', detail: 'Horaires de ce jour à vérifier', officielle: false };
  if (plages === 'ferme') return { etat: 'non', detail: 'Fermé ce jour-là', officielle };
  const ouverte = plages.find((p) => (traverseMinuit(p) ? t >= enMinutes(p.ouvre) : t >= enMinutes(p.ouvre) && t < enMinutes(p.ferme)));
  if (ouverte) {
    if (h.derniereEntree !== '' && !traverseMinuit(ouverte) && t >= enMinutes(h.derniereEntree)) {
      return { etat: 'non', detail: `Dernière entrée à ${h.derniereEntree}`, officielle };
    }
    return { etat: 'oui', detail: `${h.nature === 'animation' ? 'Animé' : 'Ouvert'} ${ouverte.ouvre}–${ouverte.ferme}`, officielle };
  }
  const liste = plages.map((p) => `${p.ouvre}–${p.ferme}`).join(', ');
  if (h.nature === 'animation') return { etat: 'a-verifier', detail: `Hors des heures d'animation habituelles (${liste})`, officielle: false };
  return { etat: 'non', detail: `Fermé à ${heure} (ouvert ${liste})`, officielle };
}

// Le lieu ouvre-t-il ce jour-là (sans heure précise) ?
export function ouvertLe(l: Lieu, dateIso: string): Ouverture {
  const h = l.horaires;
  if (!h) return { etat: 'a-verifier', detail: 'Horaires à vérifier', officielle: false };
  const officielle = h.source.officielle;
  const fermeture = h.fermetures.find((f) => f.du <= dateIso && dateIso <= f.au);
  if (fermeture) return { etat: 'non', detail: `Fermé : ${fermeture.motif}`, officielle };
  const plages = h.jours[jourSemaineDe(dateIso)];
  if (plages === undefined) return { etat: 'a-verifier', detail: 'Horaires de ce jour à vérifier', officielle: false };
  if (plages === 'ferme') return { etat: 'non', detail: 'Fermé ce jour-là', officielle };
  return { etat: 'oui', detail: plages.map((p) => `${p.ouvre}–${p.ferme}`).join(', '), officielle };
}

// ---------- Ce qui manque, fraîcheur ----------

// Les informations de la fiche qui n'ont pas de source : elles s'affichent « à vérifier »
export function faitsAVerifier(l: Lieu): string[] {
  const manque: string[] = [];
  if (l.horaires === null) manque.push('horaires');
  if (l.prix === null) manque.push('prix');
  if (l.duree === null) manque.push('durée');
  if (l.reservation === null) manque.push('réservation');
  if (l.gps === null) manque.push('emplacement GPS');
  return manque;
}

export function fraicheurLieu(l: Lieu, aujourdhui: string): string {
  if (l.verifieLe === '') return 'À vérifier';
  const n = joursEntre(l.verifieLe, aujourdhui);
  if (n <= 0) return "Vérifié aujourd'hui";
  return n === 1 ? 'Vérifié hier' : `Vérifié il y a ${n} jours`;
}

// ---------- Demande « Quoi faire, quand ? » ----------

export type Tri = 'pertinence' | 'distance' | 'prix' | 'duree' | 'nom';

export type Demande = {
  zone: string; // nom de l'étape, '' = partout
  jour: string; // AAAA-MM-JJ, '' = pas de date
  debut: string; // HH:MM, '' = pas d'heure précise
  periode: Periode | '';
  categories: Categorie[]; // [] = « surprends-moi » : toutes
  budgetMax: number | null; // par personne, dans la devise du lieu
  dureeMax: number | null; // minutes
  mots: string;
  seulementOuverts: boolean;
  depuis: Point | null; // le logement, pour calculer les distances
  tri: Tri;
  // « Qui » : les personnes concernées (leurs contraintes sont signalées) et ce qu'on veut éviter ce jour
  personnes: Personne[];
  aEviter: AEviter[];
  transports: ModeTrajet[]; // modes acceptés, [] = tous
  trajetLongKm: number;
  masquerContraintes: boolean; // masquer aussi les lieux qui contredisent clairement une contrainte (sinon : signalés seulement)
};

// Période pendant laquelle on n'est pas libre à cause d'un de mes vols : du départ vers l'aéroport jusqu'à l'atterrissage
export type FenetreVol = { numero: string; debutMs: number; finMs: number };

export type Proposition = {
  lieu: Lieu;
  ouvert: Ouverture;
  distanceKm: number | null;
  avertissements: string[];
  signalements: Signalement[]; // contraintes du groupe, « à éviter », accès : avec la raison
  affinites: TrancheAge[]; // tranches d'âge du groupe dont les priorités (cahier, section 6) correspondent à ce lieu
  pourTous: boolean; // groupe mélangé : lieu qui correspond aux priorités d'un groupe mélangé
  souhait: SouhaitLieu;
  favori: boolean;
  fait: boolean;
};

export const demandeVide = (): Demande => ({ zone: '', jour: '', debut: '', periode: '', categories: [], budgetMax: null, dureeMax: null, mots: '', seulementOuverts: false, depuis: null, tri: 'pertinence', personnes: [], aEviter: [], transports: [], trajetLongKm: 15, masquerContraintes: false });

export function heureDeLaDemande(d: Demande): string {
  if (d.debut !== '' && heureValide(d.debut)) return d.debut;
  return d.periode !== '' ? HEURE_PERIODE[d.periode] : '';
}

const rangOuvert = { oui: 0, 'a-verifier': 1, non: 2 } as const;
const rangSouhait = { prioritaire: 0, souhait: 1, '': 2 } as const;
const pointsAffinite = (p: Proposition): number => p.affinites.length + (p.pourTous ? 1 : 0);

// Filtre et trie les lieux. Les règles du cahier :
// - un lieu qui empêcherait d'attraper un vol est écarté ;
// - un lieu fermé au moment demandé est signalé, pas masqué (sauf si on demande "seulement les ouverts") ;
// - les critères de tri sont visibles (distance, prix, durée, ouverture), jamais une opinion.
export function filtrerLieux(lieux: Lieu[], d: Demande, suivis: SuiviLieu[], vols: FenetreVol[]): Proposition[] {
  const heure = heureDeLaDemande(d);
  const resultat: Proposition[] = [];
  const tranchesPresentes = [...new Set(d.personnes.map(trancheDe).filter((t): t is TrancheAge => t !== ''))];
  for (const lieu of lieuxDeLaZone(lieux, d.zone)) {
    if (d.categories.length > 0 && !d.categories.some((c) => aCategorie(lieu, c))) continue;
    if (!correspondAuxMots(lieu, d.mots)) continue;
    if (d.budgetMax !== null && lieu.prix !== null && lieu.prix.min > d.budgetMax) continue;
    if (d.dureeMax !== null && lieu.duree !== null && lieu.duree.minMin > d.dureeMax) continue;

    const ouvert: Ouverture = d.jour === '' ? { etat: 'a-verifier', detail: 'Choisis un jour pour vérifier l’ouverture', officielle: false } : heure !== '' ? ouvertA(lieu, d.jour, heure) : ouvertLe(lieu, d.jour);
    if (d.seulementOuverts && ouvert.etat === 'non') continue;

    // Jamais une proposition qui empêche d'attraper un vol (trajet vers l'aéroport inclus)
    if (d.jour !== '' && heure !== '' && vols.length > 0) {
      const debutMs = instantLocal(d.jour, heure, lieu.fuseau);
      if (!Number.isNaN(debutMs)) {
        const dureeMin = lieu.duree !== null ? lieu.duree.maxMin : (d.dureeMax ?? 0);
        const finMs = debutMs + dureeMin * 60000;
        if (vols.some((v) => debutMs < v.finMs && finMs > v.debutMs)) continue;
      }
    }

    const suivi = suivis.find((s) => s.lieuId === lieu.id);
    const avertissements: string[] = [];
    if (ouvert.etat === 'non') avertissements.push(`Fermé à ce moment : ${ouvert.detail}`);
    const km = d.depuis !== null && lieu.gps !== null ? distanceKm(d.depuis, lieu.gps) : null;
    const signalements = [
      ...contraintesLieu(lieu, d.personnes),
      ...aEviterLieu(lieu, { aEviter: d.aEviter, distanceKm: km, trajetLongKm: d.trajetLongKm }),
      ...accesLieu(lieu, d.transports),
    ];
    if (d.masquerContraintes && signalements.some((x) => x.fort)) continue;
    const affinites = affinitesLieu(lieu, tranchesPresentes);
    resultat.push({
      lieu,
      ouvert,
      distanceKm: km,
      avertissements,
      signalements,
      affinites: affinites.tranches,
      pourTous: affinites.pourTous,
      souhait: suivi?.souhait ?? '',
      favori: suivi?.favori ?? false,
      fait: suivi?.fait ?? false,
    });
  }

  const infini = (x: number | null): number => (x === null ? Infinity : x);
  const parNom = (a: Proposition, b: Proposition): number => a.lieu.nom.localeCompare(b.lieu.nom, 'fr');
  return resultat.sort((a, b) => {
    let c = 0;
    if (d.tri === 'pertinence') {
      c = rangSouhait[a.souhait] - rangSouhait[b.souhait] || rangOuvert[a.ouvert.etat] - rangOuvert[b.ouvert.etat] || pointsAffinite(b) - pointsAffinite(a) || infini(a.distanceKm) - infini(b.distanceKm);
    } else if (d.tri === 'distance') c = infini(a.distanceKm) - infini(b.distanceKm);
    else if (d.tri === 'prix') c = infini(a.lieu.prix?.min ?? null) - infini(b.lieu.prix?.min ?? null);
    else if (d.tri === 'duree') c = infini(a.lieu.duree?.minMin ?? null) - infini(b.lieu.duree?.minMin ?? null);
    return Number.isNaN(c) || c === 0 ? parNom(a, b) : c;
  });
}

// ---------- Liens avec le planning ----------

// Les moments où un de mes vols m'empêche de faire autre chose (trajet vers l'aéroport compris)
export function fenetresVols(d: Donnees): FenetreVol[] {
  const fenetres: FenetreVol[] = [];
  for (const v of d.vols) {
    if (!v.pourMoi || v.statut === 'annule') continue;
    const decollage = instantDepart(v);
    const atterrissage = instantArrivee(v);
    if (Number.isNaN(decollage) || Number.isNaN(atterrissage)) continue;
    let debut = decollage - d.reglages.delaiAeroportMin[v.portee] * 60000;
    for (const t of d.trajets) {
      if (t.volId !== v.id || t.lienVol !== 'vers') continue;
      const conseille = calculerTrajet(t, d).conseilleMs;
      if (conseille !== null && conseille < debut) debut = conseille;
    }
    fenetres.push({ numero: v.numero, debutMs: debut, finMs: atterrissage });
  }
  return fenetres;
}

// Le logement où l'on dort ce jour-là (ou, à défaut, celui où l'on arrive ou d'où l'on part), s'il a des coordonnées
export function pointDeDepart(d: Donnees, jour: string): { nom: string; point: Point } | null {
  const candidats = d.logements.filter((l) => l.gps !== null && l.arrivee.date <= jour && jour <= l.depart.date);
  const dort = candidats.find((l) => jour < l.depart.date) ?? candidats[0];
  return dort && dort.gps ? { nom: dort.nom, point: dort.gps } : null;
}

// Un créneau « idée » à partir d'une fiche : rien n'est inventé, la durée vient de la fiche (maximum de la fourchette)
export function creneauDepuisLieu(l: Lieu, id: string, jour: string, periode: Periode | '', debut: string, deviseDuJour: string): Creneau {
  return {
    id,
    jour,
    periode,
    debut,
    fin: '',
    fuseau: l.fuseau,
    titre: l.nom,
    note: '',
    statut: 'idee',
    humeur: '',
    participants: [],
    budgetEstime: null,
    budgetReel: null,
    devise: deviseDuJour,
    dureeMin: debut === '' ? (l.duree?.maxMin ?? null) : null,
    planBDe: '',
    lieuId: l.id,
    fixe: false,
    typeEvenement: '',
  };
}

// Alerte quand un créneau prévu tombe à un moment où son lieu est fermé (jamais sur un simple « à vérifier »)
export function alertesLieux(d: Donnees, lieux: Lieu[]): Alerte[] {
  const alertes: Alerte[] = [];
  for (const c of d.creneaux) {
    if (c.lieuId === '' || c.statut === 'annule' || c.statut === 'fait') continue;
    const l = lieux.find((x) => x.id === c.lieuId);
    if (!l) continue;
    const o = c.debut !== '' ? ouvertA(l, c.jour, c.debut) : ouvertLe(l, c.jour);
    if (o.etat !== 'non') continue;
    const quand = c.debut !== '' ? `à ${c.debut}` : 'ce jour-là';
    const selon = o.officielle ? 'Selon la fiche' : 'Selon la fiche (source secondaire)';
    alertes.push({ cle: `lieu-ferme:${c.id}`, message: `Lieu fermé : « ${c.titre} » est prévu ${quand}. ${selon} : ${o.detail}.`, genre: 'creneau', id: c.id, jour: c.jour });
  }
  return alertes;
}

// Étapes du séjour dont le nom correspond à une zone de la base (pour proposer « Bangkok » dans la demande)
export function zonesProposees(d: Donnees, lieux: Lieu[], jour: string): string[] {
  const zones = new Set<string>();
  const etapes = jour !== '' ? etapesDuJour(jour, d.etapes) : d.etapes;
  for (const e of etapes) if (lieuxDeLaZone(lieux, e.nom).length > 0) zones.add(e.nom);
  return [...zones];
}

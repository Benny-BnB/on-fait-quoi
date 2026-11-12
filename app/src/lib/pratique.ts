// Rubrique Pratique : fiches par étape (trajets, transports, argent, téléphone, numéros utiles, formalités).
// Même règle que les fiches de lieux : un fait sans source n'existe pas, il est « à vérifier ».

import type { Etape, FaitPratique, FichePratique, RubriquePratique, SourceLieu } from '../data/types.ts';
import { RUBRIQUES_PRATIQUE } from '../data/types.ts';
import { lireSource } from './lieux.ts';
import { joursEntre } from './sejour.ts';
import { dateValide } from './temps.ts';
import { normaliserTexte } from './texte.ts';

export const FORMAT_PRATIQUE = 'on-fait-quoi-pratique';
export const VERSION_PRATIQUE = 1;

type Objet = Record<string, unknown>;
const estObjet = (x: unknown): x is Objet => typeof x === 'object' && x !== null && !Array.isArray(x);
const texte = (o: Objet, cle: string): string => (typeof o[cle] === 'string' ? (o[cle] as string).trim() : '');

function lireFiche(brut: unknown, index: number, erreurs: string[], ids: Set<string>): FichePratique | null {
  const nom = `Fiche Pratique n°${index + 1}`;
  if (!estObjet(brut)) {
    erreurs.push(`${nom} : ce n'est pas une fiche valide.`);
    return null;
  }
  const titre = texte(brut, 'titre');
  const qui = titre ? `${nom} (${titre})` : nom;
  const avant = erreurs.length;

  if (!titre) erreurs.push(`${qui} : titre manquant.`);
  const id = texte(brut, 'id');
  if (!id) erreurs.push(`${qui} : identifiant manquant.`);
  else if (ids.has(id)) erreurs.push(`${qui} : identifiant « ${id} » utilisé deux fois.`);
  ids.add(id);
  const zone = texte(brut, 'zone');
  if (!zone) erreurs.push(`${qui} : « zone » manquante (ville, région ou pays).`);
  const rubrique = brut.rubrique;
  if (!RUBRIQUES_PRATIQUE.some((r) => r === rubrique)) erreurs.push(`${qui} : rubrique inconnue « ${String(rubrique)} ».`);

  const faits: FaitPratique[] = [];
  if (brut.faits !== undefined) {
    if (!Array.isArray(brut.faits)) erreurs.push(`${qui} : « faits » doit être une liste.`);
    else {
      brut.faits.forEach((f, i) => {
        const fait = `${qui}, fait n°${i + 1}`;
        if (!estObjet(f) || !texte(f, 'libelle') || !texte(f, 'valeur')) {
          erreurs.push(`${fait} : un libellé et une valeur sont obligatoires.`);
          return;
        }
        const s = lireSource(f.source, fait, erreurs);
        if (s) faits.push({ libelle: texte(f, 'libelle'), valeur: texte(f, 'valeur'), source: s });
      });
    }
  }

  const aVerifier: string[] = [];
  if (brut.aVerifier !== undefined) {
    if (!Array.isArray(brut.aVerifier) || !brut.aVerifier.every((x) => typeof x === 'string')) erreurs.push(`${qui} : « aVerifier » doit être une liste de textes.`);
    else aVerifier.push(...(brut.aVerifier as string[]).map((x) => x.trim()).filter((x) => x !== ''));
  }

  const liens: SourceLieu[] = [];
  if (brut.liens !== undefined) {
    if (!Array.isArray(brut.liens)) erreurs.push(`${qui} : « liens » doit être une liste.`);
    else brut.liens.forEach((l, i) => {
      const s = lireSource(l, `${qui}, lien n°${i + 1}`, erreurs);
      if (s) liens.push(s);
    });
  }

  const verifieLe = texte(brut, 'verifieLe');
  if (verifieLe !== '' && !dateValide(verifieLe)) erreurs.push(`${qui} : date de vérification invalide.`);

  if (erreurs.length > avant) return null;
  return { id, zone, rubrique: rubrique as RubriquePratique, titre, resume: texte(brut, 'resume'), faits, aVerifier, liens, verifieLe, notes: texte(brut, 'notes') };
}

// Lit une liste de fiches (fichier de la base publique, ou fiches ajoutées par l'utilisateur dans un import)
export function lireFichesPratique(brut: unknown[], erreurs: string[]): FichePratique[] {
  const ids = new Set<string>();
  return brut.map((f, i) => lireFiche(f, i, erreurs, ids)).filter((f): f is FichePratique => f !== null);
}

export type ResultatFichierPratique = { ok: true; fiches: FichePratique[] } | { ok: false; erreurs: string[] };

export function validerFichierPratique(brut: unknown): ResultatFichierPratique {
  if (!estObjet(brut) || brut.format !== FORMAT_PRATIQUE) return { ok: false, erreurs: [`Ce n'est pas un fichier Pratique (champ « format » attendu : ${FORMAT_PRATIQUE}).`] };
  if (typeof brut.version !== 'number' || brut.version > VERSION_PRATIQUE) return { ok: false, erreurs: ['Version du fichier Pratique inconnue.'] };
  if (!Array.isArray(brut.fiches)) return { ok: false, erreurs: ['« fiches » doit être une liste.'] };
  const erreurs: string[] = [];
  const fiches = lireFichesPratique(brut.fiches, erreurs);
  return erreurs.length > 0 ? { ok: false, erreurs } : { ok: true, fiches };
}

// Une fiche ajoutée par l'utilisateur prend la place d'une fiche publique de même identifiant
export function fusionnerPratique(publiques: FichePratique[], perso: FichePratique[]): FichePratique[] {
  return [...perso, ...publiques.filter((f) => !perso.some((p) => p.id === f.id))];
}

// ---------- Regroupement par étape ----------

// Une fiche concerne une étape quand le nom de sa zone se trouve dans le nom de l'étape ou dans son pays
// (« Bangkok » pour une étape « Bangkok (centre) », « Thaïlande » pour une étape dont le pays est Thaïlande)
export function ficheConcerneEtape(f: FichePratique, e: Pick<Etape, 'nom' | 'pays'>): boolean {
  const zone = normaliserTexte(f.zone);
  if (zone === '') return false;
  return normaliserTexte(e.nom).includes(zone) || normaliserTexte(e.pays).includes(zone);
}

export type GroupePratique = { titre: string; etapeId: string; fiches: FichePratique[] };

// Les fiches classées par étape du voyage (dans l'ordre des dates), puis « Autres fiches ».
// Une fiche n'apparaît qu'une seule fois, sous la première étape qu'elle concerne (une fiche « Thaïlande » est donc sous la première étape de ce pays).
export function grouperPratique(fiches: FichePratique[], etapes: Etape[]): GroupePratique[] {
  const triees = [...etapes].sort((a, b) => a.debut.localeCompare(b.debut));
  const dejaPlacees = new Set<string>();
  const groupes: GroupePratique[] = [];
  for (const e of triees) {
    const siennes = fiches.filter((f) => !dejaPlacees.has(f.id) && ficheConcerneEtape(f, e));
    siennes.forEach((f) => dejaPlacees.add(f.id));
    groupes.push({ titre: e.nom, etapeId: e.id, fiches: siennes });
  }
  const autres = fiches.filter((f) => !dejaPlacees.has(f.id));
  if (autres.length > 0) groupes.push({ titre: 'Autres fiches', etapeId: '', fiches: autres });
  return groupes;
}

export function fraicheurPratique(f: FichePratique, aujourdhui: string): string {
  if (f.verifieLe === '') return 'À vérifier';
  const n = joursEntre(f.verifieLe, aujourdhui);
  if (n <= 0) return "Vérifié aujourd'hui";
  return n === 1 ? 'Vérifié hier' : `Vérifié il y a ${n} jours`;
}

// Une fiche a besoin d'attention quand elle liste des points à vérifier ou n'a aucun fait sourcé
export function pratiqueAVerifier(f: FichePratique): string[] {
  const manque = [...f.aVerifier];
  if (f.faits.length === 0) manque.push('aucun fait sourcé pour l\'instant');
  return manque;
}

// Comparer un fichier d'import avec ce qui est déjà dans le téléphone, sans rien modifier.
// Sert à répondre à « ai-je bien importé tous mes fichiers ? » : pour chaque section du fichier,
// on dit si le téléphone contient exactement la même chose.

import { normaliser } from '../data/store.ts';
import type { Donnees } from '../data/types.ts';

export const SECTIONS: { cle: keyof Donnees; libelle: string }[] = [
  { cle: 'vols', libelle: 'Vols' },
  { cle: 'etapes', libelle: 'Étapes' },
  { cle: 'logements', libelle: 'Logements' },
  { cle: 'trajets', libelle: 'Trajets' },
  { cle: 'taches', libelle: 'Tâches' },
  { cle: 'personnes', libelle: 'Personnes' },
  { cle: 'groupes', libelle: 'Groupes' },
  { cle: 'creneaux', libelle: 'Créneaux du planning' },
  { cle: 'joursPlan', libelle: 'Réglages de jour (qui est là)' },
  { cle: 'lieuxPerso', libelle: 'Lieux ajoutés' },
  { cle: 'suiviLieux', libelle: 'Envies et notes sur les lieux' },
  { cle: 'pratiquePerso', libelle: 'Fiches Pratique ajoutées' },
  { cle: 'compteurs', libelle: 'Compteurs' },
  { cle: 'reglages', libelle: 'Réglages' },
];

export type LigneComparaison = {
  cle: keyof Donnees;
  libelle: string;
  fichier: number | null; // nombre d'éléments dans le fichier (null pour les réglages)
  telephone: number | null;
  identique: boolean; // le téléphone contient exactement ce que le fichier y mettrait
};

const nombre = (valeur: unknown): number | null => (Array.isArray(valeur) ? valeur.length : null);

// Une ligne par section présente dans le fichier. « Identique » = importer ce fichier ne changerait rien à cette section.
export function comparerAvecTelephone(fichier: Partial<Donnees>, telephone: Donnees): LigneComparaison[] {
  // Ce que le téléphone contiendrait après l'import (même complétion des anciennes données que l'import)
  const apresImport = normaliser({ ...telephone, ...fichier });
  const lignes: LigneComparaison[] = [];
  for (const s of SECTIONS) {
    if (fichier[s.cle] === undefined) continue;
    lignes.push({
      cle: s.cle,
      libelle: s.libelle,
      fichier: nombre(fichier[s.cle]),
      telephone: nombre(telephone[s.cle]),
      identique: JSON.stringify(apresImport[s.cle]) === JSON.stringify(normaliser(telephone)[s.cle]),
    });
  }
  return lignes;
}

// Ce que contient le téléphone, section par section (sections vides comprises)
export function contenuDuTelephone(telephone: Donnees): { libelle: string; nombre: number | null }[] {
  return SECTIONS.filter((s) => s.cle !== 'reglages').map((s) => ({ libelle: s.libelle, nombre: nombre(telephone[s.cle]) }));
}

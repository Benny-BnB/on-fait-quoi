// Base publique de lieux : fichiers JSON du dossier data/lieux, embarqués dans l'app (ils marchent donc hors ligne).
// Aucune donnée personnelle ici : le dépôt est public. Les envies, favoris et notes de l'utilisateur restent sur son téléphone.

import type { Donnees, Lieu } from './types.ts';
import { fusionnerLieux, validerFichierLieux } from '../lib/lieux.ts';

const fichiers = import.meta.glob<unknown>('./lieux/*.json', { eager: true, import: 'default' });

function charger(): { lieux: Lieu[]; erreurs: string[] } {
  const lieux: Lieu[] = [];
  const erreurs: string[] = [];
  const ids = new Set<string>();
  for (const [chemin, brut] of Object.entries(fichiers)) {
    const resultat = validerFichierLieux(brut);
    if (!resultat.ok) {
      erreurs.push(...resultat.erreurs.map((e) => `${chemin} : ${e}`));
      continue;
    }
    for (const l of resultat.lieux) {
      if (ids.has(l.id)) erreurs.push(`${chemin} : identifiant « ${l.id} » déjà utilisé dans un autre fichier.`);
      else {
        ids.add(l.id);
        lieux.push(l);
      }
    }
  }
  return { lieux, erreurs };
}

const base = charger();

export const LIEUX_PUBLICS: Lieu[] = base.lieux;
// Une fiche refusée par le contrôle n'apparaît pas : l'erreur est montrée dans l'app plutôt que cachée.
export const ERREURS_BASE_LIEUX: string[] = base.erreurs;

export function tousLesLieux(d: Pick<Donnees, 'lieuxPerso'>): Lieu[] {
  return fusionnerLieux(LIEUX_PUBLICS, d.lieuxPerso);
}

export function trouverLieu(d: Pick<Donnees, 'lieuxPerso'>, id: string): Lieu | undefined {
  return tousLesLieux(d).find((l) => l.id === id);
}

export function estLieuPerso(d: Pick<Donnees, 'lieuxPerso'>, id: string): boolean {
  return d.lieuxPerso.some((l) => l.id === id);
}

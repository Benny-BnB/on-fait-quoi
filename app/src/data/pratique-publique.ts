// Base publique de la rubrique Pratique : fichiers JSON du dossier data/pratique, embarqués dans l'app (ils marchent donc hors ligne).
// Aucune donnée personnelle ici : le dépôt est public. Les fiches ajoutées ou corrigées par l'utilisateur restent sur son téléphone.

import type { Donnees, FichePratique } from './types.ts';
import { fusionnerPratique, validerFichierPratique } from '../lib/pratique.ts';

const fichiers = import.meta.glob<unknown>('./pratique/*.json', { eager: true, import: 'default' });

function charger(): { fiches: FichePratique[]; erreurs: string[] } {
  const fiches: FichePratique[] = [];
  const erreurs: string[] = [];
  const ids = new Set<string>();
  for (const [chemin, brut] of Object.entries(fichiers)) {
    const resultat = validerFichierPratique(brut);
    if (!resultat.ok) {
      erreurs.push(...resultat.erreurs.map((e) => `${chemin} : ${e}`));
      continue;
    }
    for (const f of resultat.fiches) {
      if (ids.has(f.id)) erreurs.push(`${chemin} : identifiant « ${f.id} » déjà utilisé dans un autre fichier.`);
      else {
        ids.add(f.id);
        fiches.push(f);
      }
    }
  }
  return { fiches, erreurs };
}

const base = charger();

export const PRATIQUE_PUBLIQUE: FichePratique[] = base.fiches;
// Une fiche refusée par le contrôle n'apparaît pas : l'erreur est montrée dans l'app plutôt que cachée.
export const ERREURS_BASE_PRATIQUE: string[] = base.erreurs;

export function toutesLesFichesPratique(d: Pick<Donnees, 'pratiquePerso'>): FichePratique[] {
  return fusionnerPratique(PRATIQUE_PUBLIQUE, d.pratiquePerso);
}

export function trouverFichePratique(d: Pick<Donnees, 'pratiquePerso'>, id: string): FichePratique | undefined {
  return toutesLesFichesPratique(d).find((f) => f.id === id);
}

export function estFichePratiquePerso(d: Pick<Donnees, 'pratiquePerso'>, id: string): boolean {
  return d.pratiquePerso.some((f) => f.id === id);
}

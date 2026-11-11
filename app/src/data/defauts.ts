import type { Compteur, Donnees, Reglages, Vol } from './types.ts';
import { ID_PROCHAIN_VOL } from './types.ts';

// Valeurs de départ, toutes modifiables dans l'app (Réglages)
export const REGLAGES_PAR_DEFAUT: Reglages = {
  delaiAeroportMin: { international: 180, interieur: 120 },
};

export function compteurProchainVol(visible = true, delaiMin = 0): Compteur {
  return {
    id: ID_PROCHAIN_VOL,
    libelle: 'Prochain vol',
    cible: { type: 'prochain-vol' },
    visible,
    delaiMin,
  };
}

// Identifiant fixe pour le compteur "automatique" d'un vol (permet de garder
// les choix de l'utilisateur quand on réimporte le même vol)
export function idCompteurVol(volId: string): string {
  return `compteur-${volId}`;
}

// Un compteur est disponible pour chaque vol, caché par défaut (cahier 5.6)
export function compteurPourVol(v: Vol, libelle: string): Compteur {
  return {
    id: idCompteurVol(v.id),
    libelle,
    cible: { type: 'vol', volId: v.id },
    visible: false,
    delaiMin: 0,
  };
}

export function donneesVides(): Donnees {
  return {
    vols: [],
    compteurs: [compteurProchainVol()],
    reglages: structuredClone(REGLAGES_PAR_DEFAUT),
    etapes: [],
    logements: [],
    trajets: [],
    taches: [],
    personnes: [],
    creneaux: [],
    joursPlan: [],
  };
}

export function nouvelId(prefixe: string): string {
  return `${prefixe}-${crypto.randomUUID().slice(0, 8)}`;
}

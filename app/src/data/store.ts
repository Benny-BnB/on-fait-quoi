// Magasin central des données : garde l'écran à jour et enregistre chaque modification
// dans le téléphone. Tous les écrans passent par ici.

import { useEffect, useState } from 'preact/hooks';
import type { Compteur, Donnees, Reglages, Vol } from './types.ts';
import { ID_PROCHAIN_VOL } from './types.ts';
import { REGLAGES_PAR_DEFAUT, compteurPourVol, compteurProchainVol, donneesVides, idCompteurVol } from './defauts.ts';
import { ecrirePrincipal, effacerTout, lirePrincipal } from './stockage.ts';
import { FORMAT_FICHIER, VERSION_FORMAT } from './validation.ts';
import { libelleVol } from '../lib/vols.ts';

type Etat = { charge: boolean; donnees: Donnees; erreurStockage: string | null };

const MESSAGE_ERREUR_STOCKAGE =
  "Impossible d'enregistrer sur ce téléphone. Tes changements restent à l'écran seulement : exporte tes données (Réglages) pour ne rien perdre.";

let etat: Etat = { charge: false, donnees: donneesVides(), erreurStockage: null };
const abonnes = new Set<() => void>();

function definir(suite: Partial<Etat>): void {
  etat = { ...etat, ...suite };
  abonnes.forEach((notifier) => notifier());
}

export function useStore(): Etat {
  const [, rafraichir] = useState(0);
  useEffect(() => {
    const notifier = () => rafraichir((n) => n + 1);
    abonnes.add(notifier);
    return () => {
      abonnes.delete(notifier);
    };
  }, []);
  return etat;
}

// Remet les données lues dans un état complet, même si elles viennent d'une ancienne version
function normaliser(brut: Partial<Donnees> | undefined): Donnees {
  const vols = brut && Array.isArray(brut.vols) ? brut.vols : [];
  let compteurs = brut && Array.isArray(brut.compteurs) ? brut.compteurs : [];
  if (!compteurs.some((c) => c.id === ID_PROCHAIN_VOL)) compteurs = [compteurProchainVol(), ...compteurs];
  const d = brut?.reglages?.delaiAeroportMin;
  const reglages: Reglages = {
    delaiAeroportMin: {
      international: d?.international ?? REGLAGES_PAR_DEFAUT.delaiAeroportMin.international,
      interieur: d?.interieur ?? REGLAGES_PAR_DEFAUT.delaiAeroportMin.interieur,
    },
  };
  return { vols, compteurs, reglages };
}

export async function chargerDonnees(): Promise<void> {
  try {
    const lu = await lirePrincipal<Partial<Donnees>>();
    definir({ charge: true, donnees: normaliser(lu) });
  } catch {
    definir({ charge: true, erreurStockage: MESSAGE_ERREUR_STOCKAGE });
  }
}

async function modifier(transformation: (d: Donnees) => Donnees): Promise<void> {
  const suivant = transformation(etat.donnees);
  definir({ donnees: suivant });
  try {
    await ecrirePrincipal(suivant);
    if (etat.erreurStockage) definir({ erreurStockage: null });
  } catch {
    definir({ erreurStockage: MESSAGE_ERREUR_STOCKAGE });
  }
}

// ---------- Vols ----------

export function enregistrerVol(vol: Vol): Promise<void> {
  return modifier((d) => {
    const ancien = d.vols.find((v) => v.id === vol.id);
    if (!ancien) {
      return {
        ...d,
        vols: [...d.vols, vol],
        // Un compteur est disponible pour chaque vol, caché par défaut
        compteurs: [...d.compteurs, compteurPourVol(vol, libelleVol(vol))],
      };
    }
    const ancienLibelle = libelleVol(ancien);
    const nouveauLibelle = libelleVol(vol);
    return {
      ...d,
      vols: d.vols.map((v) => (v.id === vol.id ? vol : v)),
      // Le libellé suit le vol, sauf si l'utilisateur l'a changé lui-même
      compteurs: d.compteurs.map((c) =>
        c.id === idCompteurVol(vol.id) && c.libelle === ancienLibelle ? { ...c, libelle: nouveauLibelle } : c,
      ),
    };
  });
}

export function supprimerVol(id: string): Promise<void> {
  return modifier((d) => ({
    ...d,
    vols: d.vols.filter((v) => v.id !== id),
    compteurs: d.compteurs.filter((c) => !(c.cible.type === 'vol' && c.cible.volId === id)),
  }));
}

// ---------- Compteurs ----------

export function enregistrerCompteur(compteur: Compteur): Promise<void> {
  return modifier((d) => ({
    ...d,
    compteurs: d.compteurs.some((c) => c.id === compteur.id)
      ? d.compteurs.map((c) => (c.id === compteur.id ? compteur : c))
      : [...d.compteurs, compteur],
  }));
}

export function supprimerCompteur(id: string): Promise<void> {
  if (id === ID_PROCHAIN_VOL) return Promise.resolve(); // le compteur du prochain vol se cache, il ne se supprime pas
  return modifier((d) => ({ ...d, compteurs: d.compteurs.filter((c) => c.id !== id) }));
}

export function basculerCompteur(id: string): Promise<void> {
  return modifier((d) => ({
    ...d,
    compteurs: d.compteurs.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)),
  }));
}

// ---------- Réglages ----------

export function enregistrerReglages(reglages: Reglages): Promise<void> {
  return modifier((d) => ({ ...d, reglages }));
}

// ---------- Import, export, suppression ----------

// Compteurs après un import de vols sans compteurs : on garde ceux de l'utilisateur
// (prochain vol, dates libres, ses ajouts) et on recrée un compteur caché par vol.
function reconstruireCompteurs(anciens: Compteur[], vols: Vol[]): Compteur[] {
  const idsVols = new Set(vols.map((v) => v.id));
  const gardes = anciens.filter((c) => c.cible.type === 'prochain-vol' || c.cible.type === 'libre');
  const automatiques = vols.map((v) => anciens.find((c) => c.id === idCompteurVol(v.id)) ?? compteurPourVol(v, libelleVol(v)));
  const ajouts = anciens.filter(
    (c) => c.cible.type === 'vol' && idsVols.has(c.cible.volId) && c.id !== idCompteurVol(c.cible.volId),
  );
  return [...gardes, ...automatiques, ...ajouts];
}

// Remplace les sections présentes dans le fichier (vols, compteurs, réglages)
export function importerDonnees(partiel: Partial<Donnees>): Promise<void> {
  return modifier((d) => {
    const vols = partiel.vols ?? d.vols;
    let compteurs = d.compteurs;
    if (partiel.compteurs) compteurs = partiel.compteurs;
    else if (partiel.vols) compteurs = reconstruireCompteurs(d.compteurs, partiel.vols);
    return normaliser({ vols, compteurs, reglages: partiel.reglages ?? d.reglages });
  });
}

export function exporterJson(d: Donnees): string {
  return JSON.stringify(
    { format: FORMAT_FICHIER, version: VERSION_FORMAT, exporteLe: new Date().toISOString(), ...d },
    null,
    2,
  );
}

export async function toutSupprimer(): Promise<void> {
  try {
    await effacerTout();
    definir({ donnees: donneesVides(), erreurStockage: null });
  } catch {
    definir({ erreurStockage: MESSAGE_ERREUR_STOCKAGE });
  }
}

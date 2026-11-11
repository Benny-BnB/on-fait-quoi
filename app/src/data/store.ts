// Magasin central des données : garde l'écran à jour et enregistre chaque modification
// dans le téléphone. Tous les écrans passent par ici.

import { useEffect, useState } from 'preact/hooks';
import type { Compteur, Donnees, Etape, Logement, Reglages, Tache, Trajet, Vol } from './types.ts';
import { aujourdhuiIso } from '../lib/temps.ts';
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
  const etapes = brut && Array.isArray(brut.etapes) ? brut.etapes : [];
  const logements = brut && Array.isArray(brut.logements) ? brut.logements : [];
  const trajets = brut && Array.isArray(brut.trajets) ? brut.trajets : [];
  const taches = brut && Array.isArray(brut.taches) ? brut.taches : [];
  return { vols, compteurs, reglages, etapes, logements, trajets, taches };
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
    // Les trajets liés à ce vol restent, mais ne sont plus rattachés à lui
    trajets: d.trajets.map((t) => (t.volId === id ? { ...t, volId: '' } : t)),
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

// ---------- Étapes et logements ----------

export function enregistrerEtape(etape: Etape): Promise<void> {
  return modifier((d) => ({
    ...d,
    etapes: d.etapes.some((e) => e.id === etape.id) ? d.etapes.map((e) => (e.id === etape.id ? etape : e)) : [...d.etapes, etape],
  }));
}

// Supprimer une étape supprime aussi ses logements (les trajets qui y étaient liés restent, détachés)
export function supprimerEtape(id: string): Promise<void> {
  return modifier((d) => {
    const partis = new Set(d.logements.filter((l) => l.etapeId === id).map((l) => l.id));
    return {
      ...d,
      etapes: d.etapes.filter((e) => e.id !== id),
      logements: d.logements.filter((l) => l.etapeId !== id),
      trajets: d.trajets.map((t) => (partis.has(t.logementId) ? { ...t, logementId: '' } : t)),
    };
  });
}

// Ajoute ou modifie un logement. Changer son "etapeId" le déplace vers une autre étape.
export function enregistrerLogement(logement: Logement): Promise<void> {
  return modifier((d) => ({
    ...d,
    logements: d.logements.some((l) => l.id === logement.id)
      ? d.logements.map((l) => (l.id === logement.id ? logement : l))
      : [...d.logements, logement],
  }));
}

export function supprimerLogement(id: string): Promise<void> {
  return modifier((d) => ({
    ...d,
    logements: d.logements.filter((l) => l.id !== id),
    trajets: d.trajets.map((t) => (t.logementId === id ? { ...t, logementId: '' } : t)),
  }));
}

// ---------- Trajets ----------

export function enregistrerTrajet(trajet: Trajet): Promise<void> {
  return modifier((d) => ({
    ...d,
    trajets: d.trajets.some((t) => t.id === trajet.id) ? d.trajets.map((t) => (t.id === trajet.id ? trajet : t)) : [...d.trajets, trajet],
  }));
}

export function supprimerTrajet(id: string): Promise<void> {
  return modifier((d) => ({ ...d, trajets: d.trajets.filter((t) => t.id !== id) }));
}

// ---------- Tâches (check-lists) ----------

export function enregistrerTache(tache: Tache): Promise<void> {
  return modifier((d) => ({
    ...d,
    taches: d.taches.some((t) => t.id === tache.id) ? d.taches.map((t) => (t.id === tache.id ? tache : t)) : [...d.taches, tache],
  }));
}

export function supprimerTache(id: string): Promise<void> {
  return modifier((d) => ({ ...d, taches: d.taches.filter((t) => t.id !== id) }));
}

// Cocher / décocher : on garde le jour où la tâche a été faite
export function basculerTache(id: string): Promise<void> {
  return modifier((d) => ({
    ...d,
    taches: d.taches.map((t) => (t.id === id ? { ...t, fait: !t.fait, faitLe: t.fait ? '' : aujourdhuiIso() } : t)),
  }));
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
    const etapes = partiel.etapes ?? d.etapes;
    let logements = partiel.logements ?? d.logements;
    if (partiel.etapes && !partiel.logements) {
      // Étapes remplacées sans nouveaux logements : on ne garde pas de logement rattaché à une étape disparue
      const ids = new Set(etapes.map((e) => e.id));
      logements = logements.filter((l) => ids.has(l.etapeId));
    }
    return normaliser({ vols, compteurs, reglages: partiel.reglages ?? d.reglages, etapes, logements, trajets: partiel.trajets ?? d.trajets, taches: partiel.taches ?? d.taches });
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

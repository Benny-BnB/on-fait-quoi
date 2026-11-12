// « Avant le départ » : la liste de ce qu'il faut contrôler une dernière fois (cahier des charges, section 7 :
// « contrôle des liens et de la date de dernière vérification de chaque fiche »).
// L'app ne peut pas tester les liens elle-même (les sites refusent les requêtes venant d'une page web) :
// elle montre l'ancienneté de chaque fiche utilisée et ouvre la fiche, qui renvoie vers ses sources.

import type { Donnees, FichePratique, Lieu } from '../data/types.ts';
import { elementsACompleter } from './completer.ts';
import { toutesLesAlertes } from './alertes.ts';
import { grouperPratique } from './pratique.ts';
import { estActif } from './creneaux.ts';
import { donneesVidesQ, etatSauvegarde, type MetaSauvegarde } from './sauvegarde.ts';
import { joursEntre } from './sejour.ts';
import { debutVoyage } from './taches.ts';

// Une fiche vérifiée il y a plus longtemps que cela est à relire avant de partir
export const JOURS_FICHE_ANCIENNE = 30;

export type FicheARelire = {
  cle: string;
  genre: 'lieu' | 'pratique';
  titre: string;
  jours: number | null; // null = jamais vérifiée
  ancienne: boolean; // jamais vérifiée, ou plus de JOURS_FICHE_ANCIENNE jours
  avisOfficiel: boolean; // fiche « formalités et sécurité » : avis officiels qui changent, à relire juste avant le départ
};

const age = (verifieLe: string, aujourdhui: string): number | null => (verifieLe === '' ? null : Math.max(0, joursEntre(verifieLe, aujourdhui)));

// Les fiches de lieux dont on se sert (prévues dans le planning ou souhaitées) et les fiches Pratique des étapes du voyage.
// Les plus anciennes (ou jamais vérifiées) d'abord.
export function fichesARelire(d: Donnees, lieux: Lieu[], pratique: FichePratique[], aujourdhui: string): FicheARelire[] {
  const ids = new Set<string>();
  for (const c of d.creneaux) if (c.lieuId !== '' && estActif(c) && c.statut !== 'fait') ids.add(c.lieuId);
  for (const s of d.suiviLieux) if (s.souhait !== '' && !s.fait) ids.add(s.lieuId);

  const liste: FicheARelire[] = [];
  for (const l of lieux) {
    if (!ids.has(l.id)) continue;
    const jours = age(l.verifieLe, aujourdhui);
    liste.push({ cle: `lieu:${l.id}`, genre: 'lieu', titre: l.nom, jours, ancienne: jours === null || jours > JOURS_FICHE_ANCIENNE, avisOfficiel: false });
  }
  for (const g of grouperPratique(pratique, d.etapes)) {
    if (g.etapeId === '') continue; // « Autres fiches » : aucune étape du voyage ne les concerne
    for (const f of g.fiches) {
      const jours = age(f.verifieLe, aujourdhui);
      liste.push({ cle: `pratique:${f.id}`, genre: 'pratique', titre: f.titre, jours, ancienne: jours === null || jours > JOURS_FICHE_ANCIENNE, avisOfficiel: f.rubrique === 'formalites' });
    }
  }
  const poids = (f: FicheARelire): number => (f.jours === null ? Infinity : f.jours);
  return liste.sort((a, b) => poids(b) - poids(a) || a.titre.localeCompare(b.titre, 'fr'));
}

export type NiveauPoint = 'ok' | 'attention' | 'info';
export type PointControle = { cle: string; niveau: NiveauPoint; titre: string; detail: string; lien: string; libelleLien: string };

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`): string => `${n} ${n > 1 ? motPluriel : mot}`;

export function pointsControle(d: Donnees, lieux: Lieu[], pratique: FichePratique[], meta: MetaSauvegarde, aujourdhui: string): PointControle[] {
  const points: PointControle[] = [];
  const debut = debutVoyage(d);

  const sauvegarde = etatSauvegarde(meta, donneesVidesQ(d), aujourdhui, debut);
  points.push({
    cle: 'sauvegarde',
    niveau: sauvegarde.niveau === 'ok' ? 'ok' : sauvegarde.niveau === 'vide' ? 'info' : 'attention',
    titre: sauvegarde.titre,
    detail: sauvegarde.detail,
    lien: '#/reglages',
    libelleLien: 'Sauvegarder',
  });

  const manques = elementsACompleter(d, lieux, aujourdhui);
  points.push({
    cle: 'completer',
    niveau: manques.length === 0 ? 'ok' : 'attention',
    titre: manques.length === 0 ? 'Rien à compléter' : `${pluriel(manques.length, 'chose')} à compléter`,
    detail: manques.length === 0 ? 'Logements, heures, durées et fiches : tout est renseigné.' : 'Logements, heures, durées de trajets, vols ou fiches à vérifier.',
    lien: '#/a-completer',
    libelleLien: 'Voir la liste',
  });

  const alertes = toutesLesAlertes(d, lieux);
  points.push({
    cle: 'alertes',
    niveau: alertes.length === 0 ? 'ok' : 'attention',
    titre: alertes.length === 0 ? 'Aucune alerte dans le planning' : pluriel(alertes.length, 'alerte', 'alertes') + ' dans le planning',
    detail: alertes.length === 0 ? 'Pas de trajet trop juste, de lieu fermé ni de contrainte du groupe non respectée.' : 'Trajets trop justes, lieux fermés, contraintes du groupe, budget ou rythme.',
    lien: '#/planning',
    libelleLien: 'Ouvrir le planning',
  });

  const volsAVerifier = d.vols.filter((v) => v.pourMoi && v.statut === 'a-verifier');
  points.push({
    cle: 'vols',
    niveau: d.vols.length === 0 ? 'info' : volsAVerifier.length === 0 ? 'ok' : 'attention',
    titre: d.vols.length === 0 ? 'Aucun vol saisi' : volsAVerifier.length === 0 ? 'Vols : horaires confirmés' : `${pluriel(volsAVerifier.length, 'vol')} à vérifier`,
    detail: volsAVerifier.length === 0 ? 'Compare quand même chaque heure avec ton billet ou la compagnie, la veille du départ.' : `Heures à comparer avec le billet : ${volsAVerifier.map((v) => v.numero || `${v.depart.code} → ${v.arrivee.code}`).join(', ')}.`,
    lien: '#/vols',
    libelleLien: 'Voir les vols',
  });

  const fiches = fichesARelire(d, lieux, pratique, aujourdhui);
  const anciennes = fiches.filter((f) => f.ancienne);
  points.push({
    cle: 'fiches',
    niveau: fiches.length === 0 ? 'info' : anciennes.length === 0 ? 'ok' : 'attention',
    titre: fiches.length === 0 ? 'Aucune fiche utilisée' : anciennes.length === 0 ? 'Fiches vérifiées récemment' : `${pluriel(anciennes.length, 'fiche')} à relire`,
    detail:
      fiches.length === 0
        ? "Les fiches de lieux prévus dans le planning et les fiches Pratique de tes étapes apparaîtront ici."
        : `${pluriel(fiches.length, 'fiche utilisée', 'fiches utilisées')}. Une fiche est à relire si elle date de plus de ${JOURS_FICHE_ANCIENNE} jours ou n'a jamais été vérifiée.`,
    lien: '', // la liste des fiches est juste en dessous, sur le même écran
    libelleLien: '',
  });
  return points;
}

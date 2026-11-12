// Ce qui part dans l'agenda (.ics) ou dans le lien de partage : une liste d'événements calculée
// à partir des données, jamais stockée à part. Les mêmes événements servent aux deux exports,
// donc ce que l'on voit dans l'agenda est exactement ce que l'on partage.

import type { Creneau, Donnees, Lieu, Logement, Tache, Vol } from '../data/types.ts';
import { LIBELLES_PERIODE, LIBELLES_STATUT_CRENEAU, LIBELLES_TYPE_EVENEMENT } from '../data/types.ts';
import { dureeCreneauMin, instantDebut, participantsEffectifs } from './creneaux.ts';
import { heureAvecJour, creneauxImposes } from './planning.ts';
import { dateValide, formatDateIso, formatDureeMin, formatHeureDansFuseau, fuseauValide, instantLocal, nomFuseau } from './temps.ts';
import { dureeVolMin, instantArrivee, instantDepart } from './vols.ts';

export type GenreEvenement = 'vol' | 'trajet' | 'logement' | 'planning' | 'tache';

export type EvenementAgenda = {
  uid: string; // identifiant stable : réimporter le fichier met l'événement à jour au lieu de le dupliquer
  genre: GenreEvenement;
  titre: string;
  details: string[]; // une ligne par information
  lieu: string; // '' si aucun
  fuseau: string; // fuseau du lieu, '' si inconnu (sert seulement à afficher l'heure locale)
  debutMs: number | null; // instant exact ; null = événement « toute la journée »
  finMs: number | null; // null = fin inconnue
  jour: string; // AAAA-MM-JJ, jour local de l'événement
};

// Ce que l'utilisateur choisit d'inclure
export type ContenuAgenda = {
  vols: boolean;
  volsAutres: boolean; // vols d'autres personnes
  trajets: boolean;
  logements: boolean;
  planning: boolean; // créneaux libres et événements fixes
  idees: boolean; // créneaux encore au statut « Idée »
  taches: boolean; // échéances des check-lists (jamais dans le lien de partage)
  du: string; // '' = pas de limite
  au: string;
};

export const CONTENU_PAR_DEFAUT: ContenuAgenda = {
  vols: true,
  volsAutres: false,
  trajets: true,
  logements: true,
  planning: true,
  idees: false,
  taches: true,
  du: '',
  au: '',
};

export type ResultatAgenda = {
  evenements: EvenementAgenda[];
  // Ce qui n'a pas pu être mis dans l'agenda, avec la raison (pour le dire à l'utilisateur)
  ignores: string[];
};

const MS_MINUTE = 60000;

function evenementVol(v: Vol, d: Donnees): EvenementAgenda | null {
  const debut = instantDepart(v);
  if (Number.isNaN(debut)) return null;
  const fin = instantArrivee(v);
  const villeDepart = v.depart.ville || v.depart.code;
  const villeArrivee = v.arrivee.ville || v.arrivee.code;
  const marque = v.pourMoi ? '' : ` (vol de ${v.passagers || "quelqu'un d'autre"})`;
  const details: string[] = [];
  details.push(`Décollage : ${v.depart.heure}, heure locale de ${villeDepart}`);
  if (!Number.isNaN(fin)) {
    details.push(`Atterrissage : ${v.arrivee.heure} le ${formatDateIso(v.arrivee.date)}, heure locale de ${villeArrivee}`);
    const duree = dureeVolMin(v);
    if (duree > 0) details.push(`Durée du vol : ${formatDureeMin(duree)}`);
  }
  if (v.compagnie) details.push(v.compagnie);
  if (v.depart.terminal) details.push(`Terminal de départ : ${v.depart.terminal}`);
  if (v.arrivee.terminal) details.push(`Terminal d'arrivée : ${v.arrivee.terminal}`);
  if (v.pourMoi) {
    const limite = debut - d.reglages.delaiAeroportMin[v.portee] * MS_MINUTE;
    details.push(`Être à l'aéroport avant ${heureAvecJour(limite, v.depart.fuseau, v.depart.date)}`);
  }
  if (v.statut === 'a-verifier') details.push("Horaire à vérifier avant le départ");
  return {
    uid: `vol-${v.id}`,
    genre: 'vol',
    titre: `${v.numero ? `Vol ${v.numero}` : 'Vol'} · ${v.depart.code} → ${v.arrivee.code}${marque}`,
    details,
    lieu: v.depart.ville ? `${v.depart.ville} (${v.depart.code})` : v.depart.code,
    fuseau: v.depart.fuseau,
    debutMs: debut,
    finMs: Number.isNaN(fin) || fin < debut ? null : fin,
    jour: v.depart.date,
  };
}

function evenementsLogement(l: Logement, d: Donnees): EvenementAgenda[] {
  const etape = d.etapes.find((e) => e.id === l.etapeId);
  const fuseau = etape && fuseauValide(etape.fuseau) ? etape.fuseau : '';
  const sorties: EvenementAgenda[] = [];
  for (const quand of ['arrivee', 'depart'] as const) {
    const m = l[quand];
    if (!dateValide(m.date)) continue;
    const instant = fuseau !== '' && m.heure !== '' ? instantLocal(m.date, m.heure, fuseau) : NaN;
    const details: string[] = [];
    if (m.heure !== '' && fuseau !== '') details.push(`Heure locale : ${m.heure} (${nomFuseau(fuseau)})`);
    if (l.statut === 'a-verifier') details.push('Réservation à vérifier');
    if (etape) details.push(`Étape : ${etape.nom}`);
    sorties.push({
      uid: `logement-${l.id}-${quand}`,
      genre: 'logement',
      titre: `${quand === 'arrivee' ? 'Arrivée' : 'Départ'} : ${l.nom || 'logement'}`,
      details,
      lieu: l.adresse,
      fuseau,
      debutMs: Number.isNaN(instant) ? null : instant,
      finMs: null,
      jour: m.date,
    });
  }
  return sorties;
}

function evenementCreneau(c: Creneau, d: Donnees, lieux: Lieu[]): EvenementAgenda | null {
  if (!dateValide(c.jour)) return null;
  const debut = instantDebut(c);
  const duree = dureeCreneauMin(c);
  const lieu = c.lieuId !== '' ? lieux.find((l) => l.id === c.lieuId) : undefined;
  const details: string[] = [`Statut : ${LIBELLES_STATUT_CRENEAU[c.statut]}`];
  if (c.fixe) details.push(c.typeEvenement !== '' ? `Événement fixe : ${LIBELLES_TYPE_EVENEMENT[c.typeEvenement].toLowerCase()}` : 'Événement fixe');
  if (c.participants.length > 0) {
    const noms = participantsEffectifs(c, d).map((p) => p.prenom);
    if (noms.length > 0) details.push(`Avec : ${noms.join(', ')}`);
  }
  if (c.note.trim() !== '') details.push(c.note.trim());
  const periode = debut === null && c.periode !== '' ? `${LIBELLES_PERIODE[c.periode]} · ` : '';
  return {
    uid: `creneau-${c.id}`,
    genre: 'planning',
    titre: `${periode}${c.titre.trim() || 'Sans titre'}`,
    details,
    lieu: lieu ? [lieu.nom, lieu.adresse].filter((x) => x !== '').join(', ') : '',
    fuseau: fuseauValide(c.fuseau) ? c.fuseau : '',
    debutMs: debut,
    finMs: debut !== null && duree !== null ? debut + duree * MS_MINUTE : null,
    jour: c.jour,
  };
}

function evenementTache(t: Tache): EvenementAgenda | null {
  if (t.fait || !dateValide(t.echeance)) return null;
  const details = [`Échéance : ${formatDateIso(t.echeance)}`];
  if (t.note.trim() !== '') details.push(t.note.trim());
  return {
    uid: `tache-${t.id}`,
    genre: 'tache',
    titre: `${t.liste === 'a-emporter' ? 'À emporter' : 'À faire'} : ${t.titre}`,
    details,
    lieu: '',
    fuseau: '',
    debutMs: null,
    finMs: null,
    jour: t.echeance,
  };
}

// Tous les événements choisis, rangés par jour puis par heure (les « toute la journée » d'abord)
export function evenementsAgenda(d: Donnees, contenu: ContenuAgenda, lieux: Lieu[]): ResultatAgenda {
  const evenements: EvenementAgenda[] = [];
  const ignores: string[] = [];

  for (const v of d.vols) {
    if (v.statut === 'annule') continue;
    if (!v.pourMoi && !contenu.volsAutres) continue;
    if (!contenu.vols) continue;
    const e = evenementVol(v, d);
    if (e) evenements.push(e);
    else ignores.push(`Vol ${v.numero || v.depart.code} : heure de départ invalide`);
  }

  if (contenu.trajets) {
    for (const c of creneauxImposes(d)) {
      if (c.genre !== 'trajet') continue;
      if (!dateValide(c.jour)) {
        ignores.push(`Trajet « ${c.titre} » : pas de date`);
        continue;
      }
      evenements.push({
        uid: `trajet-${c.id}`,
        genre: 'trajet',
        titre: c.titre,
        details: c.details,
        lieu: '',
        fuseau: fuseauValide(c.fuseau) ? c.fuseau : '',
        debutMs: c.debutMs,
        finMs: c.debutMs !== null && c.dureeMin !== null ? c.debutMs + c.dureeMin * MS_MINUTE : null,
        jour: c.jour,
      });
    }
  }

  if (contenu.logements) {
    for (const l of d.logements) {
      if (l.statut === 'a-trouver') continue; // rien de concret à mettre dans un agenda
      evenements.push(...evenementsLogement(l, d));
    }
  }

  if (contenu.planning) {
    for (const c of d.creneaux) {
      if (c.planBDe !== '' || c.statut === 'annule') continue;
      if (c.statut === 'idee' && !contenu.idees) continue;
      const e = evenementCreneau(c, d, lieux);
      if (e) evenements.push(e);
      else ignores.push(`Créneau « ${c.titre || 'sans titre'} » : date invalide`);
    }
  }

  if (contenu.taches) {
    for (const t of d.taches) {
      const e = evenementTache(t);
      if (e) evenements.push(e);
    }
  }

  const dansLaPeriode = (e: EvenementAgenda): boolean => (contenu.du === '' || e.jour >= contenu.du) && (contenu.au === '' || e.jour <= contenu.au);
  const gardes = evenements.filter(dansLaPeriode);
  gardes.sort((a, b) => {
    if (a.jour !== b.jour) return a.jour.localeCompare(b.jour);
    const ta = a.debutMs ?? -Infinity;
    const tb = b.debutMs ?? -Infinity;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.titre.localeCompare(b.titre, 'fr');
  });
  return { evenements: gardes, ignores };
}

// « 06:55 » dans le fuseau de l'événement, ou '' si on ne peut pas le dire
export function heureLocaleEvenement(e: EvenementAgenda): string {
  if (e.debutMs === null || e.fuseau === '') return '';
  return formatHeureDansFuseau(e.debutMs, e.fuseau);
}

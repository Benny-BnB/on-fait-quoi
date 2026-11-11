// « À compléter » : tout ce qui manque encore, calculé d'après les données (rien n'est écrit en dur).
// Chaque ligne mène à l'écran où l'on peut le compléter.

import type { Donnees, Lieu } from '../data/types.ts';
import { faitsAVerifier } from './lieux.ts';
import { etapesTriees, nuitsSansLogement } from './sejour.ts';
import { dateValide, formatDateIso } from './temps.ts';

export type GenreACompleter = 'vol' | 'trajet' | 'logement' | 'etape' | 'creneau' | 'lieu' | 'taches';
export type ElementACompleter = { cle: string; groupe: string; message: string; genre: GenreACompleter; id: string };

export function elementsACompleter(d: Donnees, lieux: Lieu[], aujourdhui: string): ElementACompleter[] {
  const liste: ElementACompleter[] = [];

  // Logements : statut, adresse, heures d'arrivée et de départ
  for (const l of d.logements) {
    const nom = l.nom !== '' ? `« ${l.nom} »` : 'Un logement';
    if (l.statut === 'a-trouver') {
      liste.push({ cle: `log-trouver:${l.id}`, groupe: 'Logements', message: `${nom} : logement à trouver.`, genre: 'logement', id: l.id });
      continue;
    }
    if (l.statut === 'a-verifier') liste.push({ cle: `log-verifier:${l.id}`, groupe: 'Logements', message: `${nom} : réservation à vérifier.`, genre: 'logement', id: l.id });
    if (l.adresse.trim() === '' && l.gps === null) liste.push({ cle: `log-adresse:${l.id}`, groupe: 'Logements', message: `${nom} : adresse manquante.`, genre: 'logement', id: l.id });
    if (l.arrivee.heure === '') liste.push({ cle: `log-arrivee:${l.id}`, groupe: 'Logements', message: `${nom} : heure d'arrivée (check-in) à ajouter.`, genre: 'logement', id: l.id });
    if (l.depart.heure === '') liste.push({ cle: `log-depart:${l.id}`, groupe: 'Logements', message: `${nom} : heure de départ (check-out) à ajouter.`, genre: 'logement', id: l.id });
  }
  // Nuits sans aucun logement
  for (const e of etapesTriees(d.etapes)) {
    for (const t of nuitsSansLogement(e, d.logements.filter((l) => l.etapeId === e.id))) {
      liste.push({
        cle: `nuits:${e.id}:${t.du}`,
        groupe: 'Logements',
        message: `« ${e.nom} » : ${t.nuits} nuit${t.nuits > 1 ? 's' : ''} sans logement (du ${formatDateIso(t.du)} au ${formatDateIso(t.au)}).`,
        genre: 'etape',
        id: e.id,
      });
    }
  }

  // Vols à confirmer
  for (const v of d.vols) {
    if (v.statut === 'a-verifier') liste.push({ cle: `vol:${v.id}`, groupe: 'Vols', message: `Vol ${v.numero} : à vérifier.`, genre: 'vol', id: v.id });
  }

  // Trajets : durée et mode
  for (const t of d.trajets) {
    const nom = `« ${t.de} → ${t.a} »`;
    if (t.dureeMin === null) liste.push({ cle: `traj-duree:${t.id}`, groupe: 'Trajets', message: `Trajet ${nom} : durée à trouver.`, genre: 'trajet', id: t.id });
    if (t.mode === '') liste.push({ cle: `traj-mode:${t.id}`, groupe: 'Trajets', message: `Trajet ${nom} : mode de transport à choisir.`, genre: 'trajet', id: t.id });
  }

  // Événements imposés sans heure
  for (const c of d.creneaux) {
    if (c.fixe && c.debut === '' && c.statut !== 'annule' && c.statut !== 'fait') {
      liste.push({ cle: `evt-heure:${c.id}`, groupe: 'Planning', message: `« ${c.titre} » (${formatDateIso(c.jour)}) : heure à définir.`, genre: 'creneau', id: c.id });
    }
  }

  // Check-lists : ce qui est en retard
  const enRetard = d.taches.filter((t) => !t.fait && dateValide(t.echeance) && t.echeance < aujourdhui).length;
  if (enRetard > 0) liste.push({ cle: 'taches-retard', groupe: 'Check-lists', message: `${enRetard} tâche${enRetard > 1 ? 's' : ''} en retard.`, genre: 'taches', id: '' });

  // Lieux de tes envies (ou liés à un créneau à venir) dont des informations restent « à vérifier »
  const interessants = new Set<string>();
  for (const s of d.suiviLieux) if (s.souhait !== '' && !s.fait) interessants.add(s.lieuId);
  for (const c of d.creneaux) if (c.lieuId !== '' && c.statut !== 'fait' && c.statut !== 'annule') interessants.add(c.lieuId);
  for (const id of interessants) {
    const l = lieux.find((x) => x.id === id);
    if (!l) continue;
    const manque = faitsAVerifier(l);
    if (manque.length > 0) liste.push({ cle: `lieu:${l.id}`, groupe: 'Lieux', message: `${l.nom} : à vérifier (${manque.join(', ')}).`, genre: 'lieu', id: l.id });
  }

  return liste;
}

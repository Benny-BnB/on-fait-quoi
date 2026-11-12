// Rythme du jour : nombre d'activités, heure de lever, pauses. Ce sont des signalements, pas des interdits.

import type { Donnees } from '../data/types.ts';
import { dureeCreneauMin, estActif } from './creneaux.ts';
import { heureValide } from './temps.ts';
import type { Alerte } from './planning.ts';

const minutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Les créneaux libres d'un jour qui comptent comme « activités » (ni événement imposé, ni créneau annulé ou plan B)
export function activitesDuJour(d: Donnees, jour: string): number {
  return d.creneaux.filter((c) => c.jour === jour && estActif(c) && !c.fixe).length;
}

export function alertesRythme(d: Donnees): Alerte[] {
  const r = d.reglages.rythme;
  const alertes: Alerte[] = [];
  const jours = [...new Set(d.creneaux.map((c) => c.jour))].sort();
  if (r.activitesMax !== null) {
    for (const jour of jours) {
      const n = activitesDuJour(d, jour);
      if (n > r.activitesMax) alertes.push({ cle: `rythme-nb:${jour}`, jour, message: `${n} activités prévues ce jour pour ${r.activitesMax} souhaitée${r.activitesMax > 1 ? 's' : ''} (rythme réglé).` });
    }
  }
  for (const c of d.creneaux) {
    if (!estActif(c) || c.fixe || c.statut === 'fait' || c.debut === '' || !heureValide(c.debut)) continue;
    if (r.heureLever !== '' && c.debut < r.heureLever) {
      alertes.push({ cle: `rythme-lever:${c.id}`, jour: c.jour, genre: 'creneau', id: c.id, message: `« ${c.titre} » commence à ${c.debut}, avant l'heure de lever réglée (${r.heureLever}).` });
    }
    const duree = dureeCreneauMin(c);
    const debut = minutes(c.debut);
    const fin = c.fin !== '' && heureValide(c.fin) ? minutes(c.fin) : duree !== null ? debut + duree : debut + 1;
    for (const p of r.pauses) {
      if (debut < minutes(p.fin) && minutes(p.debut) < fin) {
        alertes.push({ cle: `rythme-pause:${c.id}:${p.debut}`, jour: c.jour, genre: 'creneau', id: c.id, message: `« ${c.titre} » empiète sur la pause${p.libelle !== '' ? ` « ${p.libelle} »` : ''} (${p.debut}–${p.fin}).` });
      }
    }
  }
  return alertes;
}

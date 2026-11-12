// Toutes les alertes du planning, réunies : trajets et vols, créneaux, lieux fermés, contraintes du groupe, budget, rythme.

import type { Donnees, Lieu } from '../data/types.ts';
import { contraintesLieu } from './contraintes.ts';
import { alertesBudget } from './budget.ts';
import { alertesCreneaux, estActif, participantsEffectifs } from './creneaux.ts';
import { alertesLieux } from './lieux.ts';
import type { Alerte } from './planning.ts';
import { alertesPlanning } from './planning.ts';
import { alertesRythme } from './rythme.ts';

// Un lieu prévu qui contredit clairement une contrainte des personnes présentes (les « à vérifier » ne déclenchent pas d'alerte)
export function alertesContraintes(d: Donnees, lieux: Lieu[]): Alerte[] {
  const alertes: Alerte[] = [];
  for (const c of d.creneaux) {
    if (c.lieuId === '' || !estActif(c) || c.statut === 'fait') continue;
    const l = lieux.find((x) => x.id === c.lieuId);
    if (!l) continue;
    contraintesLieu(l, participantsEffectifs(c, d))
      .filter((s) => s.fort)
      .forEach((s, i) => alertes.push({ cle: `contrainte:${c.id}:${i}`, jour: c.jour, genre: 'creneau', id: c.id, message: `Contrainte du groupe pour « ${c.titre} » : ${s.texte}` }));
  }
  return alertes;
}

export function toutesLesAlertes(d: Donnees, lieux: Lieu[]): Alerte[] {
  return [...alertesPlanning(d), ...alertesCreneaux(d), ...alertesLieux(d, lieux), ...alertesContraintes(d, lieux), ...alertesBudget(d), ...alertesRythme(d)];
}

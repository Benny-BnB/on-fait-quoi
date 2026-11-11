import type { Compteur, Donnees } from '../data/types.ts';
import { creneauxDatables, resoudreCompteurComplet } from '../lib/creneaux.ts';
import type { CreneauImpose } from '../lib/planning.ts';
import type { CompteurResolu } from '../lib/vols.ts';
import { instantDepart } from '../lib/vols.ts';
import { decomposer, formatDateHeureDansFuseau, formatDateIso, formatDureeMin, nomFuseau } from '../lib/temps.ts';

const deux = (n: number): string => String(n).padStart(2, '0');

function Chiffre(props: { valeur: string; unite: string }) {
  return (
    <div class="chiffre">
      <span class="chiffre-valeur">{props.valeur}</span>
      <span class="chiffre-unite">{props.unite}</span>
    </div>
  );
}

// Lignes sous le compteur : vol, trajet, heure locale, référence, terminal si connu
function lignesDetail(c: Compteur, r: CompteurResolu, donnees: Donnees, imposes: CreneauImpose[] | undefined): string[] {
  if (r.etat !== 'actif' && r.etat !== 'passe') return [];
  const lignes: string[] = [];
  if (c.cible.type === 'creneau') {
    const cle = c.cible.cle;
    const creneau = creneauxDatables(donnees, imposes).find((x) => x.cle === cle);
    if (creneau) {
      lignes.push(creneau.titre);
      lignes.push(`${formatDateHeureDansFuseau(creneau.debutMs, creneau.fuseau)}${creneau.zone !== '' ? ` (heure de ${creneau.zone})` : ''}`);
      if (c.delaiMin > 0) lignes.push(`Compteur réglé ${formatDureeMin(c.delaiMin)} avant : ${formatDateHeureDansFuseau(r.cibleMs, creneau.fuseau)}`);
    }
    return lignes;
  }
  if (r.vol) {
    const v = r.vol;
    const ville = v.depart.ville || nomFuseau(v.depart.fuseau);
    lignes.push(`${v.numero} · ${v.depart.code} → ${v.arrivee.code}`);
    lignes.push(`Décollage : ${formatDateHeureDansFuseau(instantDepart(v), v.depart.fuseau)} (heure de ${ville})`);
    if (c.delaiMin > 0) {
      lignes.push(`Compteur réglé ${formatDureeMin(c.delaiMin)} avant : ${formatDateHeureDansFuseau(r.cibleMs, v.depart.fuseau)}`);
    }
    if (v.reference) lignes.push(`Référence ${v.reference}`);
    if (v.depart.terminal) lignes.push(`Terminal ${v.depart.terminal}`);
  } else if (c.cible.type === 'libre') {
    lignes.push(`${formatDateIso(c.cible.date)} à ${c.cible.heure} (heure de ${nomFuseau(c.cible.fuseau)})`);
    if (c.delaiMin > 0) {
      lignes.push(`Compteur réglé ${formatDureeMin(c.delaiMin)} avant : ${formatDateHeureDansFuseau(r.cibleMs, c.cible.fuseau)}`);
    }
  }
  return lignes;
}

export function CarteCompteur(props: { compteur: Compteur; donnees: Donnees; maintenant: number; imposes?: CreneauImpose[]; onMasquer?: () => void }) {
  const { compteur, donnees, maintenant } = props;
  const r = resoudreCompteurComplet(compteur, donnees, maintenant, props.imposes);
  const d = r.etat === 'actif' ? decomposer(r.cibleMs - maintenant) : null;
  const lignes = lignesDetail(compteur, r, donnees, props.imposes);

  return (
    <section class="carte compteur" aria-label={compteur.libelle}>
      <h2 class="compteur-titre">{compteur.libelle}</h2>

      {d && (
        <div
          class="chiffres"
          role="timer"
          aria-label={`${d.jours} jours, ${d.heures} heures, ${d.minutes} minutes`}
        >
          <Chiffre valeur={String(d.jours)} unite="jours" />
          <Chiffre valeur={deux(d.heures)} unite="heures" />
          <Chiffre valeur={deux(d.minutes)} unite="minutes" />
          <Chiffre valeur={deux(d.secondes)} unite="secondes" />
        </div>
      )}
      {r.etat === 'passe' && <p class="compteur-etat">Heure atteinte</p>}
      {r.etat === 'aucun-vol' && <p class="compteur-etat">Aucun vol à venir.</p>}
      {r.etat === 'invalide' && <p class="compteur-etat attention">{r.raison}</p>}

      {lignes.length > 0 && (
        <ul class="compteur-details">
          {lignes.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}

      {props.onMasquer && (
        <button type="button" class="bouton secondaire petit" onClick={props.onMasquer}>
          Masquer ce compteur
        </button>
      )}
    </section>
  );
}

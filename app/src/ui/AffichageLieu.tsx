// Éléments d'affichage partagés par les fiches de lieux et les propositions.
// Règle d'affichage : une information sans source est « à vérifier » ; une source secondaire (guide, annuaire) est signalée.

import type { ComponentChildren } from 'preact';
import type { HorairesLieu, Lieu, SourceLieu } from '../data/types.ts';
import { JOURS_SEMAINE } from '../data/types.ts';
import { formatMontant } from '../lib/format.ts';
import type { Ouverture } from '../lib/lieux.ts';
import { jourSemaineDe } from '../lib/lieux.ts';
import { lienSur } from '../lib/sejour.ts';
import { formatDateIso, formatDureeMin } from '../lib/temps.ts';

export function LigneSource(props: { source: SourceLieu }) {
  const s = props.source;
  const lien = lienSur(s.lien);
  return (
    <span class="source">
      Source :{' '}
      {lien ? (
        <a href={lien} target="_blank" rel="noopener noreferrer">
          {s.libelle}
        </a>
      ) : (
        s.libelle
      )}{' '}
      · consulté le {formatDateIso(s.consulteLe)} · {s.officielle ? 'source officielle' : 'source secondaire'}
    </span>
  );
}

// Une information de la fiche : titre, valeur, source. Sans valeur : « à vérifier ».
export function Fait(props: { titre: string; valeur: ComponentChildren | null; source?: SourceLieu; note?: string; confirme?: boolean; etiquetteNonConfirme?: string }) {
  const { titre, valeur, source, note } = props;
  if (valeur === null) {
    return (
      <div class="fait">
        <span class="fait-titre">{titre}</span>
        <span class="attention-texte">À vérifier</span>
        {note && <span class="discret">{note}</span>}
      </div>
    );
  }
  const confirme = props.confirme ?? source?.officielle ?? false;
  return (
    <div class="fait">
      <span class="fait-titre">{titre}</span>
      <span class="fait-valeur">
        {valeur}
        {source && !confirme && <span class="etiquette attention">{props.etiquetteNonConfirme ?? 'À confirmer'}</span>}
      </span>
      {note && <span class="discret">{note}</span>}
      {source && <LigneSource source={source} />}
    </div>
  );
}

export function libellePrix(p: NonNullable<Lieu['prix']>): string {
  if (p.min === 0 && p.max === 0) return 'Gratuit';
  const a = formatMontant(p.min, p.devise);
  return p.min === p.max ? `${a} par personne` : `${a} à ${formatMontant(p.max, p.devise)} par personne`;
}

export function libelleDuree(d: NonNullable<Lieu['duree']>): string {
  return d.minMin === d.maxMin ? formatDureeMin(d.minMin) : `${formatDureeMin(d.minMin)} à ${formatDureeMin(d.maxMin)}`;
}

export function TableauHoraires(props: { h: HorairesLieu; jourMis?: string }) {
  const { h } = props;
  const aujourdhui = props.jourMis ? jourSemaineDe(props.jourMis) : null;
  return (
    <>
      <table class="horaires">
        <tbody>
          {JOURS_SEMAINE.map((j) => {
            const v = h.jours[j];
            return (
              <tr key={j} class={j === aujourdhui ? 'jour-choisi' : ''}>
                <th scope="row">{j}</th>
                <td>{v === undefined ? <span class="attention-texte">à vérifier</span> : v === 'ferme' ? 'fermé' : v.map((p) => `${p.ouvre}–${p.ferme}`).join(', ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {h.nature === 'animation' && <span class="discret">Heures d'animation habituelles, pas des heures d'ouverture : le lieu n'est jamais « fermé » en dehors.</span>}
      {h.derniereEntree !== '' && <span class="discret">Dernière entrée : {h.derniereEntree}</span>}
      {h.fermetures.map((f) => (
        <span class="attention-texte" key={`${f.du}${f.au}`}>
          Fermé du {formatDateIso(f.du)} au {formatDateIso(f.au)} : {f.motif}
        </span>
      ))}
      {h.note !== '' && <span class="discret">{h.note}</span>}
    </>
  );
}

// « Ouvert à ce moment » : oui, non ou à vérifier (cahier). Une réponse fondée sur un guide est signalée.
export function BadgeOuverture(props: { o: Ouverture }) {
  const { o } = props;
  const texte = o.etat === 'oui' ? 'Ouvert' : o.etat === 'non' ? 'Fermé' : 'À vérifier';
  const classe = o.etat === 'non' ? 'etiquette alerte' : o.etat === 'a-verifier' ? 'etiquette attention' : 'etiquette ok';
  return (
    <span class="ouverture">
      <span class={classe}>{texte}</span>
      <span class="discret">
        {o.detail}
        {o.etat !== 'a-verifier' && !o.officielle ? ' · selon un guide, à confirmer' : ''}
      </span>
    </span>
  );
}

// Les noms des sources utilisées pour les prix, horaires et durées d'une fiche
export function resumeSources(l: Lieu): string[] {
  const noms: string[] = [];
  for (const s of [l.horaires?.source, l.prix?.source, l.duree?.source]) if (s && !noms.includes(s.libelle)) noms.push(s.libelle);
  return noms;
}

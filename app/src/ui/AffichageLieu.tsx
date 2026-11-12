// Éléments d'affichage partagés par les fiches de lieux et les propositions.
// Règle d'affichage : une information sans source est « à vérifier » ; une source secondaire (guide, annuaire) est signalée.

import type { ComponentChildren } from 'preact';
import type { HorairesLieu, Lieu, Personne, SourceLieu, TauxChange } from '../data/types.ts';
import { JOURS_SEMAINE } from '../data/types.ts';
import { libelleEuro } from '../lib/budget.ts';
import { formatMontant } from '../lib/format.ts';
import type { Ouverture } from '../lib/lieux.ts';
import { jourSemaineDe } from '../lib/lieux.ts';
import { lienSur } from '../lib/sejour.ts';
import { totalGroupe } from '../lib/tarifs.ts';
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

// Prix pour un groupe : le tarif de l'âge de chacun quand la source en donne un, sinon le prix standard (avec la raison)
export function PrixGroupe(props: { prix: NonNullable<Lieu['prix']>; personnes: Personne[]; taux: TauxChange[]; detail?: boolean }) {
  const t = totalGroupe(props.prix, props.personnes);
  if (t === null) return null;
  const n = props.personnes.length;
  const montant = t.min === 0 && t.max === 0 ? 'gratuit' : t.min === t.max ? formatMontant(t.min, t.devise) : `${formatMontant(t.min, t.devise)} à ${formatMontant(t.max, t.devise)}`;
  const euroMin = libelleEuro(t.min, t.devise, props.taux);
  const euroMax = libelleEuro(t.max, t.devise, props.taux);
  const euro = euroMin ? ` (${euroMin}${euroMax && t.max !== t.min ? ` à ${euroMax}` : ''})` : '';
  return (
    <span class="prix-groupe">
      <span>
        Pour le groupe ({n} personne{n > 1 ? 's' : ''}) : {montant}
        {euro}
      </span>
      {props.detail && (
        <ul class="liste-simple">
          {t.parPersonne.map((x) => (
            <li key={x.prenom}>
              {x.prenom} : {x.min === 0 && x.max === 0 ? 'gratuit' : x.min === x.max ? formatMontant(x.min, t.devise) : `${formatMontant(x.min, t.devise)} à ${formatMontant(x.max, t.devise)}`} ({x.libelle.toLowerCase()})
            </li>
          ))}
        </ul>
      )}
      {t.precisions.map((x) => (
        <span class="discret" key={x}>
          {x}
        </span>
      ))}
    </span>
  );
}

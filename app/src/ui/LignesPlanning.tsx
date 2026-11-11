// Lignes et résumés partagés par le planning (vue séjour) et la vue jour.

import type { Creneau, Donnees } from '../data/types.ts';
import { LIBELLES_HUMEUR, LIBELLES_PERIODE, LIBELLES_STATUT_CRENEAU, LIBELLES_TYPE_EVENEMENT } from '../data/types.ts';
import type { Totaux } from '../lib/creneaux.ts';
import { libelleHoraire, participantsEffectifs, periodeEffective } from '../lib/creneaux.ts';
import { formatMontant, formatNombre } from '../lib/format.ts';
import type { CreneauImpose } from '../lib/planning.ts';
import { formatDureeMin, nomFuseau } from '../lib/temps.ts';
import { trouverLieu } from '../data/lieux-publics.ts';
import { lienAutreIdee, lienCreneau, lienLieu, lienSource } from './routeur.ts';

export const montant = (n: number, devise: string): string => (devise !== '' ? formatMontant(n, devise) : formatNombre(n));

// Un créneau imposé (vol, trajet, logement) : on l'ouvre pour modifier sa source
export function LigneImpose(props: { c: CreneauImpose }) {
  const c = props.c;
  return (
    <a class={`creneau${c.secondaire ? ' estompee' : ''}`} href={lienSource(c.genre, c.id)}>
      <div class="creneau-heure">
        <strong>{c.heure !== '' ? c.heure : '—'}</strong>
        {c.zone !== '' && <span class="discret">{c.zone}</span>}
      </div>
      <div class="creneau-corps">
        <strong>{c.titre}</strong>
        {c.heure === '' && !c.details.some((d) => d.includes('définir')) && <span class="discret">Heure à définir</span>}
        {c.details.map((d) => (
          <span key={d} class={d === 'À trouver' || d === 'À vérifier' ? 'attention-texte' : 'discret'}>
            {d}
          </span>
        ))}
      </div>
    </a>
  );
}

function texteParticipants(c: Creneau, d: Donnees): string | null {
  const explicite = c.participants.length > 0;
  const jourRegle = d.joursPlan.some((j) => j.jour === c.jour);
  if (!explicite && !jourRegle) return null; // tout le monde : rien à signaler
  const noms = participantsEffectifs(c, d).map((p) => p.prenom);
  if (noms.length === 0) return null;
  return noms.length <= 3 ? noms.join(', ') : `${noms.slice(0, 3).join(', ')} +${noms.length - 3}`;
}

// Un créneau libre (ou un événement fixe). Avec "onFait", une case permet de le cocher.
export function LigneLibre(props: { c: Creneau; donnees: Donnees; alternatif?: Creneau; onFait?: () => void }) {
  const { c, donnees } = props;
  const participants = texteParticipants(c, donnees);
  const periode = periodeEffective(c);
  const heureGauche = c.debut !== '' ? c.debut : periode !== '' ? LIBELLES_PERIODE[periode] : '—';
  const annule = c.statut === 'annule';
  const budget = c.budgetEstime !== null ? `Budget ${montant(c.budgetEstime, c.devise)}` : null;
  const reel = c.budgetReel !== null ? `dépensé ${montant(c.budgetReel, c.devise)}` : null;
  const lieu = c.lieuId !== '' ? trouverLieu(donnees, c.lieuId) : undefined;
  const peutChangerIdee = props.onFait !== undefined && !c.fixe && c.planBDe === '' && c.statut !== 'fait' && c.statut !== 'annule';

  return (
    <div class={`creneau creneau-libre${props.onFait ? ' avec-case' : ''}${annule ? ' estompee' : ''}`}>
      {props.onFait && (
        <button
          type="button"
          class="case"
          role="checkbox"
          aria-checked={c.statut === 'fait'}
          aria-label={c.statut === 'fait' ? `Remettre à faire : ${c.titre}` : `Marquer comme fait : ${c.titre}`}
          onClick={props.onFait}
        >
          {c.statut === 'fait' ? '✓' : ''}
        </button>
      )}
      <div class="creneau-heure">
        <strong>{heureGauche}</strong>
        <span class="discret">{nomFuseau(c.fuseau)}</span>
      </div>
      <div class="creneau-corps">
        <a class="creneau-titre" href={lienCreneau(c.id)}>
          <strong class={annule ? 'barre-texte' : ''}>{c.titre}</strong>
        </a>
        <span class="etiquettes-ligne">
          {c.fixe && <span class="etiquette">{c.typeEvenement !== '' ? LIBELLES_TYPE_EVENEMENT[c.typeEvenement] : 'Événement'} · imposé</span>}
          {c.statut !== 'prevu' && <span class={`etiquette${c.statut === 'idee' ? ' attention' : ''}`}>{LIBELLES_STATUT_CRENEAU[c.statut]}</span>}
          {c.humeur !== '' && <span class="etiquette">{LIBELLES_HUMEUR[c.humeur]}</span>}
        </span>
        {c.debut !== '' && c.fin !== '' && <span class="discret">{libelleHoraire(c)}</span>}
        {c.debut === '' && c.fin === '' && c.dureeMin !== null && <span class="discret">Durée {formatDureeMin(c.dureeMin)}</span>}
        {participants && <span class="discret">Avec : {participants}</span>}
        {(budget || reel) && <span class="discret">{[budget, reel].filter(Boolean).join(' · ')}</span>}
        {c.note !== '' && <span class="discret apercu-note">{c.note}</span>}
        {c.lieuId !== '' && (
          <a class="discret" href={lieu ? lienLieu(lieu.id) : undefined}>
            {lieu ? `Fiche du lieu : ${lieu.nom} ›` : 'Fiche du lieu introuvable'}
          </a>
        )}
        {peutChangerIdee && (
          <a class="discret" href={lienAutreIdee(c.jour, periode, c.id)}>
            Autre idée ›
          </a>
        )}
        {props.alternatif && (
          <a class="plan-b" href={lienCreneau(props.alternatif.id)}>
            Plan B : {props.alternatif.titre || 'à définir'}
          </a>
        )}
      </div>
    </div>
  );
}

// Budget et temps d'un jour ou du séjour
export function ResumeTotaux(props: { totaux: Totaux }) {
  const t = props.totaux;
  const estime = t.budgets.filter((b) => b.estime > 0).map((b) => montant(b.estime, b.devise));
  const reel = t.budgets.filter((b) => b.reel > 0).map((b) => montant(b.reel, b.devise));
  const rien = estime.length === 0 && reel.length === 0 && t.activitesMin === 0 && t.deplacementsMin === 0 && t.sansDuree === 0;
  return (
    <ul class="vol-lignes">
      {rien && <li class="discret">Rien de chiffré pour l'instant.</li>}
      {estime.length > 0 && (
        <li>
          Budget estimé : <strong>{estime.join(' · ')}</strong>
        </li>
      )}
      {reel.length > 0 && <li>Dépensé : {reel.join(' · ')}</li>}
      {t.activitesMin > 0 && <li>Activités : {formatDureeMin(t.activitesMin)}</li>}
      {t.deplacementsMin > 0 && <li>Déplacements : {formatDureeMin(t.deplacementsMin)}</li>}
      {t.sansDuree > 0 && (
        <li class="discret">
          {t.sansDuree} créneau{t.sansDuree > 1 ? 'x' : ''} sans durée connue (non compté{t.sansDuree > 1 ? 's' : ''})
        </li>
      )}
    </ul>
  );
}

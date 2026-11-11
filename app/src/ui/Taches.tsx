import { basculerTache, useStore } from '../data/store.ts';
import type { ListeTache, Tache } from '../data/types.ts';
import { descriptionDates, debutVoyage, grouperTaches, LIBELLES_GROUPE, progression, tachesFaites } from '../lib/taches.ts';
import { aujourdhuiIso } from '../lib/temps.ts';
import { Page } from './commun.tsx';
import { lienNouvelleTache, lienTache } from './routeur.ts';

// Bascule entre les deux listes
function SegmentsListes(props: { actif: ListeTache }) {
  return (
    <div class="segments" role="group" aria-label="Listes">
      <a href="#/taches" class={props.actif === 'reste-a-faire' ? 'actif' : ''} aria-current={props.actif === 'reste-a-faire' ? 'page' : undefined}>
        Reste à faire
      </a>
      <a href="#/taches/emporter" class={props.actif === 'a-emporter' ? 'actif' : ''} aria-current={props.actif === 'a-emporter' ? 'page' : undefined}>
        À emporter
      </a>
    </div>
  );
}

function LigneTache(props: { tache: Tache; aujourdhui: string }) {
  const t = props.tache;
  const d = descriptionDates(t, props.aujourdhui);
  return (
    <div class={`tache${t.fait ? ' faite' : ''}`}>
      <button
        type="button"
        class="case"
        role="checkbox"
        aria-checked={t.fait}
        aria-label={t.fait ? `Remettre à faire : ${t.titre}` : `Marquer comme fait : ${t.titre}`}
        onClick={() => void basculerTache(t.id)}
      >
        {t.fait ? '✓' : ''}
      </button>
      <a class="tache-corps" href={lienTache(t.id)}>
        <strong>{t.titre}</strong>
        {d.retard && <span class="etiquette alerte">{d.retard}</span>}
        {d.lignes.map((l) => (
          <span class="discret" key={l}>
            {l}
          </span>
        ))}
        {t.note !== '' && <span class="discret apercu-note">{t.note}</span>}
      </a>
    </div>
  );
}

export function Taches(props: { liste: ListeTache }) {
  const { donnees } = useStore();
  const aujourdhui = aujourdhuiIso();
  const debut = debutVoyage(donnees);
  const toutes = donnees.taches.filter((t) => t.liste === props.liste);
  const p = progression(toutes, aujourdhui, debut);
  const groupes = grouperTaches(toutes, aujourdhui, debut);
  const faites = tachesFaites(toutes);
  const pourcentage = p.total === 0 ? 0 : Math.round((p.faites / p.total) * 100);
  const aEmporter = props.liste === 'a-emporter';

  return (
    <Page titre="Check-lists">
      <SegmentsListes actif={props.liste} />

      <section class="carte">
        <h2>{aEmporter ? 'Valise' : 'Progression'}</h2>
        <div class="barre" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.faites} aria-label="Progression">
          <span style={{ width: `${pourcentage}%` }} />
        </div>
        <p>
          <strong>
            {p.faites} faite{p.faites > 1 ? 's' : ''} sur {p.total}
          </strong>{' '}
          · {p.restantes} restante{p.restantes > 1 ? 's' : ''}
        </p>
        {p.enRetard > 0 && <p class="alerte-texte">{p.enRetard} en retard</p>}
      </section>

      <a class="bouton" href={lienNouvelleTache(props.liste)}>
        Ajouter une tâche
      </a>

      {p.total === 0 && (
        <section class="carte">
          <p>Aucune tâche dans cette liste. Ajoute-en une, ou importe ton fichier de voyage dans Réglages.</p>
        </section>
      )}
      {p.total > 0 && p.restantes === 0 && (
        <section class="carte">
          <p>
            <strong>Tout est fait ✓</strong>
          </p>
        </section>
      )}

      {groupes.map((g) => (
        <section class="carte" key={g.groupe}>
          <h2 class={g.groupe === 'en-retard' ? 'titre-retard' : ''}>
            {LIBELLES_GROUPE[g.groupe]} ({g.taches.length})
          </h2>
          {g.groupe === 'semaine' && <p class="discret">Les 7 prochains jours</p>}
          {g.taches.map((t) => (
            <LigneTache key={t.id} tache={t} aujourdhui={aujourdhui} />
          ))}
        </section>
      ))}

      {faites.length > 0 && (
        <details class="carte details-faites">
          <summary>Fait ({faites.length})</summary>
          {faites.map((t) => (
            <LigneTache key={t.id} tache={t} aujourdhui={aujourdhui} />
          ))}
        </details>
      )}
    </Page>
  );
}

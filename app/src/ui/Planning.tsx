import { useMemo } from 'preact/hooks';
import { useStore } from '../data/store.ts';
import type { CreneauImpose } from '../lib/planning.ts';
import { alertesPlanning, creneauxImposes, etapesDuJour, plageJours } from '../lib/planning.ts';
import { jourSemaine } from '../lib/sejour.ts';
import { aujourdhuiIso, formatDateIso } from '../lib/temps.ts';
import { Page } from './commun.tsx';
import { lienSource } from './routeur.ts';

function LigneCreneau(props: { c: CreneauImpose }) {
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

export function Planning() {
  const { donnees } = useStore();
  const creneaux = useMemo(() => creneauxImposes(donnees), [donnees]);
  const alertes = useMemo(() => alertesPlanning(donnees), [donnees]);
  const jours = plageJours(donnees, creneaux);
  const aujourdhui = aujourdhuiIso();
  const parJour = new Map<string, CreneauImpose[]>();
  for (const c of creneaux) parJour.set(c.jour, [...(parJour.get(c.jour) ?? []), c]);

  // Aujourd'hui si le voyage le couvre, sinon le prochain jour à venir
  const jourCible = jours.includes(aujourdhui) ? aujourdhui : jours.find((j) => j > aujourdhui);

  return (
    <Page titre="Planning">
      {alertes.length > 0 && (
        <section class="message attention" role="status" aria-label="À surveiller">
          <strong>À surveiller ({alertes.length})</strong>
          <ul>
            {alertes.map((a) => (
              <li key={a.cle}>
                {a.message}
                {a.genre && a.id && (
                  <>
                    {' '}
                    <a href={lienSource(a.genre, a.id)}>Ouvrir</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {jourCible && (
        <button
          type="button"
          class="bouton secondaire"
          onClick={() => document.getElementById(`jour-${jourCible}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          {jourCible === aujourdhui ? "Aller à aujourd'hui" : `Aller au prochain jour (${formatDateIso(jourCible)})`}
        </button>
      )}

      {jours.length === 0 && (
        <section class="carte">
          <p>Aucun créneau pour l'instant. Importe ton fichier de voyage dans Réglages, ou ajoute des vols, des logements et des trajets.</p>
        </section>
      )}

      {jours.map((jour) => {
        const etapes = etapesDuJour(jour, donnees.etapes);
        const liste = parJour.get(jour) ?? [];
        return (
          <section class="carte jour" id={`jour-${jour}`} key={jour}>
            <div class="vol-entete">
              <h2>
                {jourSemaine(jour)} {formatDateIso(jour)}
              </h2>
              {jour === aujourdhui && (
                <span class="etiquettes">
                  <span class="etiquette">Aujourd'hui</span>
                </span>
              )}
            </div>
            {etapes.length > 0 && <p class="discret">{etapes.map((e) => e.nom).join(' → ')}</p>}
            {liste.length === 0 ? <p class="discret">Rien d'imposé ce jour.</p> : liste.map((c) => <LigneCreneau key={c.cle} c={c} />)}
          </section>
        );
      })}

      <p class="note">
        Le planning montre pour l'instant les créneaux imposés : vols, trajets, arrivées et départs de logement. Les activités libres ne sont pas encore là. Les heures sont celles du lieu concerné.
      </p>
    </Page>
  );
}

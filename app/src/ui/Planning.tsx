import { useMemo } from 'preact/hooks';
import { useStore } from '../data/store.ts';
import { tousLesLieux } from '../data/lieux-publics.ts';
import { elementsDuJour, historique, totauxJour, totauxSejour } from '../lib/creneaux.ts';
import { toutesLesAlertes } from '../lib/alertes.ts';
import { creneauxImposes, etapesDuJour, plageJours } from '../lib/planning.ts';
import { jourSemaine } from '../lib/sejour.ts';
import { aujourdhuiIso, formatDateIso } from '../lib/temps.ts';
import { Page } from './commun.tsx';
import { LigneImpose, LigneLibre, ResumeTotaux, montant } from './LignesPlanning.tsx';
import { lienCreneau, lienJour, lienNouveauCreneau, lienPartage, lienQuoiFaire, lienSource } from './routeur.ts';

export function Planning() {
  const { donnees } = useStore();
  const imposes = useMemo(() => creneauxImposes(donnees), [donnees]);
  const alertes = useMemo(() => toutesLesAlertes(donnees, tousLesLieux(donnees)), [donnees]);
  const jours = plageJours(donnees, imposes);
  const aujourdhui = aujourdhuiIso();
  const totaux = totauxSejour(donnees, imposes);
  const faits = historique(donnees);

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

      {jours.length > 0 && (
        <section class="carte">
          <h2>Tout le séjour</h2>
          <ResumeTotaux totaux={totaux} />
        </section>
      )}

      {jourCible && (
        <div class="rangee">
          <a class="bouton" href={lienJour(jourCible)}>
            {jourCible === aujourdhui ? 'Ma journée' : `Jour du ${formatDateIso(jourCible)}`}
          </a>
          <button
            type="button"
            class="bouton secondaire"
            onClick={() => document.getElementById(`jour-${jourCible}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {jourCible === aujourdhui ? "Aller à aujourd'hui" : 'Aller à ce jour'}
          </button>
        </div>
      )}

      <a class="bouton secondaire" href={lienQuoiFaire()}>
        Quoi faire, quand ? Des idées de lieux
      </a>
      <a class="bouton secondaire" href={lienPartage()}>
        Partager, agenda (.ics), code à scanner
      </a>

      {jours.length === 0 && (
        <section class="carte">
          <p>Aucun créneau pour l'instant. Importe ton fichier de voyage dans Réglages, ou ajoute des vols, des logements et des trajets.</p>
          <a class="bouton" href={lienNouveauCreneau(aujourdhui)}>
            Ajouter un créneau
          </a>
        </section>
      )}

      {jours.map((jour) => {
        const etapes = etapesDuJour(jour, donnees.etapes);
        const elements = elementsDuJour(donnees, jour, imposes).filter((e) => !('libre' in e) || e.libre.statut !== 'fait');
        const t = totauxJour(donnees, jour, imposes);
        const budget = t.budgets.filter((b) => b.estime > 0).map((b) => montant(b.estime, b.devise));
        return (
          <section class="carte jour" id={`jour-${jour}`} key={jour}>
            <a class="entete-jour" href={lienJour(jour)}>
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
              {budget.length > 0 && <p class="discret">Budget estimé : {budget.join(' · ')}</p>}
            </a>
            {elements.length === 0 ? (
              <p class="discret">Rien de prévu ce jour.</p>
            ) : (
              elements.map((e) =>
                'impose' in e ? <LigneImpose key={e.cle} c={e.impose} /> : <LigneLibre key={e.cle} c={e.libre} alternatif={e.alternatif} donnees={donnees} />,
              )
            )}
            <a class="bouton secondaire petit" href={lienJour(jour)}>
              Ouvrir la journée ›
            </a>
          </section>
        );
      })}

      {faits.length > 0 && (
        <details class="carte details-faites">
          <summary>Historique ({faits.length})</summary>
          {faits.map((c) => (
            <a class="sous-carte" key={c.id} href={lienCreneau(c.id)}>
              <strong>{c.titre}</strong>
              <span class="discret">
                {jourSemaine(c.jour)} {formatDateIso(c.jour)}
                {c.debut !== '' && ` à ${c.debut}`}
              </span>
              {c.budgetReel !== null && <span class="discret">Dépensé {montant(c.budgetReel, c.devise)}</span>}
            </a>
          ))}
        </details>
      )}

      <p class="note">
        Le planning réunit les créneaux imposés (vols, trajets, arrivées et départs de logement, événements fixes) et tes créneaux libres. Les heures sont celles du lieu concerné. Les propositions de lieux arrivent à l'étape suivante.
      </p>
    </Page>
  );
}

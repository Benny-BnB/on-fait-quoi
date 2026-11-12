import { useMemo } from 'preact/hooks';
import { tousLesLieux } from '../data/lieux-publics.ts';
import { basculerCompteur, useStore } from '../data/store.ts';
import { donneesVidesQ, etatSauvegarde } from '../lib/sauvegarde.ts';
import { elementsACompleter } from '../lib/completer.ts';
import { useMaintenant } from '../lib/horloge.ts';
import { creneauxImposes, plageJours } from '../lib/planning.ts';
import { debutVoyage, progression } from '../lib/taches.ts';
import { aujourdhuiIso, formatDateHeureDansFuseau, formatDateIso } from '../lib/temps.ts';
import { CarteCompteur } from './CarteCompteur.tsx';
import { Page } from './commun.tsx';
import { lienACompleter, lienControle, lienLieu, lienPartage, lienPratique, lienQuoiFaire } from './routeur.ts';

export function Accueil() {
  const { donnees, meta } = useStore();
  const maintenant = useMaintenant();
  const visibles = donnees.compteurs.filter((c) => c.visible);
  const creneaux = useMemo(() => creneauxImposes(donnees), [donnees]);
  // Le prochain créneau imposé dont l'heure est connue
  const prochain = creneaux.find((c) => c.debutMs !== null && c.debutMs > maintenant);
  // Raccourci vers la journée : aujourd'hui si le voyage la couvre, sinon le prochain jour du planning
  const aujourdhui = aujourdhuiIso();
  const jours = plageJours(donnees, creneaux);
  const jourCible = jours.includes(aujourdhui) ? aujourdhui : jours.find((j) => j > aujourdhui);
  // Raccourci vers les check-lists : ce qu'il reste à faire, et ce qui est en retard
  const debut = debutVoyage(donnees);
  const aFaire = progression(donnees.taches.filter((t) => t.liste === 'reste-a-faire'), aujourdhui, debut);
  const valise = progression(donnees.taches.filter((t) => t.liste === 'a-emporter'), aujourdhui, debut);

  // Rappel de sauvegarde : seulement quand il y a une raison de le montrer
  const sauvegarde = etatSauvegarde(meta, donneesVidesQ(donnees), aujourdhui, debut);

  // Ce qui manque encore, et les envies à ne pas oublier (elles viennent du téléphone, jamais du dépôt public)
  const aCompleter = elementsACompleter(donnees, tousLesLieux(donnees), aujourdhui);
  const envies = donnees.suiviLieux
    .filter((s) => s.souhait === 'prioritaire' && !s.fait)
    .map((s) => tousLesLieux(donnees).find((l) => l.id === s.lieuId))
    .filter((l) => l !== undefined);

  return (
    <Page titre="On fait quoi ?">
      {donnees.vols.length === 0 && (
        <section class="carte">
          <h2>Aucune donnée pour l'instant</h2>
          <p>Importe ton fichier de voyage, ou ajoute un vol à la main.</p>
          <div class="pile">
            <a class="bouton" href="#/reglages">
              Importer mes données
            </a>
            <a class="bouton secondaire" href="#/vols/nouveau">
              Ajouter un vol
            </a>
          </div>
        </section>
      )}

      {(sauvegarde.niveau === 'rappel' || sauvegarde.niveau === 'urgent') && (
        <section class="message attention" role="status" aria-label="Rappel de sauvegarde">
          <strong>{sauvegarde.titre}</strong>
          <span>{sauvegarde.detail}</span>
          <a class="bouton secondaire" href="#/reglages">
            Sauvegarder maintenant
          </a>
        </section>
      )}

      {visibles.map((c) => (
        <CarteCompteur
          key={c.id}
          compteur={c}
          donnees={donnees}
          maintenant={maintenant}
          imposes={creneaux}
          onMasquer={() => void basculerCompteur(c.id)}
        />
      ))}

      {jourCible && (
        <a class="bouton" href={`#/jour/${jourCible}`}>
          {jourCible === aujourdhui ? 'Ma journée' : `Voir le jour du ${formatDateIso(jourCible)}`}
        </a>
      )}

      {prochain && prochain.debutMs !== null && (
        <a class="carte carte-lien" href="#/planning">
          <h2>Prochain créneau imposé</h2>
          <strong>{prochain.titre}</strong>
          <div>
            {formatDateHeureDansFuseau(prochain.debutMs, prochain.fuseau)}
            {prochain.zone !== '' && ` (heure de ${prochain.zone})`}
          </div>
          {prochain.details.slice(0, 2).map((d) => (
            <div key={d} class="discret">
              {d}
            </div>
          ))}
          <span class="discret">Voir le planning ›</span>
        </a>
      )}

      <section class="carte">
        <h2>Quoi faire ?</h2>
        {envies.length > 0 && (
          <>
            <p class="discret">Tes envies prioritaires :</p>
            <ul class="vol-lignes">
              {envies.map((l) => (
                <li key={l.id}>
                  <a href={lienLieu(l.id)}>★ {l.nom}</a>
                </li>
              ))}
            </ul>
          </>
        )}
        <a class="bouton secondaire" href={lienQuoiFaire()}>
          Quoi faire, quand ?
        </a>
      </section>

      <section class="carte">
        <h2>Pratique</h2>
        <p class="discret">Formalités, argent, téléphone, numéros utiles et transports, par étape, chacun avec sa source.</p>
        <a class="bouton secondaire" href={lienPratique()}>
          Ouvrir la rubrique Pratique
        </a>
      </section>

      <section class="carte">
        <h2>Partager et avant le départ</h2>
        <p class="discret">Fichier d'agenda avec rappels, lien ou code à scanner pour tes proches, et dernière vérification avant de partir.</p>
        <div class="pile">
          <a class="bouton secondaire" href={lienPartage()}>
            Partager et agenda (.ics)
          </a>
          <a class="bouton secondaire" href={lienControle()}>
            Avant le départ
          </a>
        </div>
      </section>

      {aCompleter.length > 0 && (
        <a class="carte carte-lien" href={lienACompleter()}>
          <h2>À compléter</h2>
          <strong>
            {aCompleter.length} chose{aCompleter.length > 1 ? 's' : ''} à renseigner
          </strong>
          <div class="discret">Logements, heures, durées, fiches à vérifier…</div>
          <span class="discret">Voir la liste ›</span>
        </a>
      )}

      {donnees.taches.length > 0 && (
        <a class="carte carte-lien" href="#/taches">
          <h2>Check-lists</h2>
          <div>
            <strong>
              {aFaire.restantes} tâche{aFaire.restantes > 1 ? 's' : ''} à faire
            </strong>
            {aFaire.enRetard > 0 && <span class="alerte-texte"> · {aFaire.enRetard} en retard</span>}
            {aFaire.aujourdhui > 0 && ` · ${aFaire.aujourdhui} pour aujourd'hui`}
          </div>
          {valise.total > 0 && (
            <div class="discret">
              Valise : {valise.faites} sur {valise.total}
            </div>
          )}
          <span class="discret">Voir les check-lists ›</span>
        </a>
      )}

      {visibles.length === 0 && donnees.vols.length > 0 && (
        <section class="carte">
          <p>Aucun compteur n'est affiché sur l'accueil.</p>
        </section>
      )}

      <a class="bouton secondaire" href="#/compteurs">
        Choisir les compteurs affichés
      </a>
    </Page>
  );
}

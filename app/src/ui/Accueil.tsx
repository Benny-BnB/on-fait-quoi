import { useMemo } from 'preact/hooks';
import { basculerCompteur, useStore } from '../data/store.ts';
import { useMaintenant } from '../lib/horloge.ts';
import { creneauxImposes } from '../lib/planning.ts';
import { formatDateHeureDansFuseau } from '../lib/temps.ts';
import { CarteCompteur } from './CarteCompteur.tsx';
import { Page } from './commun.tsx';

export function Accueil() {
  const { donnees } = useStore();
  const maintenant = useMaintenant();
  const visibles = donnees.compteurs.filter((c) => c.visible);
  const creneaux = useMemo(() => creneauxImposes(donnees), [donnees]);
  // Le prochain créneau imposé dont l'heure est connue
  const prochain = creneaux.find((c) => c.debutMs !== null && c.debutMs > maintenant);

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

      {visibles.map((c) => (
        <CarteCompteur
          key={c.id}
          compteur={c}
          donnees={donnees}
          maintenant={maintenant}
          onMasquer={() => void basculerCompteur(c.id)}
        />
      ))}

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

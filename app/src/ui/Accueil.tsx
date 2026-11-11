import { basculerCompteur, useStore } from '../data/store.ts';
import { useMaintenant } from '../lib/horloge.ts';
import { CarteCompteur } from './CarteCompteur.tsx';
import { Page } from './commun.tsx';

export function Accueil() {
  const { donnees } = useStore();
  const maintenant = useMaintenant();
  const visibles = donnees.compteurs.filter((c) => c.visible);

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

import { useMemo } from 'preact/hooks';
import { tousLesLieux } from '../data/lieux-publics.ts';
import { useStore } from '../data/store.ts';
import type { ElementACompleter, GenreACompleter } from '../lib/completer.ts';
import { elementsACompleter } from '../lib/completer.ts';
import { aujourdhuiIso } from '../lib/temps.ts';
import { Page } from './commun.tsx';
import { lienCreneau, lienEtape, lienLieu, lienLogement, lienTrajet, lienVol } from './routeur.ts';

export function lienACompleterElement(genre: GenreACompleter, id: string): string {
  switch (genre) {
    case 'vol':
      return lienVol(id);
    case 'trajet':
      return lienTrajet(id);
    case 'logement':
      return lienLogement(id);
    case 'etape':
      return lienEtape(id);
    case 'creneau':
      return lienCreneau(id);
    case 'lieu':
      return lienLieu(id);
    case 'taches':
      return '#/taches';
    case 'personnes':
      return '#/personnes';
    case 'groupes':
      return '#/groupes';
    case 'taux':
      return '#/taux';
    case 'budget':
      return '#/budget';
    case 'rythme':
      return '#/rythme';
  }
}

// Tout ce qui manque encore, avec un lien direct vers l'écran où le renseigner
export function ACompleter() {
  const { donnees } = useStore();
  const elements = useMemo(() => elementsACompleter(donnees, tousLesLieux(donnees), aujourdhuiIso()), [donnees]);
  const groupes = [...new Set(elements.map((e) => e.groupe))];

  return (
    <Page titre="À compléter" retour={{ href: '#/', libelle: 'Accueil' }}>
      {elements.length === 0 ? (
        <section class="carte">
          <h2>Rien à compléter</h2>
          <p>Tout ce que l'app sait contrôler est renseigné. Les informations sans source restent « à vérifier » sur les fiches de lieux.</p>
        </section>
      ) : (
        <p class="discret">
          {elements.length} chose{elements.length > 1 ? 's' : ''} à renseigner. Touche une ligne pour ouvrir l'écran où la compléter ; la liste se met à jour toute seule.
        </p>
      )}
      {groupes.map((g) => (
        <section class="carte" key={g}>
          <h2>{g}</h2>
          <ul class="lignes">
            {elements
              .filter((e: ElementACompleter) => e.groupe === g)
              .map((e) => (
                <li key={e.cle}>
                  <a class="sous-carte" href={lienACompleterElement(e.genre, e.id)}>
                    {e.message}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}

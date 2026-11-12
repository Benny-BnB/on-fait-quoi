import { useMemo } from 'preact/hooks';
import { tousLesLieux } from '../data/lieux-publics.ts';
import { toutesLesFichesPratique } from '../data/pratique-publique.ts';
import { useStore } from '../data/store.ts';
import { JOURS_FICHE_ANCIENNE, fichesARelire, pointsControle, type FicheARelire } from '../lib/controle.ts';
import { aujourdhuiIso } from '../lib/temps.ts';
import { Page } from './commun.tsx';
import { EtatApp, Ligne } from './EtatApp.tsx';
import { lienFichePratique, lienLieu, lienPartage } from './routeur.ts';

function ageFiche(f: FicheARelire): string {
  if (f.jours === null) return 'Jamais vérifiée';
  if (f.jours <= 0) return "Vérifiée aujourd'hui";
  return f.jours === 1 ? 'Vérifiée hier' : `Vérifiée il y a ${f.jours} jours`;
}

function ListeFiches(props: { titre: string; aide?: string; fiches: FicheARelire[] }) {
  if (props.fiches.length === 0) return null;
  return (
    <section class="carte">
      <h2>{props.titre}</h2>
      {props.aide && <p class="discret">{props.aide}</p>}
      <ul class="lignes">
        {props.fiches.map((f) => (
          <li key={f.cle} class={`ligne ${f.ancienne ? 'attention' : 'ok'}`}>
            <span class="symbole" aria-hidden="true">
              {f.ancienne ? '!' : '✓'}
            </span>
            <div>
              <a class="ligne-valeur" href={f.genre === 'lieu' ? lienLieu(f.cle.slice(5)) : lienFichePratique(f.cle.slice(9))}>
                {f.titre}
              </a>
              <div class="ligne-aide">{ageFiche(f)}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Dernière vérification avant le départ. Rien ici ne modifie les données.
export function Controle() {
  const { donnees, meta } = useStore();
  const aujourdhui = aujourdhuiIso();
  const lieux = useMemo(() => tousLesLieux(donnees), [donnees]);
  const pratique = useMemo(() => toutesLesFichesPratique(donnees), [donnees]);
  const points = useMemo(() => pointsControle(donnees, lieux, pratique, meta, aujourdhui), [donnees, lieux, pratique, meta, aujourdhui]);
  const fiches = useMemo(() => fichesARelire(donnees, lieux, pratique, aujourdhui), [donnees, lieux, pratique, aujourdhui]);
  const avis = fiches.filter((f) => f.avisOfficiel);
  const autres = fiches.filter((f) => !f.avisOfficiel);

  return (
    <Page titre="Avant le départ" retour={{ href: '#/', libelle: 'Accueil' }}>
      <section class="carte">
        <h2>À contrôler une dernière fois</h2>
        <ul class="lignes">
          {points.map((p) => (
            <Ligne key={p.cle} titre={p.titre} valeur={p.detail} niveau={p.niveau === 'info' ? 'neutre' : p.niveau} aide={undefined} />
          ))}
        </ul>
        <div class="pile">
          {points
            .filter((p) => p.lien !== '' && p.niveau === 'attention')
            .map((p) => (
              <a class="bouton secondaire" key={p.cle} href={p.lien}>
                {p.libelleLien}
              </a>
            ))}
        </div>
      </section>

      <ListeFiches
        titre="Avis officiels à relire juste avant de partir"
        aide="Les conseils aux voyageurs, les formalités et les règles d'entrée changent. Ouvre chaque fiche, puis la source officielle indiquée : c'est elle qui fait foi, pas cette app."
        fiches={avis}
      />
      <ListeFiches
        titre="Autres fiches utilisées"
        aide={`Une fiche est à relire si elle date de plus de ${JOURS_FICHE_ANCIENNE} jours ou n'a jamais été vérifiée. Les prix, horaires et fermetures (surtout les 24, 25 et 31 décembre) peuvent avoir changé.`}
        fiches={autres}
      />

      <section class="carte">
        <h2>Les liens des sources</h2>
        <p class="discret">
          L'app ne peut pas tester les liens toute seule : les sites refusent les requêtes venant d'une page web. Pour vérifier qu'une source répond encore, ouvre la fiche puis le lien de la source. Chaque fait affiche la date de sa dernière lecture.
        </p>
      </section>

      <EtatApp />

      <section class="carte">
        <h2>Aussi avant de partir</h2>
        <p class="discret">Exporte le fichier d'agenda (rappels fiables), partage le planning à tes proches, et refais une sauvegarde.</p>
        <div class="pile">
          <a class="bouton secondaire" href={lienPartage()}>
            Partager et agenda
          </a>
          <a class="bouton secondaire" href="#/reglages">
            Sauvegarde (Réglages)
          </a>
        </div>
      </section>
    </Page>
  );
}

import { useStore } from '../data/store.ts';
import type { Etape, Logement } from '../data/types.ts';
import { LIBELLES_STATUT_LOGEMENT } from '../data/types.ts';
import { etapesTriees, logementsTries, nbNuits, nuitsSansLogement } from '../lib/sejour.ts';
import { formatDateIso } from '../lib/temps.ts';
import { Page } from './commun.tsx';
import { lienEtape, lienLogement, lienNouveauLogement, lienPratique } from './routeur.ts';

const nuitsTexte = (n: number): string => `${n} nuit${n > 1 ? 's' : ''}`;

function CarteLogement(props: { logement: Logement }) {
  const l = props.logement;
  const attention = l.statut === 'a-trouver' || l.statut === 'a-verifier';
  const moment = (m: Logement['arrivee']): string => `${formatDateIso(m.date)}${m.heure ? ` à ${m.heure}` : ' (heure à compléter)'}`;
  return (
    <a class="sous-carte" href={lienLogement(l.id)}>
      <div class="vol-entete">
        <strong>{l.nom}</strong>
        <span class="etiquettes">
          <span class={`etiquette${attention ? ' attention' : ''}`}>{LIBELLES_STATUT_LOGEMENT[l.statut]}</span>
        </span>
      </div>
      <div>Arrivée {moment(l.arrivee)}</div>
      <div>Départ {moment(l.depart)}</div>
      {l.adresse ? <div class="discret">{l.adresse}</div> : l.statut !== 'a-trouver' && <div class="discret">Adresse à compléter</div>}
      {l.reference && <div class="discret">Référence {l.reference}</div>}
    </a>
  );
}

function CarteEtape(props: { etape: Etape; logements: Logement[] }) {
  const e = props.etape;
  const trous = nuitsSansLogement(e, props.logements);
  return (
    <section class="carte">
      <div>
        <h2>{e.nom}</h2>
        <p class="discret">
          {e.pays && `${e.pays} · `}
          {formatDateIso(e.debut)} → {formatDateIso(e.fin)} · {nuitsTexte(nbNuits(e.debut, e.fin))}
        </p>
      </div>

      {trous.length > 0 && (
        <div class="message attention" role="status">
          <strong>Nuits sans logement</strong>
          <ul>
            {trous.map((t) => (
              <li key={t.du}>
                du {formatDateIso(t.du)} au {formatDateIso(t.au)} ({nuitsTexte(t.nuits)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {logementsTries(props.logements).map((l) => (
        <CarteLogement key={l.id} logement={l} />
      ))}
      {props.logements.length === 0 && <p class="discret">Aucun logement pour cette étape.</p>}

      <a class="bouton" href={lienNouveauLogement(e.id)}>
        Ajouter un logement
      </a>
      <a class="bouton secondaire petit" href={lienPratique(e.id)}>
        Pratique : trajets, argent, numéros utiles
      </a>
      <a class="bouton secondaire petit" href={lienEtape(e.id)}>
        Modifier l'étape
      </a>
    </section>
  );
}

export function Sejour() {
  const { donnees } = useStore();
  const etapes = etapesTriees(donnees.etapes);
  const idsEtapes = new Set(etapes.map((e) => e.id));
  const orphelins = donnees.logements.filter((l) => !idsEtapes.has(l.etapeId));
  const aTrouver = donnees.logements.filter((l) => l.statut === 'a-trouver').length;
  const aVerifier = donnees.logements.filter((l) => l.statut === 'a-verifier').length;

  return (
    <Page titre="Séjour">
      <a class="bouton" href="#/sejour/etape/nouveau">
        Ajouter une étape
      </a>
      <a class="bouton secondaire" href={lienPratique()}>
        Pratique : formalités, argent, téléphone, numéros utiles
      </a>

      {(aTrouver > 0 || aVerifier > 0) && (
        <div class="message info">
          {aTrouver > 0 && <div>{aTrouver} logement{aTrouver > 1 ? 's' : ''} à trouver</div>}
          {aVerifier > 0 && <div>{aVerifier} logement{aVerifier > 1 ? 's' : ''} à vérifier</div>}
        </div>
      )}

      {etapes.length === 0 && (
        <section class="carte">
          <p>Aucune étape. Ajoute-en une, ou importe ton fichier de voyage dans Réglages.</p>
        </section>
      )}

      {etapes.map((e) => (
        <CarteEtape key={e.id} etape={e} logements={donnees.logements.filter((l) => l.etapeId === e.id)} />
      ))}

      {orphelins.length > 0 && (
        <section class="carte">
          <h2>Logements sans étape</h2>
          <p class="discret">Leur étape n'existe plus. Ouvre-les pour les rattacher à une étape.</p>
          {orphelins.map((l) => (
            <CarteLogement key={l.id} logement={l} />
          ))}
        </section>
      )}
    </Page>
  );
}

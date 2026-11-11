import { useStore } from '../data/store.ts';
import type { Donnees, Vol } from '../data/types.ts';
import { LIBELLES_STATUT } from '../data/types.ts';
import { calculerTrajet, estCorrespondance, heureAvecJour, jourDans, trajetsVersVol } from '../lib/planning.ts';
import { dureeVolMin, instantArriveeAeroport, instantDepart, volsTries } from '../lib/vols.ts';
import { formatDateHeureDansFuseau, formatDateIso, formatDureeMin, formatUtc, fuseauValide } from '../lib/temps.ts';
import { Page } from './commun.tsx';
import { lienVol } from './routeur.ts';
import { SousOnglets } from './SousOnglets.tsx';

// Trajets prévus pour aller à l'aéroport, et heure de départ conseillée quand la durée est connue
function LignesTrajets(props: { vol: Vol; donnees: Donnees }) {
  const { vol: v, donnees: d } = props;
  const vers = trajetsVersVol(d, v.id);
  if (vers.length === 0) {
    return estCorrespondance(v, d.vols) ? (
      <li class="discret">Correspondance : pas de trajet à prévoir</li>
    ) : (
      <li class="attention-texte">Aucun trajet prévu vers l'aéroport</li>
    );
  }
  const f = v.depart.fuseau;
  return (
    <>
      {vers.map((t) => {
        const c = calculerTrajet(t, d);
        if (c.conseilleMs !== null && c.aeroportAvantMs !== null && fuseauValide(f)) {
          return (
            <li key={t.id}>
              <strong>Partir de « {t.de} » à {heureAvecJour(c.conseilleMs, f, jourDans(c.aeroportAvantMs, f))}</strong> (trajet {formatDureeMin(t.dureeMin ?? 0)})
            </li>
          );
        }
        return (
          <li key={t.id} class="discret">
            Trajet « {t.de} → {t.a} » : durée à renseigner pour calculer l'heure de départ
          </li>
        );
      })}
    </>
  );
}

function CarteVol(props: { vol: Vol; donnees: Donnees; maintenant: number }) {
  const v = props.vol;
  const depart = instantDepart(v);
  const valide = !Number.isNaN(depart) && !Number.isNaN(dureeVolMin(v));
  const passe = valide && depart <= props.maintenant;
  const actif = valide && !passe && v.statut !== 'annule';

  return (
    <a class={`carte carte-lien${passe || v.statut === 'annule' ? ' estompee' : ''}`} href={lienVol(v.id)}>
      <div class="vol-entete">
        <strong>{v.numero}</strong>
        {v.compagnie && <span class="discret"> · {v.compagnie}</span>}
        <span class="etiquettes">
          {passe && <span class="etiquette">Passé</span>}
          {v.statut !== 'confirme' && <span class="etiquette attention">{LIBELLES_STATUT[v.statut]}</span>}
          {!v.pourMoi && <span class="etiquette">Vol d'une autre personne</span>}
        </span>
      </div>

      <div class="vol-trajet">
        {v.depart.code} → {v.arrivee.code}
      </div>
      <div class="discret">
        {v.depart.ville || v.depart.code} → {v.arrivee.ville || v.arrivee.code}
      </div>

      <ul class="vol-lignes">
        <li>
          Départ {formatDateIso(v.depart.date)} à {v.depart.heure}
          {v.depart.terminal && ` · terminal ${v.depart.terminal}`}
        </li>
        <li>
          Arrivée {formatDateIso(v.arrivee.date)} à {v.arrivee.heure}
          {v.arrivee.terminal && ` · terminal ${v.arrivee.terminal}`}
        </li>
        {valide && <li>Durée du vol : {formatDureeMin(dureeVolMin(v))}</li>}
        {v.reference && <li>Référence {v.reference}</li>}
        {actif && v.pourMoi && (
          <li>
            Être à l'aéroport avant{' '}
            {formatDateHeureDansFuseau(instantArriveeAeroport(v, props.donnees.reglages), v.depart.fuseau)} (
            {formatDureeMin(props.donnees.reglages.delaiAeroportMin[v.portee])} avant le décollage)
          </li>
        )}
        {actif && v.pourMoi && <LignesTrajets vol={v} donnees={props.donnees} />}
        {valide && <li class="discret">Départ exact : {formatUtc(depart)}</li>}
      </ul>
    </a>
  );
}

export function Vols() {
  const { donnees } = useStore();
  const maintenant = Date.now();
  const vols = volsTries(donnees.vols);

  return (
    <Page titre="Transports">
      <SousOnglets actif="vols" />
      <a class="bouton" href="#/vols/nouveau">
        Ajouter un vol
      </a>
      {vols.length === 0 && (
        <section class="carte">
          <p>Aucun vol enregistré. Ajoute-en un, ou importe ton fichier de voyage dans Réglages.</p>
        </section>
      )}
      {vols.map((v) => (
        <CarteVol key={v.id} vol={v} donnees={donnees} maintenant={maintenant} />
      ))}
    </Page>
  );
}

import { useStore } from '../data/store.ts';
import type { Donnees, Vol } from '../data/types.ts';
import { LIBELLES_STATUT } from '../data/types.ts';
import { dureeVolMin, instantArriveeAeroport, instantDepart, volsTries } from '../lib/vols.ts';
import { formatDateHeureDansFuseau, formatDateIso, formatDureeMin, formatUtc } from '../lib/temps.ts';
import { Page } from './commun.tsx';
import { lienVol } from './routeur.ts';

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
    <Page titre="Vols">
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

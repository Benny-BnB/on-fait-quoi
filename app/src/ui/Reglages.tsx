import { enregistrerReglages, useStore } from '../data/store.ts';
import { formatHeureSecondes, formatHeureUtcSecondes } from '../lib/format.ts';
import { useMaintenant } from '../lib/horloge.ts';
import { formatDateIso, formatDureeMin, formatUtc, fuseauTelephone } from '../lib/temps.ts';
import { LIBELLES_A_EVITER } from '../data/types.ts';
import { instantDepart, prochainVol } from '../lib/vols.ts';
import { Champ, Page } from './commun.tsx';
import { EtatApp } from './EtatApp.tsx';
import { ImportExport } from './ImportExport.tsx';

function DelaisAeroport() {
  const { donnees } = useStore();
  const delais = donnees.reglages.delaiAeroportMin;

  function changer(cle: 'international' | 'interieur', champ: HTMLInputElement) {
    const n = Number.parseInt(champ.value, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 1440) {
      void enregistrerReglages({ ...donnees.reglages, delaiAeroportMin: { ...delais, [cle]: n } });
    } else {
      champ.value = String(delais[cle]); // valeur refusée : on remet l'ancienne
    }
  }

  return (
    <section class="carte">
      <h2>Arrivée à l'aéroport</h2>
      <p class="discret">Combien de temps avant le décollage tu veux être à l'aéroport. Modifiable à tout moment.</p>
      <Champ etiquette="Vol international (minutes)" aide={`Aujourd'hui : ${formatDureeMin(delais.international)}`}>
        <input type="number" min="0" max="1440" step="5" inputMode="numeric" value={delais.international} onChange={(e) => changer('international', e.currentTarget)} />
      </Champ>
      <Champ etiquette="Vol intérieur (minutes)" aide={`Aujourd'hui : ${formatDureeMin(delais.interieur)}`}>
        <input type="number" min="0" max="1440" step="5" inputMode="numeric" value={delais.interieur} onChange={(e) => changer('interieur', e.currentTarget)} />
      </Champ>
    </section>
  );
}

// Pour vérifier les compteurs : l'heure exacte du prochain vol (en UTC) et l'heure de ton téléphone
function Verification() {
  const { donnees } = useStore();
  const maintenant = useMaintenant();
  const d = new Date(maintenant);
  const prochain = prochainVol(donnees.vols, maintenant);

  return (
    <section class="carte">
      <h2>Vérifier les heures</h2>
      <ul class="vol-lignes">
        <li>Fuseau de ton téléphone : {fuseauTelephone()}</li>
        <li>Heure de ton téléphone : {formatHeureSecondes(d)}</li>
        <li>Heure UTC : {formatHeureUtcSecondes(d)}</li>
        <li>
          Prochain vol, départ exact : {prochain ? `${prochain.numero} · ${formatUtc(instantDepart(prochain))}` : 'aucun vol à venir'}
        </li>
      </ul>
      <p class="discret">
        Les compteurs se calculent avec l'heure locale de chaque aéroport et son fuseau. Changer le fuseau de ton téléphone ne les modifie pas.
      </p>
    </section>
  );
}

export function Reglages() {
  const { donnees } = useStore();
  return (
    <Page titre="Réglages">
      <section class="carte">
        <h2>Personnes et groupes</h2>
        <p class="discret">
          {donnees.personnes.length} personne{donnees.personnes.length > 1 ? 's' : ''}, {donnees.groupes.length} groupe{donnees.groupes.length > 1 ? 's' : ''}. Âge, alimentation, mobilité, confort et présence servent à signaler ce qui ne convient pas, et à choisir qui participe à chaque créneau.
        </p>
        <div class="pile">
          <a class="bouton secondaire" href="#/personnes">
            Gérer les personnes
          </a>
          <a class="bouton secondaire" href="#/groupes">
            Gérer les groupes
          </a>
        </div>
      </section>
      <section class="carte">
        <h2>Argent, rythme et préférences</h2>
        <ul class="vol-lignes">
          <li>
            Taux de change :{' '}
            {donnees.reglages.tauxChange.length > 0 ? donnees.reglages.tauxChange.map((t) => `${t.devise} (${formatDateIso(t.date)})`).join(', ') : 'aucun saisi'}
          </li>
          <li>Budgets : {donnees.reglages.budget.length > 0 ? donnees.reglages.budget.length : 'aucun'}</li>
          <li>
            Rythme : {donnees.reglages.rythme.activitesMax !== null ? `${donnees.reglages.rythme.activitesMax} activités au plus par jour` : 'pas de limite'}
            {donnees.reglages.rythme.heureLever !== '' ? `, lever à ${donnees.reglages.rythme.heureLever}` : ''}
          </li>
          <li>À éviter : {donnees.reglages.aEviter.length > 0 ? donnees.reglages.aEviter.map((a) => LIBELLES_A_EVITER[a].toLowerCase()).join(', ') : 'rien de particulier'}</li>
        </ul>
        <div class="pile">
          <a class="bouton secondaire" href="#/taux">
            Taux de change
          </a>
          <a class="bouton secondaire" href="#/budget">
            Budget
          </a>
          <a class="bouton secondaire" href="#/rythme">
            Rythme, à éviter, transports
          </a>
        </div>
      </section>
      <DelaisAeroport />
      <section class="carte">
        <h2>Partager et avant le départ</h2>
        <p class="discret">Exporter le planning dans ton agenda (avec rappels), le partager par lien ou code à scanner, contrôler tout avant de partir.</p>
        <div class="pile">
          <a class="bouton secondaire" href="#/partage">
            Partager et agenda (.ics)
          </a>
          <a class="bouton secondaire" href="#/controle">
            Avant le départ
          </a>
        </div>
      </section>
      <ImportExport />
      <Verification />
      <EtatApp />
      <p class="note">
        Cette version contient les vols, les compteurs, les étapes, les logements, les trajets, le planning, les check-lists, les fiches de lieux avec « Quoi faire, quand ? » (Bangkok, Pattaya, Krabi, Railay et Dubaï), la rubrique Pratique, les profils, les groupes, le budget, le rythme et le taux de change, ainsi que le partage, l'export d'agenda et le contrôle avant le départ.
      </p>
    </Page>
  );
}

import { enregistrerReglages, useStore } from '../data/store.ts';
import { formatHeureSecondes, formatHeureUtcSecondes } from '../lib/format.ts';
import { useMaintenant } from '../lib/horloge.ts';
import { formatDureeMin, formatUtc, fuseauTelephone } from '../lib/temps.ts';
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
      void enregistrerReglages({ delaiAeroportMin: { ...delais, [cle]: n } });
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
  return (
    <Page titre="Réglages">
      <DelaisAeroport />
      <ImportExport />
      <Verification />
      <EtatApp />
      <p class="note">
        Cette version contient les vols, les compteurs, les étapes, les logements, les trajets, le planning des créneaux imposés et les check-lists. Les activités libres et les fiches de lieux ne sont pas encore là : ils arrivent étape par étape.
      </p>
    </Page>
  );
}

import { useEffect } from 'preact/hooks';
import { chargerDonnees, useStore } from './data/store.ts';
import { demanderStockagePersistant } from './data/stockage.ts';
import { Accueil } from './ui/Accueil.tsx';
import { Page } from './ui/commun.tsx';
import { Compteurs } from './ui/Compteurs.tsx';
import { FormulaireCompteur } from './ui/FormulaireCompteur.tsx';
import { FormulaireEtape } from './ui/FormulaireEtape.tsx';
import { FormulaireLogement } from './ui/FormulaireLogement.tsx';
import { FormulaireTrajet } from './ui/FormulaireTrajet.tsx';
import { FormulaireVol } from './ui/FormulaireVol.tsx';
import { Navigation } from './ui/Navigation.tsx';
import { Planning } from './ui/Planning.tsx';
import { Reglages } from './ui/Reglages.tsx';
import { useRoute } from './ui/routeur.ts';
import { Sejour } from './ui/Sejour.tsx';
import { Trajets } from './ui/Trajets.tsx';
import { Vols } from './ui/Vols.tsx';

export function App() {
  const route = useRoute();
  const { charge } = useStore();

  useEffect(() => {
    void chargerDonnees();
    void demanderStockagePersistant(); // demande au téléphone de ne pas effacer les données tout seul
  }, []);

  let page;
  if (!charge) {
    page = (
      <Page titre="On fait quoi ?">
        <p class="note">Chargement…</p>
      </Page>
    );
  } else {
    switch (route.nom) {
      case 'vols':
        page = <Vols />;
        break;
      case 'vol':
        page = <FormulaireVol id={route.id} />;
        break;
      case 'compteurs':
        page = <Compteurs />;
        break;
      case 'compteur':
        page = <FormulaireCompteur id={route.id} />;
        break;
      case 'planning':
        page = <Planning />;
        break;
      case 'trajets':
        page = <Trajets />;
        break;
      case 'trajet':
        page = <FormulaireTrajet id={route.id} volId={route.volId} />;
        break;
      case 'sejour':
        page = <Sejour />;
        break;
      case 'etape':
        page = <FormulaireEtape id={route.id} />;
        break;
      case 'logement':
        page = <FormulaireLogement id={route.id} etapeId={route.etapeId} />;
        break;
      case 'reglages':
        page = <Reglages />;
        break;
      default:
        page = <Accueil />;
    }
  }

  return (
    <>
      {page}
      <Navigation route={route} />
    </>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { registerSW } from 'virtual:pwa-register';
import { estInstallee, verifierHorsLigne, type EtatHorsLigne } from './lib/hors-ligne';
import { formatDateHeure } from './lib/format';

type Niveau = 'ok' | 'attention' | 'neutre';

// Une ligne d'état. Le sens est porté par le texte ET par un symbole, jamais par la couleur seule.
function Ligne(props: { titre: string; valeur: string; niveau: Niveau; aide?: string }) {
  const symbole = props.niveau === 'ok' ? '✓' : props.niveau === 'attention' ? '!' : '·';
  return (
    <li class={`ligne ${props.niveau}`}>
      <span class="symbole" aria-hidden="true">
        {symbole}
      </span>
      <div>
        <div class="ligne-titre">{props.titre}</div>
        <div class="ligne-valeur">{props.valeur}</div>
        {props.aide && <div class="ligne-aide">{props.aide}</div>}
      </div>
    </li>
  );
}

function texteHorsLigne(etat: EtatHorsLigne): { valeur: string; niveau: Niveau; aide?: string } {
  switch (etat) {
    case 'pret':
      return { valeur: "Prêt : l'app est enregistrée sur ce téléphone", niveau: 'ok' };
    case 'pas-pret':
      return {
        valeur: 'Pas encore prêt',
        niveau: 'attention',
        aide: "Ouvre l'app une fois avec une connexion Internet, puis rouvre-la.",
      };
    case 'indisponible':
      return { valeur: 'Non disponible sur ce navigateur', niveau: 'attention' };
    default:
      return { valeur: 'Vérification…', niveau: 'neutre' };
  }
}

export function App() {
  const [enLigne, setEnLigne] = useState<boolean>(navigator.onLine);
  const [horsLigne, setHorsLigne] = useState<EtatHorsLigne>('verification');
  const [installerMaj, setInstallerMaj] = useState<(() => void) | null>(null);
  const installee = estInstallee();

  // Connexion Internet : suivie en direct
  useEffect(() => {
    const surEnLigne = () => setEnLigne(true);
    const surHorsLigne = () => setEnLigne(false);
    window.addEventListener('online', surEnLigne);
    window.addEventListener('offline', surHorsLigne);
    return () => {
      window.removeEventListener('online', surEnLigne);
      window.removeEventListener('offline', surHorsLigne);
    };
  }, []);

  // Mode hors ligne et mises à jour
  useEffect(() => {
    let enregistrement: ServiceWorkerRegistration | undefined;

    const actualiserEtat = () => {
      verifierHorsLigne().then(setHorsLigne);
    };

    const majSW: (rechargerPage?: boolean) => Promise<void> = registerSW({
      onOfflineReady: actualiserEtat,
      // Une nouvelle version est prête : on propose, on ne recharge jamais toute seule
      onNeedRefresh() {
        setInstallerMaj(() => () => {
          void majSW(true);
        });
      },
      onRegisteredSW(_url, reg) {
        enregistrement = reg;
      },
    });

    actualiserEtat();
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.ready.then(actualiserEtat);
    }

    // Quand on revient sur l'app, on cherche s'il existe une version plus récente
    const surVisibilite = () => {
      if (document.visibilityState === 'visible') {
        enregistrement?.update().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', surVisibilite);
    return () => document.removeEventListener('visibilitychange', surVisibilite);
  }, []);

  const etatHorsLigne = texteHorsLigne(horsLigne);

  return (
    <>
      <header class="entete">
        <h1>On fait quoi ?</h1>
        <p>Étape 1 : fondations</p>
      </header>

      <main class="contenu">
        {installerMaj && (
          <section class="carte maj" role="status">
            <p>Une nouvelle version de l'app est prête.</p>
            <button type="button" class="bouton" onClick={installerMaj}>
              Mettre à jour
            </button>
          </section>
        )}

        <section class="carte">
          <h2>État de l'app</h2>
          <ul class="lignes">
            <Ligne
              titre="Installation"
              valeur={
                installee ? "Installée sur l'écran d'accueil" : 'Ouverte dans le navigateur'
              }
              niveau={installee ? 'ok' : 'attention'}
              aide={
                installee
                  ? undefined
                  : "Sur iPhone : touche le bouton Partager de Safari, puis « Sur l'écran d'accueil »."
              }
            />
            <Ligne
              titre="Connexion Internet"
              valeur={enLigne ? 'En ligne' : 'Hors ligne'}
              niveau="neutre"
            />
            <Ligne
              titre="Mode avion"
              valeur={etatHorsLigne.valeur}
              niveau={etatHorsLigne.niveau}
              aide={etatHorsLigne.aide}
            />
            <Ligne
              titre="Version"
              valeur={`Fabriquée le ${formatDateHeure(new Date(__BUILD_ISO__))}`}
              niveau="neutre"
            />
          </ul>
        </section>

        <p class="note">
          Cette première version ne contient que l'installation et le mode hors ligne. Les vols, les
          compteurs, le planning et les check-lists ne sont pas encore là : ils arrivent étape par
          étape.
        </p>
      </main>
    </>
  );
}

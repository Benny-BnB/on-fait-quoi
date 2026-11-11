import { useEffect, useState } from 'preact/hooks';
import { demanderStockagePersistant } from '../data/stockage.ts';
import { estInstallee, verifierHorsLigne, type EtatHorsLigne } from '../lib/hors-ligne.ts';
import { formatDateHeure } from '../lib/format.ts';
import { EVENEMENT_HORS_LIGNE_PRET } from './maj.ts';

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

export function EtatApp() {
  const [enLigne, definirEnLigne] = useState<boolean>(navigator.onLine);
  const [horsLigne, definirHorsLigne] = useState<EtatHorsLigne>('verification');
  const [stockage, definirStockage] = useState<boolean | null | undefined>(undefined);
  const installee = estInstallee();

  useEffect(() => {
    const surEnLigne = () => definirEnLigne(true);
    const surHorsLigne = () => definirEnLigne(false);
    window.addEventListener('online', surEnLigne);
    window.addEventListener('offline', surHorsLigne);
    return () => {
      window.removeEventListener('online', surEnLigne);
      window.removeEventListener('offline', surHorsLigne);
    };
  }, []);

  useEffect(() => {
    const actualiser = () => {
      verifierHorsLigne().then(definirHorsLigne);
    };
    actualiser();
    if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then(actualiser);
    window.addEventListener(EVENEMENT_HORS_LIGNE_PRET, actualiser);
    void demanderStockagePersistant().then(definirStockage);
    return () => window.removeEventListener(EVENEMENT_HORS_LIGNE_PRET, actualiser);
  }, []);

  const hl = texteHorsLigne(horsLigne);
  const sauvegarde = 'Exporte une sauvegarde de temps en temps (section « Mes données »).';

  return (
    <section class="carte">
      <h2>État de l'app</h2>
      <ul class="lignes">
        <Ligne
          titre="Installation"
          valeur={installee ? "Installée sur l'écran d'accueil" : 'Ouverte dans le navigateur'}
          niveau={installee ? 'ok' : 'attention'}
          aide={installee ? undefined : "Sur iPhone : touche le bouton Partager de Safari, puis « Sur l'écran d'accueil »."}
        />
        <Ligne titre="Connexion Internet" valeur={enLigne ? 'En ligne' : 'Hors ligne'} niveau="neutre" />
        <Ligne titre="Mode avion" valeur={hl.valeur} niveau={hl.niveau} aide={hl.aide} />
        <Ligne
          titre="Données enregistrées dans le téléphone"
          valeur={
            stockage === true
              ? "Protégées contre l'effacement automatique"
              : stockage === false
                ? 'Non garanties par ce navigateur'
                : stockage === null
                  ? 'Protection : information indisponible'
                  : 'Vérification…'
          }
          niveau={stockage === true ? 'ok' : stockage === undefined ? 'neutre' : 'attention'}
          aide={stockage === true || stockage === undefined ? undefined : sauvegarde}
        />
        <Ligne titre="Version" valeur={`Fabriquée le ${formatDateHeure(new Date(__BUILD_ISO__))}`} niveau="neutre" />
      </ul>
    </section>
  );
}

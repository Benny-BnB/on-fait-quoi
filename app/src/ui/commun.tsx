import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useStore } from '../data/store.ts';
import { useMiseAJour } from './maj.ts';

// Page : bandeau du haut + contenu, avec les avertissements communs à tous les écrans
export function Page(props: {
  titre: string;
  retour?: { href: string; libelle: string };
  children: ComponentChildren;
}) {
  const { erreurStockage } = useStore();
  const installerMaj = useMiseAJour();
  return (
    <>
      <header class="entete">
        {props.retour && (
          <a class="retour" href={props.retour.href}>
            ‹ {props.retour.libelle}
          </a>
        )}
        <h1>{props.titre}</h1>
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
        {erreurStockage && (
          <div class="message erreur" role="alert">
            {erreurStockage}
          </div>
        )}
        {props.children}
      </main>
    </>
  );
}

export function Champ(props: { etiquette: string; aide?: string; children: ComponentChildren }) {
  return (
    <label class="champ">
      <span class="champ-etiquette">{props.etiquette}</span>
      {props.children}
      {props.aide && <span class="champ-aide">{props.aide}</span>}
    </label>
  );
}

export function ListeErreurs(props: { erreurs: string[] }) {
  if (props.erreurs.length === 0) return null;
  return (
    <div class="message erreur" role="alert">
      <strong>À corriger :</strong>
      <ul>
        {props.erreurs.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

// Suppression en deux touches : on demande toujours confirmation
export function BoutonConfirme(props: { libelle: string; question: string; oui: string; onConfirme: () => void }) {
  const [ouvert, definirOuvert] = useState(false);
  if (!ouvert) {
    return (
      <button type="button" class="bouton danger" onClick={() => definirOuvert(true)}>
        {props.libelle}
      </button>
    );
  }
  return (
    <div class="confirmation" role="alertdialog" aria-label={props.question}>
      <p>{props.question}</p>
      <div class="rangee">
        <button type="button" class="bouton danger" onClick={props.onConfirme}>
          {props.oui}
        </button>
        <button type="button" class="bouton secondaire" onClick={() => definirOuvert(false)}>
          Non, garder
        </button>
      </div>
    </div>
  );
}

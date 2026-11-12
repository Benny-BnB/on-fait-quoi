// Rubrique Pratique : par étape, les trajets, transports, argent, téléphone, numéros utiles, formalités.
// Chaque fait a sa source et sa date de consultation ; ce qui n'a pas pu être lu est « à vérifier ».

import { useMemo, useState } from 'preact/hooks';
import { ERREURS_BASE_PRATIQUE, estFichePratiquePerso, PRATIQUE_PUBLIQUE, toutesLesFichesPratique, trouverFichePratique } from '../data/pratique-publique.ts';
import { supprimerPratiquePerso, useStore } from '../data/store.ts';
import type { FichePratique, RubriquePratique } from '../data/types.ts';
import { LIBELLES_RUBRIQUE_PRATIQUE } from '../data/types.ts';
import { fraicheurPratique, grouperPratique, pratiqueAVerifier } from '../lib/pratique.ts';
import { etapesTriees } from '../lib/sejour.ts';
import { aujourdhuiIso, formatDateIso } from '../lib/temps.ts';
import { Fait, LigneSource } from './AffichageLieu.tsx';
import { BoutonConfirme, Champ, Page } from './commun.tsx';
import { aller, lienFichePratique, lienModifierFichePratique, lienNouvelleFichePratique, lienPratique } from './routeur.ts';

// Ce qui compte le plus d'abord : les règles d'entrée et la sécurité, puis les numéros utiles
const ORDRE_RUBRIQUES: RubriquePratique[] = ['formalites', 'urgences', 'trajets', 'transport-local', 'argent', 'telephone'];
const rang = (f: FichePratique): number => ORDRE_RUBRIQUES.indexOf(f.rubrique);

function CarteFiche(props: { f: FichePratique; perso: boolean }) {
  const { f } = props;
  const manque = pratiqueAVerifier(f);
  return (
    <a class="carte carte-lien" href={lienFichePratique(f.id)}>
      <span class="etiquette">{LIBELLES_RUBRIQUE_PRATIQUE[f.rubrique]}</span>
      <h3>{f.titre}</h3>
      {f.resume !== '' && <span class="discret">{f.resume}</span>}
      <span class="discret">
        {f.faits.length} fait{f.faits.length > 1 ? 's' : ''} sourcé{f.faits.length > 1 ? 's' : ''}
        {manque.length > 0 && <span class="attention-texte"> · {manque.length} à vérifier</span>}
        {props.perso && ' · ajoutée ou corrigée par toi'}
      </span>
    </a>
  );
}

export function Pratique(props: { etapeId?: string }) {
  const { donnees } = useStore();
  const fiches = useMemo(() => toutesLesFichesPratique(donnees), [donnees.pratiquePerso]);
  const etapes = etapesTriees(donnees.etapes);
  const [etapeChoisie, definirEtape] = useState(props.etapeId && etapes.some((e) => e.id === props.etapeId) ? props.etapeId : '');
  const groupes = useMemo(() => grouperPratique(fiches, donnees.etapes), [fiches, donnees.etapes]);
  const visibles = groupes.filter((g) => etapeChoisie === '' || g.etapeId === etapeChoisie);

  return (
    <Page titre="Pratique" retour={{ href: '#/sejour', libelle: 'Séjour' }}>
      {ERREURS_BASE_PRATIQUE.length > 0 && (
        <div class="message erreur" role="alert">
          <strong>Certaines fiches Pratique sont refusées par le contrôle des sources :</strong>
          <ul>
            {ERREURS_BASE_PRATIQUE.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div class="message info">
        Chaque information a sa source et sa date de consultation. Ce qui n'a pas pu être lu est marqué « à vérifier ». L'app ne donne pas de conseil juridique ou médical : les sites officiels font foi.
      </div>

      {etapes.length > 0 && (
        <Champ etiquette="Étape">
          <select value={etapeChoisie} onChange={(e) => definirEtape(e.currentTarget.value)}>
            <option value="">Toutes mes étapes</option>
            {etapes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>
        </Champ>
      )}

      {visibles.map((g) => (
        <section key={g.etapeId || 'autres'} class="pile" aria-label={g.titre}>
          <h2>{g.titre}</h2>
          {g.fiches.length === 0 && <p class="discret">Aucune fiche pour cette étape pour l'instant. Tu peux en ajouter une, avec sa source.</p>}
          {[...g.fiches]
            .sort((a, b) => rang(a) - rang(b) || a.titre.localeCompare(b.titre, 'fr'))
            .map((f) => (
              <CarteFiche key={f.id} f={f} perso={estFichePratiquePerso(donnees, f.id)} />
            ))}
        </section>
      ))}
      {etapes.length === 0 && fiches.length === 0 && (
        <section class="carte">
          <p>Aucune fiche pour l'instant.</p>
        </section>
      )}

      <a class="bouton" href={lienNouvelleFichePratique()}>
        Ajouter une fiche
      </a>
    </Page>
  );
}

export function FichePratiqueEcran(props: { id: string }) {
  const { donnees } = useStore();
  const f = trouverFichePratique(donnees, props.id);
  if (!f) {
    return (
      <Page titre="Fiche introuvable" retour={{ href: lienPratique(), libelle: 'Pratique' }}>
        <section class="carte">
          <p>Cette fiche n'existe pas (ou a été supprimée).</p>
        </section>
      </Page>
    );
  }
  const perso = estFichePratiquePerso(donnees, f.id);
  const fichePublique = PRATIQUE_PUBLIQUE.some((x) => x.id === f.id);
  const manque = pratiqueAVerifier(f);

  return (
    <Page titre={f.titre} retour={{ href: lienPratique(), libelle: 'Pratique' }}>
      <section class="carte">
        <span class="etiquettes-ligne">
          <span class="etiquette">{LIBELLES_RUBRIQUE_PRATIQUE[f.rubrique]}</span>
          <span class="etiquette">{f.zone}</span>
        </span>
        {f.resume !== '' && <p>{f.resume}</p>}
        <p class="discret">
          {fraicheurPratique(f, aujourdhuiIso())}
          {f.verifieLe !== '' && ` (${formatDateIso(f.verifieLe)})`}
          {perso && ' · fiche ajoutée ou corrigée par toi'}
        </p>
        {manque.length > 0 && (
          <div class="message attention" role="status">
            <strong>À vérifier :</strong>
            <ul>
              {manque.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {f.faits.length > 0 && (
        <section class="carte">
          <h2>Ce que disent les sources</h2>
          {f.faits.map((x) => (
            <Fait key={`${x.libelle}:${x.valeur}`} titre={x.libelle} valeur={x.valeur} source={x.source} etiquetteNonConfirme="Source secondaire : à confirmer" />
          ))}
        </section>
      )}

      {f.liens.length > 0 && (
        <section class="carte">
          <h2>Sites et pages à consulter</h2>
          {f.liens.map((l) => (
            <div class="fait" key={l.lien}>
              <LigneSource source={l} />
            </div>
          ))}
        </section>
      )}

      {f.notes !== '' && (
        <section class="carte">
          <h2>Notes</h2>
          <p>{f.notes}</p>
        </section>
      )}

      <section class="carte formulaire">
        <h2>Cette fiche</h2>
        <a class="bouton secondaire" href={lienModifierFichePratique(f.id)}>
          {perso ? 'Modifier ma fiche' : 'Corriger cette fiche (ma version)'}
        </a>
        {perso && (
          <BoutonConfirme
            libelle="Supprimer ma fiche"
            question={fichePublique ? 'Supprimer ta version ? La fiche publique de base reviendra à la place.' : 'Supprimer ta fiche ? Cette action ne peut pas être annulée.'}
            oui="Oui, supprimer"
            onConfirme={async () => {
              await supprimerPratiquePerso(f.id);
              aller(lienPratique());
            }}
          />
        )}
      </section>
    </Page>
  );
}

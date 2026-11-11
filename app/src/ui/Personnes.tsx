import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { enregistrerPersonne, supprimerPersonne, useStore } from '../data/store.ts';
import type { Personne } from '../data/types.ts';
import { BoutonConfirme, Champ, Page } from './commun.tsx';

function Edition(props: { initial: Personne; nouveau: boolean; onFini: () => void }) {
  const [p, definirP] = useState<Personne>(props.initial);
  const [tentative, definirTentative] = useState(false);
  const manque = p.prenom.trim() === '';

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    if (manque) return;
    await enregistrerPersonne({ ...p, prenom: p.prenom.trim(), notes: p.notes.trim() });
    props.onFini();
  }

  return (
    <form class="carte formulaire" onSubmit={enregistrer} noValidate>
      <Champ etiquette="Prénom (ou libellé : « Ami », « Cousine (8 ans) »…)">
        <input type="text" value={p.prenom} autocomplete="off" onInput={(e) => definirP({ ...p, prenom: e.currentTarget.value })} />
      </Champ>
      {tentative && manque && <p class="alerte-texte">Indique un prénom.</p>}
      <Champ etiquette="Notes (facultatif)">
        <textarea rows={2} value={p.notes} onInput={(e) => definirP({ ...p, notes: e.currentTarget.value })} />
      </Champ>
      <button type="submit" class="bouton">
        Enregistrer
      </button>
      <button type="button" class="bouton secondaire" onClick={props.onFini}>
        Annuler
      </button>
      {!props.nouveau && (
        <BoutonConfirme
          libelle="Supprimer cette personne"
          question="Supprimer cette personne ? Elle sera retirée des participants des créneaux."
          oui="Oui, supprimer"
          onConfirme={async () => {
            await supprimerPersonne(props.initial.id);
            props.onFini();
          }}
        />
      )}
    </form>
  );
}

export function Personnes() {
  const { donnees } = useStore();
  // null = rien d'ouvert ; "nouveau" = ajout ; sinon l'identifiant de la personne en cours de modification
  const [edition, definirEdition] = useState<string | null>(null);
  const enCours = edition === null || edition === 'nouveau' ? undefined : donnees.personnes.find((p) => p.id === edition);

  return (
    <Page titre="Personnes" retour={{ href: '#/reglages', libelle: 'Réglages' }}>
      <p class="discret">Les personnes du voyage servent à choisir qui participe à chaque créneau. Leur âge, leur alimentation et leurs contraintes seront ajoutés plus tard.</p>

      {edition === 'nouveau' && <Edition key="nouveau" initial={{ id: nouvelId('personne'), prenom: '', notes: '' }} nouveau onFini={() => definirEdition(null)} />}
      {edition === null && (
        <button type="button" class="bouton" onClick={() => definirEdition('nouveau')}>
          Ajouter une personne
        </button>
      )}

      {donnees.personnes.length === 0 && edition === null && (
        <section class="carte">
          <p>Aucune personne. Ajoute-en une, ou importe ton fichier de voyage dans Réglages.</p>
        </section>
      )}

      {donnees.personnes.map((p) =>
        enCours && enCours.id === p.id ? (
          <Edition key={p.id} initial={p} nouveau={false} onFini={() => definirEdition(null)} />
        ) : (
          <section class="carte" key={p.id}>
            <h2>{p.prenom}</h2>
            {p.notes !== '' && <p class="discret">{p.notes}</p>}
            {edition === null && (
              <button type="button" class="bouton secondaire petit" onClick={() => definirEdition(p.id)}>
                Modifier
              </button>
            )}
          </section>
        ),
      )}
    </Page>
  );
}

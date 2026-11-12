import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { enregistrerGroupe, supprimerGroupe, useStore } from '../data/store.ts';
import type { Groupe } from '../data/types.ts';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';
import { ChoixParticipants } from './ChoixParticipants.tsx';

function Edition(props: { initial: Groupe; nouveau: boolean; onFini: () => void }) {
  const { donnees } = useStore();
  const [g, definirG] = useState<Groupe>(props.initial);
  const [tentative, definirTentative] = useState(false);
  const problemes: string[] = [];
  if (g.nom.trim() === '') problemes.push('Donne un nom au groupe (« les amis », « tout le monde »…).');
  if (g.personneIds.length === 0) problemes.push('Choisis au moins une personne.');

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    if (problemes.length > 0) return;
    await enregistrerGroupe({ ...g, nom: g.nom.trim() });
    props.onFini();
  }

  return (
    <form class="carte formulaire" onSubmit={enregistrer} noValidate>
      <ListeErreurs erreurs={tentative ? problemes : []} />
      <Champ etiquette="Nom du groupe">
        <input type="text" value={g.nom} autocomplete="off" onInput={(e) => definirG({ ...g, nom: e.currentTarget.value })} />
      </Champ>
      <fieldset class="groupe">
        <legend>Qui est dans ce groupe ?</legend>
        <ChoixParticipants personnes={donnees.personnes} valeur={g.personneIds} onChange={(ids) => definirG({ ...g, personneIds: ids })} />
        {donnees.personnes.length > 0 && (
          <div class="rangee-boutons">
            <button type="button" class="bouton secondaire petit" onClick={() => definirG({ ...g, personneIds: donnees.personnes.map((p) => p.id) })}>
              Tout le monde
            </button>
            <button type="button" class="bouton secondaire petit" onClick={() => definirG({ ...g, personneIds: [] })}>
              Personne
            </button>
          </div>
        )}
      </fieldset>
      <button type="submit" class="bouton">
        Enregistrer
      </button>
      <button type="button" class="bouton secondaire" onClick={props.onFini}>
        Annuler
      </button>
      {!props.nouveau && (
        <BoutonConfirme
          libelle="Supprimer ce groupe"
          question="Supprimer ce groupe ? Les personnes ne sont pas supprimées."
          oui="Oui, supprimer"
          onConfirme={async () => {
            await supprimerGroupe(props.initial.id);
            props.onFini();
          }}
        />
      )}
    </form>
  );
}

export function Groupes() {
  const { donnees } = useStore();
  const [edition, definirEdition] = useState<string | null>(null);
  const enCours = edition === null || edition === 'nouveau' ? undefined : donnees.groupes.find((g) => g.id === edition);

  return (
    <Page titre="Groupes" retour={{ href: '#/personnes', libelle: 'Personnes' }}>
      <p class="discret">
        Un groupe est un ensemble de personnes (« les amis », « les enfants », « tout le monde »). Dans « Quoi faire, quand ? », tu peux choisir un ou plusieurs groupes : l'app cumule leurs contraintes et signale ce qui ne convient pas à l'un d'eux.
      </p>

      {edition === 'nouveau' && <Edition key="nouveau" initial={{ id: nouvelId('groupe'), nom: '', personneIds: [] }} nouveau onFini={() => definirEdition(null)} />}
      {edition === null && (
        <button type="button" class="bouton" disabled={donnees.personnes.length === 0} onClick={() => definirEdition('nouveau')}>
          Ajouter un groupe
        </button>
      )}
      {donnees.personnes.length === 0 && (
        <section class="carte">
          <p>
            Ajoute d'abord des <a href="#/personnes">personnes</a>.
          </p>
        </section>
      )}
      {donnees.groupes.length === 0 && donnees.personnes.length > 0 && edition === null && (
        <section class="carte">
          <p>Aucun groupe. Ajoute-en un, ou importe ton fichier de voyage dans Réglages.</p>
        </section>
      )}

      {donnees.groupes.map((g) =>
        enCours && enCours.id === g.id ? (
          <Edition key={g.id} initial={g} nouveau={false} onFini={() => definirEdition(null)} />
        ) : (
          <section class="carte" key={g.id}>
            <h2>{g.nom}</h2>
            <p class="discret">{g.personneIds.map((id) => donnees.personnes.find((p) => p.id === id)?.prenom).filter((x) => x !== undefined).join(', ') || 'Personne'}</p>
            {edition === null && (
              <button type="button" class="bouton secondaire petit" onClick={() => definirEdition(g.id)}>
                Modifier
              </button>
            )}
          </section>
        ),
      )}
    </Page>
  );
}

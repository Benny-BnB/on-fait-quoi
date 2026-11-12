import { useState } from 'preact/hooks';
import { nouvelId, personneVide } from '../data/defauts.ts';
import { enregistrerPersonne, supprimerPersonne, useStore } from '../data/store.ts';
import type { Personne, PlagePresence } from '../data/types.ts';
import { CONFORTS, LIBELLES_CONFORT, LIBELLES_MOBILITE, LIBELLES_REGIME, LIBELLES_TRANCHE_AGE, MOBILITES, REGIMES, TRANCHES_AGE } from '../data/types.ts';
import { resumeProfil } from '../lib/profils.ts';
import { dateValide, formatDateIso } from '../lib/temps.ts';
import { ChoixListe } from './ChoixListe.tsx';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';

function erreursPersonne(p: Personne, ageTxt: string): string[] {
  const e: string[] = [];
  if (p.prenom.trim() === '') e.push('Indique un prénom (ou un libellé comme « Ami »).');
  const a = ageTxt.trim();
  if (a !== '' && !(Number.isFinite(Number(a)) && Number(a) >= 0 && Number(a) <= 130)) e.push("L'âge doit être un nombre d'années (entre 0 et 130), ou rester vide.");
  p.presence.forEach((x, i) => {
    if (!dateValide(x.du) || !dateValide(x.au)) e.push(`Présence n°${i + 1} : choisis les deux dates.`);
    else if (x.au < x.du) e.push(`Présence n°${i + 1} : le dernier jour doit être après le premier.`);
  });
  return e;
}

function Edition(props: { initial: Personne; nouveau: boolean; onFini: () => void }) {
  const [p, definirP] = useState<Personne>(props.initial);
  const [ageTxt, definirAge] = useState(props.initial.ageAns === null ? '' : String(props.initial.ageAns));
  const [tentative, definirTentative] = useState(false);
  const maj = (partiel: Partial<Personne>) => definirP((x) => ({ ...x, ...partiel }));
  const problemes = erreursPersonne(p, ageTxt);

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    if (problemes.length > 0) return;
    const age = ageTxt.trim() === '' ? null : Number(ageTxt.trim());
    await enregistrerPersonne({ ...p, prenom: p.prenom.trim(), notes: p.notes.trim(), alimentation: p.alimentation.trim(), ageAns: age, tranche: age === null ? p.tranche : '' });
    props.onFini();
  }

  const majPresence = (i: number, partiel: Partial<PlagePresence>) => maj({ presence: p.presence.map((x, k) => (k === i ? { ...x, ...partiel } : x)) });

  return (
    <form class="carte formulaire" onSubmit={enregistrer} noValidate>
      <ListeErreurs erreurs={tentative ? problemes : []} />
      <Champ etiquette="Prénom (ou libellé : « Ami », « Cousine (8 ans) »…)">
        <input type="text" value={p.prenom} autocomplete="off" onInput={(e) => maj({ prenom: e.currentTarget.value })} />
      </Champ>

      <div class="rangee-champs">
        <Champ etiquette="Âge en années (facultatif)">
          <input type="text" inputMode="numeric" value={ageTxt} onInput={(e) => definirAge(e.currentTarget.value)} />
        </Champ>
        <Champ etiquette="Ou tranche d'âge">
          <select value={p.tranche} disabled={ageTxt.trim() !== ''} onChange={(e) => maj({ tranche: e.currentTarget.value as Personne['tranche'] })}>
            <option value="">Non précisée</option>
            {TRANCHES_AGE.map((t) => (
              <option key={t} value={t}>
                {LIBELLES_TRANCHE_AGE[t]}
              </option>
            ))}
          </select>
        </Champ>
      </div>

      <fieldset class="groupe">
        <legend>Alimentation</legend>
        <ChoixListe options={REGIMES} libelles={LIBELLES_REGIME} valeur={p.regimes} onChange={(v) => maj({ regimes: v })} legende="Régimes" />
        <Champ etiquette="Précisions (allergies, aversions…)">
          <input type="text" value={p.alimentation} onInput={(e) => maj({ alimentation: e.currentTarget.value })} />
        </Champ>
      </fieldset>

      <fieldset class="groupe">
        <legend>Mobilité</legend>
        <ChoixListe options={MOBILITES} libelles={LIBELLES_MOBILITE} valeur={p.mobilite} onChange={(v) => maj({ mobilite: v })} legende="Mobilité" />
      </fieldset>

      <fieldset class="groupe">
        <legend>Confort</legend>
        <ChoixListe options={CONFORTS} libelles={LIBELLES_CONFORT} valeur={p.confort} onChange={(v) => maj({ confort: v })} legende="Confort" />
      </fieldset>

      <fieldset class="groupe">
        <legend>Présence</legend>
        <p class="champ-aide">Sans période, la personne est là pendant tout le voyage. Sinon, elle n'est là que pendant ces périodes (elle peut arriver, partir ou s'ajouter en cours de séjour).</p>
        {p.presence.map((x, i) => (
          <div class="rangee-champs" key={i}>
            <Champ etiquette="Du">
              <input type="date" value={x.du} onInput={(e) => majPresence(i, { du: e.currentTarget.value })} />
            </Champ>
            <Champ etiquette="Au (inclus)">
              <input type="date" value={x.au} onInput={(e) => majPresence(i, { au: e.currentTarget.value })} />
            </Champ>
            <button type="button" class="bouton secondaire petit" onClick={() => maj({ presence: p.presence.filter((_, k) => k !== i) })}>
              Retirer
            </button>
          </div>
        ))}
        <button type="button" class="bouton secondaire petit" onClick={() => maj({ presence: [...p.presence, { du: '', au: '' }] })}>
          Ajouter une période de présence
        </button>
      </fieldset>

      <Champ etiquette="Notes (facultatif)">
        <textarea rows={2} value={p.notes} onInput={(e) => maj({ notes: e.currentTarget.value })} />
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
          question="Supprimer cette personne ? Elle sera retirée des participants des créneaux et des groupes."
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
      <p class="discret">
        Les personnes du voyage servent à choisir qui participe à chaque créneau. Leur âge, leur alimentation, leur mobilité et leur confort servent à signaler, dans « Quoi faire, quand ? », ce qui ne leur convient pas : ce sont des signalements, pas des interdits.
      </p>

      {edition === 'nouveau' && <Edition key="nouveau" initial={personneVide(nouvelId('personne'))} nouveau onFini={() => definirEdition(null)} />}
      {edition === null && (
        <div class="rangee">
          <button type="button" class="bouton" onClick={() => definirEdition('nouveau')}>
            Ajouter une personne
          </button>
          <a class="bouton secondaire" href="#/groupes">
            Les groupes
          </a>
        </div>
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
            <span class="etiquettes-ligne">
              {resumeProfil(p, { regime: LIBELLES_REGIME, mobilite: LIBELLES_MOBILITE }).map((x) => (
                <span class="etiquette" key={x}>
                  {x}
                </span>
              ))}
              {p.confort.map((c) => (
                <span class="etiquette" key={c}>
                  {LIBELLES_CONFORT[c]}
                </span>
              ))}
            </span>
            {p.alimentation !== '' && <p class="discret">Alimentation : {p.alimentation}</p>}
            {p.presence.length > 0 && (
              <p class="discret">
                Présent : {p.presence.map((x) => (x.du === x.au ? formatDateIso(x.du) : `du ${formatDateIso(x.du)} au ${formatDateIso(x.au)}`)).join(' ; ')}
              </p>
            )}
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

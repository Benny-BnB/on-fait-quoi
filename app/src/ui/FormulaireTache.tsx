import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { enregistrerTache, supprimerTache, useStore } from '../data/store.ts';
import type { Tache } from '../data/types.ts';
import { LIBELLES_LISTE, LISTES_TACHE } from '../data/types.ts';
import { ajouterJours, lienSur } from '../lib/sejour.ts';
import { aujourdhuiIso, dateValide } from '../lib/temps.ts';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';
import { aller, lienListe } from './routeur.ts';

function nettoyer(t: Tache): Tache {
  const titre = t.titre.trim();
  return { ...t, titre, note: t.note.trim(), lien: t.lien.trim(), faitLe: t.fait ? t.faitLe || aujourdhuiIso() : '' };
}

function erreursTache(t: Tache): string[] {
  const e: string[] = [];
  if (!t.titre) e.push('Donne un titre à la tâche.');
  if (t.dateSouhaitee !== '' && !dateValide(t.dateSouhaitee)) e.push('Date souhaitée invalide.');
  if (t.echeance !== '' && !dateValide(t.echeance)) e.push('Échéance invalide.');
  if (dateValide(t.dateSouhaitee) && dateValide(t.echeance) && t.dateSouhaitee > t.echeance) {
    e.push("La date souhaitée ne peut pas être après l'échéance : la date souhaitée est quand tu veux la faire, l'échéance est la limite.");
  }
  if (t.lien !== '' && lienSur(t.lien) === null) e.push('Le lien doit commencer par https:// ou http://.');
  return e;
}

function Editeur(props: { initial: Tache; nouveau: boolean }) {
  const [tache, definirTache] = useState<Tache>(props.initial);
  const [tentative, definirTentative] = useState(false); // vrai après un premier essai d'enregistrement
  const maj = (partiel: Partial<Tache>) => definirTache((t) => ({ ...t, ...partiel }));

  const propre = nettoyer(tache);
  const problemes = erreursTache(propre);
  const aujourdhui = aujourdhuiIso();
  const lienOuvrable = lienSur(propre.lien);

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    if (problemes.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await enregistrerTache(propre);
    aller(lienListe(propre.liste));
  }

  return (
    <Page titre={props.nouveau ? 'Nouvelle tâche' : 'Modifier la tâche'} retour={{ href: lienListe(props.initial.liste), libelle: 'Check-lists' }}>
      <form class="formulaire" onSubmit={enregistrer} noValidate>
        <ListeErreurs erreurs={tentative ? problemes : []} />

        <Champ etiquette="Tâche">
          <textarea rows={2} value={tache.titre} onInput={(e) => maj({ titre: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Liste">
          <select value={tache.liste} onChange={(e) => maj({ liste: e.currentTarget.value as Tache['liste'] })}>
            {LISTES_TACHE.map((l) => (
              <option key={l} value={l}>
                {LIBELLES_LISTE[l]}
              </option>
            ))}
          </select>
        </Champ>

        <fieldset class="groupe">
          <legend>Dates (facultatives)</legend>
          <p class="champ-aide">Ce qui peut être réglé tout de suite est réglé tout de suite : la date souhaitée est la plus proche possible, l'échéance est la limite.</p>
          <Champ etiquette="Date souhaitée">
            <input type="date" value={tache.dateSouhaitee} onInput={(e) => maj({ dateSouhaitee: e.currentTarget.value })} />
          </Champ>
          <div class="rangee-boutons">
            <button type="button" class="bouton secondaire petit" onClick={() => maj({ dateSouhaitee: aujourdhui })}>
              Aujourd'hui
            </button>
            <button type="button" class="bouton secondaire petit" onClick={() => maj({ dateSouhaitee: ajouterJours(aujourdhui, 1) })}>
              Demain
            </button>
            <button type="button" class="bouton secondaire petit" onClick={() => maj({ dateSouhaitee: '' })}>
              Effacer
            </button>
          </div>
          <Champ etiquette="Échéance">
            <input type="date" value={tache.echeance} onInput={(e) => maj({ echeance: e.currentTarget.value })} />
          </Champ>
          <div class="rangee-boutons">
            <button type="button" class="bouton secondaire petit" onClick={() => maj({ echeance: '' })}>
              Effacer
            </button>
          </div>
        </fieldset>

        <Champ etiquette="Note (facultatif)">
          <textarea rows={3} value={tache.note} onInput={(e) => maj({ note: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Lien utile (facultatif)">
          <input type="url" value={tache.lien} placeholder="https://…" autocomplete="off" autocapitalize="off" spellcheck={false} onInput={(e) => maj({ lien: e.currentTarget.value })} />
        </Champ>
        {lienOuvrable && (
          <a class="bouton secondaire petit" href={lienOuvrable} target="_blank" rel="noopener noreferrer">
            Ouvrir le lien
          </a>
        )}

        {!props.nouveau && (
          <label class="interrupteur">
            <input type="checkbox" checked={tache.fait} onChange={(e) => maj({ fait: e.currentTarget.checked })} />
            <span>Cette tâche est faite</span>
          </label>
        )}

        <button type="submit" class="bouton">
          Enregistrer
        </button>
        <a class="bouton secondaire" href={lienListe(props.initial.liste)}>
          Annuler
        </a>
        {!props.nouveau && (
          <BoutonConfirme
            libelle="Supprimer cette tâche"
            question="Supprimer cette tâche ? C'est définitif."
            oui="Oui, supprimer"
            onConfirme={async () => {
              await supprimerTache(props.initial.id);
              aller(lienListe(props.initial.liste));
            }}
          />
        )}
      </form>
    </Page>
  );
}

export function FormulaireTache(props: { id: string; liste?: string }) {
  const { donnees } = useStore();
  const nouveau = props.id === 'nouveau';
  const existante = nouveau ? undefined : donnees.taches.find((t) => t.id === props.id);
  if (!nouveau && !existante) {
    return (
      <Page titre="Tâche introuvable" retour={{ href: '#/taches', libelle: 'Check-lists' }}>
        <section class="carte">
          <p>Cette tâche n'existe pas (ou a été supprimée).</p>
        </section>
      </Page>
    );
  }
  const liste = props.liste === 'a-emporter' ? 'a-emporter' : 'reste-a-faire';
  const vide: Tache = { id: nouvelId('tache'), titre: '', liste, dateSouhaitee: '', echeance: '', fait: false, faitLe: '', note: '', lien: '' };
  return <Editeur key={`${props.id}-${props.liste ?? ''}`} initial={existante ?? vide} nouveau={nouveau} />;
}

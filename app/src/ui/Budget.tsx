import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { enregistrerReglages, useStore } from '../data/store.ts';
import type { BudgetLigne, PerimetreBudget } from '../data/types.ts';
import { PERIMETRES_BUDGET } from '../data/types.ts';
import { etatBudgets } from '../lib/budget.ts';
import { formatMontant } from '../lib/format.ts';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';

const LIBELLES_PERIMETRE: Record<PerimetreBudget, string> = {
  'jour-personne': 'Par jour et par personne',
  pays: 'Pour un pays',
  groupe: 'Pour le groupe, tout le voyage',
};

function Edition(props: { initial: BudgetLigne; nouveau: boolean; onFini: () => void }) {
  const { donnees } = useStore();
  const [b, definirB] = useState<BudgetLigne>(props.initial);
  const [montantTxt, definirMontant] = useState(props.initial.montant > 0 ? String(props.initial.montant) : '');
  const [tentative, definirTentative] = useState(false);
  const pays = [...new Set(donnees.etapes.map((e) => e.pays.trim()).filter((x) => x !== ''))];
  const montant = Number(montantTxt.trim().replace(',', '.'));
  const problemes: string[] = [];
  if (!(Number.isFinite(montant) && montant >= 0 && montantTxt.trim() !== '')) problemes.push('Indique un montant (un nombre, zéro ou plus).');
  if (!/^[A-Z]{3}$/.test(b.devise.trim().toUpperCase())) problemes.push('Indique la devise sur 3 lettres (EUR, THB, AED…).');
  if (b.perimetre === 'pays' && b.pays.trim() === '') problemes.push('Indique le pays.');

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    if (problemes.length > 0) return;
    const ligne: BudgetLigne = { ...b, libelle: b.libelle.trim(), pays: b.perimetre === 'pays' ? b.pays.trim() : '', montant, devise: b.devise.trim().toUpperCase() };
    const budget = donnees.reglages.budget.some((x) => x.id === ligne.id) ? donnees.reglages.budget.map((x) => (x.id === ligne.id ? ligne : x)) : [...donnees.reglages.budget, ligne];
    await enregistrerReglages({ ...donnees.reglages, budget });
    props.onFini();
  }

  return (
    <form class="carte formulaire" onSubmit={enregistrer} noValidate>
      <ListeErreurs erreurs={tentative ? problemes : []} />
      <Champ etiquette="Ce budget vaut…">
        <select value={b.perimetre} onChange={(e) => definirB({ ...b, perimetre: e.currentTarget.value as PerimetreBudget })}>
          {PERIMETRES_BUDGET.map((p) => (
            <option key={p} value={p}>
              {LIBELLES_PERIMETRE[p]}
            </option>
          ))}
        </select>
      </Champ>
      {b.perimetre === 'pays' && (
        <Champ etiquette="Pays" aide="Le pays tel qu'il est écrit dans tes étapes.">
          <input type="text" list="pays-budget" value={b.pays} autocomplete="off" onInput={(e) => definirB({ ...b, pays: e.currentTarget.value })} />
          <datalist id="pays-budget">
            {pays.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Champ>
      )}
      <div class="rangee-champs">
        <Champ etiquette="Montant">
          <input type="text" inputMode="decimal" value={montantTxt} onInput={(e) => definirMontant(e.currentTarget.value)} />
        </Champ>
        <Champ etiquette="Devise">
          <input type="text" value={b.devise} maxLength={3} placeholder="EUR" autocomplete="off" spellcheck={false} onInput={(e) => definirB({ ...b, devise: e.currentTarget.value })} />
        </Champ>
      </div>
      <Champ etiquette="Nom (facultatif)">
        <input type="text" value={b.libelle} onInput={(e) => definirB({ ...b, libelle: e.currentTarget.value })} />
      </Champ>
      <button type="submit" class="bouton">
        Enregistrer
      </button>
      <button type="button" class="bouton secondaire" onClick={props.onFini}>
        Annuler
      </button>
      {!props.nouveau && (
        <BoutonConfirme
          libelle="Supprimer ce budget"
          question="Supprimer ce budget ?"
          oui="Oui, supprimer"
          onConfirme={async () => {
            await enregistrerReglages({ ...donnees.reglages, budget: donnees.reglages.budget.filter((x) => x.id !== props.initial.id) });
            props.onFini();
          }}
        />
      )}
    </form>
  );
}

export function Budget() {
  const { donnees } = useStore();
  const [edition, definirEdition] = useState<string | null>(null);
  const budget = donnees.reglages.budget;
  const etats = etatBudgets(donnees);

  return (
    <Page titre="Budget" retour={{ href: '#/reglages', libelle: 'Réglages' }}>
      <p class="discret">
        Fixe un budget par jour et par personne, par pays, ou pour tout le groupe. L'app compare ensuite ce que tu prévois dans le planning (budget des créneaux) et te prévient en cas de dépassement. Le budget d'un créneau est le total pour ses participants. Des monnaies différentes ne s'additionnent que si leur taux de change est saisi.
      </p>

      {edition === 'nouveau' && <Edition key="nouveau" initial={{ id: nouvelId('budget'), perimetre: 'jour-personne', libelle: '', pays: '', montant: 0, devise: '' }} nouveau onFini={() => definirEdition(null)} />}
      {edition === null && (
        <button type="button" class="bouton" onClick={() => definirEdition('nouveau')}>
          Ajouter un budget
        </button>
      )}
      {budget.length === 0 && edition === null && (
        <section class="carte">
          <p>Aucun budget fixé.</p>
        </section>
      )}

      {budget.map((b) => {
        if (edition === b.id) return <Edition key={b.id} initial={b} nouveau={false} onFini={() => definirEdition(null)} />;
        const etat = etats.find((e) => e.ligne.id === b.id);
        return (
          <section class="carte" key={b.id}>
            <h2>{b.libelle || LIBELLES_PERIMETRE[b.perimetre]}</h2>
            <p>
              <strong>{formatMontant(b.montant, b.devise)}</strong> <span class="discret">· {LIBELLES_PERIMETRE[b.perimetre]}{b.perimetre === 'pays' ? ` (${b.pays})` : ''}</span>
            </p>
            {etat && (
              <ul class="vol-lignes">
                <li>Estimé : {formatMontant(Math.round(etat.estime), b.devise)}</li>
                <li>Dépensé : {formatMontant(Math.round(etat.reel), b.devise)}</li>
                <li class={etat.depasse ? 'alerte-texte' : ''}>{etat.depasse ? `Dépassé de ${formatMontant(Math.round(-etat.reste), b.devise)}` : `Reste : ${formatMontant(Math.round(etat.reste), b.devise)}`}</li>
                {etat.sansTaux.length > 0 && <li class="attention-texte">Montants en {etat.sansTaux.join(', ')} non comptés : saisis leur <a href="#/taux">taux de change</a>.</li>}
              </ul>
            )}
            {edition === null && (
              <button type="button" class="bouton secondaire petit" onClick={() => definirEdition(b.id)}>
                Modifier
              </button>
            )}
          </section>
        );
      })}
    </Page>
  );
}

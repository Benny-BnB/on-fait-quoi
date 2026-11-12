import { useState } from 'preact/hooks';
import { enregistrerReglages, useStore } from '../data/store.ts';
import type { TauxChange as Taux } from '../data/types.ts';
import { formatNombre } from '../lib/format.ts';
import { lienSur } from '../lib/sejour.ts';
import { chargerTauxEnLigne, SOURCE_TAUX_EN_LIGNE } from '../lib/tauxEnLigne.ts';
import { aujourdhuiIso, dateValide, formatDateIso } from '../lib/temps.ts';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';
import { libelleTaux } from '../lib/budget.ts';

function Edition(props: { initial: Taux | null; onFini: () => void }) {
  const { donnees } = useStore();
  const i = props.initial;
  const [devise, definirDevise] = useState(i?.devise ?? '');
  const [pourUnEuro, definirPourUnEuro] = useState(i ? String(Math.round((1 / i.taux) * 1e6) / 1e6) : '');
  const [date, definirDate] = useState(i?.date ?? aujourdhuiIso());
  const [source, definirSource] = useState(i?.source ?? '');
  const [lien, definirLien] = useState(i?.lien ?? '');
  const [tentative, definirTentative] = useState(false);

  const n = Number(pourUnEuro.trim().replace(',', '.'));
  const problemes: string[] = [];
  if (!/^[A-Z]{3}$/.test(devise.trim().toUpperCase()) || devise.trim().toUpperCase() === 'EUR') problemes.push("Indique la devise sur 3 lettres (THB, AED…), différente de l'euro.");
  if (!(Number.isFinite(n) && n > 0)) problemes.push('Indique combien de cette devise valent 1 € (un nombre plus grand que zéro).');
  if (!dateValide(date)) problemes.push('Indique la date du taux.');
  if (source.trim() === '') problemes.push("Indique d'où vient le taux (ta banque, un site de change…) : un taux sans source n'est pas enregistré.");
  if (lien.trim() !== '' && lienSur(lien) === null) problemes.push('Le lien de la source doit commencer par https://.');

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    if (problemes.length > 0) return;
    const code = devise.trim().toUpperCase();
    const nouveau: Taux = { devise: code, taux: 1 / n, date, source: source.trim(), lien: lien.trim() };
    const autres = donnees.reglages.tauxChange.filter((t) => t.devise !== code && t.devise !== i?.devise);
    await enregistrerReglages({ ...donnees.reglages, tauxChange: [...autres, nouveau].sort((a, b) => a.devise.localeCompare(b.devise)) });
    props.onFini();
  }

  return (
    <form class="carte formulaire" onSubmit={enregistrer} noValidate>
      <ListeErreurs erreurs={tentative ? problemes : []} />
      <Champ etiquette="Devise" aide="Code à 3 lettres : THB, AED…">
        <input type="text" value={devise} maxLength={3} autocomplete="off" spellcheck={false} onInput={(e) => definirDevise(e.currentTarget.value)} />
      </Champ>
      <Champ etiquette={`Pour 1 €, combien de ${devise.trim().toUpperCase() || 'cette devise'} ?`}>
        <input type="text" inputMode="decimal" value={pourUnEuro} onInput={(e) => definirPourUnEuro(e.currentTarget.value)} />
      </Champ>
      <Champ etiquette="Date du taux">
        <input type="date" value={date} onInput={(e) => definirDate(e.currentTarget.value)} />
      </Champ>
      <Champ etiquette="Source" aide="Ta banque, l'appli que tu utilises, un site de change…">
        <input type="text" value={source} onInput={(e) => definirSource(e.currentTarget.value)} />
      </Champ>
      <Champ etiquette="Lien de la source (facultatif)">
        <input type="url" inputMode="url" value={lien} autocomplete="off" spellcheck={false} onInput={(e) => definirLien(e.currentTarget.value)} />
      </Champ>
      <button type="submit" class="bouton">
        Enregistrer
      </button>
      <button type="button" class="bouton secondaire" onClick={props.onFini}>
        Annuler
      </button>
      {i && (
        <BoutonConfirme
          libelle="Supprimer ce taux"
          question="Supprimer ce taux ? Les prix de cette devise n'auront plus d'équivalent en euros."
          oui="Oui, supprimer"
          onConfirme={async () => {
            await enregistrerReglages({ ...donnees.reglages, tauxChange: donnees.reglages.tauxChange.filter((t) => t.devise !== i.devise) });
            props.onFini();
          }}
        />
      )}
    </form>
  );
}

export function TauxChange() {
  const { donnees } = useStore();
  const [edition, definirEdition] = useState<'aucune' | 'nouveau' | string>('aucune');
  const [message, definirMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);
  const [enCours, definirEnCours] = useState(false);
  const taux = donnees.reglages.tauxChange;
  // Les devises du voyage (celles des étapes) et celles déjà saisies
  const devises = [...new Set([...donnees.etapes.map((e) => e.devise), ...taux.map((t) => t.devise)])].filter((d) => /^[A-Z]{3}$/.test(d) && d !== 'EUR').sort();

  async function majEnLigne() {
    definirEnCours(true);
    definirMessage(null);
    const r = await chargerTauxEnLigne(devises);
    definirEnCours(false);
    if (!r.ok) {
      definirMessage({ ton: 'erreur', texte: r.erreur });
      return;
    }
    const gardes = taux.filter((t) => !r.taux.some((n) => n.devise === t.devise));
    await enregistrerReglages({ ...donnees.reglages, tauxChange: [...gardes, ...r.taux].sort((a, b) => a.devise.localeCompare(b.devise)) });
    definirMessage({
      ton: 'ok',
      texte: `${r.taux.length} taux mis à jour (${r.taux.map((t) => t.devise).join(', ')}), source ${SOURCE_TAUX_EN_LIGNE.libelle}, date ${r.taux[0] ? formatDateIso(r.taux[0].date) : ''}.${r.manquantes.length > 0 ? ` Introuvable : ${r.manquantes.join(', ')} (à saisir à la main).` : ''}`,
    });
  }

  return (
    <Page titre="Taux de change" retour={{ href: '#/reglages', libelle: 'Réglages' }}>
      <p class="discret">
        Le taux sert à afficher les prix en euros à côté de la monnaie locale. Il est toujours daté et sourcé, et l'app ne le devine jamais : sans taux, seul le prix local s'affiche.
      </p>

      {taux.length === 0 && edition === 'aucune' && (
        <section class="carte">
          <p>Aucun taux saisi{devises.length > 0 ? ` (devises du voyage : ${devises.join(', ')})` : ''}.</p>
        </section>
      )}

      {taux.map((t) =>
        edition === t.devise ? (
          <Edition key={t.devise} initial={t} onFini={() => definirEdition('aucune')} />
        ) : (
          <section class="carte" key={t.devise}>
            <h2>{t.devise}</h2>
            <p>
              {libelleTaux(t)} <span class="discret">(1 € = {formatNombre(Math.round((1 / t.taux) * 100) / 100)} {t.devise})</span>
            </p>
            <p class="discret">
              Taux du {formatDateIso(t.date)} · source :{' '}
              {lienSur(t.lien) ? (
                <a href={lienSur(t.lien) ?? undefined} target="_blank" rel="noopener noreferrer">
                  {t.source}
                </a>
              ) : (
                t.source
              )}
            </p>
            {edition === 'aucune' && (
              <button type="button" class="bouton secondaire petit" onClick={() => definirEdition(t.devise)}>
                Modifier
              </button>
            )}
          </section>
        ),
      )}

      {edition === 'nouveau' && <Edition key="nouveau" initial={null} onFini={() => definirEdition('aucune')} />}
      {edition === 'aucune' && (
        <>
          <button type="button" class="bouton" onClick={() => definirEdition('nouveau')}>
            Saisir un taux
          </button>
          <section class="carte">
            <h2>Mettre à jour en ligne</h2>
            <p class="discret">
              Récupère les taux du jour ({devises.join(', ') || 'aucune devise étrangère dans le voyage'}) chez {SOURCE_TAUX_EN_LIGNE.libelle}. L'app contacte ce service seulement quand tu touches le bouton, sans lui envoyer aucune donnée personnelle. Ces taux sont indicatifs : ils ne sont pas ceux de ta banque.
            </p>
            <button type="button" class="bouton secondaire" disabled={enCours || devises.length === 0} onClick={() => void majEnLigne()}>
              {enCours ? 'Mise à jour…' : 'Mettre à jour en ligne'}
            </button>
            {message && (
              <div class={`message ${message.ton}`} role="status">
                {message.texte}
              </div>
            )}
          </section>
        </>
      )}
    </Page>
  );
}

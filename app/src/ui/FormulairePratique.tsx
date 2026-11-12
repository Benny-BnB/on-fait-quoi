// Ajouter une fiche Pratique, ou corriger une fiche publique (sa propre version).
// Mêmes règles que la base publique : un fait sans source n'existe pas.

import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { estFichePratiquePerso, PRATIQUE_PUBLIQUE, trouverFichePratique } from '../data/pratique-publique.ts';
import { enregistrerPratiquePerso, useStore } from '../data/store.ts';
import type { FichePratique, RubriquePratique, SourceLieu } from '../data/types.ts';
import { LIBELLES_RUBRIQUE_PRATIQUE, RUBRIQUES_PRATIQUE } from '../data/types.ts';
import { lireFichesPratique } from '../lib/pratique.ts';
import { aujourdhuiIso } from '../lib/temps.ts';
import { Champ, ListeErreurs, Page } from './commun.tsx';
import { aller, lienFichePratique, lienPratique } from './routeur.ts';

type SaisieSource = { lien: string; libelle: string; officielle: boolean };
type SaisieFait = { libelle: string; valeur: string; source: SaisieSource };
type Saisie = {
  titre: string;
  zone: string;
  rubrique: RubriquePratique;
  resume: string;
  faits: SaisieFait[];
  aVerifier: string; // un point par ligne
  liens: SaisieSource[];
  notes: string;
};

const sourceVide = (): SaisieSource => ({ lien: '', libelle: '', officielle: false });
const versSource = (s: SourceLieu): SaisieSource => ({ lien: s.lien, libelle: s.libelle, officielle: s.officielle });

function versSaisie(f: FichePratique | undefined): Saisie {
  return {
    titre: f?.titre ?? '',
    zone: f?.zone ?? '',
    rubrique: f?.rubrique ?? 'transport-local',
    resume: f?.resume ?? '',
    faits: (f?.faits ?? []).map((x) => ({ libelle: x.libelle, valeur: x.valeur, source: versSource(x.source) })),
    aVerifier: (f?.aVerifier ?? []).join('\n'),
    liens: (f?.liens ?? []).map(versSource),
    notes: f?.notes ?? '',
  };
}

const sourceVideSaisie = (s: SaisieSource): boolean => s.lien.trim() === '' && s.libelle.trim() === '';

function construire(s: Saisie, initial: FichePratique | undefined, id: string, aujourdhui: string): { fiche: FichePratique | null; erreurs: string[] } {
  // La date de consultation ne change pas si la source n'a pas changé
  const anciennes = initial ? [...initial.faits.map((f) => f.source), ...initial.liens] : [];
  const source = (x: SaisieSource) => {
    const inchangee = anciennes.find((a) => a.lien === x.lien.trim() && a.libelle === x.libelle.trim() && a.officielle === x.officielle);
    return { lien: x.lien.trim(), libelle: x.libelle.trim(), consulteLe: inchangee ? inchangee.consulteLe : aujourdhui, officielle: x.officielle };
  };
  const brut = {
    id,
    titre: s.titre.trim(),
    zone: s.zone.trim(),
    rubrique: s.rubrique,
    resume: s.resume.trim(),
    // Une ligne entièrement vide est ignorée ; une ligne à moitié remplie est signalée par le contrôle
    faits: s.faits.filter((f) => !(f.libelle.trim() === '' && f.valeur.trim() === '' && sourceVideSaisie(f.source))).map((f) => ({ libelle: f.libelle, valeur: f.valeur, source: source(f.source) })),
    aVerifier: s.aVerifier.split('\n').map((x) => x.trim()).filter((x) => x !== ''),
    liens: s.liens.filter((l) => !sourceVideSaisie(l)).map(source),
    verifieLe: aujourdhui,
    notes: s.notes.trim(),
  };
  const problemes: string[] = [];
  const lues = lireFichesPratique([brut], problemes);
  if (problemes.length > 0 || lues.length === 0) return { fiche: null, erreurs: problemes.map((p) => p.replace(/^Fiche Pratique n°1( \([^)]*\))?(, )?/, '').replace(/^ : /, '').replace(/^: /, '')) };
  return { fiche: lues[0], erreurs: [] };
}

function ChampsSource(props: { source: SaisieSource; onChange: (s: SaisieSource) => void; qui: string }) {
  const { source, onChange } = props;
  return (
    <>
      <Champ etiquette={`${props.qui} : lien`} aide="Page où tu as lu l'information (https://…).">
        <input type="url" inputMode="url" value={source.lien} autocomplete="off" spellcheck={false} onInput={(e) => onChange({ ...source, lien: e.currentTarget.value })} />
      </Champ>
      <Champ etiquette={`${props.qui} : nom`}>
        <input type="text" value={source.libelle} placeholder="Site officiel, office du tourisme, opérateur…" onInput={(e) => onChange({ ...source, libelle: e.currentTarget.value })} />
      </Champ>
      <label class="interrupteur">
        <input type="checkbox" checked={source.officielle} onChange={(e) => onChange({ ...source, officielle: e.currentTarget.checked })} />
        <span>Source officielle (administration, opérateur, office du tourisme)</span>
      </label>
    </>
  );
}

function Editeur(props: { initial: FichePratique | undefined; id: string }) {
  const { donnees } = useStore();
  const [saisie, definirSaisie] = useState<Saisie>(() => versSaisie(props.initial));
  const [tentative, definirTentative] = useState(false);
  const [erreurs, definirErreurs] = useState<string[]>([]);
  const maj = (partiel: Partial<Saisie>) => definirSaisie((s) => ({ ...s, ...partiel }));
  const nouveau = props.initial === undefined;
  const copie = !nouveau && !estFichePratiquePerso(donnees, props.id);
  const zones = [...new Set([...PRATIQUE_PUBLIQUE.map((f) => f.zone), ...donnees.etapes.flatMap((e) => [e.nom, e.pays]).filter((x) => x !== '')])];

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    const r = construire(saisie, props.initial, props.id, aujourdhuiIso());
    definirErreurs(r.erreurs);
    if (!r.fiche) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await enregistrerPratiquePerso(r.fiche);
    aller(lienFichePratique(r.fiche.id));
  }

  return (
    <Page titre={nouveau ? 'Nouvelle fiche Pratique' : copie ? 'Ma version de la fiche' : 'Modifier ma fiche'} retour={nouveau ? { href: lienPratique(), libelle: 'Pratique' } : { href: lienFichePratique(props.id), libelle: 'Fiche' }}>
      <form class="formulaire" onSubmit={enregistrer} noValidate>
        <ListeErreurs erreurs={tentative ? erreurs : []} />
        {copie && <div class="message info">Tu corriges ta propre version de cette fiche publique. Elle reste sur ton téléphone et remplace la fiche de base pour toi.</div>}

        <Champ etiquette="Titre">
          <input type="text" value={saisie.titre} autocomplete="off" onInput={(e) => maj({ titre: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Étape, ville ou pays" aide="Elle sert à ranger la fiche sous la bonne étape : écris le nom de l'étape ou de son pays.">
          <input type="text" list="zones-pratique" value={saisie.zone} autocomplete="off" onInput={(e) => maj({ zone: e.currentTarget.value })} />
        </Champ>
        <datalist id="zones-pratique">
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        <Champ etiquette="Rubrique">
          <select value={saisie.rubrique} onChange={(e) => maj({ rubrique: e.currentTarget.value as RubriquePratique })}>
            {RUBRIQUES_PRATIQUE.map((r) => (
              <option key={r} value={r}>
                {LIBELLES_RUBRIQUE_PRATIQUE[r]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ etiquette="Résumé (facultatif)">
          <textarea rows={2} value={saisie.resume} onInput={(e) => maj({ resume: e.currentTarget.value })} />
        </Champ>

        <fieldset class="groupe">
          <legend>Faits sourcés</legend>
          <p class="champ-aide">Chaque fait a sa source (lien et nom). Sans source, mets-le plutôt dans « À vérifier ».</p>
          {saisie.faits.map((f, i) => {
            const changer = (partiel: Partial<SaisieFait>) => maj({ faits: saisie.faits.map((x, j) => (j === i ? { ...x, ...partiel } : x)) });
            return (
              <div class="carte-interne" key={i}>
                <Champ etiquette="Ce que c'est" aide="Par exemple : prix du billet, durée, horaires.">
                  <input type="text" value={f.libelle} onInput={(e) => changer({ libelle: e.currentTarget.value })} />
                </Champ>
                <Champ etiquette="Ce que dit la source">
                  <textarea rows={2} value={f.valeur} onInput={(e) => changer({ valeur: e.currentTarget.value })} />
                </Champ>
                <ChampsSource qui="Source" source={f.source} onChange={(s) => changer({ source: s })} />
                <button type="button" class="bouton secondaire petit" onClick={() => maj({ faits: saisie.faits.filter((_, j) => j !== i) })}>
                  Retirer ce fait
                </button>
              </div>
            );
          })}
          <button type="button" class="bouton secondaire petit" onClick={() => maj({ faits: [...saisie.faits, { libelle: '', valeur: '', source: sourceVide() }] })}>
            Ajouter un fait
          </button>
        </fieldset>

        <Champ etiquette="À vérifier (un point par ligne)" aide="Ce que tu ne sais pas encore : il restera affiché « à vérifier ».">
          <textarea rows={3} value={saisie.aVerifier} onInput={(e) => maj({ aVerifier: e.currentTarget.value })} />
        </Champ>

        <fieldset class="groupe">
          <legend>Sites et pages à consulter</legend>
          {saisie.liens.map((l, i) => (
            <div class="carte-interne" key={i}>
              <ChampsSource qui="Page" source={l} onChange={(s) => maj({ liens: saisie.liens.map((x, j) => (j === i ? s : x)) })} />
              <button type="button" class="bouton secondaire petit" onClick={() => maj({ liens: saisie.liens.filter((_, j) => j !== i) })}>
                Retirer ce lien
              </button>
            </div>
          ))}
          <button type="button" class="bouton secondaire petit" onClick={() => maj({ liens: [...saisie.liens, sourceVide()] })}>
            Ajouter un lien
          </button>
        </fieldset>

        <Champ etiquette="Notes (facultatif)">
          <textarea rows={3} value={saisie.notes} onInput={(e) => maj({ notes: e.currentTarget.value })} />
        </Champ>

        <button type="submit" class="bouton">
          Enregistrer
        </button>
      </form>
    </Page>
  );
}

export function FormulairePratique(props: { id: string }) {
  const { donnees } = useStore();
  if (props.id === 'nouveau') return <Editeur key="nouveau" initial={undefined} id={nouvelId('pratique')} />;
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
  return <Editeur key={props.id} initial={f} id={f.id} />;
}

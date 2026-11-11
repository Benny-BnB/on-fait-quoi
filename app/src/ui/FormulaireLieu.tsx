// Ajouter un lieu à sa base, ou corriger une fiche publique (sa propre version).
// Mêmes règles que la base publique : un prix, une durée ou une position sans source n'existe pas.

import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { estLieuPerso, tousLesLieux, trouverLieu } from '../data/lieux-publics.ts';
import { enregistrerLieuPerso, useStore } from '../data/store.ts';
import type { Categorie, Lieu } from '../data/types.ts';
import { CATEGORIES, LIBELLES_CATEGORIE } from '../data/types.ts';
import { lireLieux } from '../lib/lieux.ts';
import { analyserGps, formatGps, lienSur } from '../lib/sejour.ts';
import { aujourdhuiIso, fuseauTelephone, listeFuseaux } from '../lib/temps.ts';
import { Champ, ListeErreurs, Page } from './commun.tsx';
import { aller, lienLieu, lienQuoiFaire } from './routeur.ts';

type SaisieSource = { lien: string; libelle: string; officielle: boolean };
type Saisie = {
  nom: string;
  zone: string;
  fuseau: string;
  quartier: string;
  adresse: string;
  gps: string;
  categories: Categorie[];
  description: string;
  lienOfficiel: string;
  interieur: Lieu['interieur'];
  notes: string;
  prixMin: string;
  prixMax: string;
  prixDevise: string;
  prixNote: string;
  prixSource: SaisieSource;
  dureeMin: string;
  dureeMax: string;
  dureeSource: SaisieSource;
};

const sourceVide = (): SaisieSource => ({ lien: '', libelle: '', officielle: false });
const versSource = (s: Lieu['prix'] | Lieu['duree']): SaisieSource => (s ? { lien: s.source.lien, libelle: s.source.libelle, officielle: s.source.officielle } : sourceVide());

function versSaisie(l: Lieu | undefined, fuseauDefaut: string): Saisie {
  return {
    nom: l?.nom ?? '',
    zone: l?.zone ?? '',
    fuseau: l?.fuseau ?? fuseauDefaut,
    quartier: l?.quartier ?? '',
    adresse: l?.adresse ?? '',
    gps: l?.gps ? formatGps({ lat: l.gps.lat, lng: l.gps.lng }) : '',
    categories: l ? [...l.categories] : [],
    description: l?.description ?? '',
    lienOfficiel: l?.lienOfficiel ?? '',
    interieur: l?.interieur ?? '',
    notes: l?.notes ?? '',
    prixMin: l?.prix ? String(l.prix.min) : '',
    prixMax: l?.prix ? String(l.prix.max) : '',
    prixDevise: l?.prix?.devise ?? '',
    prixNote: l?.prix?.note ?? '',
    prixSource: versSource(l?.prix ?? null),
    dureeMin: l?.duree ? String(l.duree.minMin) : '',
    dureeMax: l?.duree ? String(l.duree.maxMin) : '',
    dureeSource: versSource(l?.duree ?? null),
  };
}

function nombre(t: string): number | null | undefined {
  const v = t.trim().replace(',', '.');
  if (v === '') return null; // vide
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined; // undefined = pas un nombre
}

function construire(s: Saisie, initial: Lieu | undefined, id: string, aujourdhui: string): { lieu: Lieu | null; erreurs: string[] } {
  const erreurs: string[] = [];
  const source = (x: SaisieSource, ancienne: { lien: string; libelle: string; consulteLe: string; officielle: boolean } | undefined) => {
    // La date de consultation ne change pas si la source n'a pas changé
    const inchangee = ancienne && ancienne.lien === x.lien.trim() && ancienne.libelle === x.libelle.trim() && ancienne.officielle === x.officielle;
    return { lien: x.lien.trim(), libelle: x.libelle.trim(), consulteLe: inchangee ? ancienne.consulteLe : aujourdhui, officielle: x.officielle };
  };
  const exigerSource = (quoi: string, x: SaisieSource) => {
    if (lienSur(x.lien) === null || x.libelle.trim() === '') {
      erreurs.push(`${quoi} : indique d'où vient l'information (lien https:// et nom de la source). Sans source, laisse-le vide : il restera « à vérifier ».`);
    }
  };

  let gps: Lieu['gps'] = null;
  const g = analyserGps(s.gps);
  if (!g.ok) erreurs.push('Coordonnées GPS invalides. Exemple : 13.7563, 100.5018.');
  else if (g.gps) {
    const garde = initial?.gps && initial.gps.lat === g.gps.lat && initial.gps.lng === g.gps.lng ? initial.gps.source : null;
    gps = {
      lat: g.gps.lat,
      lng: g.gps.lng,
      source: garde ?? { lien: `https://www.openstreetmap.org/?mlat=${g.gps.lat}&mlon=${g.gps.lng}`, libelle: 'Saisi à la main', consulteLe: aujourdhui, officielle: false },
    };
  }

  let prix: Lieu['prix'] = null;
  const pMin = nombre(s.prixMin);
  const pMax = nombre(s.prixMax);
  if (s.prixMin.trim() !== '' || s.prixMax.trim() !== '') {
    if (pMin === undefined || pMax === undefined) erreurs.push('Prix : écris des nombres.');
    else {
      exigerSource('Prix', s.prixSource);
      const min = pMin ?? pMax ?? 0;
      prix = { min, max: pMax ?? min, devise: s.prixDevise.trim().toUpperCase(), note: s.prixNote.trim(), source: source(s.prixSource, initial?.prix?.source) };
    }
  }

  let duree: Lieu['duree'] = null;
  const dMin = nombre(s.dureeMin);
  const dMax = nombre(s.dureeMax);
  if (s.dureeMin.trim() !== '' || s.dureeMax.trim() !== '') {
    if (dMin === undefined || dMax === undefined) erreurs.push('Durée : écris des nombres de minutes.');
    else {
      exigerSource('Durée', s.dureeSource);
      const min = dMin ?? dMax ?? 0;
      duree = { minMin: min, maxMin: dMax ?? min, estimee: initial?.duree?.estimee ?? false, base: initial?.duree?.base ?? '', source: source(s.dureeSource, initial?.duree?.source) };
    }
  }
  if (erreurs.length > 0) return { lieu: null, erreurs };

  const brut = {
    ...(initial ?? {}),
    id,
    nom: s.nom.trim(),
    zone: s.zone.trim(),
    fuseau: s.fuseau.trim(),
    quartier: s.quartier.trim(),
    adresse: s.adresse.trim(),
    gps,
    categories: s.categories,
    description: s.description.trim(),
    lienOfficiel: s.lienOfficiel.trim(),
    interieur: s.interieur,
    notes: s.notes.trim(),
    prix,
    duree,
    verifieLe: aujourdhui,
  };
  const problemes: string[] = [];
  const lus = lireLieux([brut], problemes);
  if (problemes.length > 0 || lus.length === 0) return { lieu: null, erreurs: problemes.map((p) => p.replace(/^Lieu n°1( \([^)]*\))? : /, '')) };
  return { lieu: lus[0], erreurs: [] };
}

function Editeur(props: { initial: Lieu | undefined; id: string }) {
  const { donnees } = useStore();
  const [saisie, definirSaisie] = useState<Saisie>(() => versSaisie(props.initial, donnees.etapes[0]?.fuseau ?? fuseauTelephone()));
  const [tentative, definirTentative] = useState(false);
  const [erreurs, definirErreurs] = useState<string[]>([]);
  const [fuseaux] = useState<string[]>(listeFuseaux);
  const zones = [...new Set(tousLesLieux(donnees).map((l) => l.zone))];
  const maj = (partiel: Partial<Saisie>) => definirSaisie((s) => ({ ...s, ...partiel }));
  const nouveau = props.initial === undefined;
  const copie = !nouveau && !estLieuPerso(donnees, props.id);

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    const r = construire(saisie, props.initial, props.id, aujourdhuiIso());
    definirErreurs(r.erreurs);
    if (!r.lieu) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await enregistrerLieuPerso(r.lieu);
    aller(lienLieu(r.lieu.id));
  }

  const sourceChamps = (quoi: 'prixSource' | 'dureeSource') => (
    <>
      <Champ etiquette="Source : lien" aide="Page où tu as lu l'information (https://…).">
        <input type="url" inputMode="url" value={saisie[quoi].lien} autocomplete="off" spellcheck={false} onInput={(e) => maj({ [quoi]: { ...saisie[quoi], lien: e.currentTarget.value } })} />
      </Champ>
      <Champ etiquette="Source : nom">
        <input type="text" value={saisie[quoi].libelle} placeholder="Site du lieu, office du tourisme, guide…" onInput={(e) => maj({ [quoi]: { ...saisie[quoi], libelle: e.currentTarget.value } })} />
      </Champ>
      <label class="interrupteur">
        <input type="checkbox" checked={saisie[quoi].officielle} onChange={(e) => maj({ [quoi]: { ...saisie[quoi], officielle: e.currentTarget.checked } })} />
        <span>Source officielle (site du lieu ou de l'opérateur, billetterie, office du tourisme)</span>
      </label>
    </>
  );

  return (
    <Page titre={nouveau ? 'Nouveau lieu' : copie ? 'Ma version de la fiche' : 'Modifier ma fiche'} retour={nouveau ? { href: lienQuoiFaire(), libelle: 'Quoi faire ?' } : { href: lienLieu(props.id), libelle: 'Fiche' }}>
      <form class="formulaire" onSubmit={enregistrer} noValidate>
        <ListeErreurs erreurs={tentative ? erreurs : []} />
        {copie && <div class="message info">Tu corriges ta propre version de cette fiche publique. Elle reste sur ton téléphone et remplace la fiche de base pour toi.</div>}

        <Champ etiquette="Nom du lieu">
          <input type="text" value={saisie.nom} autocomplete="off" onInput={(e) => maj({ nom: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Ville ou région" aide="Elle sert à retrouver le lieu quand tu cherches pour une étape (ex. Bangkok).">
          <input type="text" list="zones-lieux" value={saisie.zone} autocomplete="off" onInput={(e) => maj({ zone: e.currentTarget.value })} />
        </Champ>
        <datalist id="zones-lieux">
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>

        <fieldset class="groupe">
          <legend>Catégories (au moins une)</legend>
          <div class="chips">
            {CATEGORIES.map((c) => {
              const actif = saisie.categories.includes(c);
              return (
                <label key={c} class={`chip${actif ? ' choisi' : ''}`}>
                  <input type="checkbox" checked={actif} onChange={() => maj({ categories: actif ? saisie.categories.filter((x) => x !== c) : [...saisie.categories, c] })} />
                  {LIBELLES_CATEGORIE[c]}
                </label>
              );
            })}
          </div>
        </fieldset>

        <Champ etiquette="Description (facultatif)" aide="Une ou deux phrases factuelles.">
          <textarea rows={2} value={saisie.description} onInput={(e) => maj({ description: e.currentTarget.value })} />
        </Champ>
        <div class="rangee-champs">
          <Champ etiquette="Quartier (facultatif)">
            <input type="text" value={saisie.quartier} onInput={(e) => maj({ quartier: e.currentTarget.value })} />
          </Champ>
          <Champ etiquette="Intérieur / extérieur">
            <select value={saisie.interieur} onChange={(e) => maj({ interieur: e.currentTarget.value as Lieu['interieur'] })}>
              <option value="">Non précisé</option>
              <option value="interieur">Intérieur</option>
              <option value="exterieur">Extérieur</option>
              <option value="mixte">Les deux</option>
            </select>
          </Champ>
        </div>
        <Champ etiquette="Adresse (facultatif)">
          <textarea rows={2} value={saisie.adresse} onInput={(e) => maj({ adresse: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Coordonnées GPS (facultatif)" aide="Copiées depuis une carte, par exemple 13.7563, 100.5018.">
          <input type="text" inputMode="decimal" value={saisie.gps} autocomplete="off" spellcheck={false} onInput={(e) => maj({ gps: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Site officiel (facultatif)">
          <input type="url" inputMode="url" value={saisie.lienOfficiel} autocomplete="off" spellcheck={false} onInput={(e) => maj({ lienOfficiel: e.currentTarget.value })} />
        </Champ>

        <fieldset class="groupe">
          <legend>Prix par personne (facultatif)</legend>
          <p class="champ-aide">Un prix doit avoir une source. Sans source, laisse vide : il restera « à vérifier ».</p>
          <div class="rangee-champs">
            <Champ etiquette="Minimum">
              <input type="text" inputMode="decimal" value={saisie.prixMin} onInput={(e) => maj({ prixMin: e.currentTarget.value })} />
            </Champ>
            <Champ etiquette="Maximum">
              <input type="text" inputMode="decimal" value={saisie.prixMax} onInput={(e) => maj({ prixMax: e.currentTarget.value })} />
            </Champ>
          </div>
          <Champ etiquette="Devise" aide="Code à 3 lettres : THB, AED, EUR…">
            <input type="text" value={saisie.prixDevise} maxLength={3} placeholder="THB" autocomplete="off" spellcheck={false} onInput={(e) => maj({ prixDevise: e.currentTarget.value })} />
          </Champ>
          <Champ etiquette="Précision (facultatif)" aide="Qui paie quoi : enfants, étrangers, tarif réduit…">
            <input type="text" value={saisie.prixNote} onInput={(e) => maj({ prixNote: e.currentTarget.value })} />
          </Champ>
          {sourceChamps('prixSource')}
        </fieldset>

        <fieldset class="groupe">
          <legend>Durée de la visite (facultatif)</legend>
          <div class="rangee-champs">
            <Champ etiquette="Minimum (minutes)">
              <input type="text" inputMode="numeric" value={saisie.dureeMin} onInput={(e) => maj({ dureeMin: e.currentTarget.value })} />
            </Champ>
            <Champ etiquette="Maximum (minutes)">
              <input type="text" inputMode="numeric" value={saisie.dureeMax} onInput={(e) => maj({ dureeMax: e.currentTarget.value })} />
            </Champ>
          </div>
          {sourceChamps('dureeSource')}
        </fieldset>

        <Champ etiquette="Notes (facultatif)" aide="Horaires, réservation, tenue : écris-les ici tant qu'ils n'ont pas de source à citer.">
          <textarea rows={3} value={saisie.notes} onInput={(e) => maj({ notes: e.currentTarget.value })} />
        </Champ>

        <details class="plus-options">
          <summary>Plus d'options</summary>
          <Champ etiquette="Fuseau horaire du lieu" aide="Rempli d'après ton séjour.">
            <input type="text" list="fuseaux-lieu" value={saisie.fuseau} autocomplete="off" spellcheck={false} onInput={(e) => maj({ fuseau: e.currentTarget.value })} />
          </Champ>
          <datalist id="fuseaux-lieu">
            {fuseaux.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </details>

        <button type="submit" class="bouton">
          Enregistrer
        </button>
        <a class="bouton secondaire" href={nouveau ? lienQuoiFaire() : lienLieu(props.id)}>
          Annuler
        </a>
      </form>
    </Page>
  );
}

export function FormulaireLieu(props: { id: string }) {
  const { donnees } = useStore();
  if (props.id === 'nouveau') return <Editeur key="nouveau" initial={undefined} id={nouvelId('lieu')} />;
  const l = trouverLieu(donnees, props.id);
  if (!l) {
    return (
      <Page titre="Fiche introuvable" retour={{ href: lienQuoiFaire(), libelle: 'Quoi faire ?' }}>
        <section class="carte">
          <p>Cette fiche n'existe pas (ou a été supprimée).</p>
        </section>
      </Page>
    );
  }
  return <Editeur key={l.id} initial={l} id={l.id} />;
}

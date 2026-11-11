import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { enregistrerTrajet, supprimerTrajet, useStore } from '../data/store.ts';
import type { Donnees, Trajet } from '../data/types.ts';
import { LIBELLES_MODE, MODES_TRAJET } from '../data/types.ts';
import { calculerTrajet, heureAvecJour, jourDans } from '../lib/planning.ts';
import { premierLien } from '../lib/sejour.ts';
import { dateValide, formatDateHeureDansFuseau, formatDateIso, formatDureeMin, fuseauTelephone, fuseauValide, heureValide, listeFuseaux } from '../lib/temps.ts';
import { libelleVol, volsTries } from '../lib/vols.ts';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';
import { aller } from './routeur.ts';

// La saisie garde les nombres sous forme de texte pour qu'on puisse les effacer et les retaper librement
type Saisie = Omit<Trajet, 'dureeMin' | 'prixMin' | 'prixMax'> & { dureeH: string; dureeM: string; prixMinTxt: string; prixMaxTxt: string };

function versSaisie(t: Trajet): Saisie {
  const { dureeMin, prixMin, prixMax, ...reste } = t;
  return {
    ...reste,
    dureeH: dureeMin === null ? '' : String(Math.floor(dureeMin / 60)),
    dureeM: dureeMin === null ? '' : String(dureeMin % 60),
    prixMinTxt: prixMin === null ? '' : String(prixMin),
    prixMaxTxt: prixMax === null ? '' : String(prixMax),
  };
}

const nombreOuNull = (texte: string): number | null => {
  const t = texte.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
};

// Construit un trajet à partir de la saisie, sans rien refuser (sert à l'aperçu en direct)
function brouillon(s: Saisie): Trajet {
  const { dureeH, dureeM, prixMinTxt, prixMaxTxt, ...reste } = s;
  const h = nombreOuNull(dureeH);
  const m = nombreOuNull(dureeM);
  const dureeMin = h === null && m === null ? null : (h ?? 0) * 60 + (m ?? 0);
  return {
    ...reste,
    de: s.de.trim(),
    a: s.a.trim(),
    fuseau: s.fuseau.trim(),
    dureeMin,
    prixMin: nombreOuNull(prixMinTxt),
    prixMax: nombreOuNull(prixMaxTxt),
    devise: s.devise.trim().toUpperCase(),
    source: s.source.trim(),
    notes: s.notes.trim(),
  };
}

function erreursTrajet(t: Trajet): string[] {
  const e: string[] = [];
  if (!t.de) e.push('Indique le lieu de départ.');
  if (!t.a) e.push("Indique le lieu d'arrivée.");
  if (!dateValide(t.date)) e.push('Date manquante ou invalide.');
  if (t.heure !== '' && !heureValide(t.heure)) e.push('Heure invalide.');
  if (!fuseauValide(t.fuseau)) e.push('Fuseau horaire inconnu (exemple : Asia/Bangkok).');
  if (t.dureeMin !== null && (Number.isNaN(t.dureeMin) || t.dureeMin < 0 || t.dureeMin > 7 * 24 * 60)) e.push('La durée doit être entre 0 et 7 jours.');
  const prixDonnes = t.prixMin !== null || t.prixMax !== null;
  if (prixDonnes) {
    if (t.prixMin === null || t.prixMax === null || Number.isNaN(t.prixMin) || Number.isNaN(t.prixMax) || t.prixMin < 0 || t.prixMax < 0) {
      e.push('Prix : indique un minimum et un maximum (le même nombre si le prix est fixe).');
    } else if (t.prixMin > t.prixMax) {
      e.push('Le prix minimum dépasse le prix maximum.');
    }
    if (!/^[A-Z]{3}$/.test(t.devise)) e.push('Indique la devise du prix (3 lettres, exemple : THB).');
  }
  if (t.consulteLe !== '' && !dateValide(t.consulteLe)) e.push('Date de consultation invalide.');
  return e;
}

// Pas de prix = pas de devise enregistrée
function versTrajet(t: Trajet): Trajet {
  return { ...t, devise: t.prixMin !== null ? t.devise : '' };
}

// Aperçu : ce que l'app déduit du vol lié (heure limite à l'aéroport, heure de départ conseillée)
function ApercuHeures(props: { trajet: Trajet; donnees: Donnees }) {
  const c = calculerTrajet(props.trajet, props.donnees);
  const v = c.vol;
  if (!v || props.trajet.lienVol !== 'vers' || c.aeroportAvantMs === null || !fuseauValide(v.depart.fuseau)) return null;
  const f = v.depart.fuseau;
  const delai = props.donnees.reglages.delaiAeroportMin[v.portee];
  const trop = c.origine === 'saisie' && c.finMs !== null && c.finMs > c.aeroportAvantMs;
  return (
    <div class={`message ${trop ? 'attention' : 'info'}`} role="status">
      <div>
        Être à l'aéroport avant {formatDateHeureDansFuseau(c.aeroportAvantMs, f)} ({formatDureeMin(delai)} avant le décollage du vol {v.numero}).
      </div>
      {c.conseilleMs !== null ? (
        <div>
          <strong>Heure de départ conseillée : {heureAvecJour(c.conseilleMs, f, jourDans(c.aeroportAvantMs, f))}</strong>
        </div>
      ) : (
        <div>Renseigne la durée du trajet pour calculer l'heure de départ conseillée.</div>
      )}
      {trop && c.finMs !== null && <div>Avec l'heure saisie, tu arrives à {heureAvecJour(c.finMs, f, jourDans(c.aeroportAvantMs, f))} : trop tard.</div>}
    </div>
  );
}

function Editeur(props: { initial: Trajet; nouveau: boolean }) {
  const { donnees } = useStore();
  const [saisie, definirSaisie] = useState<Saisie>(() => versSaisie(props.initial));
  const [tentative, definirTentative] = useState(false); // vrai après un premier essai d'enregistrement
  const [fuseaux] = useState<string[]>(listeFuseaux);
  const maj = (partiel: Partial<Saisie>) => definirSaisie((s) => ({ ...s, ...partiel }));

  const vols = volsTries(donnees.vols);
  const propre = brouillon(saisie);
  const problemes = erreursTrajet(propre);
  const lienSource = premierLien(saisie.source);
  const volChoisi = saisie.volId !== '' ? donnees.vols.find((v) => v.id === saisie.volId) : undefined;

  // Choisir un vol propose son fuseau et son jour (sans écraser une date déjà saisie)
  function lierVol(volId: string, lienVol: Trajet['lienVol']) {
    const v = donnees.vols.find((x) => x.id === volId);
    definirSaisie((s) => ({
      ...s,
      volId,
      lienVol,
      fuseau: v ? (lienVol === 'vers' ? v.depart.fuseau : v.arrivee.fuseau) : s.fuseau,
      date: s.date === '' && v ? (lienVol === 'vers' ? v.depart.date : v.arrivee.date) : s.date,
    }));
  }

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    if (problemes.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await enregistrerTrajet(versTrajet(propre));
    aller('#/trajets');
  }

  return (
    <Page titre={props.nouveau ? 'Nouveau trajet' : 'Modifier le trajet'} retour={{ href: '#/trajets', libelle: 'Trajets' }}>
      <form class="formulaire" onSubmit={enregistrer} noValidate>
        <ListeErreurs erreurs={tentative ? problemes : []} />

        <Champ etiquette="De">
          <input type="text" value={saisie.de} placeholder="Hôtel" onInput={(e) => maj({ de: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="À">
          <input type="text" value={saisie.a} placeholder="Aéroport" onInput={(e) => maj({ a: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Mode de transport">
          <select value={saisie.mode} onChange={(e) => maj({ mode: e.currentTarget.value as Trajet['mode'] })}>
            <option value="">À choisir</option>
            {MODES_TRAJET.map((m) => (
              <option key={m} value={m}>
                {LIBELLES_MODE[m]}
              </option>
            ))}
          </select>
        </Champ>

        <fieldset class="groupe">
          <legend>Lien avec un vol</legend>
          <Champ etiquette="Vol">
            <select value={saisie.volId} onChange={(e) => lierVol(e.currentTarget.value, saisie.lienVol)}>
              <option value="">Aucun</option>
              {saisie.volId !== '' && !volChoisi && <option value={saisie.volId}>Vol introuvable</option>}
              {vols.map((v) => (
                <option key={v.id} value={v.id}>
                  {libelleVol(v)} · {formatDateIso(v.depart.date)}
                </option>
              ))}
            </select>
          </Champ>
          {saisie.volId !== '' && (
            <>
              <label class="choix">
                <input type="radio" name="lien-vol" checked={saisie.lienVol === 'vers'} onChange={() => lierVol(saisie.volId, 'vers')} />
                <span>Pour prendre ce vol (aller à l'aéroport)</span>
              </label>
              <label class="choix">
                <input type="radio" name="lien-vol" checked={saisie.lienVol === 'depuis'} onChange={() => lierVol(saisie.volId, 'depuis')} />
                <span>Après l'atterrissage de ce vol</span>
              </label>
            </>
          )}
        </fieldset>

        <div class="rangee-champs">
          <Champ etiquette="Date prévue">
            <input type="date" value={saisie.date} onInput={(e) => maj({ date: e.currentTarget.value })} />
          </Champ>
          <Champ etiquette="Heure de départ (facultatif)">
            <input type="time" value={saisie.heure} onInput={(e) => maj({ heure: e.currentTarget.value })} />
          </Champ>
        </div>
        <Champ etiquette="Fuseau horaire du lieu de départ" aide="L'heure de départ saisie est celle de ce fuseau.">
          <input type="text" list="liste-fuseaux-trajet" value={saisie.fuseau} placeholder="Asia/Bangkok" autocomplete="off" spellcheck={false} onInput={(e) => maj({ fuseau: e.currentTarget.value })} />
        </Champ>
        <datalist id="liste-fuseaux-trajet">
          {fuseaux.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>

        <fieldset class="groupe">
          <legend>Durée (facultatif)</legend>
          <div class="rangee-champs">
            <Champ etiquette="Heures">
              <input type="number" min="0" inputMode="numeric" value={saisie.dureeH} onInput={(e) => maj({ dureeH: e.currentTarget.value })} />
            </Champ>
            <Champ etiquette="Minutes">
              <input type="number" min="0" max="59" inputMode="numeric" value={saisie.dureeM} onInput={(e) => maj({ dureeM: e.currentTarget.value })} />
            </Champ>
          </div>
          <label class="interrupteur">
            <input type="checkbox" checked={saisie.dureeEstimee} onChange={(e) => maj({ dureeEstimee: e.currentTarget.checked })} />
            <span>Durée estimée (pas publiée par une source)</span>
          </label>
        </fieldset>

        <ApercuHeures trajet={propre} donnees={donnees} />

        <fieldset class="groupe">
          <legend>Prix par personne (facultatif)</legend>
          <div class="rangee-champs">
            <Champ etiquette="Minimum">
              <input type="text" inputMode="decimal" value={saisie.prixMinTxt} onInput={(e) => maj({ prixMinTxt: e.currentTarget.value })} />
            </Champ>
            <Champ etiquette="Maximum">
              <input type="text" inputMode="decimal" value={saisie.prixMaxTxt} onInput={(e) => maj({ prixMaxTxt: e.currentTarget.value })} />
            </Champ>
          </div>
          <Champ etiquette="Devise" aide="Code à 3 lettres : THB, AED, EUR…">
            <input type="text" value={saisie.devise} maxLength={3} placeholder="THB" autocomplete="off" spellcheck={false} onInput={(e) => maj({ devise: e.currentTarget.value })} />
          </Champ>
        </fieldset>

        <fieldset class="groupe">
          <legend>Source</legend>
          <p class="champ-aide">Où as-tu lu la durée ou le prix ? Sans source, ils s'affichent « à vérifier ».</p>
          <Champ etiquette="Source (nom, lien…)">
            <textarea rows={2} value={saisie.source} autocomplete="off" spellcheck={false} onInput={(e) => maj({ source: e.currentTarget.value })} />
          </Champ>
          <Champ etiquette="Consultée le (facultatif)">
            <input type="date" value={saisie.consulteLe} onInput={(e) => maj({ consulteLe: e.currentTarget.value })} />
          </Champ>
          {lienSource && (
            <a class="bouton secondaire petit" href={lienSource} target="_blank" rel="noopener noreferrer">
              Ouvrir la source
            </a>
          )}
        </fieldset>

        <Champ etiquette="Logement concerné (facultatif)">
          <select value={saisie.logementId} onChange={(e) => maj({ logementId: e.currentTarget.value })}>
            <option value="">Aucun</option>
            {saisie.logementId !== '' && !donnees.logements.some((l) => l.id === saisie.logementId) && <option value={saisie.logementId}>Logement introuvable</option>}
            {donnees.logements.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ etiquette="Notes (facultatif)">
          <textarea rows={3} value={saisie.notes} onInput={(e) => maj({ notes: e.currentTarget.value })} />
        </Champ>

        <button type="submit" class="bouton">
          Enregistrer
        </button>
        <a class="bouton secondaire" href="#/trajets">
          Annuler
        </a>
        {!props.nouveau && (
          <BoutonConfirme
            libelle="Supprimer ce trajet"
            question="Supprimer ce trajet ? C'est définitif."
            oui="Oui, supprimer"
            onConfirme={async () => {
              await supprimerTrajet(props.initial.id);
              aller('#/trajets');
            }}
          />
        )}
      </form>
    </Page>
  );
}

export function FormulaireTrajet(props: { id: string; volId?: string }) {
  const { donnees } = useStore();
  const nouveau = props.id === 'nouveau';
  const existant = nouveau ? undefined : donnees.trajets.find((t) => t.id === props.id);
  if (!nouveau && !existant) {
    return (
      <Page titre="Trajet introuvable" retour={{ href: '#/trajets', libelle: 'Trajets' }}>
        <section class="carte">
          <p>Ce trajet n'existe pas (ou a été supprimé).</p>
        </section>
      </Page>
    );
  }
  // Un nouveau trajet lancé depuis un vol : on prépare "vers l'aéroport" avec le jour et le fuseau du vol
  const vol = props.volId ? donnees.vols.find((v) => v.id === props.volId) : undefined;
  const vide: Trajet = {
    id: nouvelId('trajet'),
    de: '',
    a: vol ? `Aéroport ${vol.depart.ville || vol.depart.code} (${vol.depart.code})` : '',
    mode: '',
    date: vol?.depart.date ?? '',
    heure: '',
    fuseau: vol?.depart.fuseau ?? fuseauTelephone(),
    dureeMin: null,
    dureeEstimee: false,
    prixMin: null,
    prixMax: null,
    devise: '',
    source: '',
    consulteLe: '',
    volId: vol?.id ?? '',
    lienVol: 'vers',
    logementId: '',
    notes: '',
  };
  return <Editeur key={`${props.id}-${props.volId ?? ''}`} initial={existant ?? vide} nouveau={nouveau} />;
}

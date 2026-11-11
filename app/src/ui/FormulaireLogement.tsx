import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { enregistrerLogement, supprimerLogement, useStore } from '../data/store.ts';
import type { Etape, Logement, MomentLogement } from '../data/types.ts';
import { LIBELLES_STATUT_LOGEMENT, STATUTS_LOGEMENT } from '../data/types.ts';
import { analyserGps, etapesTriees, formatGps, lienSur, liensCartes, nbNuits } from '../lib/sejour.ts';
import { dateValide, formatDateIso, heureValide } from '../lib/temps.ts';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';
import { aller } from './routeur.ts';

type Saisie = Omit<Logement, 'gps'> & { gpsTexte: string };

function versSaisie(l: Logement): Saisie {
  const { gps, ...reste } = l;
  return { ...reste, gpsTexte: formatGps(gps) };
}

// Transforme la saisie en logement propre. Renvoie la liste des erreurs si quelque chose ne va pas.
function verifier(s: Saisie): { logement: Logement } | { erreurs: string[] } {
  const erreurs: string[] = [];
  const nom = s.nom.trim() || (s.statut === 'a-trouver' ? 'Logement à trouver' : '');
  if (!s.etapeId) erreurs.push("Choisis l'étape de ce logement.");
  if (!nom) erreurs.push('Donne un nom au logement (ou mets le statut « À trouver »).');
  const lien = s.lien.trim();
  if (lien !== '' && lienSur(lien) === null) erreurs.push('Le lien doit commencer par https:// ou http://.');
  const gps = analyserGps(s.gpsTexte);
  if (!gps.ok) erreurs.push('Coordonnées GPS invalides. Exemple : 13.7563, 100.5018 (latitude, longitude).');
  for (const [quand, m] of [
    ['Arrivée', s.arrivee],
    ['Départ', s.depart],
  ] as const) {
    if (!dateValide(m.date)) erreurs.push(`${quand} : date manquante ou invalide.`);
    if (m.heure.trim() !== '' && !heureValide(m.heure.trim())) erreurs.push(`${quand} : heure invalide.`);
  }
  if (dateValide(s.arrivee.date) && dateValide(s.depart.date) && !(s.depart.date > s.arrivee.date)) {
    erreurs.push("Le départ doit être après l'arrivée (au moins une nuit).");
  }
  if (erreurs.length > 0 || !gps.ok) return { erreurs };
  const { gpsTexte: _ignore, ...reste } = s;
  return {
    logement: {
      ...reste,
      nom,
      lien,
      adresse: s.adresse.trim(),
      gps: gps.gps,
      arrivee: { date: s.arrivee.date, heure: s.arrivee.heure.trim() },
      depart: { date: s.depart.date, heure: s.depart.heure.trim() },
      reference: s.reference.trim().toUpperCase(),
      notes: s.notes.trim(),
    },
  };
}

function ChampsMoment(props: { titre: string; moment: MomentLogement; onChange: (partiel: Partial<MomentLogement>) => void }) {
  return (
    <fieldset class="groupe">
      <legend>{props.titre}</legend>
      <div class="rangee-champs">
        <Champ etiquette="Date">
          <input type="date" value={props.moment.date} onInput={(e) => props.onChange({ date: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Heure (facultatif)">
          <input type="time" value={props.moment.heure} onInput={(e) => props.onChange({ heure: e.currentTarget.value })} />
        </Champ>
      </div>
    </fieldset>
  );
}

function Editeur(props: { initial: Logement; nouveau: boolean; etapes: Etape[] }) {
  const [saisie, definirSaisie] = useState<Saisie>(() => versSaisie(props.initial));
  const [tentative, definirTentative] = useState(false); // vrai après un premier essai d'enregistrement
  const maj = (partiel: Partial<Saisie>) => definirSaisie((s) => ({ ...s, ...partiel }));

  // Choisir une autre étape = déplacer le logement. Pour un nouveau logement, on propose les dates de l'étape.
  function changerEtape(etapeId: string) {
    const etape = props.etapes.find((e) => e.id === etapeId);
    definirSaisie((s) => ({
      ...s,
      etapeId,
      arrivee: !s.arrivee.date && etape ? { ...s.arrivee, date: etape.debut } : s.arrivee,
      depart: !s.depart.date && etape ? { ...s.depart, date: etape.fin } : s.depart,
    }));
  }

  const resultat = verifier(saisie);

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    if ('erreurs' in resultat) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await enregistrerLogement(resultat.logement);
    aller('#/sejour');
  }

  const etape = props.etapes.find((e) => e.id === saisie.etapeId);
  const horsEtape = etape && dateValide(saisie.arrivee.date) && dateValide(saisie.depart.date) && (saisie.arrivee.date < etape.debut || saisie.depart.date > etape.fin);
  const nuits = dateValide(saisie.arrivee.date) && dateValide(saisie.depart.date) && saisie.depart.date > saisie.arrivee.date ? nbNuits(saisie.arrivee.date, saisie.depart.date) : null;
  const gps = analyserGps(saisie.gpsTexte);
  const cartes = liensCartes({ nom: saisie.nom.trim(), adresse: saisie.adresse, gps: gps.ok ? gps.gps : null });
  const lienOuvrable = lienSur(saisie.lien);

  return (
    <Page titre={props.nouveau ? 'Nouveau logement' : 'Modifier le logement'} retour={{ href: '#/sejour', libelle: 'Séjour' }}>
      <form class="formulaire" onSubmit={enregistrer} noValidate>
        <ListeErreurs erreurs={tentative && 'erreurs' in resultat ? resultat.erreurs : []} />

        <Champ etiquette="Étape" aide="Pour déplacer ce logement, choisis une autre étape.">
          <select value={saisie.etapeId} onChange={(e) => changerEtape(e.currentTarget.value)}>
            {saisie.etapeId === '' && <option value="">Choisir…</option>}
            {!etape && saisie.etapeId !== '' && <option value={saisie.etapeId}>Étape introuvable</option>}
            {props.etapes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom} ({formatDateIso(e.debut)} → {formatDateIso(e.fin)})
              </option>
            ))}
          </select>
        </Champ>
        <Champ etiquette="Nom du logement">
          <input type="text" value={saisie.nom} onInput={(e) => maj({ nom: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Statut">
          <select value={saisie.statut} onChange={(e) => maj({ statut: e.currentTarget.value as Logement['statut'] })}>
            {STATUTS_LOGEMENT.map((s) => (
              <option key={s} value={s}>
                {LIBELLES_STATUT_LOGEMENT[s]}
              </option>
            ))}
          </select>
        </Champ>

        <ChampsMoment titre="Arrivée" moment={saisie.arrivee} onChange={(p) => maj({ arrivee: { ...saisie.arrivee, ...p } })} />
        <ChampsMoment titre="Départ" moment={saisie.depart} onChange={(p) => maj({ depart: { ...saisie.depart, ...p } })} />
        {nuits !== null && <div class="message info">{nuits} nuit{nuits > 1 ? 's' : ''}</div>}
        {horsEtape && etape && (
          <div class="message attention" role="status">
            Ces dates dépassent celles de l'étape « {etape.nom} » ({formatDateIso(etape.debut)} → {formatDateIso(etape.fin)}). Tu peux enregistrer quand même.
          </div>
        )}

        <Champ etiquette="Lien (annonce ou réservation, facultatif)">
          <input type="url" value={saisie.lien} placeholder="https://…" autocomplete="off" autocapitalize="off" spellcheck={false} onInput={(e) => maj({ lien: e.currentTarget.value })} />
        </Champ>
        {lienOuvrable && (
          <a class="bouton secondaire petit" href={lienOuvrable} target="_blank" rel="noopener noreferrer">
            Ouvrir le lien
          </a>
        )}

        <Champ etiquette="Adresse (facultatif)">
          <textarea rows={2} value={saisie.adresse} onInput={(e) => maj({ adresse: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Coordonnées GPS (facultatif)" aide="Latitude, longitude. Exemple : 13.7563, 100.5018. À copier depuis Plans ou Google Maps.">
          <input type="text" value={saisie.gpsTexte} inputMode="decimal" autocomplete="off" spellcheck={false} onInput={(e) => maj({ gpsTexte: e.currentTarget.value })} />
        </Champ>
        {cartes && (
          <div class="rangee">
            <a class="bouton secondaire petit" href={cartes.plans} target="_blank" rel="noopener noreferrer">
              Ouvrir dans Plans
            </a>
            <a class="bouton secondaire petit" href={cartes.google} target="_blank" rel="noopener noreferrer">
              Google Maps
            </a>
          </div>
        )}

        <Champ etiquette="Référence de réservation (facultatif)" aide="Jamais de numéro de carte bancaire.">
          <input type="text" value={saisie.reference} autocomplete="off" spellcheck={false} onInput={(e) => maj({ reference: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Notes (facultatif)">
          <textarea rows={3} value={saisie.notes} onInput={(e) => maj({ notes: e.currentTarget.value })} />
        </Champ>

        <button type="submit" class="bouton">
          Enregistrer
        </button>
        <a class="bouton secondaire" href="#/sejour">
          Annuler
        </a>
        {!props.nouveau && (
          <BoutonConfirme
            libelle="Supprimer ce logement"
            question="Supprimer ce logement ? C'est définitif."
            oui="Oui, supprimer"
            onConfirme={async () => {
              await supprimerLogement(props.initial.id);
              aller('#/sejour');
            }}
          />
        )}
      </form>
    </Page>
  );
}

export function FormulaireLogement(props: { id: string; etapeId?: string }) {
  const { donnees } = useStore();
  const nouveau = props.id === 'nouveau';
  const existant = nouveau ? undefined : donnees.logements.find((l) => l.id === props.id);
  if (!nouveau && !existant) {
    return (
      <Page titre="Logement introuvable" retour={{ href: '#/sejour', libelle: 'Séjour' }}>
        <section class="carte">
          <p>Ce logement n'existe pas (ou a été supprimé).</p>
        </section>
      </Page>
    );
  }
  const etapes = etapesTriees(donnees.etapes);
  if (nouveau && etapes.length === 0) {
    return (
      <Page titre="Nouveau logement" retour={{ href: '#/sejour', libelle: 'Séjour' }}>
        <section class="carte">
          <p>Un logement appartient à une étape. Crée d'abord une étape.</p>
          <a class="bouton" href="#/sejour/etape/nouveau">
            Ajouter une étape
          </a>
        </section>
      </Page>
    );
  }
  const etapeDepart = etapes.find((e) => e.id === props.etapeId);
  const vide: Logement = {
    id: nouvelId('logement'),
    etapeId: etapeDepart?.id ?? '',
    nom: '',
    statut: 'a-verifier',
    lien: '',
    adresse: '',
    gps: null,
    arrivee: { date: etapeDepart?.debut ?? '', heure: '' },
    depart: { date: etapeDepart?.fin ?? '', heure: '' },
    reference: '',
    notes: '',
  };
  return <Editeur key={`${props.id}-${props.etapeId ?? ''}`} initial={existant ?? vide} nouveau={nouveau} etapes={etapes} />;
}

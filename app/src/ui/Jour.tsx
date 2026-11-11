import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { basculerCreneauFait, definirParticipantsJour, enregistrerCreneau, useStore } from '../data/store.ts';
import type { Creneau, Periode } from '../data/types.ts';
import { LIBELLES_PERIODE } from '../data/types.ts';
import type { ElementJour } from '../lib/creneaux.ts';
import { alertesCreneaux, deviseDuJour, elementsDuJour, estPrincipal, HEURE_PERIODE, idsParticipantsJour, periodeEffective, totauxJour, zoneDuJour } from '../lib/creneaux.ts';
import { useMaintenant } from '../lib/horloge.ts';
import type { Alerte } from '../lib/planning.ts';
import { alertesPlanning, creneauxImposes, etapesDuJour } from '../lib/planning.ts';
import { ajouterJours, jourSemaine } from '../lib/sejour.ts';
import { aujourdhuiIso, dateValide, formatDateHeureDansFuseau, formatDateIso, fuseauTelephone, instantLocal } from '../lib/temps.ts';
import { ChoixParticipants } from './ChoixParticipants.tsx';
import { Page } from './commun.tsx';
import { LigneImpose, LigneLibre, ResumeTotaux } from './LignesPlanning.tsx';
import { lienJour, lienNouveauCreneau, lienSource } from './routeur.ts';

const PERIODES_RAPIDES: Periode[] = ['matin', 'midi', 'apres-midi', 'soir'];
const IDEES = ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Plage', 'Piscine', 'Marché', 'Visite', 'Balade', 'Shopping', 'Spa', 'Repos', 'Soirée'];

// Ajout en quelques secondes : on tape (ou on touche une idée), on valide
function AjoutRapide(props: { jour: string; periode: Periode; zone: string; devise: string; onFini: () => void }) {
  const [titre, definirTitre] = useState('');
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => champ.current?.focus(), []);

  async function ajouter(ev: Event) {
    ev.preventDefault();
    const t = titre.trim();
    if (t === '') return;
    const creneau: Creneau = {
      id: nouvelId('creneau'),
      jour: props.jour,
      periode: props.periode,
      debut: '',
      fin: '',
      fuseau: props.zone,
      titre: t,
      note: '',
      statut: 'prevu',
      humeur: '',
      participants: [],
      budgetEstime: null,
      budgetReel: null,
      devise: props.devise,
      dureeMin: null,
      planBDe: '',
      fixe: false,
      typeEvenement: '',
    };
    await enregistrerCreneau(creneau);
    props.onFini();
  }

  return (
    <form class="ajout-rapide" onSubmit={ajouter}>
      <input ref={champ} type="text" value={titre} placeholder={`${LIBELLES_PERIODE[props.periode]} : quoi ?`} autocomplete="off" onInput={(e) => definirTitre(e.currentTarget.value)} />
      <div class="rangee-boutons">
        {IDEES.map((i) => (
          <button type="button" class="bouton secondaire petit" key={i} onClick={() => definirTitre(i)}>
            {i}
          </button>
        ))}
      </div>
      <div class="rangee">
        <button type="submit" class="bouton" disabled={titre.trim() === ''}>
          Ajouter
        </button>
        <button type="button" class="bouton secondaire" onClick={props.onFini}>
          Annuler
        </button>
      </div>
      <a class="discret" href={lienNouveauCreneau(props.jour, props.periode)}>
        Plus de détails (heure, participants, budget…) ›
      </a>
    </form>
  );
}

type Ligne = ElementJour | { cle: string; tri: number; vide: Periode };

export function Jour(props: { jour: string }) {
  const { donnees } = useStore();
  const maintenant = useMaintenant();
  const [ouvert, definirOuvert] = useState<Periode | null>(null);
  const jour = props.jour;
  const imposes = useMemo(() => creneauxImposes(donnees), [donnees]);
  const alertes = useMemo<Alerte[]>(() => [...alertesPlanning(donnees), ...alertesCreneaux(donnees)], [donnees]);

  if (!dateValide(jour)) {
    return (
      <Page titre="Jour introuvable" retour={{ href: '#/planning', libelle: 'Planning' }}>
        <section class="carte">
          <p>Ce jour n'existe pas.</p>
        </section>
      </Page>
    );
  }

  const zone = zoneDuJour(jour, donnees.etapes, fuseauTelephone());
  const devise = deviseDuJour(donnees, jour);
  const etapes = etapesDuJour(jour, donnees.etapes);
  const aujourdhui = aujourdhuiIso();

  const elements = elementsDuJour(donnees, jour, imposes);
  const actifs = elements.filter((e) => !('libre' in e) || e.libre.statut !== 'fait');
  const faits = donnees.creneaux.filter((c) => c.jour === jour && estPrincipal(c) && c.statut === 'fait');

  // Les moments de la journée encore vides, proposés à l'ajout rapide
  const couvertes = new Set(donnees.creneaux.filter((c) => c.jour === jour && estPrincipal(c) && c.statut !== 'annule').map(periodeEffective));
  const vides: Ligne[] = PERIODES_RAPIDES.filter((p) => !couvertes.has(p)).map((p) => {
    const t = instantLocal(jour, HEURE_PERIODE[p], zone);
    return { cle: `vide:${p}`, tri: Number.isNaN(t) ? Infinity : t, vide: p };
  });
  const lignes: Ligne[] = [...actifs, ...vides].sort((a, b) => (a.tri === b.tri ? a.cle.localeCompare(b.cle) : a.tri < b.tri ? -1 : 1));

  const clesImposesDuJour = new Set(imposes.filter((s) => s.jour === jour).map((s) => `${s.genre}:${s.id}`));
  const alertesJour = alertes.filter((a) => a.jour === jour || (a.genre !== undefined && a.id !== undefined && clesImposesDuJour.has(`${a.genre}:${a.id}`)));

  const prochain = jour === aujourdhui ? actifs.find((e) => ('impose' in e ? e.impose.debutMs !== null && e.impose.debutMs > maintenant : e.tri > maintenant && e.tri !== Infinity)) : undefined;
  const totaux = totauxJour(donnees, jour, imposes);
  const idsJour = idsParticipantsJour(donnees, jour);

  return (
    <Page titre={`${jourSemaine(jour)} ${formatDateIso(jour)}`} retour={{ href: '#/planning', libelle: 'Planning' }}>
      <div class="rangee">
        <a class="bouton secondaire petit" href={lienJour(ajouterJours(jour, -1))}>
          ‹ Veille
        </a>
        <a class="bouton secondaire petit" href={lienJour(ajouterJours(jour, 1))}>
          Lendemain ›
        </a>
      </div>
      {etapes.length > 0 && <p class="discret">{etapes.map((e) => e.nom).join(' → ')}</p>}

      {prochain && (
        <section class="carte">
          <h2>Prochaine chose</h2>
          {'impose' in prochain ? (
            <>
              <strong>{prochain.impose.titre}</strong>
              <span>{prochain.impose.debutMs !== null ? formatDateHeureDansFuseau(prochain.impose.debutMs, prochain.impose.fuseau) : ''}</span>
            </>
          ) : (
            <>
              <strong>{prochain.libre.titre}</strong>
              <span>{formatDateHeureDansFuseau(prochain.tri, prochain.libre.fuseau)}</span>
            </>
          )}
        </section>
      )}

      {alertesJour.length > 0 && (
        <section class="message attention" role="status" aria-label="À surveiller ce jour">
          <strong>À surveiller ({alertesJour.length})</strong>
          <ul>
            {alertesJour.map((a) => (
              <li key={a.cle}>
                {a.message}
                {a.genre && a.id && (
                  <>
                    {' '}
                    <a href={lienSource(a.genre, a.id)}>Ouvrir</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section class="carte">
        <h2>Cette journée</h2>
        <ResumeTotaux totaux={totaux} />
      </section>

      {donnees.personnes.length > 0 && (
        <section class="carte">
          <h2>Qui est là ?</h2>
          <ChoixParticipants
            personnes={donnees.personnes}
            valeur={idsJour}
            onChange={(ids) => void definirParticipantsJour(jour, ids.length === donnees.personnes.length ? null : ids)}
          />
          {donnees.joursPlan.some((j) => j.jour === jour) && (
            <button type="button" class="bouton secondaire petit" onClick={() => void definirParticipantsJour(jour, null)}>
              Tout le monde
            </button>
          )}
        </section>
      )}

      <section class="carte jour">
        {lignes.map((l) => {
          if ('vide' in l) {
            return ouvert === l.vide ? (
              <AjoutRapide key={l.cle} jour={jour} periode={l.vide} zone={zone} devise={devise} onFini={() => definirOuvert(null)} />
            ) : (
              <button type="button" class="creneau-vide" key={l.cle} onClick={() => definirOuvert(l.vide)}>
                <strong>{LIBELLES_PERIODE[l.vide]}</strong>
                <span class="discret">Rien de prévu · toucher pour ajouter</span>
              </button>
            );
          }
          if ('impose' in l) return <LigneImpose key={l.cle} c={l.impose} />;
          return <LigneLibre key={l.cle} c={l.libre} alternatif={l.alternatif} donnees={donnees} onFait={() => void basculerCreneauFait(l.libre.id)} />;
        })}
      </section>

      <a class="bouton" href={lienNouveauCreneau(jour)}>
        Ajouter un créneau précis
      </a>

      {faits.length > 0 && (
        <details class="carte details-faites">
          <summary>Fait ({faits.length})</summary>
          {faits.map((c) => (
            <LigneLibre key={c.id} c={c} donnees={donnees} onFait={() => void basculerCreneauFait(c.id)} />
          ))}
        </details>
      )}
    </Page>
  );
}

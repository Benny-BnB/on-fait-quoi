import { useMemo, useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { ERREURS_BASE_LIEUX, tousLesLieux } from '../data/lieux-publics.ts';
import { enregistrerCreneau, useStore } from '../data/store.ts';
import type { AEviter, Categorie, ModeTrajet, Periode, TauxChange } from '../data/types.ts';
import { A_EVITER, CATEGORIES, LIBELLES_A_EVITER, LIBELLES_CATEGORIE, LIBELLES_MODE, LIBELLES_PERIODE, MODES_TRAJET, PERIODES } from '../data/types.ts';
import { libelleEuro } from '../lib/budget.ts';
import { alternatifDe, creerAlternative, deviseDuJour, participantsEffectifs, periodeEffective } from '../lib/creneaux.ts';
import { groupeComplet, idsPresentsLe, personnesDe } from '../lib/profils.ts';
import { activitesDuJour } from '../lib/rythme.ts';
import type { Demande, Proposition, Tri } from '../lib/lieux.ts';
import { creneauDepuisLieu, demandeVide, fenetresVols, filtrerLieux, formatDistance, heureDeLaDemande, lieuxDeLaZone, pointDeDepart } from '../lib/lieux.ts';
import { dateValide, formatDateIso, heureValide } from '../lib/temps.ts';
import { BadgeOuverture, libelleDuree, libellePrix, resumeSources } from './AffichageLieu.tsx';
import { ChoixListe } from './ChoixListe.tsx';
import { Champ, Page } from './commun.tsx';
import { aller, lienJour, lienLieu, lienNouveauLieu } from './routeur.ts';

const TRIS: { cle: Tri; libelle: string }[] = [
  { cle: 'pertinence', libelle: 'Mes envies d’abord, puis ouvert, puis proche' },
  { cle: 'distance', libelle: 'Le plus proche du logement' },
  { cle: 'prix', libelle: 'Le moins cher' },
  { cle: 'duree', libelle: 'Le plus court' },
  { cle: 'nom', libelle: 'Ordre alphabétique' },
];

const nombreOuNull = (t: string): number | null => {
  const v = t.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function CartePropositon(props: { p: Proposition; taux: TauxChange[]; action: string; actionActive: boolean; onAction: () => void; surprise?: boolean }) {
  const { p } = props;
  const l = p.lieu;
  const sources = resumeSources(l);
  return (
    <article class="carte proposition">
      {props.surprise && <span class="etiquette">Idée tirée au hasard</span>}
      <div class="titre-ligne">
        <h3>{l.nom}</h3>
        {p.souhait === 'prioritaire' && <span class="souhait-etoile">★ Prioritaire</span>}
        {p.souhait === 'souhait' && <span class="souhait-etoile">Envie</span>}
        {p.favori && <span class="souhait-etoile">♥ Favori</span>}
        {p.fait && <span class="etiquette">Déjà fait</span>}
      </div>
      <span class="discret">
        {[...l.categories.map((c) => LIBELLES_CATEGORIE[c]), l.quartier].filter((x) => x !== '').join(' · ')}
      </span>
      <span>
        {l.duree ? `Durée : ${libelleDuree(l.duree)}` : 'Durée : '}
        {!l.duree && <span class="attention-texte">à vérifier</span>}
        {' · '}
        {l.prix ? libellePrix(l.prix) : 'Prix : '}
        {l.prix && libelleEuro(l.prix.min, l.prix.devise, props.taux) && ` (${libelleEuro(l.prix.min, l.prix.devise, props.taux)}${l.prix.max !== l.prix.min ? ` à ${libelleEuro(l.prix.max, l.prix.devise, props.taux)}` : ''})`}
        {!l.prix && <span class="attention-texte">à vérifier</span>}
        {l.prix && !l.prix.source.officielle && <span class="attention-texte"> (à vérifier)</span>}
      </span>
      <div>
        <span class="discret">Ouvert à ce moment ? </span>
        <BadgeOuverture o={p.ouvert} />
      </div>
      {p.distanceKm !== null && <span class="discret">À {formatDistance(p.distanceKm)} du logement (à vol d'oiseau)</span>}
      {l.incontournable && <span class="discret">Incontournable selon {l.incontournable.source.libelle}</span>}
      {l.public && <span class="discret">Pour qui : {l.public.texte}</span>}
      {p.avertissements.map((a) => (
        <span class="attention-texte" key={a}>
          {a}
        </span>
      ))}
      {p.signalements.map((x) => (
        <span class={x.fort ? 'attention-texte' : 'discret'} key={x.cle}>
          {x.fort ? '⚠ ' : 'ℹ '}
          {x.texte}
        </span>
      ))}
      {sources.length > 0 && <span class="source">Sources : {sources.join(' · ')}</span>}
      <div class="rangee">
        <a class="bouton secondaire petit" href={lienLieu(l.id)}>
          Voir la fiche
        </a>
        <button type="button" class="bouton petit" disabled={!props.actionActive} onClick={props.onAction}>
          {props.action}
        </button>
      </div>
    </article>
  );
}

export function QuoiFaire(props: { jour?: string; periode?: string; planbDe?: string }) {
  const { donnees } = useStore();
  const lieux = useMemo(() => tousLesLieux(donnees), [donnees.lieuxPerso]);
  const principal = props.planbDe ? donnees.creneaux.find((c) => c.id === props.planbDe) : undefined;

  // Zones de la base, et zone de départ : celle de l'étape du jour
  const zones = useMemo(() => [...new Set(lieux.map((l) => l.zone))].sort((a, b) => a.localeCompare(b, 'fr')), [lieux]);
  const jourInitial = principal?.jour ?? (props.jour && dateValide(props.jour) ? props.jour : '');
  const zoneInitiale = useMemo(() => {
    const etapes = jourInitial !== '' ? donnees.etapes.filter((e) => e.debut <= jourInitial && jourInitial <= e.fin) : donnees.etapes;
    return zones.find((z) => etapes.some((e) => lieuxDeLaZone(lieux.filter((l) => l.zone === z), e.nom).length > 0)) ?? '';
  }, [zones]);

  const [demande, definirDemande] = useState<Demande>(() => ({
    ...demandeVide(),
    zone: zoneInitiale,
    jour: jourInitial,
    periode: principal ? periodeEffective(principal) : ((PERIODES.find((p) => p === props.periode) ?? '') as Periode | ''),
    debut: principal?.debut ?? '',
  }));
  const [budgetTxt, definirBudget] = useState('');
  const [dureeTxt, definirDuree] = useState('');
  const [vue, definirVue] = useState<'tous' | 'envies' | 'favoris'>('tous');
  const [cacherFaits, definirCacherFaits] = useState(false);
  const [surprise, definirSurprise] = useState<string | null>(null);
  const [quiChoisi, definirQui] = useState<string[] | null>(null); // null = les personnes présentes ce jour-là
  const [aEviter, definirAEviter] = useState<AEviter[]>(donnees.reglages.aEviter);
  const [transports, definirTransports] = useState<ModeTrajet[]>(donnees.reglages.transports);
  const [masquer, definirMasquer] = useState(false);
  const maj = (partiel: Partial<Demande>) => {
    definirSurprise(null);
    definirDemande((d) => ({ ...d, ...partiel }));
  };

  const jourOk = dateValide(demande.jour);
  const depart = jourOk ? pointDeDepart(donnees, demande.jour) : null;
  const vols = useMemo(() => fenetresVols(donnees), [donnees.vols, donnees.trajets, donnees.reglages]);

  // Qui : par défaut, les personnes présentes ce jour-là (aucune sans jour) ; en « Autre idée », les participants du créneau
  const idsParDefaut = principal ? participantsEffectifs(principal, donnees).map((p) => p.id) : jourOk ? idsPresentsLe(donnees, demande.jour) : [];
  const idsQui = quiChoisi ?? idsParDefaut;
  const personnesQui = useMemo(() => personnesDe(donnees, [], idsQui), [donnees.personnes, idsQui.join('|')]);
  const reglages = donnees.reglages;
  const complet = { ...demande, budgetMax: nombreOuNull(budgetTxt), dureeMax: nombreOuNull(dureeTxt), depuis: depart?.point ?? null, personnes: personnesQui, aEviter, transports, trajetLongKm: reglages.trajetLongKm, masquerContraintes: masquer };

  const toutes = useMemo(
    () => filtrerLieux(lieux, complet, donnees.suiviLieux, vols),
    [lieux, demande, budgetTxt, dureeTxt, depart, donnees.suiviLieux, vols, personnesQui, aEviter, transports, reglages.trajetLongKm, masquer],
  );
  // Combien de lieux sont masqués parce qu'ils empêcheraient d'attraper un vol (pour le dire clairement)
  const filtreVols = jourOk && heureDeLaDemande(demande) !== '' && vols.length > 0;
  const masquesVol = useMemo(
    () => (filtreVols ? filtrerLieux(lieux, { ...complet, depuis: null }, donnees.suiviLieux, []).length - toutes.length : 0),
    [filtreVols, lieux, demande, budgetTxt, dureeTxt, donnees.suiviLieux, toutes],
  );
  const propositions = toutes.filter((p) => (vue === 'envies' ? p.souhait !== '' : vue === 'favoris' ? p.favori : true)).filter((p) => !(cacherFaits && p.fait));
  const tirage = surprise !== null ? propositions.find((p) => p.lieu.id === surprise) : undefined;
  const affichees = tirage ? [tirage] : propositions;

  function tirerAuHasard() {
    const candidats = propositions.filter((p) => !p.fait && p.ouvert.etat !== 'non');
    if (candidats.length === 0) return;
    const autres = candidats.filter((p) => p.lieu.id !== surprise);
    const choix = (autres.length > 0 ? autres : candidats)[Math.floor(Math.random() * (autres.length > 0 ? autres.length : candidats.length))];
    definirSurprise(choix.lieu.id);
  }

  async function choisir(p: Proposition) {
    if (principal) {
      // « Autre idée » : le choix devient le plan B du créneau (il en remplace le contenu s'il existe déjà)
      const existant = alternatifDe(donnees, principal.id);
      const base = existant ?? creerAlternative(principal, nouvelId('creneau'));
      await enregistrerCreneau({
        ...base,
        titre: p.lieu.nom,
        lieuId: p.lieu.id,
        budgetEstime: null,
        budgetReel: null,
        dureeMin: base.debut === '' && base.fin === '' ? (p.lieu.duree?.maxMin ?? null) : base.dureeMin,
      });
      aller(lienJour(principal.jour));
      return;
    }
    if (!jourOk) return;
    const debut = demande.debut !== '' && heureValide(demande.debut) ? demande.debut : '';
    const devise = p.lieu.prix?.devise ?? deviseDuJour(donnees, demande.jour);
    await enregistrerCreneau(creneauDepuisLieu(p.lieu, nouvelId('creneau'), demande.jour, demande.periode, debut, devise));
    aller(lienJour(demande.jour));
  }

  const actionLibelle = principal ? 'Choisir comme plan B' : jourOk ? `Ajouter au ${formatDateIso(demande.jour)}` : 'Choisis un jour pour ajouter';
  const actionActive = principal !== undefined || jourOk;
  const retour = principal ? { href: lienJour(principal.jour), libelle: 'Journée' } : { href: '#/planning', libelle: 'Planning' };

  return (
    <Page titre={principal ? 'Autre idée' : 'Quoi faire, quand ?'} retour={retour}>
      {ERREURS_BASE_LIEUX.length > 0 && (
        <div class="message erreur" role="alert">
          <strong>Certaines fiches de la base sont refusées par le contrôle des sources :</strong>
          <ul>
            {ERREURS_BASE_LIEUX.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {props.planbDe && !principal && (
        <div class="message erreur" role="alert">
          Le créneau de départ n'existe plus. Tu peux quand même chercher des lieux ci-dessous.
        </div>
      )}
      {principal && (
        <div class="message info">
          Autre idée pour « {principal.titre} » ({formatDateIso(principal.jour)}). Ce que tu choisis devient son plan B.
        </div>
      )}

      <form class="carte formulaire" onSubmit={(e) => e.preventDefault()} noValidate>
        <h2>Ma demande</h2>
        <Champ etiquette="Où ?" aide="Les lieux de la base pour cette zone. Les étapes sans fiche n'apparaissent pas.">
          <select value={demande.zone} onChange={(e) => maj({ zone: e.currentTarget.value })}>
            <option value="">Partout</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Champ>

        {!principal && (
          <>
            <Champ etiquette="Quel jour ?">
              <input type="date" value={demande.jour} onInput={(e) => maj({ jour: e.currentTarget.value })} />
            </Champ>
            <div class="rangee-champs">
              <Champ etiquette="Moment">
                <select value={demande.periode} onChange={(e) => maj({ periode: e.currentTarget.value as Periode | '' })}>
                  <option value="">Pas de moment</option>
                  {PERIODES.map((p) => (
                    <option key={p} value={p}>
                      {LIBELLES_PERIODE[p]}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ etiquette="Heure (facultatif)">
                <input type="time" value={demande.debut} onInput={(e) => maj({ debut: e.currentTarget.value })} />
              </Champ>
            </div>
          </>
        )}

        <fieldset class="groupe">
          <legend>Qui ?</legend>
          {donnees.personnes.length === 0 ? (
            <p class="discret">
              Aucune personne enregistrée : <a href="#/personnes">ajoute les personnes du voyage</a> pour voir ce qui convient à chacun.
            </p>
          ) : (
            <>
              {donnees.groupes.length > 0 && (
                <div class="chips" role="group" aria-label="Groupes">
                  {donnees.groupes.map((g) => {
                    const choisi = groupeComplet(g, idsQui);
                    return (
                      <label key={g.id} class={`chip${choisi ? ' choisi' : ''}`}>
                        <input
                          type="checkbox"
                          checked={choisi}
                          onChange={() => {
                            definirSurprise(null);
                            definirQui(choisi ? idsQui.filter((id) => !g.personneIds.includes(id)) : [...new Set([...idsQui, ...g.personneIds])]);
                          }}
                        />
                        <span>{g.nom}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div class="chips" role="group" aria-label="Personnes">
                {donnees.personnes.map((p) => {
                  const choisi = idsQui.includes(p.id);
                  return (
                    <label key={p.id} class={`chip${choisi ? ' choisi' : ''}`}>
                      <input
                        type="checkbox"
                        checked={choisi}
                        onChange={() => {
                          definirSurprise(null);
                          definirQui(choisi ? idsQui.filter((id) => id !== p.id) : [...idsQui, p.id]);
                        }}
                      />
                      <span>{p.prenom}</span>
                    </label>
                  );
                })}
              </div>
              <p class="champ-aide">
                {quiChoisi === null ? (jourOk || principal ? 'Par défaut : les personnes présentes ce jour-là.' : 'Choisis un jour, ou les personnes concernées, pour voir leurs contraintes.') : 'Choix manuel.'}{' '}
                {quiChoisi !== null && (
                  <button type="button" class="bouton secondaire petit" onClick={() => definirQui(null)}>
                    Revenir au choix automatique
                  </button>
                )}
              </p>
            </>
          )}
        </fieldset>

        <Champ etiquette="Mots-clés" aide="Sans accent ni majuscule : « vue wat arun », « marché », « rooftop »…">
          <input type="search" value={demande.mots} autocomplete="off" onInput={(e) => maj({ mots: e.currentTarget.value })} />
        </Champ>

        <details class="plus-options">
          <summary>Affiner : catégories, budget, durée, tri…</summary>
        <fieldset class="groupe">
          <legend>Quoi ? (sans choix : tout est proposé)</legend>
          <div class="chips">
            {CATEGORIES.map((c: Categorie) => {
              const actif = demande.categories.includes(c);
              return (
                <label key={c} class={`chip${actif ? ' choisi' : ''}`}>
                  <input
                    type="checkbox"
                    checked={actif}
                    onChange={() => maj({ categories: actif ? demande.categories.filter((x) => x !== c) : [...demande.categories, c] })}
                  />
                  {LIBELLES_CATEGORIE[c]}
                </label>
              );
            })}
          </div>
        </fieldset>


        <div class="rangee-champs">
          <Champ etiquette="Budget max par personne" aide="Monnaie du lieu (THB)">
            <input type="text" inputMode="decimal" value={budgetTxt} onInput={(e) => { definirSurprise(null); definirBudget(e.currentTarget.value); }} />
          </Champ>
          <Champ etiquette="Durée max (minutes)">
            <input type="text" inputMode="numeric" value={dureeTxt} onInput={(e) => { definirSurprise(null); definirDuree(e.currentTarget.value); }} />
          </Champ>
        </div>

        <fieldset class="groupe">
          <legend>À éviter ce jour</legend>
          <ChoixListe options={A_EVITER} libelles={LIBELLES_A_EVITER} valeur={aEviter} onChange={(v) => { definirSurprise(null); definirAEviter(v); }} legende="À éviter ce jour" />
          <p class="champ-aide">Réglage de base dans <a href="#/rythme">Rythme et préférences</a>. Seuls les lieux dont une source en parle sont signalés.</p>
        </fieldset>
        <fieldset class="groupe">
          <legend>Transport</legend>
          <ChoixListe options={MODES_TRAJET} libelles={LIBELLES_MODE} valeur={transports} onChange={(v) => { definirSurprise(null); definirTransports(v); }} legende="Transports acceptés" />
          <p class="champ-aide">Sans choix, tous. Seuls les lieux dont une source donne l'accès sont concernés.</p>
        </fieldset>
        <label class="interrupteur">
          <input type="checkbox" checked={masquer} onChange={(e) => { definirSurprise(null); definirMasquer(e.currentTarget.checked); }} />
          <span>Masquer les lieux qui contredisent clairement une contrainte (sinon : signalés avec la raison)</span>
        </label>
        <label class="interrupteur">
          <input type="checkbox" checked={demande.seulementOuverts} onChange={(e) => maj({ seulementOuverts: e.currentTarget.checked })} />
          <span>Seulement ce qui est ouvert à ce moment (« à vérifier » est gardé)</span>
        </label>
        <label class="interrupteur">
          <input type="checkbox" checked={cacherFaits} onChange={(e) => { definirSurprise(null); definirCacherFaits(e.currentTarget.checked); }} />
          <span>Cacher ce que j'ai déjà fait</span>
        </label>

        <Champ etiquette="Parmi">
          <select value={vue} onChange={(e) => { definirSurprise(null); definirVue(e.currentTarget.value as typeof vue); }}>
            <option value="tous">Tous les lieux</option>
            <option value="envies">Mes envies seulement</option>
            <option value="favoris">Mes favoris seulement</option>
          </select>
        </Champ>
        <Champ etiquette="Trier par" aide="Des critères visibles, jamais une opinion.">
          <select value={demande.tri} onChange={(e) => maj({ tri: e.currentTarget.value as Tri })}>
            {TRIS.map((t) => (
              <option key={t.cle} value={t.cle}>
                {t.libelle}
              </option>
            ))}
          </select>
        </Champ>
        </details>
      </form>

      <section aria-label="Résultats" class="pile">
        <div class="rangee">
          <strong>
            {propositions.length} lieu{propositions.length > 1 ? 'x' : ''}
          </strong>
          <button type="button" class="bouton secondaire petit" disabled={propositions.length === 0} onClick={tirerAuHasard}>
            Surprends-moi
          </button>
          {tirage && (
            <button type="button" class="bouton secondaire petit" onClick={() => definirSurprise(null)}>
              Voir toute la liste
            </button>
          )}
        </div>
        {jourOk && !principal && (
          <p class="discret">
            Ce jour : {activitesDuJour(donnees, demande.jour)} activité{activitesDuJour(donnees, demande.jour) > 1 ? 's' : ''} déjà prévue{activitesDuJour(donnees, demande.jour) > 1 ? 's' : ''}
            {reglages.rythme.activitesMax !== null ? ` sur ${reglages.rythme.activitesMax} souhaitée${reglages.rythme.activitesMax > 1 ? 's' : ''} (rythme réglé).` : '. Aucune limite réglée.'}
          </p>
        )}
        {depart ? (
          <p class="discret">Distances calculées depuis « {depart.nom} », à vol d'oiseau.</p>
        ) : (
          <p class="discret">{jourOk ? 'Aucun logement avec des coordonnées ce jour-là : les distances ne sont pas affichées.' : 'Choisis un jour pour voir les distances depuis ton logement.'}</p>
        )}
        {filtreVols && masquesVol > 0 && (
          <p class="attention-texte">
            {masquesVol} lieu{masquesVol > 1 ? 'x sont masqués' : ' est masqué'} : {masquesVol > 1 ? 'ils' : 'il'} t'empêcher{masquesVol > 1 ? 'aient' : 'ait'} d'attraper un de tes vols (trajet vers l'aéroport compris). Change l'heure ou le jour pour les revoir.
          </p>
        )}
        {filtreVols && masquesVol === 0 && <p class="discret">Les lieux qui t'empêcheraient d'attraper un de tes vols sont masqués ; aucun ne l'est pour ce moment.</p>}
        <p class="discret">Prix en monnaie locale, par personne. L'équivalent en euros viendra avec le taux de change (étape 8).</p>

        {affichees.length === 0 && (
          <section class="carte">
            <p>Aucun lieu ne correspond. Retire un filtre (catégorie, budget, durée, mots-clés) ou choisis « Partout ».</p>
          </section>
        )}
        {affichees.map((p) => (
          <CartePropositon key={p.lieu.id} p={p} taux={reglages.tauxChange} action={actionLibelle} actionActive={actionActive} surprise={tirage !== undefined} onAction={() => void choisir(p)} />
        ))}
      </section>

      <a class="bouton secondaire" href={lienNouveauLieu()}>
        Ajouter un lieu à ma base
      </a>
    </Page>
  );
}

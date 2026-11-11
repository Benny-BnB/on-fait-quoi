import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { echangerCreneaux, enregistrerCreneau, passerAuPlanB, supprimerCreneau, useStore } from '../data/store.ts';
import type { Creneau } from '../data/types.ts';
import { HUMEURS, LIBELLES_HUMEUR, LIBELLES_PERIODE, LIBELLES_STATUT_CRENEAU, LIBELLES_TYPE_EVENEMENT, PERIODES, STATUTS_CRENEAU, TYPES_EVENEMENT } from '../data/types.ts';
import { alternatifDe, cleTriCreneau, copierCreneau, creerAlternative, deviseDuJour, estPrincipal, libelleHoraire, zoneDuJour } from '../lib/creneaux.ts';
import { ajouterJours } from '../lib/sejour.ts';
import { aujourdhuiIso, dateValide, formatDateIso, fuseauTelephone, fuseauValide, heureValide, listeFuseaux } from '../lib/temps.ts';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';
import { ChoixParticipants } from './ChoixParticipants.tsx';
import { aller, lienCopie, lienCreneau, lienJour, lienPlanB } from './routeur.ts';

const IDEES = ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Plage', 'Piscine', 'Marché', 'Visite', 'Balade', 'Shopping', 'Spa', 'Repos', 'Soirée'];

// La saisie garde les nombres sous forme de texte pour qu'on puisse les effacer et les retaper librement
type Saisie = Omit<Creneau, 'budgetEstime' | 'budgetReel' | 'dureeMin'> & { estimeTxt: string; reelTxt: string; dureeTxt: string };

function versSaisie(c: Creneau): Saisie {
  const { budgetEstime, budgetReel, dureeMin, ...reste } = c;
  return {
    ...reste,
    participants: [...c.participants],
    estimeTxt: budgetEstime === null ? '' : String(budgetEstime),
    reelTxt: budgetReel === null ? '' : String(budgetReel),
    dureeTxt: dureeMin === null ? '' : String(dureeMin),
  };
}

const nombreOuNull = (texte: string): number | null => {
  const t = texte.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
};

// Construit un créneau à partir de la saisie, sans rien refuser
function brouillon(s: Saisie): Creneau {
  const { estimeTxt, reelTxt, dureeTxt, ...reste } = s;
  const budgetEstime = nombreOuNull(estimeTxt);
  const budgetReel = nombreOuNull(reelTxt);
  return {
    ...reste,
    titre: s.titre.trim(),
    note: s.note.trim(),
    fuseau: s.fuseau.trim(),
    budgetEstime,
    budgetReel,
    devise: budgetEstime === null && budgetReel === null ? '' : s.devise.trim().toUpperCase(),
    dureeMin: nombreOuNull(dureeTxt),
  };
}

function erreursCreneau(c: Creneau): string[] {
  const e: string[] = [];
  if (!c.titre) e.push('Donne un titre au créneau.');
  if (!dateValide(c.jour)) e.push('Jour manquant ou invalide.');
  if (c.debut !== '' && !heureValide(c.debut)) e.push('Heure de début invalide.');
  if (c.fin !== '' && !heureValide(c.fin)) e.push('Heure de fin invalide.');
  if (c.fin !== '' && c.debut === '') e.push('Une heure de fin demande une heure de début.');
  if (heureValide(c.debut) && heureValide(c.fin) && c.fin <= c.debut) e.push("L'heure de fin doit être après le début (même jour). Pour finir après minuit, coupe en deux créneaux.");
  if (!fuseauValide(c.fuseau)) e.push('Fuseau horaire inconnu (exemple : Asia/Bangkok).');
  for (const [nom, v] of [['estimé', c.budgetEstime], ['réel', c.budgetReel]] as const) {
    if (v !== null && (Number.isNaN(v) || v < 0)) e.push(`Budget ${nom} invalide.`);
  }
  if ((c.budgetEstime !== null || c.budgetReel !== null) && !/^[A-Z]{3}$/.test(c.devise)) e.push('Indique la devise du budget (3 lettres, exemple : THB).');
  if (c.dureeMin !== null && (Number.isNaN(c.dureeMin) || c.dureeMin < 0 || c.dureeMin > 1440)) e.push('La durée doit être entre 0 et 24 h (en minutes).');
  return e;
}

function Editeur(props: { initial: Creneau; nouveau: boolean }) {
  const { donnees } = useStore();
  const [saisie, definirSaisie] = useState<Saisie>(() => versSaisie(props.initial));
  const [tentative, definirTentative] = useState(false); // vrai après un premier essai d'enregistrement
  const [confirme, definirConfirme] = useState(false);
  const [echangeAvec, definirEchangeAvec] = useState('');
  const [fuseaux] = useState<string[]>(listeFuseaux);
  const maj = (partiel: Partial<Saisie>) => definirSaisie((s) => ({ ...s, ...partiel }));

  const propre = brouillon(saisie);
  const initial = props.initial;
  // Un événement fixe est imposé : on ne change sa date ni son heure sans confirmer
  const placeChangee = !props.nouveau && initial.fixe && (initial.jour !== propre.jour || initial.debut !== propre.debut || initial.fin !== propre.fin || initial.periode !== propre.periode);
  const problemes = [...erreursCreneau(propre), ...(placeChangee && !confirme ? ["Cet événement est imposé. Coche la case pour confirmer que sa date ou son heure a changé."] : [])];

  const principal = initial.planBDe !== '' ? donnees.creneaux.find((c) => c.id === initial.planBDe) : undefined;
  const alternatif = !props.nouveau && initial.planBDe === '' ? alternatifDe(donnees, initial.id) : undefined;

  // Changer de jour : le fuseau et la devise suivent le nouveau jour, sauf si tu les avais changés toi-même
  function changerJour(jour: string) {
    definirSaisie((s) => {
      const ancienneZone = zoneDuJour(s.jour, donnees.etapes, '');
      const nouvelleZone = zoneDuJour(jour, donnees.etapes, '');
      const ancienneDevise = deviseDuJour(donnees, s.jour);
      const nouvelleDevise = deviseDuJour(donnees, jour);
      return {
        ...s,
        jour,
        fuseau: nouvelleZone !== '' && (s.fuseau === ancienneZone || s.fuseau === '') ? nouvelleZone : s.fuseau,
        devise: nouvelleDevise !== '' && (s.devise === ancienneDevise || s.devise === '') ? nouvelleDevise : s.devise,
      };
    });
  }

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    if (problemes.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await enregistrerCreneau(propre);
    aller(lienJour(propre.jour));
  }

  // Les autres créneaux avec lesquels on peut échanger sa place
  const echangeables = donnees.creneaux
    .filter((c) => c.id !== initial.id && estPrincipal(c) && !c.fixe && c.statut !== 'fait' && c.statut !== 'annule')
    .sort((a, b) => a.jour.localeCompare(b.jour) || (cleTriCreneau(a) < cleTriCreneau(b) ? -1 : 1));

  return (
    <Page titre={props.nouveau ? 'Nouveau créneau' : 'Modifier le créneau'} retour={{ href: lienJour(initial.jour), libelle: 'Journée' }}>
      <form class="formulaire" onSubmit={enregistrer} noValidate>
        <ListeErreurs erreurs={tentative ? problemes : []} />

        {principal && (
          <div class="message info">
            Plan B de « {principal.titre} ». <a href={lienCreneau(principal.id)}>Ouvrir le principal</a>
          </div>
        )}

        <Champ etiquette="Quoi ?">
          <textarea rows={2} value={saisie.titre} placeholder="Plage, déjeuner, visite…" onInput={(e) => maj({ titre: e.currentTarget.value })} />
        </Champ>
        {props.nouveau && (
          <div class="rangee-boutons" aria-label="Idées rapides">
            {IDEES.map((i) => (
              <button type="button" class="bouton secondaire petit" key={i} onClick={() => maj({ titre: i })}>
                {i}
              </button>
            ))}
          </div>
        )}

        <fieldset class="groupe">
          <legend>Quand ?</legend>
          <Champ etiquette="Jour">
            <input type="date" value={saisie.jour} onInput={(e) => changerJour(e.currentTarget.value)} />
          </Champ>
          <div class="rangee-boutons">
            <button type="button" class="bouton secondaire petit" onClick={() => dateValide(saisie.jour) && changerJour(ajouterJours(saisie.jour, -1))}>
              ‹ Veille
            </button>
            <button type="button" class="bouton secondaire petit" onClick={() => dateValide(saisie.jour) && changerJour(ajouterJours(saisie.jour, 1))}>
              Lendemain ›
            </button>
          </div>
          <Champ etiquette="Période">
            <select value={saisie.periode} onChange={(e) => maj({ periode: e.currentTarget.value as Creneau['periode'] })}>
              <option value="">Aucune</option>
              {PERIODES.map((p) => (
                <option key={p} value={p}>
                  {LIBELLES_PERIODE[p]}
                </option>
              ))}
            </select>
          </Champ>
          <div class="rangee-champs">
            <Champ etiquette="Heure de début (facultatif)">
              <input type="time" value={saisie.debut} onInput={(e) => maj({ debut: e.currentTarget.value })} />
            </Champ>
            <Champ etiquette="Heure de fin (facultatif)">
              <input type="time" value={saisie.fin} onInput={(e) => maj({ fin: e.currentTarget.value })} />
            </Champ>
          </div>
        </fieldset>

        {placeChangee && (
          <label class="interrupteur">
            <input type="checkbox" checked={confirme} onChange={(e) => definirConfirme(e.currentTarget.checked)} />
            <span>Je confirme que cet événement imposé a changé de date ou d'heure</span>
          </label>
        )}

        <fieldset class="groupe">
          <legend>Qui ?</legend>
          <p class="champ-aide">Sans choix, ce sont les personnes présentes ce jour-là.</p>
          <ChoixParticipants personnes={donnees.personnes} valeur={saisie.participants} onChange={(ids) => maj({ participants: ids })} />
          {saisie.participants.length > 0 && (
            <button type="button" class="bouton secondaire petit" onClick={() => maj({ participants: [] })}>
              Comme la journée
            </button>
          )}
        </fieldset>

        <div class="rangee-champs">
          <Champ etiquette="Statut">
            <select value={saisie.statut} onChange={(e) => maj({ statut: e.currentTarget.value as Creneau['statut'] })}>
              {STATUTS_CRENEAU.map((s) => (
                <option key={s} value={s}>
                  {LIBELLES_STATUT_CRENEAU[s]}
                </option>
              ))}
            </select>
          </Champ>
          <Champ etiquette="Ambiance (facultatif)">
            <select value={saisie.humeur} onChange={(e) => maj({ humeur: e.currentTarget.value as Creneau['humeur'] })}>
              <option value="">—</option>
              {HUMEURS.map((h) => (
                <option key={h} value={h}>
                  {LIBELLES_HUMEUR[h]}
                </option>
              ))}
            </select>
          </Champ>
        </div>

        <fieldset class="groupe">
          <legend>Budget (facultatif)</legend>
          <p class="champ-aide">Montant total pour les participants.</p>
          <div class="rangee-champs">
            <Champ etiquette="Estimé">
              <input type="text" inputMode="decimal" value={saisie.estimeTxt} onInput={(e) => maj({ estimeTxt: e.currentTarget.value })} />
            </Champ>
            <Champ etiquette="Dépensé">
              <input type="text" inputMode="decimal" value={saisie.reelTxt} onInput={(e) => maj({ reelTxt: e.currentTarget.value })} />
            </Champ>
          </div>
          <Champ etiquette="Devise" aide="Code à 3 lettres : THB, AED, EUR…">
            <input type="text" value={saisie.devise} maxLength={3} placeholder="THB" autocomplete="off" spellcheck={false} onInput={(e) => maj({ devise: e.currentTarget.value })} />
          </Champ>
        </fieldset>

        <Champ etiquette="Note (facultatif)">
          <textarea rows={3} value={saisie.note} onInput={(e) => maj({ note: e.currentTarget.value })} />
        </Champ>

        <details class="plus-options">
          <summary>Plus d'options</summary>
          <Champ etiquette="Durée en minutes (si pas d'heure de fin)">
            <input type="number" min="0" inputMode="numeric" value={saisie.dureeTxt} onInput={(e) => maj({ dureeTxt: e.currentTarget.value })} />
          </Champ>
          <Champ etiquette="Fuseau horaire des heures saisies" aide="Celui du lieu où tu seras ce jour-là (rempli tout seul d'après l'étape).">
            <input type="text" list="liste-fuseaux-creneau" value={saisie.fuseau} autocomplete="off" spellcheck={false} onInput={(e) => maj({ fuseau: e.currentTarget.value })} />
          </Champ>
          <datalist id="liste-fuseaux-creneau">
            {fuseaux.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          {initial.fixe && (
            <Champ etiquette="Type d'événement">
              <select value={saisie.typeEvenement} onChange={(e) => maj({ typeEvenement: e.currentTarget.value as Creneau['typeEvenement'] })}>
                <option value="">—</option>
                {TYPES_EVENEMENT.map((t) => (
                  <option key={t} value={t}>
                    {LIBELLES_TYPE_EVENEMENT[t]}
                  </option>
                ))}
              </select>
            </Champ>
          )}
        </details>

        <button type="submit" class="bouton">
          Enregistrer
        </button>
        <a class="bouton secondaire" href={lienJour(initial.jour)}>
          Annuler
        </a>

        {!props.nouveau && (
          <fieldset class="groupe">
            <legend>Changer d'avis</legend>

            {initial.planBDe === '' && !alternatif && (
              <a class="bouton secondaire petit" href={lienPlanB(initial.id)}>
                Ajouter un plan B
              </a>
            )}
            {alternatif && (
              <>
                <a class="sous-carte" href={lienCreneau(alternatif.id)}>
                  <strong>Plan B : {alternatif.titre || 'à définir'}</strong>
                </a>
                <button
                  type="button"
                  class="bouton secondaire petit"
                  onClick={async () => {
                    await passerAuPlanB(alternatif.id);
                    aller(lienJour(initial.jour));
                  }}
                >
                  Passer au plan B
                </button>
              </>
            )}
            {principal && (
              <button
                type="button"
                class="bouton secondaire petit"
                onClick={async () => {
                  await passerAuPlanB(initial.id);
                  aller(lienJour(initial.jour));
                }}
              >
                Passer à ce plan B
              </button>
            )}

            <a class="bouton secondaire petit" href={lienCopie(initial.id)}>
              Dupliquer
            </a>

            {!initial.fixe && initial.planBDe === '' && (
              <>
                <Champ etiquette="Échanger sa place avec…">
                  <select value={echangeAvec} onChange={(e) => definirEchangeAvec(e.currentTarget.value)}>
                    <option value="">Choisir un autre créneau</option>
                    {echangeables.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatDateIso(c.jour)} · {libelleHoraire(c)} · {c.titre}
                      </option>
                    ))}
                  </select>
                </Champ>
                <button
                  type="button"
                  class="bouton secondaire petit"
                  disabled={echangeAvec === ''}
                  onClick={async () => {
                    await echangerCreneaux(initial.id, echangeAvec);
                    aller(lienJour(initial.jour));
                  }}
                >
                  Échanger les places
                </button>
              </>
            )}

            {initial.debut !== '' && (
              <a class="bouton secondaire petit" href={`#/compteurs/nouveau/${encodeURIComponent(`creneau:${initial.id}`)}`}>
                Ajouter un compteur sur ce créneau
              </a>
            )}
          </fieldset>
        )}

        {!props.nouveau && (
          <BoutonConfirme
            libelle="Supprimer ce créneau"
            question="Supprimer ce créneau ? Son plan B, s'il en a un, devient un créneau normal."
            oui="Oui, supprimer"
            onConfirme={async () => {
              await supprimerCreneau(initial.id);
              aller(lienJour(initial.jour));
            }}
          />
        )}
      </form>
    </Page>
  );
}

export function FormulaireCreneau(props: { id: string; mode?: 'jour' | 'planb' | 'copie'; reference?: string; periode?: string }) {
  const { donnees } = useStore();
  const nouveau = props.id === 'nouveau';
  const introuvable = (
    <Page titre="Créneau introuvable" retour={{ href: '#/planning', libelle: 'Planning' }}>
      <section class="carte">
        <p>Ce créneau n'existe pas (ou a été supprimé).</p>
      </section>
    </Page>
  );

  if (!nouveau) {
    const existant = donnees.creneaux.find((c) => c.id === props.id);
    return existant ? <Editeur key={props.id} initial={existant} nouveau={false} /> : introuvable;
  }

  let initial: Creneau;
  if (props.mode === 'planb' || props.mode === 'copie') {
    const source = donnees.creneaux.find((c) => c.id === props.reference);
    if (!source) return introuvable;
    initial = props.mode === 'planb' ? creerAlternative(source, nouvelId('creneau')) : copierCreneau(source, nouvelId('creneau'));
  } else {
    const jour = props.reference && dateValide(props.reference) ? props.reference : aujourdhuiIso();
    const periode = PERIODES.find((p) => p === props.periode) ?? '';
    initial = {
      id: nouvelId('creneau'),
      jour,
      periode,
      debut: '',
      fin: '',
      fuseau: zoneDuJour(jour, donnees.etapes, fuseauTelephone()),
      titre: '',
      note: '',
      statut: 'prevu',
      humeur: '',
      participants: [],
      budgetEstime: null,
      budgetReel: null,
      devise: deviseDuJour(donnees, jour),
      dureeMin: null,
      planBDe: '',
      fixe: false,
      typeEvenement: '',
    };
  }
  return <Editeur key={`${props.id}-${props.mode ?? ''}-${props.reference ?? ''}-${props.periode ?? ''}`} initial={initial} nouveau />;
}

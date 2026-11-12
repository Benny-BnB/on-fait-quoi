import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { estLieuPerso, LIEUX_PUBLICS, trouverLieu } from '../data/lieux-publics.ts';
import { enregistrerCreneau, modifierSuiviLieu, supprimerLieuPerso, useStore } from '../data/store.ts';
import type { Lieu, Periode, SouhaitLieu } from '../data/types.ts';
import { LIBELLES_CATEGORIE, LIBELLES_MODE, LIBELLES_PERIODE, PERIODES } from '../data/types.ts';
import { libelleEuro } from '../lib/budget.ts';
import { deviseDuJour } from '../lib/creneaux.ts';
import { creneauDepuisLieu, faitsAVerifier, fraicheurLieu, lieuxDeLaZone, ouvertA, ouvertLe } from '../lib/lieux.ts';
import { liensCartes, lienSur } from '../lib/sejour.ts';
import { aujourdhuiIso, dateValide, formatDateIso, heureValide } from '../lib/temps.ts';
import { BadgeOuverture, Fait, libelleDuree, libellePrix, TableauHoraires } from './AffichageLieu.tsx';
import { BoutonConfirme, Champ, Page } from './commun.tsx';
import { aller, lienJour, lienModifierLieu, lienQuoiFaire } from './routeur.ts';

// Jour proposé pour ajouter le lieu au planning : aujourd'hui s'il est dans une étape de la zone du lieu, sinon le début de la prochaine
function jourPropose(l: Lieu, etapes: { nom: string; debut: string; fin: string }[], aujourdhui: string): string {
  const etapesDuLieu = etapes.filter((e) => lieuxDeLaZone([l], e.nom).length > 0 && dateValide(e.debut) && dateValide(e.fin)).sort((a, b) => a.debut.localeCompare(b.debut));
  const encours = etapesDuLieu.find((e) => e.debut <= aujourdhui && aujourdhui <= e.fin);
  if (encours) return aujourdhui;
  return etapesDuLieu.find((e) => e.debut > aujourdhui)?.debut ?? etapesDuLieu[0]?.debut ?? '';
}

function MesEnvies(props: { lieuId: string }) {
  const { donnees } = useStore();
  const suivi = donnees.suiviLieux.find((s) => s.lieuId === props.lieuId);
  const souhait: SouhaitLieu = suivi?.souhait ?? '';
  const [note, definirNote] = useState(suivi?.note ?? '');
  return (
    <section class="carte formulaire">
      <h2>Mes envies</h2>
      <p class="discret">Reste sur ton téléphone : rien de tout ça n'est publié.</p>
      <Champ etiquette="Envie">
        <select value={souhait} onChange={(e) => void modifierSuiviLieu(props.lieuId, { souhait: e.currentTarget.value as SouhaitLieu })}>
          <option value="">Pas d'envie particulière</option>
          <option value="souhait">J'ai envie d'y aller</option>
          <option value="prioritaire">Prioritaire</option>
        </select>
      </Champ>
      <div class="rangee">
        <button type="button" class={`bouton ${suivi?.favori ? '' : 'secondaire'}`} aria-pressed={suivi?.favori ?? false} onClick={() => void modifierSuiviLieu(props.lieuId, { favori: !(suivi?.favori ?? false) })}>
          {suivi?.favori ? '★ Favori' : '☆ Favori'}
        </button>
        <button type="button" class={`bouton ${suivi?.fait ? '' : 'secondaire'}`} aria-pressed={suivi?.fait ?? false} onClick={() => void modifierSuiviLieu(props.lieuId, { fait: !(suivi?.fait ?? false) })}>
          {suivi?.fait ? '✓ Déjà fait' : 'Déjà fait ?'}
        </button>
      </div>
      <Champ etiquette="Ma note (facultatif)" aide="Par exemple : y aller en fin d'après-midi, tenue à prévoir.">
        <textarea rows={3} value={note} onInput={(e) => definirNote(e.currentTarget.value)} onBlur={() => void modifierSuiviLieu(props.lieuId, { note })} />
      </Champ>
    </section>
  );
}

function AjouterAuPlanning(props: { lieu: Lieu }) {
  const { donnees } = useStore();
  const l = props.lieu;
  const aujourdhui = aujourdhuiIso();
  const [jour, definirJour] = useState(() => jourPropose(l, donnees.etapes, aujourdhui));
  const [periode, definirPeriode] = useState<Periode | ''>('');
  const [debut, definirDebut] = useState('');

  const jourOk = dateValide(jour);
  const heureOk = debut === '' || heureValide(debut);
  const ouverture = jourOk && heureOk ? (debut !== '' ? ouvertA(l, jour, debut) : ouvertLe(l, jour)) : null;

  async function ajouter(ev: Event) {
    ev.preventDefault();
    if (!jourOk || !heureOk) return;
    const devise = l.prix?.devise ?? deviseDuJour(donnees, jour);
    await enregistrerCreneau(creneauDepuisLieu(l, nouvelId('creneau'), jour, periode, debut, devise));
    aller(lienJour(jour));
  }

  return (
    <form class="carte formulaire" onSubmit={ajouter} noValidate>
      <h2>Ajouter au planning</h2>
      <p class="discret">Le créneau est créé comme une idée : tu pourras le modifier, le confirmer ou lui donner un plan B.</p>
      <Champ etiquette="Jour">
        <input type="date" value={jour} onInput={(e) => definirJour(e.currentTarget.value)} />
      </Champ>
      <div class="rangee-champs">
        <Champ etiquette="Moment">
          <select value={periode} onChange={(e) => definirPeriode(e.currentTarget.value as Periode | '')}>
            <option value="">Pas de moment</option>
            {PERIODES.map((p) => (
              <option key={p} value={p}>
                {LIBELLES_PERIODE[p]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ etiquette="Heure (facultatif)">
          <input type="time" value={debut} onInput={(e) => definirDebut(e.currentTarget.value)} />
        </Champ>
      </div>
      {ouverture && (
        <div>
          <span class="discret">Ce jour-là : </span>
          <BadgeOuverture o={ouverture} />
        </div>
      )}
      <button type="submit" class="bouton" disabled={!jourOk || !heureOk}>
        Ajouter au {jourOk ? formatDateIso(jour) : 'planning'}
      </button>
    </form>
  );
}

export function FicheLieu(props: { id: string }) {
  const { donnees } = useStore();
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

  const aVerifier = faitsAVerifier(l);
  const perso = estLieuPerso(donnees, l.id);
  const fichePublique = LIEUX_PUBLICS.some((x) => x.id === l.id);
  const cartes = liensCartes({ nom: l.nom, adresse: l.adresse, gps: l.gps ? { lat: l.gps.lat, lng: l.gps.lng } : null });
  const lienOfficiel = lienSur(l.lienOfficiel);
  const reservation = l.reservation;
  const tauxPrix = l.prix ? donnees.reglages.tauxChange.find((t) => t.devise === l.prix?.devise) : undefined;
  const euro = l.prix ? libelleEuro(l.prix.min, l.prix.devise, donnees.reglages.tauxChange) : null;
  const euroMax = l.prix ? libelleEuro(l.prix.max, l.prix.devise, donnees.reglages.tauxChange) : null;
  const lienReservation = reservation ? lienSur(reservation.lien) : null;

  return (
    <Page titre={l.nom} retour={{ href: lienQuoiFaire(), libelle: 'Quoi faire ?' }}>
      <section class="carte">
        <p class="discret">
          {[l.zone, l.quartier].filter((x) => x !== '').join(' · ')}
        </p>
        <span class="etiquettes-ligne">
          {l.categories.map((c) => (
            <span class="etiquette" key={c}>
              {LIBELLES_CATEGORIE[c]}
            </span>
          ))}
          {l.interieur !== '' && <span class="etiquette">{l.interieur === 'interieur' ? 'À l’intérieur' : l.interieur === 'exterieur' ? 'En extérieur' : 'Intérieur et extérieur'}</span>}
        </span>
        {l.description !== '' && <p>{l.description}</p>}
        <p class="discret">
          {fraicheurLieu(l, aujourdhuiIso())}
          {l.verifieLe !== '' && ` (${formatDateIso(l.verifieLe)})`}
          {perso && ' · fiche ajoutée ou corrigée par toi'}
        </p>
        {aVerifier.length > 0 && (
          <div class="message attention" role="status">
            <strong>À vérifier : {aVerifier.join(', ')}.</strong>
            <span>Ces informations n'ont pas de source : l'app ne les invente pas.</span>
          </div>
        )}
      </section>

      <MesEnvies key={l.id} lieuId={l.id} />
      <AjouterAuPlanning key={`plan-${l.id}`} lieu={l} />

      <section class="carte">
        <h2>Les informations</h2>
        {l.incontournable && <Fait titre="Incontournable" valeur={l.incontournable.raison} source={l.incontournable.source} confirme etiquetteNonConfirme="" />}
        <Fait titre="Horaires" valeur={l.horaires ? <TableauHoraires h={l.horaires} /> : null} source={l.horaires?.source} etiquetteNonConfirme="À confirmer (source secondaire)" />
        <Fait
          titre="Prix"
          valeur={l.prix ? `${libellePrix(l.prix)}${euro ? ` (${euro}${euroMax && l.prix.max !== l.prix.min ? ` à ${euroMax}` : ''})` : ''}` : null}
          note={[l.prix?.note, euro && tauxPrix ? `Équivalent en euros d'après ton taux du ${formatDateIso(tauxPrix.date)} (${tauxPrix.source}).` : l.prix && l.prix.devise !== 'EUR' ? 'Équivalent en euros : saisis le taux de change dans les Réglages.' : ''].filter((x) => x && x !== '').join(' ') || undefined}
          source={l.prix?.source}
          etiquetteNonConfirme="À vérifier (source secondaire)"
        />
        <Fait titre="Durée de la visite" valeur={l.duree ? libelleDuree(l.duree) : null} note={l.duree?.estimee ? `Estimée : ${l.duree.base}` : l.duree?.base || undefined} source={l.duree?.source} />
        <Fait
          titre="Réservation"
          valeur={
            reservation === null
              ? null
              : (
                <>
                  {reservation.necessaire === true ? 'Réservation nécessaire' : reservation.necessaire === false ? 'Pas de réservation nécessaire' : 'Obligatoire ou non : à vérifier'}
                  {lienReservation && (
                    <a href={lienReservation} target="_blank" rel="noopener noreferrer">
                      Réserver en ligne ›
                    </a>
                  )}
                </>
              )
          }
          note={reservation?.note}
          source={reservation?.source}
        />
        <Fait titre="Tenue" valeur={l.tenue ? l.tenue.texte : null} source={l.tenue?.source} />
        {l.attention.map((a) => (
          <Fait key={`${a.genre}:${a.texte}`} titre={a.genre === 'foule' ? 'Foule' : a.genre === 'chaleur' ? 'Chaleur' : 'Activité extrême'} valeur={a.texte} source={a.source} />
        ))}
        {l.acces.map((a) => (
          <Fait key={`acces:${a.texte}`} titre={`Accès : ${a.modes.map((m) => LIBELLES_MODE[m].toLowerCase()).join(', ')}`} valeur={a.texte} source={a.source} />
        ))}
        {l.public && <Fait titre="Pour qui" valeur={l.public.texte} source={l.public.source} />}
        <Fait titre="Adresse" valeur={l.adresse !== '' ? l.adresse : null} />
        <Fait titre="Emplacement GPS" valeur={l.gps ? `${l.gps.lat}, ${l.gps.lng}` : null} source={l.gps?.source} />
        {cartes && (
          <div class="rangee">
            <a class="bouton secondaire petit" href={cartes.plans} target="_blank" rel="noopener noreferrer">
              Plans
            </a>
            <a class="bouton secondaire petit" href={cartes.google} target="_blank" rel="noopener noreferrer">
              Google Maps
            </a>
          </div>
        )}
        {l.notes !== '' && (
          <div class="fait">
            <span class="fait-titre">Notes</span>
            <span>{l.notes}</span>
          </div>
        )}
        <div class="fait">
          <span class="fait-titre">Site officiel</span>
          {lienOfficiel ? (
            <a href={lienOfficiel} target="_blank" rel="noopener noreferrer">
              {lienOfficiel}
            </a>
          ) : (
            <span class="attention-texte">Aucun site officiel trouvé : à vérifier</span>
          )}
        </div>
      </section>

      <section class="carte formulaire">
        <h2>Cette fiche</h2>
        <a class="bouton secondaire" href={lienModifierLieu(l.id)}>
          {perso ? 'Modifier ma fiche' : 'Corriger cette fiche (ma version)'}
        </a>
        {perso && (
          <BoutonConfirme
            libelle="Supprimer ma fiche"
            question={
              fichePublique
                ? 'Supprimer ta version ? La fiche publique de base reviendra à la place. Tes envies et tes notes sur ce lieu sont gardées.'
                : 'Supprimer ta fiche ? Tes envies et ta note sur ce lieu sont supprimées aussi ; les créneaux gardent leur titre.'
            }
            oui="Oui, supprimer"
            onConfirme={async () => {
              await supprimerLieuPerso(l.id, fichePublique);
              aller(lienQuoiFaire());
            }}
          />
        )}
      </section>
    </Page>
  );
}

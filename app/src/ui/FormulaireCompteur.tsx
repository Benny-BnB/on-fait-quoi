import { useState } from 'preact/hooks';
import { nouvelId } from '../data/defauts.ts';
import { enregistrerCompteur, supprimerCompteur, useStore } from '../data/store.ts';
import type { CibleCompteur, Compteur } from '../data/types.ts';
import { ID_PROCHAIN_VOL } from '../data/types.ts';
import { creneauxDatables } from '../lib/creneaux.ts';
import { dateValide, formatDateHeureDansFuseau, formatDateIso, formatDureeMin, fuseauTelephone, fuseauValide, heureValide, listeFuseaux } from '../lib/temps.ts';
import { libelleVol, volsTries } from '../lib/vols.ts';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';
import { aller } from './routeur.ts';

function Editeur(props: { initial: Compteur; nouveau: boolean }) {
  const { donnees } = useStore();
  const [compteur, definirCompteur] = useState<Compteur>(props.initial);
  const [heures, definirHeures] = useState<string>(String(Math.floor(props.initial.delaiMin / 60)));
  const [minutes, definirMinutes] = useState<string>(String(props.initial.delaiMin % 60));
  const [tentative, definirTentative] = useState(false); // vrai après un premier essai d'enregistrement
  const [fuseaux] = useState<string[]>(listeFuseaux);

  const vols = volsTries(donnees.vols);
  const cible = compteur.cible;
  const maj = (partiel: Partial<Compteur>) => definirCompteur((c) => ({ ...c, ...partiel }));

  function choisirType(type: 'vol' | 'libre' | 'creneau') {
    const nouvelle: CibleCompteur =
      type === 'vol'
        ? { type: 'vol', volId: vols[0]?.id ?? '' }
        : type === 'creneau'
          ? { type: 'creneau', cle: '' }
          : { type: 'libre', date: '', heure: '', fuseau: fuseauTelephone() };
    maj({ cible: nouvelle });
  }

  function choisirCreneau(cle: string) {
    const c = datables.find((x) => x.cle === cle);
    maj({ cible: { type: 'creneau', cle }, libelle: compteur.libelle || (c ? c.titre : '') });
  }

  function choisirVol(volId: string) {
    const v = donnees.vols.find((x) => x.id === volId);
    maj({ cible: { type: 'vol', volId }, libelle: compteur.libelle || (v ? libelleVol(v) : '') });
  }

  function fixerDelai(totalMin: number) {
    definirHeures(String(Math.floor(totalMin / 60)));
    definirMinutes(String(totalMin % 60));
  }

  const volChoisi = cible.type === 'vol' ? donnees.vols.find((v) => v.id === cible.volId) : undefined;
  // Les créneaux du planning qui ont une heure (imposés ou libres), à venir ou déjà choisis
  const datables = creneauxDatables(donnees);
  const creneauChoisi = cible.type === 'creneau' ? datables.find((x) => x.cle === cible.cle) : undefined;
  const creneauxProposes = datables.filter((x) => x.debutMs > Date.now() - 24 * 3600 * 1000 || x.cle === (cible.type === 'creneau' ? cible.cle : ''));

  const problemes: string[] = [];
  const delaiMin = (Number.parseInt(heures || '0', 10) || 0) * 60 + (Number.parseInt(minutes || '0', 10) || 0);
  if (!compteur.libelle.trim()) problemes.push('Donne un nom au compteur.');
  if (delaiMin < 0 || delaiMin > 7 * 24 * 60) problemes.push('Le délai doit être entre 0 et 7 jours.');
  if (cible.type === 'vol' && !volChoisi) problemes.push('Choisis un vol.');
  if (cible.type === 'creneau' && !creneauChoisi) problemes.push('Choisis un créneau.');
  if (cible.type === 'libre') {
    if (!dateValide(cible.date)) problemes.push('Date manquante ou invalide.');
    if (!heureValide(cible.heure)) problemes.push('Heure manquante ou invalide.');
    if (!fuseauValide(cible.fuseau)) problemes.push('Fuseau horaire inconnu (exemple : Europe/Brussels).');
  }

  async function enregistrer(e: Event) {
    e.preventDefault();
    definirTentative(true);
    if (problemes.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await enregistrerCompteur({ ...compteur, libelle: compteur.libelle.trim(), delaiMin });
    aller('#/compteurs');
  }

  return (
    <Page titre={props.nouveau ? 'Nouveau compteur' : 'Modifier le compteur'} retour={{ href: '#/compteurs', libelle: 'Compteurs' }}>
      <form class="formulaire" onSubmit={enregistrer} noValidate>
        <ListeErreurs erreurs={tentative ? problemes : []} />

        {props.nouveau && (
          <fieldset class="groupe">
            <legend>Ce compteur compte jusqu'à…</legend>
            <label class="choix">
              <input type="radio" name="type" checked={cible.type === 'vol'} onChange={() => choisirType('vol')} />
              <span>Un vol</span>
            </label>
            <label class="choix">
              <input type="radio" name="type" checked={cible.type === 'libre'} onChange={() => choisirType('libre')} />
              <span>Une date et une heure à choisir</span>
            </label>
            <label class="choix">
              <input type="radio" name="type" checked={cible.type === 'creneau'} onChange={() => choisirType('creneau')} />
              <span>Un créneau du planning</span>
            </label>
          </fieldset>
        )}

        {cible.type === 'vol' && (
          <Champ etiquette="Vol">
            <select value={cible.volId} onChange={(e) => choisirVol(e.currentTarget.value)}>
              {vols.length === 0 && <option value="">Aucun vol enregistré</option>}
              {!volChoisi && cible.volId !== '' && <option value={cible.volId}>Vol introuvable</option>}
              {vols.map((v) => (
                <option key={v.id} value={v.id}>
                  {libelleVol(v)} · {formatDateIso(v.depart.date)}
                </option>
              ))}
            </select>
          </Champ>
        )}

        {cible.type === 'creneau' && (
          <Champ etiquette="Créneau" aide="Seuls les créneaux qui ont une heure précise peuvent avoir un compteur.">
            <select value={cible.cle} onChange={(e) => choisirCreneau(e.currentTarget.value)}>
              <option value="">Choisir un créneau</option>
              {cible.cle !== '' && !creneauChoisi && <option value={cible.cle}>Créneau introuvable</option>}
              {creneauxProposes.map((x) => (
                <option key={x.cle} value={x.cle}>
                  {formatDateHeureDansFuseau(x.debutMs, x.fuseau)} · {x.titre}
                </option>
              ))}
            </select>
          </Champ>
        )}

        {cible.type === 'libre' && (
          <>
            <div class="rangee-champs">
              <Champ etiquette="Date">
                <input type="date" value={cible.date} onInput={(e) => maj({ cible: { ...cible, date: e.currentTarget.value } })} />
              </Champ>
              <Champ etiquette="Heure">
                <input type="time" value={cible.heure} onInput={(e) => maj({ cible: { ...cible, heure: e.currentTarget.value } })} />
              </Champ>
            </div>
            <Champ etiquette="Fuseau horaire" aide="Par défaut, celui de ton téléphone aujourd'hui. Change-le si l'heure est celle d'une autre ville.">
              <input
                type="text"
                list="liste-fuseaux-compteur"
                value={cible.fuseau}
                autocomplete="off"
                spellcheck={false}
                onInput={(e) => maj({ cible: { ...cible, fuseau: e.currentTarget.value } })}
              />
            </Champ>
            <datalist id="liste-fuseaux-compteur">
              {fuseaux.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </>
        )}

        <Champ etiquette="Nom du compteur">
          <input type="text" value={compteur.libelle} onInput={(e) => maj({ libelle: e.currentTarget.value })} />
        </Champ>

        <fieldset class="groupe">
          <legend>Délai avant l'heure</legend>
          <p class="champ-aide">Par exemple 3 h pour « être à l'aéroport ». 0 = à l'heure exacte.</p>
          <div class="rangee-champs">
            <Champ etiquette="Heures">
              <input type="number" min="0" max="168" inputMode="numeric" value={heures} onInput={(e) => definirHeures(e.currentTarget.value)} />
            </Champ>
            <Champ etiquette="Minutes">
              <input type="number" min="0" max="59" inputMode="numeric" value={minutes} onInput={(e) => definirMinutes(e.currentTarget.value)} />
            </Champ>
          </div>
          <div class="rangee-boutons">
            <button type="button" class="bouton secondaire petit" onClick={() => fixerDelai(0)}>
              À l'heure
            </button>
            <button type="button" class="bouton secondaire petit" onClick={() => fixerDelai(60)}>
              1 h avant
            </button>
            <button type="button" class="bouton secondaire petit" onClick={() => fixerDelai(180)}>
              3 h avant
            </button>
            {volChoisi && (
              <button type="button" class="bouton secondaire petit" onClick={() => fixerDelai(donnees.reglages.delaiAeroportMin[volChoisi.portee])}>
                Arrivée à l'aéroport ({formatDureeMin(donnees.reglages.delaiAeroportMin[volChoisi.portee])})
              </button>
            )}
          </div>
        </fieldset>

        <label class="interrupteur">
          <input type="checkbox" checked={compteur.visible} onChange={(e) => maj({ visible: e.currentTarget.checked })} />
          <span>Afficher sur l'accueil</span>
        </label>

        <button type="submit" class="bouton">
          Enregistrer
        </button>
        <a class="bouton secondaire" href="#/compteurs">
          Annuler
        </a>
        {!props.nouveau && props.initial.id !== ID_PROCHAIN_VOL && (
          <BoutonConfirme
            libelle="Supprimer ce compteur"
            question="Supprimer ce compteur ?"
            oui="Oui, supprimer"
            onConfirme={async () => {
              await supprimerCompteur(props.initial.id);
              aller('#/compteurs');
            }}
          />
        )}
      </form>
    </Page>
  );
}

export function FormulaireCompteur(props: { id: string; cle?: string }) {
  const { donnees } = useStore();
  const nouveau = props.id === 'nouveau';
  const existant = nouveau ? undefined : donnees.compteurs.find((c) => c.id === props.id);
  if (!nouveau && !existant) {
    return (
      <Page titre="Compteur introuvable" retour={{ href: '#/compteurs', libelle: 'Compteurs' }}>
        <section class="carte">
          <p>Ce compteur n'existe pas (ou a été supprimé).</p>
        </section>
      </Page>
    );
  }
  // Lancé depuis la fiche d'un créneau : le compteur vise déjà ce créneau
  const creneauVise = props.cle ? creneauxDatables(donnees).find((x) => x.cle === props.cle) : undefined;
  const vide: Compteur = {
    id: nouvelId('compteur'),
    libelle: creneauVise ? creneauVise.titre : '',
    cible: props.cle ? { type: 'creneau', cle: props.cle } : { type: 'vol', volId: volsTries(donnees.vols)[0]?.id ?? '' },
    visible: true,
    delaiMin: 0,
  };
  return <Editeur key={`${props.id}-${props.cle ?? ''}`} initial={existant ?? vide} nouveau={nouveau} />;
}

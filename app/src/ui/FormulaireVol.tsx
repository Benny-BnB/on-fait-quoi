import { useState } from 'preact/hooks';
import { AEROPORTS_CONNUS } from '../data/aeroports.ts';
import { nouvelId } from '../data/defauts.ts';
import { enregistrerVol, supprimerVol, useStore } from '../data/store.ts';
import type { Aeroport, Vol } from '../data/types.ts';
import { LIBELLES_PORTEE, LIBELLES_STATUT, PORTEES, STATUTS_VOL } from '../data/types.ts';
import { dateValide, formatDureeMin, formatUtc, fuseauValide, heureValide, listeFuseaux } from '../lib/temps.ts';
import { dureeVolMin, instantDepart } from '../lib/vols.ts';
import { BoutonConfirme, Champ, ListeErreurs, Page } from './commun.tsx';
import { aller } from './routeur.ts';

function aeroportVide(): Aeroport {
  return { code: '', ville: '', date: '', heure: '', fuseau: '', terminal: '' };
}

function volVide(): Vol {
  return {
    id: nouvelId('vol'),
    compagnie: '',
    numero: '',
    reference: '',
    depart: aeroportVide(),
    arrivee: aeroportVide(),
    portee: 'international',
    passagers: '',
    pourMoi: true,
    statut: 'confirme',
    notes: '',
  };
}

function nettoyerAeroport(a: Aeroport): Aeroport {
  return {
    code: a.code.trim().toUpperCase(),
    ville: a.ville.trim(),
    date: a.date.trim(),
    heure: a.heure.trim(),
    fuseau: a.fuseau.trim(),
    terminal: a.terminal.trim(),
  };
}

function nettoyer(v: Vol): Vol {
  return {
    ...v,
    compagnie: v.compagnie.trim(),
    numero: v.numero.trim().toUpperCase(),
    reference: v.reference.trim().toUpperCase(),
    depart: nettoyerAeroport(v.depart),
    arrivee: nettoyerAeroport(v.arrivee),
    passagers: v.passagers.trim(),
    notes: v.notes.trim(),
  };
}

function erreursVol(v: Vol): string[] {
  const e: string[] = [];
  if (!v.numero) e.push('Indique le numéro de vol.');
  for (const [quel, nom] of [
    ['depart', 'Départ'],
    ['arrivee', 'Arrivée'],
  ] as const) {
    const a = v[quel];
    if (!/^[A-Z]{3}$/.test(a.code)) e.push(`${nom} : le code d'aéroport doit avoir 3 lettres (exemple : BRU).`);
    if (!dateValide(a.date)) e.push(`${nom} : date manquante ou invalide.`);
    if (!heureValide(a.heure)) e.push(`${nom} : heure manquante ou invalide.`);
    if (!fuseauValide(a.fuseau)) e.push(`${nom} : fuseau horaire inconnu (exemple : Europe/Brussels).`);
  }
  if (e.length === 0 && !(dureeVolMin(v) > 0)) {
    e.push("L'arrivée doit être après le départ. Les heures sont celles de chaque ville (heure locale), avec le fuseau de chaque ville.");
  }
  return e;
}

function ChampsAeroport(props: {
  titre: string;
  aeroport: Aeroport;
  onCode: (saisie: string) => void;
  onChange: (partiel: Partial<Aeroport>) => void;
}) {
  const a = props.aeroport;
  return (
    <fieldset class="groupe">
      <legend>{props.titre}</legend>
      <div class="rangee-champs">
        <Champ etiquette="Code de l'aéroport">
          <input
            type="text"
            value={a.code}
            maxLength={3}
            placeholder="BRU"
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => props.onCode(e.currentTarget.value)}
          />
        </Champ>
        <Champ etiquette="Ville (facultatif)">
          <input type="text" value={a.ville} onInput={(e) => props.onChange({ ville: e.currentTarget.value })} />
        </Champ>
      </div>
      <div class="rangee-champs">
        <Champ etiquette="Date (heure locale)">
          <input type="date" value={a.date} onInput={(e) => props.onChange({ date: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Heure locale">
          <input type="time" value={a.heure} onInput={(e) => props.onChange({ heure: e.currentTarget.value })} />
        </Champ>
      </div>
      <Champ etiquette="Fuseau horaire" aide="Le fuseau de cette ville, pas celui de ton téléphone. Il se remplit tout seul pour les aéroports courants.">
        <input
          type="text"
          list="liste-fuseaux"
          value={a.fuseau}
          placeholder="Europe/Brussels"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => props.onChange({ fuseau: e.currentTarget.value })}
        />
      </Champ>
      <Champ etiquette="Terminal (facultatif)">
        <input type="text" value={a.terminal} onInput={(e) => props.onChange({ terminal: e.currentTarget.value })} />
      </Champ>
    </fieldset>
  );
}

function Editeur(props: { initial: Vol; nouveau: boolean }) {
  const [vol, definirVol] = useState<Vol>(props.initial);
  const [tentative, definirTentative] = useState(false); // vrai après un premier essai d'enregistrement
  const [fuseaux] = useState<string[]>(listeFuseaux);

  const maj = (partiel: Partial<Vol>) => definirVol((v) => ({ ...v, ...partiel }));
  const majAeroport = (quel: 'depart' | 'arrivee', partiel: Partial<Aeroport>) =>
    definirVol((v) =>
      quel === 'depart' ? { ...v, depart: { ...v.depart, ...partiel } } : { ...v, arrivee: { ...v.arrivee, ...partiel } },
    );

  // Quand on tape un code connu, on pré-remplit la ville et le fuseau (sans écraser ce qui est déjà saisi)
  function surCode(quel: 'depart' | 'arrivee', saisie: string) {
    const code = saisie.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    definirVol((v) => {
      const a = { ...v[quel], code };
      const connu = AEROPORTS_CONNUS[code];
      if (connu) {
        if (!a.ville) a.ville = connu.ville;
        if (!a.fuseau) a.fuseau = connu.fuseau;
      }
      return quel === 'depart' ? { ...v, depart: a } : { ...v, arrivee: a };
    });
  }

  const propre = nettoyer(vol);
  const problemes = erreursVol(propre);
  const apercuOk = problemes.length === 0;

  async function enregistrer(e: Event) {
    e.preventDefault();
    definirTentative(true);
    if (problemes.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await enregistrerVol(propre);
    aller('#/vols');
  }

  return (
    <Page titre={props.nouveau ? 'Nouveau vol' : `Vol ${props.initial.numero}`} retour={{ href: '#/vols', libelle: 'Vols' }}>
      <form class="formulaire" onSubmit={enregistrer} noValidate>
        <ListeErreurs erreurs={tentative ? problemes : []} />

        <Champ etiquette="Numéro de vol">
          <input type="text" value={vol.numero} placeholder="XX123" autocomplete="off" spellcheck={false} onInput={(e) => maj({ numero: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Compagnie (facultatif)">
          <input type="text" value={vol.compagnie} onInput={(e) => maj({ compagnie: e.currentTarget.value })} />
        </Champ>
        <Champ etiquette="Référence de réservation (facultatif)" aide="Pas le numéro de billet.">
          <input type="text" value={vol.reference} autocomplete="off" spellcheck={false} onInput={(e) => maj({ reference: e.currentTarget.value })} />
        </Champ>

        <ChampsAeroport titre="Départ" aeroport={vol.depart} onCode={(s) => surCode('depart', s)} onChange={(p) => majAeroport('depart', p)} />
        <ChampsAeroport titre="Arrivée" aeroport={vol.arrivee} onCode={(s) => surCode('arrivee', s)} onChange={(p) => majAeroport('arrivee', p)} />
        <datalist id="liste-fuseaux">
          {fuseaux.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>

        {apercuOk && (
          <div class="message info">
            <div>Durée du vol : {formatDureeMin(dureeVolMin(propre))}</div>
            <div>Départ exact : {formatUtc(instantDepart(propre))}</div>
          </div>
        )}

        <Champ etiquette="Type de vol" aide="Sert à choisir le délai d'arrivée à l'aéroport (Réglages).">
          <select value={vol.portee} onChange={(e) => maj({ portee: e.currentTarget.value as Vol['portee'] })}>
            {PORTEES.map((p) => (
              <option key={p} value={p}>
                {LIBELLES_PORTEE[p]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ etiquette="Statut">
          <select value={vol.statut} onChange={(e) => maj({ statut: e.currentTarget.value as Vol['statut'] })}>
            {STATUTS_VOL.map((s) => (
              <option key={s} value={s}>
                {LIBELLES_STATUT[s]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ etiquette="Passagers (facultatif)">
          <input type="text" value={vol.passagers} onInput={(e) => maj({ passagers: e.currentTarget.value })} />
        </Champ>
        <label class="interrupteur">
          <input type="checkbox" checked={vol.pourMoi} onChange={(e) => maj({ pourMoi: e.currentTarget.checked })} />
          <span>C'est mon vol (le compteur « Prochain vol » le prend en compte)</span>
        </label>
        <Champ etiquette="Notes (facultatif)">
          <textarea rows={3} value={vol.notes} onInput={(e) => maj({ notes: e.currentTarget.value })} />
        </Champ>

        <button type="submit" class="bouton">
          Enregistrer
        </button>
        <a class="bouton secondaire" href="#/vols">
          Annuler
        </a>
        {!props.nouveau && (
          <BoutonConfirme
            libelle="Supprimer ce vol"
            question="Supprimer ce vol et ses compteurs ? C'est définitif."
            oui="Oui, supprimer"
            onConfirme={async () => {
              await supprimerVol(props.initial.id);
              aller('#/vols');
            }}
          />
        )}
      </form>
    </Page>
  );
}

export function FormulaireVol(props: { id: string }) {
  const { donnees } = useStore();
  const nouveau = props.id === 'nouveau';
  const existant = nouveau ? undefined : donnees.vols.find((v) => v.id === props.id);
  if (!nouveau && !existant) {
    return (
      <Page titre="Vol introuvable" retour={{ href: '#/vols', libelle: 'Vols' }}>
        <section class="carte">
          <p>Ce vol n'existe pas (ou a été supprimé).</p>
        </section>
      </Page>
    );
  }
  return <Editeur key={props.id} initial={existant ?? volVide()} nouveau={nouveau} />;
}

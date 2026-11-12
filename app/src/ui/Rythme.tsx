import { useState } from 'preact/hooks';
import { enregistrerReglages, useStore } from '../data/store.ts';
import type { AEviter, ModeTrajet, PauseRythme } from '../data/types.ts';
import { A_EVITER, LIBELLES_A_EVITER, LIBELLES_MODE, MODES_TRAJET } from '../data/types.ts';
import { heureValide } from '../lib/temps.ts';
import { ChoixListe } from './ChoixListe.tsx';
import { Champ, ListeErreurs, Page } from './commun.tsx';

export function Rythme() {
  const { donnees } = useStore();
  const r = donnees.reglages;
  const [activitesTxt, definirActivites] = useState(r.rythme.activitesMax === null ? '' : String(r.rythme.activitesMax));
  const [lever, definirLever] = useState(r.rythme.heureLever);
  const [pauses, definirPauses] = useState<PauseRythme[]>(r.rythme.pauses);
  const [aEviter, definirAEviter] = useState<AEviter[]>(r.aEviter);
  const [kmTxt, definirKm] = useState(String(r.trajetLongKm));
  const [transports, definirTransports] = useState<ModeTrajet[]>(r.transports);
  const [tentative, definirTentative] = useState(false);
  const [enregistre, definirEnregistre] = useState(false);

  const problemes: string[] = [];
  const max = activitesTxt.trim() === '' ? null : Number(activitesTxt.trim());
  if (max !== null && !(Number.isInteger(max) && max >= 0 && max <= 50)) problemes.push("Le nombre d'activités par jour doit être un nombre entier (ou rester vide).");
  if (lever !== '' && !heureValide(lever)) problemes.push("L'heure de lever est invalide.");
  pauses.forEach((p, i) => {
    if (!heureValide(p.debut) || !heureValide(p.fin)) problemes.push(`Pause n°${i + 1} : indique le début et la fin.`);
    else if (p.fin <= p.debut) problemes.push(`Pause n°${i + 1} : la fin doit être après le début.`);
  });
  const km = Number(kmTxt.trim().replace(',', '.'));
  if (!(Number.isFinite(km) && km > 0 && km <= 2000)) problemes.push('Le seuil de long trajet est un nombre de kilomètres plus grand que zéro.');

  async function enregistrer(ev: Event) {
    ev.preventDefault();
    definirTentative(true);
    definirEnregistre(false);
    if (problemes.length > 0) return;
    await enregistrerReglages({ ...r, rythme: { activitesMax: max, heureLever: lever, pauses: pauses.map((p) => ({ ...p, libelle: p.libelle.trim() })) }, aEviter, trajetLongKm: km, transports });
    definirEnregistre(true);
  }
  const majPause = (i: number, partiel: Partial<PauseRythme>) => definirPauses((l) => l.map((p, k) => (k === i ? { ...p, ...partiel } : p)));

  return (
    <Page titre="Rythme et préférences" retour={{ href: '#/reglages', libelle: 'Réglages' }}>
      <form class="formulaire" onSubmit={enregistrer} noValidate>
        <ListeErreurs erreurs={tentative ? problemes : []} />
        {enregistre && (
          <div class="message ok" role="status">
            Enregistré.
          </div>
        )}

        <section class="carte formulaire">
          <h2>Rythme du jour</h2>
          <p class="discret">Des repères : l'app signale ce qui les dépasse dans le planning, elle ne bloque rien.</p>
          <Champ etiquette="Activités par jour, au plus" aide="Vide = pas de limite.">
            <input type="text" inputMode="numeric" value={activitesTxt} onInput={(e) => definirActivites(e.currentTarget.value)} />
          </Champ>
          <Champ etiquette="Heure de lever" aide="Un créneau qui commence avant est signalé.">
            <input type="time" value={lever} onInput={(e) => definirLever(e.currentTarget.value)} />
          </Champ>
          <fieldset class="groupe">
            <legend>Pauses</legend>
            {pauses.map((p, i) => (
              <div class="formulaire" key={i}>
                <Champ etiquette="Nom (facultatif)">
                  <input type="text" value={p.libelle} placeholder="Sieste, pause déjeuner…" onInput={(e) => majPause(i, { libelle: e.currentTarget.value })} />
                </Champ>
                <div class="rangee-champs">
                  <Champ etiquette="De">
                    <input type="time" value={p.debut} onInput={(e) => majPause(i, { debut: e.currentTarget.value })} />
                  </Champ>
                  <Champ etiquette="À">
                    <input type="time" value={p.fin} onInput={(e) => majPause(i, { fin: e.currentTarget.value })} />
                  </Champ>
                </div>
                <button type="button" class="bouton secondaire petit" onClick={() => definirPauses((l) => l.filter((_, k) => k !== i))}>
                  Retirer cette pause
                </button>
              </div>
            ))}
            <button type="button" class="bouton secondaire petit" onClick={() => definirPauses((l) => [...l, { libelle: '', debut: '', fin: '' }])}>
              Ajouter une pause
            </button>
          </fieldset>
        </section>

        <section class="carte formulaire">
          <h2>À éviter</h2>
          <p class="discret">
            Réglage de base, que tu peux changer le jour même dans « Quoi faire, quand ? ». La foule et la chaleur ne sont signalées que pour les lieux dont une source en parle : sans information, rien n'est signalé.
          </p>
          <ChoixListe options={A_EVITER} libelles={LIBELLES_A_EVITER} valeur={aEviter} onChange={definirAEviter} legende="À éviter" />
          <Champ etiquette="Un long trajet, c'est plus de… (km à vol d'oiseau)" aide="Valeur de départ proposée : à régler selon toi.">
            <input type="text" inputMode="decimal" value={kmTxt} onInput={(e) => definirKm(e.currentTarget.value)} />
          </Champ>
        </section>

        <section class="carte formulaire">
          <h2>Transports acceptés</h2>
          <p class="discret">Sans choix, tous les transports sont acceptés. Un lieu dont la source donne un accès qui n'est dans aucun de tes modes est signalé.</p>
          <ChoixListe options={MODES_TRAJET} libelles={LIBELLES_MODE} valeur={transports} onChange={definirTransports} legende="Transports" />
        </section>

        <button type="submit" class="bouton">
          Enregistrer
        </button>
      </form>
    </Page>
  );
}

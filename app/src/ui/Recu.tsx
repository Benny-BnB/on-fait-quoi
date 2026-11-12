import { useEffect, useMemo, useState } from 'preact/hooks';
import { construireIcs } from '../lib/ics.ts';
import { decoderPlanning, evenementsDepuisPlanning, type PlanningPartage } from '../lib/partage.ts';
import { heureLocaleEvenement, type EvenementAgenda } from '../lib/agenda.ts';
import { jourSemaine } from '../lib/sejour.ts';
import { formatDateIso, nomFuseau } from '../lib/temps.ts';
import { ChoixRappels } from './ChoixRappels.tsx';
import { Page } from './commun.tsx';
import { dateDuJour, enregistrerFichier } from './fichier.ts';

type Etat = { etat: 'lecture' } | { etat: 'erreur'; message: string } | { etat: 'pret'; planning: PlanningPartage };

// Planning reçu par un lien ou un code à scanner. Il est seulement affiché : rien n'est enregistré dans l'app.
export function Recu(props: { code: string }) {
  const [etat, definirEtat] = useState<Etat>({ etat: 'lecture' });
  const [rappelsDeplacements, definirRappelsDeplacements] = useState<number[]>([180]);
  const [rappelsAutres, definirRappelsAutres] = useState<number[]>([30]);
  const [message, definirMessage] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    definirEtat({ etat: 'lecture' });
    void decoderPlanning(props.code).then((r) => {
      if (annule) return;
      definirEtat(r.ok ? { etat: 'pret', planning: r.planning } : { etat: 'erreur', message: r.erreur });
    });
    return () => {
      annule = true;
    };
  }, [props.code]);

  const evenements = useMemo(() => (etat.etat === 'pret' ? evenementsDepuisPlanning(etat.planning) : []), [etat]);
  const parJour = useMemo(() => {
    const jours = new Map<string, EvenementAgenda[]>();
    for (const e of [...evenements].sort((a, b) => a.jour.localeCompare(b.jour) || (a.debutMs ?? -Infinity) - (b.debutMs ?? -Infinity))) {
      jours.set(e.jour, [...(jours.get(e.jour) ?? []), e]);
    }
    return [...jours.entries()];
  }, [evenements]);

  async function exporter() {
    const ics = construireIcs(evenements, {
      maintenantMs: Date.now(),
      rappelsDeplacementsMin: rappelsDeplacements,
      rappelsAutresMin: rappelsAutres,
      rappelTaches: false,
      nomCalendrier: 'Planning reçu (On fait quoi ?)',
    });
    const r = await enregistrerFichier(`planning-recu-${dateDuJour()}.ics`, ics, 'text/calendar');
    if (r !== 'annule') definirMessage('Fichier prêt. Ouvre-le : Calendrier propose « Ajouter tout ».');
  }

  return (
    <Page titre="Planning reçu" retour={{ href: '#/', libelle: 'Accueil' }}>
      {etat.etat === 'lecture' && <p class="note">Lecture du lien…</p>}
      {etat.etat === 'erreur' && (
        <div class="message erreur" role="alert">
          {etat.message}
        </div>
      )}
      {etat.etat === 'pret' && (
        <>
          <section class="carte">
            <h2>
              {evenements.length} événement{evenements.length > 1 ? 's' : ''}
            </h2>
            <p class="discret">
              Ce planning vient d'un lien. Il s'affiche ici, mais il n'est enregistré nulle part : ferme la page et il disparaît. Les heures sont celles de chaque lieu.
            </p>
          </section>
          {parJour.map(([jour, liste]) => (
            <section class="carte jour-recu" key={jour}>
              <h2>
                {jourSemaine(jour)} {formatDateIso(jour)}
              </h2>
              {liste.map((e) => {
                const heure = heureLocaleEvenement(e);
                return (
                  <div class="evenement-recu" key={e.uid}>
                    <span class="heure">{heure !== '' ? heure : e.debutMs === null ? 'Journée' : '–'}</span>
                    <strong>{e.titre}</strong>
                    {heure !== '' && e.fuseau !== '' && <span class="discret">Heure de {nomFuseau(e.fuseau)}</span>}
                    {e.lieu !== '' && <span class="discret">{e.lieu}</span>}
                    {e.details.map((d) => (
                      <span class="discret" key={d}>
                        {d}
                      </span>
                    ))}
                  </div>
                );
              })}
            </section>
          ))}
          <section class="carte">
            <h2>L'ajouter à mon agenda</h2>
            <p class="discret">Fabrique un fichier d'agenda (.ics) avec ces événements, à ouvrir dans Calendrier.</p>
            <p class="discret">Rappel avant un vol ou un trajet :</p>
            <ChoixRappels valeur={rappelsDeplacements} onChange={definirRappelsDeplacements} legende="Rappels avant un vol ou un trajet" />
            <p class="discret">Rappel avant le reste :</p>
            <ChoixRappels valeur={rappelsAutres} onChange={definirRappelsAutres} legende="Rappels avant un logement ou un créneau" />
            <button type="button" class="bouton" onClick={() => void exporter()}>
              Enregistrer ou partager le fichier
            </button>
            {message && (
              <div class="message ok" role="status">
                {message}
              </div>
            )}
          </section>
        </>
      )}
    </Page>
  );
}

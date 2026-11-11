import { useStore } from '../data/store.ts';
import { LIBELLES_MODE } from '../data/types.ts';
import { calculerTrajet, heureAvecJour, jourDans } from '../lib/planning.ts';
import { formatDureeMin, fuseauValide } from '../lib/temps.ts';
import { lienNouveauTrajet, lienTrajet } from './routeur.ts';

// Dans la fiche d'un vol : les trajets liés et l'heure de départ conseillée
export function TrajetsDuVol(props: { volId: string }) {
  const { donnees } = useStore();
  const lies = donnees.trajets.filter((t) => t.volId === props.volId);
  return (
    <fieldset class="groupe">
      <legend>Trajets liés à ce vol</legend>
      {lies.length === 0 && <p class="discret">Aucun trajet lié.</p>}
      {lies.map((t) => {
        const c = calculerTrajet(t, donnees);
        const f = c.vol?.depart.fuseau ?? '';
        return (
          <a key={t.id} class="sous-carte" href={lienTrajet(t.id)}>
            <strong>
              {t.de} → {t.a}
            </strong>
            <div class="discret">
              {t.lienVol === 'vers' ? 'Pour prendre ce vol' : "Après l'atterrissage"}
              {t.mode !== '' ? ` · ${LIBELLES_MODE[t.mode]}` : ' · mode à choisir'}
              {t.dureeMin !== null ? ` · ${formatDureeMin(t.dureeMin)}` : ' · durée à renseigner'}
            </div>
            {t.lienVol === 'vers' && c.conseilleMs !== null && c.aeroportAvantMs !== null && fuseauValide(f) && (
              <div>Partir à {heureAvecJour(c.conseilleMs, f, jourDans(c.aeroportAvantMs, f))}</div>
            )}
          </a>
        );
      })}
      <a class="bouton secondaire petit" href={lienNouveauTrajet(props.volId)}>
        Ajouter un trajet vers l'aéroport
      </a>
    </fieldset>
  );
}

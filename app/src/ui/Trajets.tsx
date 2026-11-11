import { useStore } from '../data/store.ts';
import type { Donnees, Trajet } from '../data/types.ts';
import { LIBELLES_MODE } from '../data/types.ts';
import { formatMontant, formatNombre } from '../lib/format.ts';
import { calculerTrajet, heureAvecJour, jourDans } from '../lib/planning.ts';
import { joursEntre } from '../lib/sejour.ts';
import { aujourdhuiIso, formatDateIso, formatDureeMin, fuseauValide } from '../lib/temps.ts';
import { Page } from './commun.tsx';
import { SousOnglets } from './SousOnglets.tsx';
import { lienTrajet } from './routeur.ts';

export function ancienneteTexte(consulteLe: string): string {
  const n = joursEntre(consulteLe, aujourdhuiIso());
  if (n <= 0) return "aujourd'hui";
  return n === 1 ? 'hier' : `il y a ${n} jours`;
}

export function textePrix(t: Trajet): string | null {
  if (t.prixMin === null || t.prixMax === null) return null;
  if (t.prixMin === t.prixMax) return formatMontant(t.prixMin, t.devise);
  return `${formatNombre(t.prixMin)} à ${formatMontant(t.prixMax, t.devise)}`;
}

// Trajets triés par jour, puis par heure de départ connue
function trajetsTries(donnees: Donnees): Trajet[] {
  const cle = (t: Trajet): [string, number] => {
    const c = calculerTrajet(t, donnees);
    const jour = c.debutMs !== null && fuseauValide(c.fuseau) ? jourDans(c.debutMs, c.fuseau) : t.date;
    return [jour, c.debutMs ?? Infinity];
  };
  return [...donnees.trajets].sort((a, b) => {
    const [ja, ha] = cle(a);
    const [jb, hb] = cle(b);
    if (ja !== jb) return ja.localeCompare(jb);
    if (ha !== hb) return ha < hb ? -1 : 1;
    return a.de.localeCompare(b.de, 'fr');
  });
}

function CarteTrajet(props: { trajet: Trajet; donnees: Donnees }) {
  const t = props.trajet;
  const d = props.donnees;
  const c = calculerTrajet(t, d);
  const volTrouve = c.vol;
  const logement = t.logementId !== '' ? d.logements.find((l) => l.id === t.logementId) : undefined;
  const prix = textePrix(t);
  const aUneInfo = t.dureeMin !== null || prix !== null;

  const heure =
    c.origine === 'saisie' || c.origine === 'conseillee'
      ? c.debutMs !== null && fuseauValide(c.fuseau)
        ? `${formatDateIso(jourDans(c.debutMs, c.fuseau))} à ${heureAvecJour(c.debutMs, c.fuseau, jourDans(c.debutMs, c.fuseau))}`
        : formatDateIso(t.date)
      : `${formatDateIso(t.date)} (heure à définir)`;

  return (
    <a class="carte carte-lien" href={lienTrajet(t.id)}>
      <div class="vol-entete">
        <strong>
          {t.de} → {t.a}
        </strong>
        <span class="etiquettes">
          {t.mode !== '' ? <span class="etiquette">{LIBELLES_MODE[t.mode]}</span> : <span class="etiquette attention">Mode à choisir</span>}
        </span>
      </div>
      <ul class="vol-lignes">
        <li>
          {heure}
          {c.origine === 'conseillee' && ' · départ conseillé'}
        </li>
        {t.volId !== '' && (
          <li>{volTrouve ? `${t.lienVol === 'vers' ? 'Pour prendre le vol' : "Après l'atterrissage du vol"} ${volTrouve.numero}` : 'Vol lié introuvable'}</li>
        )}
        {logement && <li>Logement : {logement.nom}</li>}
        {c.origine === 'saisie' && c.aeroportAvantMs !== null && volTrouve && fuseauValide(volTrouve.depart.fuseau) && (
          <li>Être à l'aéroport avant {heureAvecJour(c.aeroportAvantMs, volTrouve.depart.fuseau, jourDans(c.aeroportAvantMs, volTrouve.depart.fuseau))}</li>
        )}
        {t.dureeMin !== null ? (
          <li>
            Durée {formatDureeMin(t.dureeMin)}
            {t.dureeEstimee && ' (estimée)'}
          </li>
        ) : (
          <li class="discret">Durée à renseigner</li>
        )}
        {prix && <li>Prix par personne : {prix}</li>}
        {t.source !== '' ? (
          <li class="discret">
            Source : {t.source}
            {t.consulteLe !== '' && ` · consultée le ${formatDateIso(t.consulteLe)} (${ancienneteTexte(t.consulteLe)})`}
          </li>
        ) : (
          aUneInfo && <li class="attention-texte">Source : à vérifier</li>
        )}
      </ul>
    </a>
  );
}

export function Trajets() {
  const { donnees } = useStore();
  const trajets = trajetsTries(donnees);
  return (
    <Page titre="Transports">
      <SousOnglets actif="trajets" />
      <a class="bouton" href="#/trajets/nouveau">
        Ajouter un trajet
      </a>
      {trajets.length === 0 && (
        <section class="carte">
          <p>Aucun trajet. Ajoute-en un, ou importe ton fichier de voyage dans Réglages.</p>
        </section>
      )}
      {trajets.map((t) => (
        <CarteTrajet key={t.id} trajet={t} donnees={donnees} />
      ))}
    </Page>
  );
}

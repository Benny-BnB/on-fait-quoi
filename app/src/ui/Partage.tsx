import { useEffect, useMemo, useState } from 'preact/hooks';
import { tousLesLieux } from '../data/lieux-publics.ts';
import { useStore } from '../data/store.ts';
import { CONTENU_PAR_DEFAUT, evenementsAgenda, type ContenuAgenda } from '../lib/agenda.ts';
import { construireIcs } from '../lib/ics.ts';
import { encoderPlanning, lienDePartage, planningDepuisEvenements } from '../lib/partage.ts';
import { cheminSvgQr, creerQr, type MatriceQr } from '../lib/qr.ts';
import { formatDateIso } from '../lib/temps.ts';
import { ChoixRappels } from './ChoixRappels.tsx';
import { Champ, Page } from './commun.tsx';
import { dateDuJour, enregistrerFichier } from './fichier.ts';

type LienPret = { url: string; qr: MatriceQr | null };

// Au-delà, certaines messageries coupent ou abîment le lien
const LONGUEUR_LIEN_CONFORTABLE = 2000;

function Interrupteur(props: { libelle: string; aide?: string; valeur: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="choix">
      <input type="checkbox" checked={props.valeur} onChange={(e) => props.onChange(e.currentTarget.checked)} />
      <span>
        {props.libelle}
        {props.aide && <span class="champ-aide"> {props.aide}</span>}
      </span>
    </label>
  );
}

export function CodeQr(props: { qr: MatriceQr }) {
  const { viewBox, chemin } = cheminSvgQr(props.qr);
  // Toujours noir sur blanc, même en mode sombre : un code inversé n'est pas lu par tous les téléphones
  return (
    <svg class="qr" viewBox={viewBox} role="img" aria-label="Code à scanner pour ouvrir le planning" shape-rendering="crispEdges">
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={chemin} fill="#000000" />
    </svg>
  );
}

export function Partage() {
  const { donnees } = useStore();
  const lieux = useMemo(() => tousLesLieux(donnees), [donnees]);
  const [contenu, definirContenu] = useState<ContenuAgenda>(CONTENU_PAR_DEFAUT);
  const [rappelsDeplacements, definirRappelsDeplacements] = useState<number[]>([1440, 180]);
  const [rappelsAutres, definirRappelsAutres] = useState<number[]>([30]);
  const [rappelTaches, definirRappelTaches] = useState(true);
  const [message, definirMessage] = useState<string | null>(null);
  const [lien, definirLien] = useState<LienPret | null>(null);
  const maj = (changement: Partial<ContenuAgenda>) => definirContenu((c) => ({ ...c, ...changement }));

  const resultat = useMemo(() => evenementsAgenda(donnees, contenu, lieux), [donnees, contenu, lieux]);
  const partageables = useMemo(() => planningDepuisEvenements(resultat.evenements), [resultat]);

  // Le lien et le code se recalculent quand le choix change (la compression est rapide, mais asynchrone)
  useEffect(() => {
    let annule = false;
    definirLien(null);
    if (partageables.e.length === 0) return;
    void encoderPlanning(partageables).then((code) => {
      if (annule) return;
      const url = lienDePartage(window.location.href, code);
      definirLien({ url, qr: creerQr(url) });
    });
    return () => {
      annule = true;
    };
  }, [partageables]);

  const periodeInvalide = contenu.du !== '' && contenu.au !== '' && contenu.du > contenu.au;

  async function exporterIcs() {
    const ics = construireIcs(resultat.evenements, {
      maintenantMs: Date.now(),
      rappelsDeplacementsMin: rappelsDeplacements,
      rappelsAutresMin: rappelsAutres,
      rappelTaches,
      nomCalendrier: 'Voyage (On fait quoi ?)',
    });
    const r = await enregistrerFichier(`on-fait-quoi-${dateDuJour()}.ics`, ics, 'text/calendar');
    if (r === 'partage') definirMessage('Fichier partagé. Ouvre-le depuis Fichiers (ou le message reçu) : Calendrier propose « Ajouter tout ».');
    if (r === 'telecharge') definirMessage('Fichier téléchargé. Ouvre-le : Calendrier propose d\'ajouter les événements.');
  }

  async function copierLien() {
    if (!lien) return;
    try {
      await navigator.clipboard.writeText(lien.url);
      definirMessage('Lien copié. Colle-le dans un message pour la personne concernée.');
    } catch {
      definirMessage('La copie a échoué. Utilise plutôt « Envoyer le lien » ou le fichier d\'agenda.');
    }
  }

  async function envoyerLien() {
    if (!lien) return;
    try {
      await navigator.share({ url: lien.url, title: 'Planning du voyage' });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) definirMessage("L'envoi a échoué. Utilise plutôt « Copier le lien ».");
    }
  }

  const nb = resultat.evenements.length;
  const nbLien = partageables.e.length;

  return (
    <Page titre="Partager et agenda" retour={{ href: '#/planning', libelle: 'Planning' }}>
      <section class="carte">
        <h2>Que mettre dans l'export ?</h2>
        <Interrupteur libelle="Mes vols" valeur={contenu.vols} onChange={(v) => maj({ vols: v })} />
        <Interrupteur libelle="Les vols des autres personnes" valeur={contenu.volsAutres} onChange={(v) => maj({ volsAutres: v })} />
        <Interrupteur libelle="Les trajets" valeur={contenu.trajets} onChange={(v) => maj({ trajets: v })} />
        <Interrupteur libelle="Les logements" aide="(arrivées et départs ; pas ceux « à trouver »)" valeur={contenu.logements} onChange={(v) => maj({ logements: v })} />
        <Interrupteur libelle="Le planning" aide="(créneaux et événements fixes)" valeur={contenu.planning} onChange={(v) => maj({ planning: v })} />
        <Interrupteur libelle="Les idées pas encore décidées" valeur={contenu.idees} onChange={(v) => maj({ idees: v })} />
        <Interrupteur libelle="Les échéances des check-lists" aide="(fichier d'agenda seulement, jamais dans le lien)" valeur={contenu.taches} onChange={(v) => maj({ taches: v })} />
        <div class="rangee-champs">
          <Champ etiquette="Du" aide="Vide = depuis le début">
            <input type="date" value={contenu.du} onInput={(e) => maj({ du: e.currentTarget.value })} />
          </Champ>
          <Champ etiquette="Au" aide="Vide = jusqu'à la fin">
            <input type="date" value={contenu.au} onInput={(e) => maj({ au: e.currentTarget.value })} />
          </Champ>
        </div>
        {periodeInvalide && (
          <div class="message erreur" role="alert">
            La date de début est après la date de fin.
          </div>
        )}
        <p class="discret">
          {nb === 0 ? 'Rien à exporter avec ce choix.' : `${nb} événement${nb > 1 ? 's' : ''} dans le fichier d'agenda, ${nbLien} dans le lien.`}
          {contenu.du !== '' || contenu.au !== '' ? ` Période : ${contenu.du !== '' ? formatDateIso(contenu.du) : 'début'} → ${contenu.au !== '' ? formatDateIso(contenu.au) : 'fin'}.` : ''}
        </p>
        {resultat.ignores.length > 0 && (
          <div class="message attention" role="status">
            <strong>Pas mis dans l'export :</strong>
            <ul>
              {resultat.ignores.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section class="carte">
        <h2>Fichier d'agenda (.ics)</h2>
        <p class="discret">
          Pour Calendrier (Apple), Outlook ou Google Agenda. Les heures sont écrites en UTC : l'agenda les affiche tout seul à la bonne heure, où que tu sois. La description rappelle l'heure locale du lieu. Les références de réservation et les liens ne sont jamais mis dans le fichier.
        </p>
        <h3>Rappels (alertes de l'agenda)</h3>
        <p class="discret">Avant un vol ou un trajet :</p>
        <ChoixRappels valeur={rappelsDeplacements} onChange={definirRappelsDeplacements} legende="Rappels avant un vol ou un trajet" />
        <p class="discret">Avant un logement ou un créneau du planning :</p>
        <ChoixRappels valeur={rappelsAutres} onChange={definirRappelsAutres} legende="Rappels avant un logement ou un créneau" />
        <Interrupteur libelle="Échéances : un rappel la veille à 9 h" valeur={rappelTaches} onChange={definirRappelTaches} />
        <button type="button" class="bouton" disabled={nb === 0 || periodeInvalide} onClick={() => void exporterIcs()}>
          Enregistrer ou partager le fichier
        </button>
        <ol class="etapes-liste">
          <li>Dans Calendrier, crée un calendrier « Voyage » : tu pourras le partager à tes proches, ou le supprimer d'un coup.</li>
          <li>Ouvre le fichier enregistré : Calendrier propose « Ajouter tout ». Choisis le calendrier « Voyage ».</li>
          <li>Pour mettre à jour : exporte à nouveau et rouvre le fichier. Chaque événement garde son identifiant, donc l'agenda doit le mettre à jour sans le dupliquer (à vérifier avec ton agenda).</li>
        </ol>
        <p class="discret">Les rappels sont gérés par l'agenda lui-même : ils sonnent même quand l'app est fermée.</p>
      </section>

      <section class="carte">
        <h2>Lien et code à scanner</h2>
        <p class="discret">
          Le planning est écrit dans le lien lui-même, compressé. Il est fabriqué dans ce téléphone et n'est envoyé à aucun serveur ni enregistré nulle part : celui qui reçoit le lien voit le planning, c'est tout. N'envoie-le qu'aux personnes du voyage.
        </p>
        {nbLien === 0 && <p class="discret">Rien à partager avec ce choix.</p>}
        {nbLien > 0 && !lien && <p class="discret">Préparation du lien…</p>}
        {lien && (
          <>
            {lien.qr ? (
              <>
                <CodeQr qr={lien.qr} />
                <p class="discret">Fais-le scanner avec l'appareil photo de l'iPhone : le planning s'ouvre sur son téléphone.</p>
              </>
            ) : (
              <div class="message attention" role="status">
                Ce planning est trop gros pour un code à scanner lisible ({nbLien} événements). Choisis une période plus courte avec « Du » et « Au », ou envoie le lien ou le fichier d'agenda.
              </div>
            )}
            <p class="discret">Lien de {lien.url.length} caractères.</p>
            {lien.url.length > LONGUEUR_LIEN_CONFORTABLE && (
              <div class="message attention" role="status">
                Ce lien est très long : certaines messageries le coupent. Préfère le fichier d'agenda, ou une période plus courte.
              </div>
            )}
            <div class="rangee">
              <button type="button" class="bouton secondaire" onClick={() => void copierLien()}>
                Copier le lien
              </button>
              {typeof navigator.share === 'function' && (
                <button type="button" class="bouton secondaire" onClick={() => void envoyerLien()}>
                  Envoyer le lien
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {message && (
        <div class="message ok" role="status">
          {message}
        </div>
      )}

      <section class="carte">
        <h2>Rappels de l'app et mise à jour automatique</h2>
        <p>
          <strong>Notifications de l'app quand elle est fermée : non.</strong> Sur iPhone, les notifications d'une app web passent par « Web Push » : l'app doit être installée sur l'écran d'accueil, et un serveur doit envoyer chaque message via le service de notifications d'Apple. Cette app n'a volontairement pas de serveur (gratuit, sans suivi). La fonction prévue pour programmer des notifications sans serveur (« Notification Triggers ») a été abandonnée par Chrome, et je n'ai trouvé aucune trace d'une version pour Safari.
        </p>
        <p>
          <strong>Ce qui marche à la place :</strong> les rappels du fichier d'agenda (ci-dessus), gérés par Calendrier, et les alertes affichées dans l'app quand tu l'ouvres.
        </p>
        <p>
          <strong>Synchronisation automatique avec l'agenda : pas d'option gratuite et privée.</strong> Un agenda qui se met à jour tout seul demande un fichier hébergé en ligne à une adresse fixe : ici, sur un site public (GitHub Pages), ou chez un service tiers qui garderait ton planning. Dans les deux cas, ton planning ne resterait pas privé, ce que le cahier des charges interdit. L'export du fichier .ics, à refaire quand tu changes quelque chose, est la solution retenue.
        </p>
      </section>
    </Page>
  );
}

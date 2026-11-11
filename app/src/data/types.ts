// Modèle de données de l'app. Tout ce qui est ici se modifie dans l'app :
// rien n'est figé dans le code (cahier des charges, règle 3).

// Un aéroport, avec l'heure LOCALE de cet aéroport et le nom de son fuseau (nom IANA,
// par exemple "Europe/Brussels"). L'instant exact se calcule à partir de ces deux infos.
export type Aeroport = {
  code: string; // code à 3 lettres, ex. BRU
  ville: string; // nom lisible, peut rester vide
  date: string; // AAAA-MM-JJ (heure locale de l'aéroport)
  heure: string; // HH:MM, 24 h (heure locale de l'aéroport)
  fuseau: string; // nom IANA du fuseau de l'aéroport
  terminal: string; // vide si inconnu
};

export const STATUTS_VOL = ['confirme', 'a-verifier', 'annule'] as const;
export type StatutVol = (typeof STATUTS_VOL)[number];

export const LIBELLES_STATUT: Record<StatutVol, string> = {
  confirme: 'Confirmé',
  'a-verifier': 'À vérifier',
  annule: 'Annulé',
};

export const PORTEES = ['international', 'interieur'] as const;
export type Portee = (typeof PORTEES)[number];

export const LIBELLES_PORTEE: Record<Portee, string> = {
  international: 'Vol international',
  interieur: 'Vol intérieur',
};

export type Vol = {
  id: string;
  compagnie: string;
  numero: string;
  reference: string; // référence de réservation (jamais le numéro de billet)
  depart: Aeroport;
  arrivee: Aeroport;
  portee: Portee; // sert à choisir le délai d'arrivée à l'aéroport
  passagers: string; // texte libre
  pourMoi: boolean; // faux = vol d'une autre personne, ignoré par "prochain vol"
  statut: StatutVol;
  notes: string;
};

export type CibleCompteur =
  | { type: 'prochain-vol' } // le prochain vol à venir, change tout seul après le décollage
  | { type: 'vol'; volId: string }
  | { type: 'libre'; date: string; heure: string; fuseau: string };

export type Compteur = {
  id: string;
  libelle: string;
  cible: CibleCompteur;
  visible: boolean; // affiché sur l'accueil ou non
  delaiMin: number; // minutes AVANT la cible (0 = à l'heure exacte)
};

export type Reglages = {
  // Délai conseillé d'arrivée à l'aéroport avant le décollage, en minutes
  delaiAeroportMin: { international: number; interieur: number };
};

// Une étape du voyage (une ville ou une région où l'on séjourne)
export type Etape = {
  id: string;
  nom: string;
  pays: string;
  devise: string; // code à 3 lettres, ex. THB
  fuseau: string; // nom IANA, ex. Asia/Bangkok
  debut: string; // AAAA-MM-JJ : jour d'arrivée (première nuit)
  fin: string; // AAAA-MM-JJ : jour de départ (la nuit de ce jour n'est pas comptée)
};

export const STATUTS_LOGEMENT = ['a-trouver', 'a-verifier', 'reserve', 'confirme'] as const;
export type StatutLogement = (typeof STATUTS_LOGEMENT)[number];

export const LIBELLES_STATUT_LOGEMENT: Record<StatutLogement, string> = {
  'a-trouver': 'À trouver',
  'a-verifier': 'À vérifier',
  reserve: 'Réservé',
  confirme: 'Confirmé',
};

// Arrivée ou départ d'un logement : la date est obligatoire, l'heure peut rester vide
export type MomentLogement = { date: string; heure: string };

export type Coordonnees = { lat: number; lng: number };

export type Logement = {
  id: string;
  etapeId: string; // l'étape à laquelle il appartient (changer cette valeur = le déplacer)
  nom: string;
  statut: StatutLogement;
  lien: string; // annonce ou réservation, vide si aucun
  adresse: string;
  gps: Coordonnees | null;
  arrivee: MomentLogement;
  depart: MomentLogement;
  reference: string; // référence de réservation (jamais de numéro de carte)
  notes: string;
};

export const MODES_TRAJET = ['train', 'taxi', 'vtc', 'bateau', 'bus', 'metro', 'voiture', 'scooter', 'a-pied'] as const;
export type ModeTrajet = (typeof MODES_TRAJET)[number];

export const LIBELLES_MODE: Record<ModeTrajet, string> = {
  train: 'Train',
  taxi: 'Taxi',
  vtc: 'Appli de VTC',
  bateau: 'Bateau',
  bus: 'Bus',
  metro: 'Métro',
  voiture: 'Voiture',
  scooter: 'Scooter',
  'a-pied': 'À pied',
};

// "vers" = pour attraper ce vol (l'arrivée à l'aéroport est contrainte par le décollage)
// "depuis" = après l'arrivée de ce vol (le trajet commence à l'atterrissage)
export type LienVol = 'vers' | 'depuis';

export type Trajet = {
  id: string;
  de: string;
  a: string;
  mode: ModeTrajet | ''; // '' = mode pas encore choisi
  date: string; // AAAA-MM-JJ : jour prévu du trajet
  heure: string; // HH:MM, heure locale de départ dans "fuseau" ; '' = pas fixée
  fuseau: string; // nom IANA du lieu de départ
  dureeMin: number | null; // null = durée inconnue
  dureeEstimee: boolean; // vrai = durée estimée (pas publiée par une source)
  prixMin: number | null; // prix par personne, null = inconnu
  prixMax: number | null;
  devise: string; // devise du prix, ex. THB
  source: string; // où on a lu la durée ou le prix (texte ou lien)
  consulteLe: string; // AAAA-MM-JJ, date de consultation de la source, '' si inconnue
  volId: string; // '' = aucun vol lié
  lienVol: LienVol;
  logementId: string; // '' = aucun logement lié
  notes: string;
};

export const LISTES_TACHE = ['reste-a-faire', 'a-emporter'] as const;
export type ListeTache = (typeof LISTES_TACHE)[number];

export const LIBELLES_LISTE: Record<ListeTache, string> = {
  'reste-a-faire': 'Reste à faire',
  'a-emporter': 'À emporter',
};

// Une tâche de check-list. "Fait" = cochée : elle quitte la liste active et ne compte plus dans ce qui reste.
export type Tache = {
  id: string;
  titre: string;
  liste: ListeTache;
  dateSouhaitee: string; // AAAA-MM-JJ, '' si aucune : le plus tôt possible vaut mieux que le plus tard
  echeance: string; // AAAA-MM-JJ, '' si aucune : la limite à ne pas dépasser
  fait: boolean;
  faitLe: string; // AAAA-MM-JJ, '' tant que la tâche n'est pas faite
  note: string;
  lien: string; // lien utile (http ou https), vide si aucun
};

export type Donnees = {
  vols: Vol[];
  compteurs: Compteur[];
  reglages: Reglages;
  etapes: Etape[];
  logements: Logement[];
  trajets: Trajet[];
  taches: Tache[];
};

export const ID_PROCHAIN_VOL = 'prochain-vol';

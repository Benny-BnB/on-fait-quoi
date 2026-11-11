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

export type Donnees = {
  vols: Vol[];
  compteurs: Compteur[];
  reglages: Reglages;
  etapes: Etape[];
  logements: Logement[];
};

export const ID_PROCHAIN_VOL = 'prochain-vol';

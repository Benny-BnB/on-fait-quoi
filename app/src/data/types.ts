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
  | { type: 'libre'; date: string; heure: string; fuseau: string }
  | { type: 'creneau'; cle: string }; // un créneau du planning (imposé ou libre), par sa clé stable

export type Compteur = {
  id: string;
  libelle: string;
  cible: CibleCompteur;
  visible: boolean; // affiché sur l'accueil ou non
  delaiMin: number; // minutes AVANT la cible (0 = à l'heure exacte)
};

// Taux de change : 1 unité de la devise = "taux" euros. Toujours daté et sourcé (jamais deviné).
export type TauxChange = { devise: string; taux: number; date: string; source: string; lien: string };

// Un budget fixé par l'utilisateur : par jour et par personne, pour un pays, ou pour le groupe entier
export const PERIMETRES_BUDGET = ['jour-personne', 'pays', 'groupe'] as const;
export type PerimetreBudget = (typeof PERIMETRES_BUDGET)[number];
export type BudgetLigne = { id: string; perimetre: PerimetreBudget; libelle: string; pays: string; montant: number; devise: string };

// Ce qu'on peut vouloir éviter un jour donné
export const A_EVITER = ['foule', 'longs-trajets', 'chaleur', 'extreme'] as const;
export type AEviter = (typeof A_EVITER)[number];
export const LIBELLES_A_EVITER: Record<AEviter, string> = {
  foule: 'La foule',
  'longs-trajets': 'Les longs trajets',
  chaleur: 'La chaleur',
  extreme: 'Les activités extrêmes',
};

export type PauseRythme = { libelle: string; debut: string; fin: string }; // HH:MM
export type Rythme = {
  activitesMax: number | null; // nombre d'activités souhaité par jour, null = pas de limite
  heureLever: string; // HH:MM, '' = pas réglée
  pauses: PauseRythme[];
};

export type Reglages = {
  // Délai conseillé d'arrivée à l'aéroport avant le décollage, en minutes
  delaiAeroportMin: { international: number; interieur: number };
  tauxChange: TauxChange[];
  budget: BudgetLigne[];
  rythme: Rythme;
  aEviter: AEviter[]; // réglage de base, modifiable le jour même dans « Quoi faire, quand ? »
  trajetLongKm: number; // au-delà de cette distance à vol d'oiseau depuis le logement, un lieu compte comme « long trajet »
  transports: ModeTrajet[]; // modes acceptés ; [] = tous
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

export const REGIMES = ['vegetarien', 'vegan', 'halal', 'sans-gluten', 'sans-lactose', 'allergie'] as const;
export type Regime = (typeof REGIMES)[number];
export const LIBELLES_REGIME: Record<Regime, string> = {
  vegetarien: 'Végétarien',
  vegan: 'Végan',
  halal: 'Halal',
  'sans-gluten': 'Sans gluten',
  'sans-lactose': 'Sans lactose',
  allergie: 'Allergie',
};

export const MOBILITES = ['marche-limitee', 'debout-limite', 'poussette', 'fauteuil', 'escaliers'] as const;
export type Mobilite = (typeof MOBILITES)[number];
export const LIBELLES_MOBILITE: Record<Mobilite, string> = {
  'marche-limitee': 'Marche longue limitée',
  'debout-limite': 'Station debout limitée',
  poussette: 'Poussette',
  fauteuil: 'Fauteuil',
  escaliers: 'Escaliers difficiles',
};

export const CONFORTS = ['froid', 'chaud'] as const;
export type Confort = (typeof CONFORTS)[number];
export const LIBELLES_CONFORT: Record<Confort, string> = { froid: 'Sensible au froid', chaud: 'Sensible à la chaleur' };

export const TRANCHES_AGE = ['enfant', 'adulte', 'senior'] as const;
export type TrancheAge = (typeof TRANCHES_AGE)[number];
export const LIBELLES_TRANCHE_AGE: Record<TrancheAge, string> = { enfant: 'Enfant', adulte: 'Adulte', senior: 'Senior' };

// Période de présence : du jour "du" au jour "au" inclus (AAAA-MM-JJ)
export type PlagePresence = { du: string; au: string };

// Une personne du voyage
export type Personne = {
  id: string;
  prenom: string; // le prénom, ou un libellé comme « Ami »
  notes: string;
  ageAns: number | null; // âge en années, si connu
  tranche: TrancheAge | ''; // utilisée quand l'âge exact n'est pas connu
  alimentation: string; // texte libre : allergies précises, aversions…
  regimes: Regime[];
  mobilite: Mobilite[];
  confort: Confort[];
  presence: PlagePresence[]; // [] = présente tout le voyage ; sinon seulement pendant ces périodes
};

// Un groupe de personnes (« les amis », « tout le monde »…)
export type Groupe = { id: string; nom: string; personneIds: string[] };

export const PERIODES = ['matin', 'midi', 'apres-midi', 'soir', 'nuit'] as const;
export type Periode = (typeof PERIODES)[number];

export const LIBELLES_PERIODE: Record<Periode, string> = {
  matin: 'Matin',
  midi: 'Midi',
  'apres-midi': 'Après-midi',
  soir: 'Soir',
  nuit: 'Nuit',
};

export const STATUTS_CRENEAU = ['idee', 'prevu', 'reserve', 'fait', 'annule'] as const;
export type StatutCreneau = (typeof STATUTS_CRENEAU)[number];

export const LIBELLES_STATUT_CRENEAU: Record<StatutCreneau, string> = {
  idee: 'Idée',
  prevu: 'Prévu',
  reserve: 'Réservé',
  fait: 'Fait',
  annule: 'Annulé',
};

export const HUMEURS = ['calme', 'actif', 'gourmand', 'festif'] as const;
export type Humeur = (typeof HUMEURS)[number];

export const LIBELLES_HUMEUR: Record<Humeur, string> = {
  calme: 'Calme',
  actif: 'Actif',
  gourmand: 'Gourmand',
  festif: 'Festif',
};

export const TYPES_EVENEMENT = ['festival', 'repas', 'fete', 'anniversaire'] as const;
export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

export const LIBELLES_TYPE_EVENEMENT: Record<TypeEvenement, string> = {
  festival: 'Festival',
  repas: 'Repas',
  fete: 'Fête',
  anniversaire: 'Anniversaire',
};

// ---------- Fiches de lieux (base publique : aucune donnée personnelle) ----------

export const CATEGORIES = [
  'incontournables',
  'culture',
  'nature',
  'plages',
  'promenades',
  'sport',
  'nourriture',
  'nocturne',
  'marches',
  'bien-etre',
  'spots',
  'famille',
] as const;
export type Categorie = (typeof CATEGORIES)[number];

export const LIBELLES_CATEGORIE: Record<Categorie, string> = {
  incontournables: 'Incontournables',
  culture: 'Culture et histoire',
  nature: 'Nature et paysages',
  plages: 'Plages et îles',
  promenades: 'Promenades et randonnées',
  sport: 'Sport et aventure',
  nourriture: 'Nourriture',
  nocturne: 'Bars et vie nocturne',
  marches: 'Marchés et shopping',
  'bien-etre': 'Bien-être',
  spots: 'Spots et photo',
  famille: 'En famille et événements',
};

// Mise en garde sourcée sur un lieu, utilisée pour « À éviter ce jour » (foule, chaleur, activité extrême)
export type AttentionLieu = { genre: 'foule' | 'chaleur' | 'extreme'; texte: string; source: SourceLieu };
// Comment y aller, quand une source le dit
export type AccesLieu = { modes: ModeTrajet[]; texte: string; source: SourceLieu };

// D'où vient une information. Sans source, l'information n'existe pas : elle est « à vérifier ».
export type SourceLieu = {
  lien: string; // https://…
  libelle: string; // nom de la source
  consulteLe: string; // AAAA-MM-JJ : jour où la page a été lue
  officielle: boolean; // vrai = site officiel du lieu, de l'opérateur ou d'un organisme officiel ; faux = guide, annuaire, blog (source secondaire)
};

export const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
export type JourSemaine = (typeof JOURS_SEMAINE)[number];

// "ferme" plus petit que "ouvre" = fermeture après minuit ("24:00" = minuit)
export type PlageHoraire = { ouvre: string; ferme: string };

export type HorairesLieu = {
  // "ouverture" = heures d'ouverture ; "animation" = heures où le lieu est animé (rue, marché de nuit) : en dehors, on ne dit jamais "fermé"
  nature: 'ouverture' | 'animation';
  jours: Partial<Record<JourSemaine, PlageHoraire[] | 'ferme'>>; // un jour absent = inconnu
  fermetures: { du: string; au: string; motif: string }[]; // dates précises (AAAA-MM-JJ)
  derniereEntree: string; // HH:MM, '' si inconnue : après cette heure on n'entre plus, même si le lieu est encore ouvert
  note: string;
  source: SourceLieu;
};

export type Lieu = {
  id: string;
  nom: string;
  zone: string; // ville ou région de la fiche, ex. « Bangkok » (rapprochée du nom d'une étape)
  fuseau: string; // fuseau IANA du lieu
  quartier: string;
  adresse: string;
  gps: { lat: number; lng: number; source: SourceLieu } | null;
  categories: Categorie[];
  etiquettes: string[];
  incontournable: { raison: string; source: SourceLieu } | null; // seulement si une source citée le dit
  description: string; // une ou deux phrases factuelles
  duree: { minMin: number; maxMin: number; estimee: boolean; base: string; source: SourceLieu } | null;
  prix: { min: number; max: number; devise: string; note: string; source: SourceLieu } | null; // par personne
  horaires: HorairesLieu | null;
  reservation: { necessaire: boolean | null; lien: string; note: string; source: SourceLieu } | null;
  tenue: { texte: string; source: SourceLieu } | null;
  interieur: '' | 'interieur' | 'exterieur' | 'mixte';
  public: { texte: string; source: SourceLieu } | null; // enfants, seniors, accessibilité, alimentation
  attention: AttentionLieu[]; // [] = aucune mise en garde sourcée (ce n'est pas une garantie)
  acces: AccesLieu[]; // [] = accès non renseigné
  lienOfficiel: string;
  verifieLe: string; // AAAA-MM-JJ : dernière vérification de la fiche, '' si jamais
  notes: string;
};

// Suivi personnel d'un lieu : reste sur le téléphone
export type SouhaitLieu = '' | 'souhait' | 'prioritaire';
export type SuiviLieu = { lieuId: string; souhait: SouhaitLieu; favori: boolean; fait: boolean; note: string };

// Un créneau du planning que l'utilisateur remplit lui-même (activité, repas, repos, note…)
// ou un événement fixe (fixe = true), qui est imposé et ne se déplace pas à la légère.
export type Creneau = {
  id: string;
  jour: string; // AAAA-MM-JJ
  periode: Periode | ''; // '' = pas de période choisie
  debut: string; // HH:MM, '' si pas d'heure précise
  fin: string; // HH:MM, '' si pas d'heure de fin (jamais avant "debut", même jour)
  fuseau: string; // fuseau dans lequel "debut" et "fin" sont exprimés
  titre: string;
  note: string;
  statut: StatutCreneau;
  humeur: Humeur | '';
  participants: string[]; // ids de personnes ; [] = comme la journée
  budgetEstime: number | null; // montant total pour les participants, dans "devise"
  budgetReel: number | null;
  devise: string; // '' si aucun budget
  dureeMin: number | null; // durée connue quand il n'y a pas d'heure de fin
  planBDe: string; // '' = créneau principal ; sinon id du créneau principal dont celui-ci est le plan B
  lieuId: string; // fiche de lieu liée ('' = aucune)
  fixe: boolean; // événement fixe (imposé)
  typeEvenement: TypeEvenement | ''; // pour un événement fixe
};

// Qui est là un jour donné. Sans entrée pour un jour, tout le monde est là.
export type JourPlan = { jour: string; participants: string[] };

export type Donnees = {
  vols: Vol[];
  compteurs: Compteur[];
  reglages: Reglages;
  etapes: Etape[];
  logements: Logement[];
  trajets: Trajet[];
  taches: Tache[];
  personnes: Personne[];
  groupes: Groupe[];
  creneaux: Creneau[];
  joursPlan: JourPlan[];
  lieuxPerso: Lieu[]; // lieux ajoutés par l'utilisateur (souhaits) : jamais publiés
  suiviLieux: SuiviLieu[];
};

export const ID_PROCHAIN_VOL = 'prochain-vol';

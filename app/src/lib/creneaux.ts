// Créneaux libres du planning : tri, durées, participants, totaux, alertes, échange, plan B.
// Tout est calculé à partir des données : rien n'est stocké en double.

import type { Compteur, Creneau, Donnees, Etape, Periode, Personne } from '../data/types.ts';
import { LIBELLES_PERIODE } from '../data/types.ts';
import type { Alerte, CreneauImpose } from './planning.ts';
import { calculerTrajet, creneauxImposes, etapesDuJour, heureAvecJour } from './planning.ts';
import { etapesTriees } from './sejour.ts';
import { fuseauValide, heureValide, instantLocal, nomFuseau } from './temps.ts';
import type { CompteurResolu } from './vols.ts';
import { instantArrivee, instantDepart, resoudre } from './vols.ts';

// Heures "de rangement" des périodes : elles servent UNIQUEMENT à ordonner la journée, on ne les affiche jamais comme des heures
export const HEURE_PERIODE: Record<Periode, string> = {
  matin: '09:00',
  midi: '12:30',
  'apres-midi': '15:00',
  soir: '19:00',
  nuit: '22:30',
};

// ---------- Fuseau d'un jour ----------

// Où est-on ce jour-là ? L'étape où l'on dort, sinon celle que l'on quitte, sinon la valeur par défaut.
export function zoneDuJour(jour: string, etapes: Etape[], defaut = ''): string {
  const valides = etapesTriees(etapes.filter((e) => fuseauValide(e.fuseau)));
  const sejour = valides.find((e) => e.debut <= jour && jour < e.fin);
  if (sejour) return sejour.fuseau;
  const depart = valides.find((e) => e.debut <= jour && jour <= e.fin);
  return depart ? depart.fuseau : defaut;
}

// La devise de l'étape où l'on est ce jour-là ('' si on ne sait pas)
export function deviseDuJour(d: Donnees, jour: string): string {
  const zone = zoneDuJour(jour, d.etapes, '');
  const candidates = etapesDuJour(jour, d.etapes);
  return (candidates.find((e) => e.fuseau === zone) ?? candidates[0])?.devise ?? '';
}

// ---------- Heures et durées ----------

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function instantDebut(c: Creneau): number | null {
  if (c.debut === '') return null;
  const t = instantLocal(c.jour, c.debut, c.fuseau);
  return Number.isNaN(t) ? null : t;
}

export function instantFin(c: Creneau): number | null {
  if (c.fin === '') return null;
  const t = instantLocal(c.jour, c.fin, c.fuseau);
  return Number.isNaN(t) ? null : t;
}

// Durée en minutes : fin - début si les deux heures sont données, sinon la durée saisie, sinon inconnue
export function dureeCreneauMin(c: Creneau): number | null {
  if (c.debut !== '' && c.fin !== '' && heureValide(c.debut) && heureValide(c.fin)) {
    const d = minutes(c.fin) - minutes(c.debut);
    return d > 0 ? d : null;
  }
  return c.dureeMin;
}

// Clé pour ranger les créneaux dans la journée : l'heure, sinon l'heure de rangement de la période,
// sinon le début de la journée pour un événement fixe, sinon la fin de la journée
export function cleTriCreneau(c: Creneau): number {
  const debut = instantDebut(c);
  if (debut !== null) return debut;
  const rangement = c.periode !== '' ? HEURE_PERIODE[c.periode] : c.fixe ? '00:00' : '';
  if (rangement === '') return Infinity;
  const t = instantLocal(c.jour, rangement, c.fuseau);
  return Number.isNaN(t) ? Infinity : t;
}

// La période d'un créneau : celle qu'on a choisie, sinon celle de son heure de début, sinon aucune
export function periodeEffective(c: Creneau): Periode | '' {
  if (c.periode !== '') return c.periode;
  if (c.debut === '' || !heureValide(c.debut)) return '';
  const h = Number(c.debut.split(':')[0]);
  if (h < 5) return 'nuit';
  if (h < 12) return 'matin';
  if (h < 14) return 'midi';
  if (h < 18) return 'apres-midi';
  if (h < 22) return 'soir';
  return 'nuit';
}

// "09:30–11:00", "Matin", "Toute la journée", "Heure à définir"
export function libelleHoraire(c: Creneau): string {
  if (c.debut !== '' && c.fin !== '') return `${c.debut}–${c.fin}`;
  if (c.debut !== '') return c.debut;
  if (c.periode !== '') return LIBELLES_PERIODE[c.periode];
  return c.fixe ? 'Toute la journée' : 'Heure à définir';
}

// ---------- Créneaux principaux, plans B, participants ----------

export const estPrincipal = (c: Creneau): boolean => c.planBDe === '';
// Compte dans les totaux et les alertes : ni annulé, ni plan B
export const estActif = (c: Creneau): boolean => c.statut !== 'annule' && c.planBDe === '';

export function alternatifDe(d: Donnees, id: string): Creneau | undefined {
  return d.creneaux.find((c) => c.planBDe === id);
}

export function idsParticipantsJour(d: Donnees, jour: string): string[] {
  const j = d.joursPlan.find((x) => x.jour === jour);
  return j ? j.participants : d.personnes.map((p) => p.id);
}

// Qui participe : ceux du créneau s'il en a, sinon ceux du jour (tout le monde par défaut)
export function participantsEffectifs(c: Creneau, d: Donnees): Personne[] {
  const ids = c.participants.length > 0 ? c.participants : idsParticipantsJour(d, c.jour);
  return ids.map((id) => d.personnes.find((p) => p.id === id)).filter((p): p is Personne => p !== undefined);
}

export function historique(d: Donnees): Creneau[] {
  return d.creneaux
    .filter((c) => c.statut === 'fait' && estPrincipal(c))
    .sort((a, b) => b.jour.localeCompare(a.jour) || (cleTriCreneau(a) < cleTriCreneau(b) ? 1 : -1));
}

// ---------- Contenu d'une journée ----------

export type ElementJour =
  | { cle: string; tri: number; impose: CreneauImpose }
  | { cle: string; tri: number; libre: Creneau; alternatif: Creneau | undefined };

// Créneaux imposés et créneaux libres (principaux) d'un jour, dans l'ordre de la journée
export function elementsDuJour(d: Donnees, jour: string, imposes: CreneauImpose[]): ElementJour[] {
  const elements: ElementJour[] = [];
  for (const s of imposes) if (s.jour === jour) elements.push({ cle: s.cle, tri: s.tri, impose: s });
  for (const c of d.creneaux) {
    if (c.jour === jour && estPrincipal(c)) elements.push({ cle: `creneau:${c.id}`, tri: cleTriCreneau(c), libre: c, alternatif: alternatifDe(d, c.id) });
  }
  return elements.sort((a, b) => (a.tri === b.tri ? a.cle.localeCompare(b.cle) : a.tri < b.tri ? -1 : 1));
}

// ---------- Totaux ----------

export type BudgetDevise = { devise: string; estime: number; reel: number };
export type Totaux = {
  budgets: BudgetDevise[]; // un total par devise : sans taux de change, on n'additionne pas des monnaies différentes
  activitesMin: number; // durée des créneaux libres dont la durée est connue
  sansDuree: number; // nombre de créneaux libres sans durée connue (non comptés)
  deplacementsMin: number; // durée des trajets et des vols connus
};

function additionner(creneaux: Creneau[], imposes: CreneauImpose[]): Totaux {
  const parDevise = new Map<string, { estime: number; reel: number }>();
  let activitesMin = 0;
  let sansDuree = 0;
  for (const c of creneaux) {
    if (!estActif(c)) continue;
    if (c.budgetEstime !== null || c.budgetReel !== null) {
      const cumul = parDevise.get(c.devise) ?? { estime: 0, reel: 0 };
      cumul.estime += c.budgetEstime ?? 0;
      cumul.reel += c.budgetReel ?? 0;
      parDevise.set(c.devise, cumul);
    }
    const duree = dureeCreneauMin(c);
    if (duree !== null) activitesMin += duree;
    else if (!c.fixe) sansDuree++;
  }
  let deplacementsMin = 0;
  for (const s of imposes) if (s.dureeMin !== null) deplacementsMin += s.dureeMin;
  const budgets = [...parDevise.entries()].map(([devise, v]) => ({ devise, ...v })).sort((a, b) => a.devise.localeCompare(b.devise));
  return { budgets, activitesMin, sansDuree, deplacementsMin };
}

export function totauxJour(d: Donnees, jour: string, imposes: CreneauImpose[]): Totaux {
  return additionner(
    d.creneaux.filter((c) => c.jour === jour),
    imposes.filter((s) => s.jour === jour),
  );
}

export function totauxSejour(d: Donnees, imposes: CreneauImpose[]): Totaux {
  return additionner(d.creneaux, imposes);
}

// ---------- Alertes ----------

export function alertesCreneaux(d: Donnees): Alerte[] {
  const alertes: Alerte[] = [];
  const libres = d.creneaux.filter(estActif).map((c) => ({ c, debut: instantDebut(c), fin: instantFin(c) }));

  // Intervalles imposés : mes vols, et les trajets dont on connaît le début et la fin
  type Intervalle = { libelle: string; debut: number; fin: number; cle: string };
  const imposes: Intervalle[] = [];
  for (const v of d.vols) {
    if (!v.pourMoi || v.statut === 'annule') continue;
    const debut = instantDepart(v);
    const fin = instantArrivee(v);
    if (!Number.isNaN(debut) && !Number.isNaN(fin)) imposes.push({ libelle: `le vol ${v.numero}`, debut, fin, cle: `vol:${v.id}` });
  }
  for (const t of d.trajets) {
    const calcul = calculerTrajet(t, d);
    if (calcul.debutMs !== null && calcul.finMs !== null) imposes.push({ libelle: `le trajet « ${t.de} → ${t.a} »`, debut: calcul.debutMs, fin: calcul.finMs, cle: `trajet:${t.id}` });
  }

  // 1. Chevauchements : entre deux créneaux libres, ou entre un créneau libre et un vol ou un trajet
  const aHoraire = libres.filter((x): x is { c: Creneau; debut: number; fin: number } => x.debut !== null && x.fin !== null);
  for (let i = 0; i < aHoraire.length; i++) {
    const a = aHoraire[i];
    for (let j = i + 1; j < aHoraire.length; j++) {
      const b = aHoraire[j];
      if (a.debut < b.fin && b.debut < a.fin) {
        alertes.push({ cle: `chevauche:${a.c.id}:${b.c.id}`, message: `Chevauchement : « ${a.c.titre} » et « ${b.c.titre} » se superposent.`, genre: 'creneau', id: a.c.id, jour: a.c.jour });
      }
    }
    for (const x of imposes) {
      if (a.debut < x.fin && x.debut < a.fin) {
        alertes.push({ cle: `chevauche:${a.c.id}:${x.cle}`, message: `Chevauchement : « ${a.c.titre} » et ${x.libelle} se superposent.`, genre: 'creneau', id: a.c.id, jour: a.c.jour });
      }
    }
  }

  // 2. Créneau trop proche d'un de mes vols : pendant le temps qu'il faut pour rejoindre l'aéroport
  for (const v of d.vols) {
    if (!v.pourMoi || v.statut === 'annule') continue;
    const decollage = instantDepart(v);
    if (Number.isNaN(decollage)) continue;
    const limite = decollage - d.reglages.delaiAeroportMin[v.portee] * 60000;
    const departsConseilles = d.trajets
      .filter((t) => t.volId === v.id && t.lienVol === 'vers')
      .map((t) => calculerTrajet(t, d).conseilleMs)
      .filter((x): x is number => x !== null);
    const debutFenetre = departsConseilles.length > 0 ? Math.min(limite, ...departsConseilles) : limite;
    const f = v.depart.fuseau;
    if (!fuseauValide(f)) continue;
    for (const { c, debut, fin } of libres) {
      if (debut === null) continue;
      const finEffective = fin ?? debut;
      if (debut < decollage && finEffective > debutFenetre) {
        const quand = heureAvecJour(debutFenetre, f, v.depart.date);
        const quoi = departsConseilles.length > 0 ? `il faut partir pour l'aéroport vers ${quand}` : `il faut être à l'aéroport avant ${quand}`;
        alertes.push({ cle: `proche-vol:${c.id}:${v.id}`, message: `« ${c.titre} » est trop proche du vol ${v.numero} : ${quoi}.`, genre: 'creneau', id: c.id, jour: c.jour });
      }
    }
  }
  return alertes;
}

// ---------- Opérations sur les créneaux (fonctions pures : elles renvoient de nouveaux créneaux) ----------

const horaire = (c: Creneau) => ({ jour: c.jour, periode: c.periode, debut: c.debut, fin: c.fin, fuseau: c.fuseau });

// Échange les places (jour, période, heures) de deux créneaux
export function echanger(a: Creneau, b: Creneau): [Creneau, Creneau] {
  return [
    { ...a, ...horaire(b) },
    { ...b, ...horaire(a) },
  ];
}

// Le plan B prend la place du créneau principal ; l'ancien principal devient son plan B.
// Renvoie [ancien principal (devenu plan B), ancien plan B (devenu principal)].
export function promouvoirPlanB(principal: Creneau, alternatif: Creneau): [Creneau, Creneau] {
  return [
    { ...principal, planBDe: alternatif.id },
    { ...alternatif, ...horaire(principal), planBDe: '' },
  ];
}

// Copie à enregistrer ou à modifier : même place, statut "idée", jamais un événement fixe ni un plan B
export function copierCreneau(c: Creneau, nouvelId: string): Creneau {
  return { ...c, id: nouvelId, statut: 'idee', budgetReel: null, planBDe: '', fixe: false, typeEvenement: '', participants: [...c.participants] };
}

// Brouillon de plan B : même place et mêmes participants, contenu vide
export function creerAlternative(c: Creneau, nouvelId: string): Creneau {
  return {
    ...horaire(c),
    id: nouvelId,
    titre: '',
    note: '',
    statut: 'idee',
    humeur: '',
    participants: [...c.participants],
    budgetEstime: null,
    budgetReel: null,
    devise: c.devise,
    dureeMin: null,
    planBDe: c.id,
    fixe: false,
    typeEvenement: '',
  };
}

// Quand le principal change de place, son plan B le suit
export function suivrePlace(plan: Creneau, principal: Creneau): Creneau {
  return { ...plan, ...horaire(principal) };
}

// ---------- Créneaux datés (pour les compteurs) ----------

export type CreneauDatable = { cle: string; titre: string; debutMs: number; fuseau: string; zone: string };

// Tous les créneaux dont l'heure de début est connue : imposés (vols, trajets, logements) et libres
export function creneauxDatables(d: Donnees, imposes: CreneauImpose[] = creneauxImposes(d)): CreneauDatable[] {
  const liste: CreneauDatable[] = [];
  for (const s of imposes) if (s.debutMs !== null) liste.push({ cle: s.cle, titre: s.titre, debutMs: s.debutMs, fuseau: s.fuseau, zone: s.zone });
  for (const c of d.creneaux) {
    if (!estActif(c)) continue;
    const debut = instantDebut(c);
    if (debut !== null) liste.push({ cle: `creneau:${c.id}`, titre: c.titre, debutMs: debut, fuseau: c.fuseau, zone: nomFuseau(c.fuseau) });
  }
  return liste.sort((a, b) => a.debutMs - b.debutMs);
}

// Comme "resoudre" (vols.ts), mais gère aussi les compteurs sur un créneau du planning
export function resoudreCompteurComplet(c: Compteur, d: Donnees, maintenantMs: number, imposes?: CreneauImpose[]): CompteurResolu {
  if (c.cible.type !== 'creneau') return resoudre(c, d, maintenantMs);
  const cle = c.cible.cle;
  const trouve = creneauxDatables(d, imposes).find((x) => x.cle === cle);
  if (!trouve) return { etat: 'invalide', raison: "Ce créneau n'existe plus, ou n'a plus d'heure." };
  const cibleMs = trouve.debutMs - c.delaiMin * 60000;
  return { etat: cibleMs > maintenantMs ? 'actif' : 'passe', cibleMs };
}

// Logique des étapes et des logements (sans affichage, donc facile à tester).

import type { Coordonnees, Etape, Logement } from '../data/types.ts';
import { dateValide } from './temps.ts';

const MS_PAR_JOUR = 86400000;
const deux = (n: number): string => String(n).padStart(2, '0');

// Les dates sont des textes AAAA-MM-JJ. On les compte en "numéro de jour" pour calculer sans piège.
function numeroJour(dateIso: string): number {
  const [annee, mois, jour] = dateIso.split('-').map(Number);
  return Date.UTC(annee, mois - 1, jour) / MS_PAR_JOUR;
}

function dateDepuisNumero(n: number): string {
  const d = new Date(n * MS_PAR_JOUR);
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`;
}

export function ajouterJours(dateIso: string, jours: number): string {
  return dateDepuisNumero(numeroJour(dateIso) + jours);
}

// Nombre de nuits entre le jour d'arrivée et le jour de départ
export function nbNuits(debut: string, fin: string): number {
  return numeroJour(fin) - numeroJour(debut);
}

const JOURS_SEMAINE = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

// "2026-12-05" -> "sam."
export function jourSemaine(dateIso: string): string {
  return JOURS_SEMAINE[new Date(numeroJour(dateIso) * MS_PAR_JOUR).getUTCDay()];
}

// Tous les jours de "du" à "au" inclus (avec une limite de sécurité)
export function listeJours(du: string, au: string, max = 400): string[] {
  const premier = numeroJour(du);
  const dernier = Math.min(numeroJour(au), premier + max - 1);
  const jours: string[] = [];
  for (let n = premier; n <= dernier; n++) jours.push(dateDepuisNumero(n));
  return jours;
}

// Nombre de jours entre deux dates (positif si "au" est après "du")
export function joursEntre(du: string, au: string): number {
  return numeroJour(au) - numeroJour(du);
}

// Premier lien http(s) trouvé dans un texte libre (par exemple le champ "source"), sinon null
export function premierLien(texte: string): string | null {
  const m = /https?:\/\/[^\s<>"]+/.exec(texte);
  if (!m) return null;
  return lienSur(m[0].replace(/[.,;:)\]]+$/, ''));
}

export function etapesTriees(etapes: Etape[]): Etape[] {
  return [...etapes].sort((a, b) => a.debut.localeCompare(b.debut) || a.fin.localeCompare(b.fin) || a.nom.localeCompare(b.nom, 'fr'));
}

export function logementsTries(logements: Logement[]): Logement[] {
  const cle = (l: Logement): string => `${l.arrivee.date} ${l.arrivee.heure || '99:99'}`;
  return [...logements].sort((a, b) => cle(a).localeCompare(cle(b)) || a.nom.localeCompare(b.nom, 'fr'));
}

export type NuitsSansLogement = { du: string; au: string; nuits: number };

// Les nuits d'une étape qu'aucun logement ne couvre. "au" est le jour du réveil (exclu).
// Un logement "à trouver" compte comme une place réservée dans le planning : il est signalé à part.
export function nuitsSansLogement(etape: Etape, logementsDeLEtape: Logement[]): NuitsSansLogement[] {
  if (!dateValide(etape.debut) || !dateValide(etape.fin)) return [];
  const premiere = numeroJour(etape.debut);
  const apresDerniere = numeroJour(etape.fin); // la nuit du jour de départ n'est pas comptée
  const couvertes = new Set<number>();
  for (const l of logementsDeLEtape) {
    if (!dateValide(l.arrivee.date) || !dateValide(l.depart.date)) continue;
    const de = Math.max(numeroJour(l.arrivee.date), premiere);
    const a = Math.min(numeroJour(l.depart.date), apresDerniere);
    for (let n = de; n < a; n++) couvertes.add(n);
  }
  const trous: NuitsSansLogement[] = [];
  let debutTrou: number | null = null;
  for (let n = premiere; n <= apresDerniere; n++) {
    const manque = n < apresDerniere && !couvertes.has(n);
    if (manque && debutTrou === null) debutTrou = n;
    if (!manque && debutTrou !== null) {
      trous.push({ du: dateDepuisNumero(debutTrou), au: dateDepuisNumero(n), nuits: n - debutTrou });
      debutTrou = null;
    }
  }
  return trous;
}

// Un lien n'est accepté que s'il commence par http:// ou https:// (jamais "javascript:" ou autre)
export function lienSur(url: string): string | null {
  const texte = url.trim();
  if (texte === '') return null;
  try {
    const u = new URL(texte);
    return u.protocol === 'https:' || u.protocol === 'http:' ? texte : null;
  } catch {
    return null;
  }
}

// "13.7563, 100.5018" ou "13.7563 100.5018" -> coordonnées. Vide = pas de coordonnées.
export function analyserGps(saisie: string): { ok: true; gps: Coordonnees | null } | { ok: false } {
  const texte = saisie.trim();
  if (texte === '') return { ok: true, gps: null };
  const m = /^(-?\d+(?:\.\d+)?)\s*[,;]?\s*(-?\d+(?:\.\d+)?)$/.exec(texte);
  if (!m) return { ok: false };
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return { ok: false };
  return { ok: true, gps: { lat, lng } };
}

export function formatGps(gps: Coordonnees | null): string {
  return gps ? `${gps.lat}, ${gps.lng}` : '';
}

// Liens pour ouvrir un logement dans une application de cartes (seulement quand on touche le lien)
export function liensCartes(l: Pick<Logement, 'nom' | 'adresse' | 'gps'>): { plans: string; google: string } | null {
  let requete: string;
  if (l.gps) requete = `${l.gps.lat},${l.gps.lng}`;
  else if (l.adresse.trim() !== '') requete = l.adresse.trim();
  else return null;
  const q = encodeURIComponent(requete);
  return {
    plans: l.gps ? `https://maps.apple.com/?ll=${q}&q=${encodeURIComponent(l.nom || 'Logement')}` : `https://maps.apple.com/?q=${q}`,
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}

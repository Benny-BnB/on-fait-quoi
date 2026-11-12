// Fabrication du fichier d'agenda (.ics, format iCalendar, RFC 5545), lisible par Apple Calendrier et Outlook.
// Les heures sont écrites en UTC (suffixe Z) pour éviter tout problème de fuseau : l'agenda les convertit
// tout seul dans le fuseau de l'appareil. L'heure locale du lieu est rappelée dans la description.

import type { EvenementAgenda } from './agenda.ts';
import { ajouterJours } from './sejour.ts';

export type OptionsIcs = {
  maintenantMs: number; // heure de fabrication du fichier (passée en paramètre pour que le résultat soit prévisible)
  rappelsDeplacementsMin: number[]; // rappels avant un vol ou un trajet, en minutes ([] = aucun)
  rappelsAutresMin: number[]; // rappels avant un logement ou un créneau du planning
  rappelTaches: boolean; // rappel la veille à 9 h pour une échéance de check-list
  nomCalendrier: string;
};

const deux = (n: number): string => String(n).padStart(2, '0');

// 20270115T063000Z
export function formatInstantIcs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${deux(d.getUTCMonth() + 1)}${deux(d.getUTCDate())}T${deux(d.getUTCHours())}${deux(d.getUTCMinutes())}${deux(d.getUTCSeconds())}Z`;
}

// 2027-01-15 -> 20270115
export function formatJourIcs(jour: string): string {
  return jour.replaceAll('-', '');
}

// Dans un texte iCalendar : \ ; , et les retours à la ligne s'écrivent avec une barre oblique
export function echapperTexteIcs(texte: string): string {
  return texte.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

// Une ligne ne dépasse pas 75 octets : on la coupe sans jamais séparer un caractère accentué en deux
export function plierLigne(ligne: string): string[] {
  const encodeur = new TextEncoder();
  const morceaux: string[] = [];
  let courant = '';
  let octets = 0;
  let limite = 75;
  for (const caractere of ligne) {
    const n = encodeur.encode(caractere).length;
    if (octets + n > limite) {
      morceaux.push(courant);
      courant = '';
      octets = 0;
      limite = 74; // les lignes suivantes commencent par une espace
    }
    courant += caractere;
    octets += n;
  }
  morceaux.push(courant);
  return morceaux.map((m, i) => (i === 0 ? m : ` ${m}`));
}

// 180 -> -PT3H ; 1440 -> -P1D ; 90 -> -PT1H30M
export function declencheurAvant(minutes: number): string {
  const jours = Math.floor(minutes / 1440);
  const heures = Math.floor((minutes % 1440) / 60);
  const min = minutes % 60;
  let texte = '-P';
  if (jours > 0) texte += `${jours}D`;
  if (heures > 0 || min > 0) {
    texte += 'T';
    if (heures > 0) texte += `${heures}H`;
    if (min > 0) texte += `${min}M`;
  }
  return texte;
}

// Un identifiant d'événement sans caractère qui gênerait un agenda
function uidSur(uid: string): string {
  return `${uid.replace(/[^A-Za-z0-9._-]/g, '-')}@on-fait-quoi`;
}

function rappel(declencheur: string, titre: string): string[] {
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${echapperTexteIcs(titre)}`, `TRIGGER:${declencheur}`, 'END:VALARM'];
}

function lignesEvenement(e: EvenementAgenda, o: OptionsIcs): string[] {
  const lignes: string[] = ['BEGIN:VEVENT', `UID:${uidSur(e.uid)}`, `DTSTAMP:${formatInstantIcs(o.maintenantMs)}`];
  // Un numéro de version qui grandit à chaque fabrication : l'agenda sait que ce fichier est plus récent
  lignes.push(`SEQUENCE:${Math.floor(o.maintenantMs / 60000)}`);
  lignes.push(`SUMMARY:${echapperTexteIcs(e.titre)}`);
  const toutelaJournee = e.debutMs === null;
  if (e.debutMs === null) {
    lignes.push(`DTSTART;VALUE=DATE:${formatJourIcs(e.jour)}`);
    lignes.push(`DTEND;VALUE=DATE:${formatJourIcs(ajouterJours(e.jour, 1))}`); // la fin d'un événement « toute la journée » est le lendemain
    lignes.push('TRANSP:TRANSPARENT'); // ne bloque pas la disponibilité
  } else {
    lignes.push(`DTSTART:${formatInstantIcs(e.debutMs)}`);
    if (e.finMs !== null && e.finMs >= e.debutMs) lignes.push(`DTEND:${formatInstantIcs(e.finMs)}`);
  }
  if (e.lieu !== '') lignes.push(`LOCATION:${echapperTexteIcs(e.lieu)}`);
  if (e.details.length > 0) lignes.push(`DESCRIPTION:${echapperTexteIcs(e.details.join('\n'))}`);

  if (toutelaJournee) {
    if (e.genre === 'tache' && o.rappelTaches) lignes.push(...rappel('-PT15H', e.titre)); // la veille à 9 h
  } else {
    const minutes = e.genre === 'vol' || e.genre === 'trajet' ? o.rappelsDeplacementsMin : o.rappelsAutresMin;
    for (const m of [...new Set(minutes)].filter((x) => Number.isInteger(x) && x > 0).sort((a, b) => b - a)) {
      lignes.push(...rappel(declencheurAvant(m), e.titre));
    }
  }
  lignes.push('END:VEVENT');
  return lignes;
}

// Le fichier complet, avec des fins de ligne CRLF comme l'exige le format
export function construireIcs(evenements: EvenementAgenda[], o: OptionsIcs): string {
  const lignes: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//On fait quoi//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${echapperTexteIcs(o.nomCalendrier)}`];
  for (const e of evenements) lignes.push(...lignesEvenement(e, o));
  lignes.push('END:VCALENDAR');
  return `${lignes.flatMap(plierLigne).join('\r\n')}\r\n`;
}

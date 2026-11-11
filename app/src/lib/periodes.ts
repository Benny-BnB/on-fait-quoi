import type { Periode } from '../data/types.ts';

// Heures "de rangement" des périodes : elles servent UNIQUEMENT à ordonner la journée
// (et à vérifier un horaire d'ouverture quand on ne donne qu'une période) ; on ne les affiche jamais comme des heures.
export const HEURE_PERIODE: Record<Periode, string> = {
  matin: '09:00',
  midi: '12:30',
  'apres-midi': '15:00',
  soir: '19:00',
  nuit: '22:30',
};

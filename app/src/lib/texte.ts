// Texte sans accents ni majuscules, pour les recherches et les comparaisons
export function normaliserTexte(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

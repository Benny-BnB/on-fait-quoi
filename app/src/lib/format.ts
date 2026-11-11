// Formats d'affichage imposés par le cahier des charges :
// dates JJ/MM/AAAA, heures sur 24 h.

const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

export function formatDate(d: Date): string {
  return `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatHeure(d: Date): string {
  return `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
}

export function formatDateHeure(d: Date): string {
  return `${formatDate(d)} à ${formatHeure(d)}`;
}

// Heure avec secondes, vue dans le fuseau du téléphone
export function formatHeureSecondes(d: Date): string {
  return `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}:${deuxChiffres(d.getSeconds())}`;
}

// Heure avec secondes en UTC (indépendante de tout fuseau)
export function formatHeureUtcSecondes(d: Date): string {
  return `${deuxChiffres(d.getUTCHours())}:${deuxChiffres(d.getUTCMinutes())}:${deuxChiffres(d.getUTCSeconds())}`;
}

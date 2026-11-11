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

// 1234.5 -> "1.234,50" ; 39 -> "39" (milliers avec un point, décimales avec une virgule)
export function formatNombre(n: number): string {
  const [entier, decimales] = Math.abs(n).toFixed(2).split('.');
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${groupe}${decimales === '00' ? '' : `,${decimales}`}`;
}

// Euro : 1.234,56€ ; autre devise : 1.234 THB (le code de la monnaie locale reste affiché)
export function formatMontant(n: number, devise: string): string {
  return devise === 'EUR' ? `${formatNombre(n)}€` : `${formatNombre(n)} ${devise}`;
}

// Heure avec secondes, vue dans le fuseau du téléphone
export function formatHeureSecondes(d: Date): string {
  return `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}:${deuxChiffres(d.getSeconds())}`;
}

// Heure avec secondes en UTC (indépendante de tout fuseau)
export function formatHeureUtcSecondes(d: Date): string {
  return `${deuxChiffres(d.getUTCHours())}:${deuxChiffres(d.getUTCMinutes())}:${deuxChiffres(d.getUTCSeconds())}`;
}

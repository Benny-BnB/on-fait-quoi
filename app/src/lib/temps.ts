// Calculs d'heures et de fuseaux horaires.
//
// Principe : on ne se sert JAMAIS du fuseau du téléphone pour une heure de vol.
// On part de l'heure locale écrite sur le billet + le fuseau de la ville, et on en
// déduit un instant exact (en millisecondes depuis 1970, identique partout dans le monde).
// Le compteur est alors "instant exact moins maintenant" : le fuseau du téléphone ne change rien.

const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function dateValide(s: string): boolean {
  const m = RE_DATE.exec(s);
  if (!m) return false;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  const jour = Number(m[3]);
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  return d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour;
}

export function heureValide(s: string): boolean {
  return RE_HEURE.test(s);
}

const formateurs = new Map<string, Intl.DateTimeFormat | null>();

function formateur(fuseau: string): Intl.DateTimeFormat | null {
  const connu = formateurs.get(fuseau);
  if (connu !== undefined) return connu;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuseau,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  } catch {
    f = null; // nom de fuseau inconnu
  }
  formateurs.set(fuseau, f);
  return f;
}

export function fuseauValide(fuseau: string): boolean {
  return fuseau.trim() !== '' && formateur(fuseau) !== null;
}

// Écart (en ms) entre l'heure locale du fuseau et l'heure UTC, à un instant donné.
// Exemple : Bruxelles en décembre = +1 h = +3 600 000 ms.
export function decalageMs(instantMs: number, fuseau: string): number {
  const f = formateur(fuseau);
  if (!f) return NaN;
  const parties = f.formatToParts(new Date(instantMs));
  const valeur = (type: string): number => Number(parties.find((p) => p.type === type)?.value);
  const heureLocaleCommeUtc = Date.UTC(
    valeur('year'),
    valeur('month') - 1,
    valeur('day'),
    valeur('hour') % 24,
    valeur('minute'),
    valeur('second'),
  );
  return heureLocaleCommeUtc - Math.floor(instantMs / 1000) * 1000;
}

// Instant exact (ms depuis 1970) d'une heure locale dans un fuseau. NaN si une donnée est invalide.
export function instantLocal(date: string, heure: string, fuseau: string): number {
  if (!dateValide(date) || !heureValide(heure) || !fuseauValide(fuseau)) return NaN;
  const [annee, mois, jour] = date.split('-').map(Number);
  const [h, min] = heure.split(':').map(Number);
  const naif = Date.UTC(annee, mois - 1, jour, h, min);
  // Deux passes : la seconde corrige le cas d'un changement d'heure (été/hiver) proche
  const premier = naif - decalageMs(naif, fuseau);
  return naif - decalageMs(premier, fuseau);
}

const deux = (n: number): string => String(n).padStart(2, '0');

// Date et heure d'un instant, vues dans un fuseau donné
export function partiesDansFuseau(instantMs: number, fuseau: string) {
  const d = new Date(instantMs + decalageMs(instantMs, fuseau));
  return {
    annee: d.getUTCFullYear(),
    mois: d.getUTCMonth() + 1,
    jour: d.getUTCDate(),
    heure: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    seconde: d.getUTCSeconds(),
  };
}

export function formatDateDansFuseau(instantMs: number, fuseau: string): string {
  const p = partiesDansFuseau(instantMs, fuseau);
  return `${deux(p.jour)}/${deux(p.mois)}/${p.annee}`;
}

export function formatHeureDansFuseau(instantMs: number, fuseau: string): string {
  const p = partiesDansFuseau(instantMs, fuseau);
  return `${deux(p.heure)}:${deux(p.minute)}`;
}

export function formatDateHeureDansFuseau(instantMs: number, fuseau: string): string {
  return `${formatDateDansFuseau(instantMs, fuseau)} à ${formatHeureDansFuseau(instantMs, fuseau)}`;
}

export function formatUtc(instantMs: number): string {
  const d = new Date(instantMs);
  return `${deux(d.getUTCDate())}/${deux(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())} UTC`;
}

// "AAAA-MM-JJ" -> "JJ/MM/AAAA"
export function formatDateIso(date: string): string {
  const m = RE_DATE.exec(date);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : date;
}

export type Decompte = { jours: number; heures: number; minutes: number; secondes: number };

// Découpe un temps restant en jours / heures / minutes / secondes.
// On arrondit vers le haut : le compteur affiche 0 seconde exactement à l'heure de la cible.
export function decomposer(msRestantes: number): Decompte {
  const total = Math.max(0, Math.ceil(msRestantes / 1000));
  return {
    jours: Math.floor(total / 86400),
    heures: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    secondes: total % 60,
  };
}

// 395 -> "6 h 35", 180 -> "3 h", 45 -> "45 min"
export function formatDureeMin(minutes: number): string {
  if (!Number.isFinite(minutes)) return '?';
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const reste = m % 60;
  if (h === 0) return `${reste} min`;
  return reste === 0 ? `${h} h` : `${h} h ${deux(reste)}`;
}

export function fuseauTelephone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// "Asia/Dubai" -> "Dubai", "America/New_York" -> "New York"
export function nomFuseau(fuseau: string): string {
  return (fuseau.split('/').pop() ?? fuseau).replace(/_/g, ' ');
}

// Liste des noms de fuseaux proposés dans les formulaires
export function listeFuseaux(): string[] {
  const proposes = ['Europe/Brussels', 'Asia/Dubai', 'Asia/Bangkok'];
  try {
    const tous = Intl.supportedValuesOf('timeZone');
    return tous.length > 0 ? tous : proposes;
  } catch {
    return proposes;
  }
}

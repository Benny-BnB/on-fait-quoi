// Planning : calcul des heures de trajet, créneaux imposés et alertes.
// Tout est calculé à partir des vols, logements et trajets : rien n'est stocké en double,
// donc si un vol change d'heure, le planning suit tout de suite.

import type { Donnees, Etape, Trajet, Vol } from '../data/types.ts';
import { LIBELLES_MODE, LIBELLES_STATUT_LOGEMENT } from '../data/types.ts';
import { etapesTriees, listeJours } from './sejour.ts';
import { dateValide, formatDateIso, formatDureeMin, formatHeureDansFuseau, fuseauValide, instantLocal, nomFuseau, partiesDansFuseau } from './temps.ts';
import { dureeVolMin, instantArrivee, instantDepart } from './vols.ts';

const deux = (n: number): string => String(n).padStart(2, '0');
const nombreOuNull = (x: number): number | null => (Number.isNaN(x) ? null : x);
const HEURE_MS = 3600 * 1000;

// Jour (AAAA-MM-JJ) d'un instant, vu dans un fuseau
export function jourDans(instantMs: number, fuseau: string): string {
  const p = partiesDansFuseau(instantMs, fuseau);
  return `${p.annee}-${deux(p.mois)}-${deux(p.jour)}`;
}

// "06:55", ou "06:55 (le 29/12)" si ce n'est pas le jour de référence
export function heureAvecJour(instantMs: number, fuseau: string, jourReference: string): string {
  const heure = formatHeureDansFuseau(instantMs, fuseau);
  const jour = jourDans(instantMs, fuseau);
  return jour === jourReference ? heure : `${heure} (le ${formatDateIso(jour)})`;
}

// ---------- Heure d'un trajet ----------

export type OrigineHeure = 'saisie' | 'conseillee' | 'arrivee-vol' | 'inconnue';

export type CalculTrajet = {
  debutMs: number | null; // instant de départ, si on peut le connaître
  finMs: number | null; // instant d'arrivée, si départ et durée sont connus
  origine: OrigineHeure; // d'où vient l'heure : saisie par l'utilisateur, calculée d'après le vol, etc.
  fuseau: string; // fuseau dans lequel afficher l'heure
  vol: Vol | undefined;
  aeroportAvantMs: number | null; // trajet "vers" un vol : heure limite d'arrivée à l'aéroport
  conseilleMs: number | null; // heure de départ conseillée = limite d'arrivée - durée du trajet
};

export function calculerTrajet(t: Trajet, d: Donnees): CalculTrajet {
  const vol = t.volId !== '' ? d.vols.find((v) => v.id === t.volId) : undefined;
  const dureeMs = t.dureeMin === null ? null : t.dureeMin * 60000;
  let fuseau = t.fuseau;
  let aeroportAvantMs: number | null = null;
  let conseilleMs: number | null = null;

  if (vol && t.lienVol === 'vers') {
    const decollage = nombreOuNull(instantDepart(vol));
    if (decollage !== null) {
      aeroportAvantMs = decollage - d.reglages.delaiAeroportMin[vol.portee] * 60000;
      if (dureeMs !== null) conseilleMs = aeroportAvantMs - dureeMs;
    }
    fuseau = vol.depart.fuseau;
  } else if (vol) {
    fuseau = vol.arrivee.fuseau;
  }

  let debutMs: number | null = null;
  let origine: OrigineHeure = 'inconnue';
  const saisi = t.heure !== '' ? nombreOuNull(instantLocal(t.date, t.heure, t.fuseau)) : null;
  if (saisi !== null) {
    debutMs = saisi;
    origine = 'saisie';
    fuseau = t.fuseau;
  } else if (conseilleMs !== null) {
    debutMs = conseilleMs;
    origine = 'conseillee';
  } else if (vol && t.lienVol === 'depuis') {
    const atterrissage = nombreOuNull(instantArrivee(vol));
    if (atterrissage !== null) {
      debutMs = atterrissage;
      origine = 'arrivee-vol';
    }
  }
  const finMs = debutMs !== null && dureeMs !== null ? debutMs + dureeMs : null;
  return { debutMs, finMs, origine, fuseau, vol, aeroportAvantMs, conseilleMs };
}

// ---------- Créneaux imposés ----------

export type GenreSource = 'vol' | 'trajet' | 'logement';
export type TypeCreneau = 'vol-depart' | 'vol-arrivee' | 'trajet' | 'logement-arrivee' | 'logement-depart';

export type CreneauImpose = {
  cle: string; // identifiant stable, ex. "vol:abc:depart"
  type: TypeCreneau;
  jour: string; // AAAA-MM-JJ, jour local du lieu
  debutMs: number | null; // instant exact, null si l'heure n'est pas connue
  heure: string; // HH:MM local, '' si inconnue
  fuseau: string;
  zone: string; // nom du lieu pour afficher "heure de ..."
  titre: string;
  details: string[];
  dureeMin: number | null; // durée connue (trajet, vol), sert aux totaux de temps
  tri: number; // clé pour ranger les créneaux dans la journée (instant, ou juste avant le vol pour un trajet sans heure)
  genre: GenreSource; // d'où vient ce créneau (pour ouvrir le bon formulaire)
  id: string;
  secondaire: boolean; // vol d'une autre personne : affiché plus discrètement
  attention: boolean; // à vérifier ou à trouver
};

export function creneauxImposes(d: Donnees): CreneauImpose[] {
  const liste: Omit<CreneauImpose, 'tri'>[] = [];
  // Clé de tri des trajets sans heure vers un aéroport : juste avant l'heure limite d'arrivée à l'aéroport
  const triSansHeure = new Map<string, number>();

  for (const v of d.vols) {
    if (v.statut === 'annule') continue;
    const depart = nombreOuNull(instantDepart(v));
    const arrivee = nombreOuNull(instantArrivee(v));
    const secondaire = !v.pourMoi;
    const marque = secondaire ? ` (vol de ${v.passagers || 'quelqu\'un d\'autre'})` : '';
    const attention = v.statut === 'a-verifier';

    const detailsDepart: string[] = [];
    if (v.compagnie) detailsDepart.push(v.compagnie);
    if (v.depart.terminal) detailsDepart.push(`Terminal ${v.depart.terminal}`);
    if (depart !== null && v.pourMoi) {
      const limite = depart - d.reglages.delaiAeroportMin[v.portee] * 60000;
      detailsDepart.push(`Être à l'aéroport avant ${heureAvecJour(limite, v.depart.fuseau, v.depart.date)}`);
    }
    if (v.reference) detailsDepart.push(`Référence ${v.reference}`);
    liste.push({
      cle: `vol:${v.id}:depart`,
      type: 'vol-depart',
      jour: v.depart.date,
      debutMs: depart,
      heure: v.depart.heure,
      fuseau: v.depart.fuseau,
      zone: v.depart.ville || v.depart.code,
      titre: `Décollage ${v.numero} · ${v.depart.code} → ${v.arrivee.code}${marque}`,
      details: detailsDepart,
      dureeMin: nombreOuNull(dureeVolMin(v)),
      genre: 'vol',
      id: v.id,
      secondaire,
      attention,
    });

    liste.push({
      cle: `vol:${v.id}:arrivee`,
      type: 'vol-arrivee',
      jour: v.arrivee.date,
      debutMs: arrivee,
      heure: v.arrivee.heure,
      fuseau: v.arrivee.fuseau,
      zone: v.arrivee.ville || v.arrivee.code,
      titre: `Atterrissage ${v.numero} à ${v.arrivee.ville || v.arrivee.code}${marque}`,
      details: v.arrivee.terminal ? [`Terminal ${v.arrivee.terminal}`] : [],
      dureeMin: null,
      genre: 'vol',
      id: v.id,
      secondaire,
      attention: false,
    });
  }

  for (const t of d.trajets) {
    const c = calculerTrajet(t, d);
    const fuseauOk = fuseauValide(c.fuseau);
    const connu = c.debutMs !== null && fuseauOk;
    const details: string[] = [t.mode !== '' ? LIBELLES_MODE[t.mode] : 'Mode à choisir'];
    if (t.dureeMin !== null) details.push(`Durée ${formatDureeMin(t.dureeMin)}${t.dureeEstimee ? ' (estimée)' : ''}`);

    if (c.vol && t.lienVol === 'vers' && c.aeroportAvantMs !== null && fuseauOk) {
      details.push(`Être à l'aéroport avant ${heureAvecJour(c.aeroportAvantMs, c.vol.depart.fuseau, jourDans(c.aeroportAvantMs, c.vol.depart.fuseau))}`);
    }
    if (c.origine === 'conseillee' && c.vol) {
      details.push(`Départ conseillé : arrivée à l'aéroport ${formatDureeMin(d.reglages.delaiAeroportMin[c.vol.portee])} avant le décollage`);
    } else if (c.origine === 'arrivee-vol' && c.vol) {
      details.push(`À partir de l'atterrissage du vol ${c.vol.numero} (formalités et bagages en plus)`);
    } else if (c.origine === 'inconnue' && c.vol && t.lienVol === 'vers' && t.dureeMin === null) {
      details.push('Heure de départ à définir : durée du trajet inconnue');
    }

    if (!connu && c.vol && t.lienVol === 'vers' && c.aeroportAvantMs !== null) triSansHeure.set(`trajet:${t.id}`, c.aeroportAvantMs - 1);

    liste.push({
      cle: `trajet:${t.id}`,
      type: 'trajet',
      jour: connu && c.debutMs !== null ? jourDans(c.debutMs, c.fuseau) : t.date,
      debutMs: connu ? c.debutMs : null,
      heure: connu && c.debutMs !== null ? formatHeureDansFuseau(c.debutMs, c.fuseau) : '',
      fuseau: c.fuseau,
      zone: c.vol ? (t.lienVol === 'vers' ? c.vol.depart.ville || c.vol.depart.code : c.vol.arrivee.ville || c.vol.arrivee.code) : nomFuseau(c.fuseau),
      titre: `${t.de} → ${t.a}`,
      details,
      dureeMin: t.dureeMin,
      genre: 'trajet',
      id: t.id,
      secondaire: false,
      attention: false,
    });
  }

  for (const l of d.logements) {
    const etape = d.etapes.find((e) => e.id === l.etapeId);
    const fuseau = etape?.fuseau ?? '';
    const fuseauOk = fuseauValide(fuseau);
    const attention = l.statut === 'a-trouver' || l.statut === 'a-verifier';
    for (const quand of ['arrivee', 'depart'] as const) {
      const m = l[quand];
      const instant = fuseauOk && m.heure !== '' ? nombreOuNull(instantLocal(m.date, m.heure, fuseau)) : null;
      const details: string[] = [];
      if (attention) details.push(LIBELLES_STATUT_LOGEMENT[l.statut]);
      if (l.adresse) details.push(l.adresse);
      liste.push({
        cle: `logement:${l.id}:${quand}`,
        type: quand === 'arrivee' ? 'logement-arrivee' : 'logement-depart',
        jour: m.date,
        debutMs: instant,
        heure: m.heure,
        fuseau,
        zone: etape?.nom ?? '',
        titre: `${quand === 'arrivee' ? 'Arrivée' : 'Départ'} : ${l.nom}`,
        details,
        dureeMin: null,
        genre: 'logement',
        id: l.id,
        secondaire: false,
        attention,
      });
    }
  }

  // Sans heure connue : après ceux qui ont une heure (sauf les trajets vers un aéroport, rangés avant leur vol)
  const cle = (c: Omit<CreneauImpose, 'tri'>): number => c.debutMs ?? triSansHeure.get(c.cle) ?? Infinity;
  const avecTri: CreneauImpose[] = liste.map((c) => ({ ...c, tri: cle(c) }));
  return avecTri.sort((a, b) => {
    if (a.jour !== b.jour) return a.jour.localeCompare(b.jour);
    const ca = cle(a);
    const cb = cle(b);
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.titre.localeCompare(b.titre, 'fr');
  });
}

// Tous les jours à afficher : du premier au dernier jour du voyage (créneaux et étapes confondus)
export function plageJours(d: Donnees, creneaux: CreneauImpose[]): string[] {
  const dates = creneaux.map((c) => c.jour).filter(dateValide);
  for (const c of d.creneaux) if (dateValide(c.jour)) dates.push(c.jour);
  for (const e of d.etapes) {
    if (dateValide(e.debut)) dates.push(e.debut);
    if (dateValide(e.fin)) dates.push(e.fin);
  }
  if (dates.length === 0) return [];
  dates.sort();
  return listeJours(dates[0], dates[dates.length - 1]);
}

export function etapesDuJour(jour: string, etapes: Etape[]): Etape[] {
  return etapesTriees(etapes.filter((e) => e.debut <= jour && jour <= e.fin));
}

// ---------- Alertes ----------

export type Alerte = { cle: string; message: string; genre?: GenreSource | 'creneau'; id?: string; jour?: string };

// Un vol qui part de l'aéroport où l'on vient d'atterrir peu avant : pas besoin de trajet (correspondance)
export function estCorrespondance(v: Vol, vols: Vol[]): boolean {
  const depart = instantDepart(v);
  return vols.some((w) => {
    if (w.id === v.id || !w.pourMoi || w.statut === 'annule' || w.arrivee.code !== v.depart.code) return false;
    const ecart = depart - instantArrivee(w);
    return ecart >= 0 && ecart <= 12 * HEURE_MS;
  });
}

export function alertesPlanning(d: Donnees): Alerte[] {
  const alertes: Alerte[] = [];

  // 1. Vol sans trajet prévu vers l'aéroport
  for (const v of d.vols) {
    if (!v.pourMoi || v.statut === 'annule' || Number.isNaN(instantDepart(v))) continue;
    const aUnTrajet = d.trajets.some((t) => t.volId === v.id && t.lienVol === 'vers');
    if (!aUnTrajet && !estCorrespondance(v, d.vols)) {
      alertes.push({ cle: `sans-trajet:${v.id}`, message: `Vol ${v.numero} du ${formatDateIso(v.depart.date)} : aucun trajet prévu vers l'aéroport.`, genre: 'vol', id: v.id });
    }
  }

  const calculs = d.trajets.map((t) => ({ t, c: calculerTrajet(t, d) }));

  for (const { t, c } of calculs) {
    const nom = `« ${t.de} → ${t.a} »`;
    // 2. Un trajet vers l'aéroport qui arrive après l'heure limite
    if (c.origine === 'saisie' && c.finMs !== null && c.aeroportAvantMs !== null && c.vol && c.finMs > c.aeroportAvantMs && fuseauValide(c.vol.depart.fuseau)) {
      const f = c.vol.depart.fuseau;
      const jourRef = jourDans(c.aeroportAvantMs, f);
      alertes.push({
        cle: `trop-tard:${t.id}`,
        message: `Le trajet ${nom} arrive à l'aéroport à ${heureAvecJour(c.finMs, f, jourRef)}, après l'heure conseillée (${heureAvecJour(c.aeroportAvantMs, f, jourRef)}) pour le vol ${c.vol.numero}.`,
        genre: 'trajet',
        id: t.id,
      });
    }
    // 3. La date saisie ne correspond pas au jour calculé d'après le vol
    if ((c.origine === 'conseillee' || c.origine === 'arrivee-vol') && c.debutMs !== null && fuseauValide(c.fuseau)) {
      const jour = jourDans(c.debutMs, c.fuseau);
      if (jour !== t.date) {
        alertes.push({
          cle: `date:${t.id}`,
          message: `Trajet ${nom} : la date saisie (${formatDateIso(t.date)}) ne correspond pas au jour calculé d'après le vol (${formatDateIso(jour)}).`,
          genre: 'trajet',
          id: t.id,
        });
      }
    }
  }

  // 4. Chevauchements : un trajet qui se superpose à un autre trajet ou à un de tes vols
  type Intervalle = { libelle: string; debut: number; fin: number; trajet: boolean; id: string; genre: GenreSource };
  const intervalles: Intervalle[] = [];
  for (const v of d.vols) {
    if (!v.pourMoi || v.statut === 'annule') continue;
    const debut = instantDepart(v);
    const fin = instantArrivee(v);
    if (!Number.isNaN(debut) && !Number.isNaN(fin)) intervalles.push({ libelle: `le vol ${v.numero}`, debut, fin, trajet: false, id: v.id, genre: 'vol' });
  }
  for (const { t, c } of calculs) {
    if (c.debutMs !== null && c.finMs !== null) {
      intervalles.push({ libelle: `le trajet « ${t.de} → ${t.a} »`, debut: c.debutMs, fin: c.finMs, trajet: true, id: t.id, genre: 'trajet' });
    }
  }
  for (let i = 0; i < intervalles.length; i++) {
    for (let j = i + 1; j < intervalles.length; j++) {
      const a = intervalles[i];
      const b = intervalles[j];
      if ((a.trajet || b.trajet) && a.debut < b.fin && b.debut < a.fin) {
        const premier = a.trajet ? a : b;
        alertes.push({ cle: `chevauche:${a.id}:${b.id}`, message: `Chevauchement : ${a.libelle} et ${b.libelle} se superposent.`, genre: premier.genre, id: premier.id });
      }
    }
  }

  // 5. Aucun trajet prévu entre deux étapes qui se suivent
  const etapes = etapesTriees(d.etapes.filter((e) => dateValide(e.debut) && dateValide(e.fin)));
  for (let i = 0; i + 1 < etapes.length; i++) {
    const de = etapes[i];
    const vers = etapes[i + 1];
    const aUnTrajet = d.trajets.some((t) => t.date >= de.fin && t.date <= vers.debut);
    if (!aUnTrajet) {
      alertes.push({ cle: `entre-etapes:${de.id}:${vers.id}`, message: `Aucun trajet prévu de « ${de.nom} » vers « ${vers.nom} » (le ${formatDateIso(vers.debut)}).` });
    }
  }

  return alertes;
}

// Trajets rattachés à un vol pour y aller ("vers")
export function trajetsVersVol(d: Donnees, volId: string): Trajet[] {
  return d.trajets.filter((t) => t.volId === volId && t.lienVol === 'vers');
}

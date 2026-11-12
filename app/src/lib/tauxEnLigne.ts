// Mise à jour des taux de change depuis une source gratuite et citée, sans clé : ExchangeRate-API (open.er-api.com).
// L'app ne contacte ce service que lorsque l'utilisateur touche le bouton, et n'envoie aucune donnée personnelle.

import type { TauxChange } from '../data/types.ts';

export const URL_TAUX_EN_LIGNE = 'https://open.er-api.com/v6/latest/EUR';
export const SOURCE_TAUX_EN_LIGNE = { libelle: 'ExchangeRate-API (open.er-api.com)', lien: 'https://www.exchangerate-api.com' };

export type LectureTaux = { ok: true; taux: TauxChange[]; manquantes: string[] } | { ok: false; erreur: string };

// La réponse donne, pour 1 €, la valeur en chaque devise ; on en tire « 1 unité de devise = x € »
export function lireReponseTaux(brut: unknown, devises: string[]): LectureTaux {
  if (typeof brut !== 'object' || brut === null) return { ok: false, erreur: 'Réponse inattendue de la source.' };
  const r = brut as Record<string, unknown>;
  if (r.result !== 'success') return { ok: false, erreur: 'La source a répondu par une erreur.' };
  const unix = r.time_last_update_unix;
  if (typeof unix !== 'number' || !Number.isFinite(unix) || unix <= 0) return { ok: false, erreur: 'La source ne donne pas la date des taux.' };
  const rates = r.rates;
  if (typeof rates !== 'object' || rates === null) return { ok: false, erreur: 'La source ne donne pas les taux.' };
  const date = new Date(unix * 1000).toISOString().slice(0, 10);
  const taux: TauxChange[] = [];
  const manquantes: string[] = [];
  for (const devise of devises) {
    const pourUnEuro = (rates as Record<string, unknown>)[devise];
    if (typeof pourUnEuro !== 'number' || !(pourUnEuro > 0) || !Number.isFinite(pourUnEuro)) {
      manquantes.push(devise);
      continue;
    }
    taux.push({ devise, taux: 1 / pourUnEuro, date, source: SOURCE_TAUX_EN_LIGNE.libelle, lien: SOURCE_TAUX_EN_LIGNE.lien });
  }
  return { ok: true, taux, manquantes };
}

export async function chargerTauxEnLigne(devises: string[]): Promise<LectureTaux> {
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), 10000);
  try {
    const reponse = await fetch(URL_TAUX_EN_LIGNE, { signal: controle.signal });
    if (!reponse.ok) return { ok: false, erreur: `La source n'a pas répondu (code ${reponse.status}).` };
    return lireReponseTaux(await reponse.json(), devises);
  } catch {
    return { ok: false, erreur: "Impossible de joindre la source (pas de connexion ?). Tu peux saisir le taux à la main." };
  } finally {
    clearTimeout(minuteur);
  }
}

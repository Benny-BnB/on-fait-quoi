import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { personneVide } from '../data/defauts.ts';
import type { Lieu, Personne, SuiviLieu } from '../data/types.ts';
import { affinitesLieu } from './affinites.ts';
import { demandeVide, filtrerLieux, validerFichierLieux } from './lieux.ts';

const DOSSIER = new URL('../data/lieux/', import.meta.url);
const base: Lieu[] = readdirSync(DOSSIER)
  .filter((n) => n.endsWith('.json'))
  .flatMap((n) => {
    const r = validerFichierLieux(JSON.parse(readFileSync(new URL(n, DOSSIER), 'utf8')));
    assert.equal(r.ok, true);
    return r.ok ? r.lieux : [];
  });
const lieu = (id: string): Lieu => {
  const l = base.find((x) => x.id === id);
  assert.ok(l, `lieu ${id} introuvable`);
  return l;
};
const personne = (prenom: string, age: number): Personne => ({ ...personneVide(prenom.toLowerCase(), prenom), ageAns: age });

test("priorités du cahier par tranche : culture pour les seniors, animaux et parcs pour les enfants, rooftops et spots pour les adultes", () => {
  const musee = lieu('dxb-museum-future'); // culture
  assert.deepEqual(affinitesLieu(musee, ['senior', 'adulte', 'enfant']).tranches, ['senior']);
  const safari = lieu('dxb-safari-park'); // nature + famille, étiquette animaux
  assert.deepEqual(affinitesLieu(safari, ['senior', 'adulte', 'enfant']).tranches, ['enfant']);
  const frame = lieu('dxb-dubai-frame'); // spots + culture, et un jardin (étiquette) : les enfants aussi
  assert.deepEqual(affinitesLieu(frame, ['senior', 'adulte', 'enfant']).tranches, ['senior', 'adulte', 'enfant']);
  const sky = lieu('bkk-sky-bar-lebua'); // vie nocturne
  assert.deepEqual(affinitesLieu(sky, ['senior', 'adulte', 'enfant']).tranches, ['adulte']);
});

test("« convient à un groupe mélangé » : seulement avec au moins deux tranches d'âge, et selon les priorités des groupes mélangés", () => {
  const safari = lieu('dxb-safari-park');
  assert.equal(affinitesLieu(safari, ['enfant']).pourTous, false, 'une seule tranche : pas un groupe mélangé');
  assert.equal(affinitesLieu(safari, ['enfant', 'senior']).pourTous, true, 'catégorie famille');
  const musee = lieu('dxb-museum-future'); // culture seulement
  assert.equal(affinitesLieu(musee, ['enfant', 'senior']).pourTous, false);
  // une sortie à la journée (durée de 4 h ou plus) convient aussi à un groupe mélangé
  const journee: Lieu = { ...musee, duree: { minMin: 240, maxMin: 300, estimee: false, base: '', source: musee.horaires!.source } };
  assert.equal(affinitesLieu(journee, ['enfant', 'senior']).pourTous, true);
});

test("sans personne choisie, aucune mise en avant : rien ne change pour l'utilisateur", () => {
  assert.deepEqual(affinitesLieu(lieu('dxb-safari-park'), []), { tranches: [], pourTous: false });
  const props = filtrerLieux(base, { ...demandeVide(), zone: 'Dubaï' }, [], []);
  assert.ok(props.every((p) => p.affinites.length === 0 && !p.pourTous));
});

test("le tri « pertinence » met d'abord les lieux qui correspondent à plus de tranches du groupe, après les envies et l'ouverture", () => {
  const groupe = [personne('Alex', 40), personne('Robin', 8), personne('Charlie', 70)];
  const demande = { ...demandeVide(), zone: 'Dubaï', personnes: groupe };
  const props = filtrerLieux(base, demande, [], []);
  const ordre = props.map((p) => p.lieu.id);
  // jour inconnu : tout est « à vérifier », donc seul le nombre d'affinités départage, puis le nom
  const points = props.map((p) => p.affinites.length + (p.pourTous ? 1 : 0));
  assert.deepEqual([...points].sort((a, b) => b - a), points, `ordre non décroissant : ${ordre.join(', ')}`);
  assert.ok(points[0] >= 2);
  // une envie passe avant : le musée (1 affinité) devient premier s'il est marqué prioritaire
  const suivis: SuiviLieu[] = [{ lieuId: 'dxb-museum-future', souhait: 'prioritaire', favori: false, fait: false, note: '' }];
  assert.equal(filtrerLieux(base, demande, suivis, [])[0].lieu.id, 'dxb-museum-future');
});

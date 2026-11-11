import { basculerCompteur, useStore } from '../data/store.ts';
import type { Compteur, Donnees } from '../data/types.ts';
import { formatDateIso, formatDureeMin, nomFuseau } from '../lib/temps.ts';
import { libelleVol } from '../lib/vols.ts';
import { Page } from './commun.tsx';
import { lienCompteur } from './routeur.ts';

function resume(c: Compteur, donnees: Donnees): string {
  let base: string;
  if (c.cible.type === 'prochain-vol') {
    base = 'Le prochain vol à venir (change tout seul après le décollage)';
  } else if (c.cible.type === 'vol') {
    const volId = c.cible.volId;
    const v = donnees.vols.find((x) => x.id === volId);
    base = v ? `${libelleVol(v)} · ${formatDateIso(v.depart.date)}` : 'Vol introuvable';
  } else {
    base = `${formatDateIso(c.cible.date)} à ${c.cible.heure} (heure de ${nomFuseau(c.cible.fuseau)})`;
  }
  return c.delaiMin > 0 ? `${base} · ${formatDureeMin(c.delaiMin)} avant` : base;
}

export function Compteurs() {
  const { donnees } = useStore();
  return (
    <Page titre="Compteurs" retour={{ href: '#/', libelle: 'Accueil' }}>
      <a class="bouton" href="#/compteurs/nouveau">
        Ajouter un compteur
      </a>
      <p class="note">Active un compteur pour l'afficher sur l'accueil. Chaque vol a le sien.</p>
      {donnees.compteurs.map((c) => (
        <section class="carte" key={c.id}>
          <h2 class="compteur-titre">{c.libelle}</h2>
          <p class="discret">{resume(c, donnees)}</p>
          <label class="interrupteur">
            <input type="checkbox" checked={c.visible} onChange={() => void basculerCompteur(c.id)} />
            <span>Afficher sur l'accueil</span>
          </label>
          <a class="bouton secondaire" href={lienCompteur(c.id)}>
            Modifier
          </a>
        </section>
      ))}
    </Page>
  );
}

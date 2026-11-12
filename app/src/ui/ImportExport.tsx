import { useState } from 'preact/hooks';
import { annulerDernierImport, exporterJson, importerDonnees, noterSauvegarde, toutSupprimer, useStore } from '../data/store.ts';
import type { Donnees } from '../data/types.ts';
import { lireTexteImport } from '../data/validation.ts';
import { donneesVidesQ, etatSauvegarde } from '../lib/sauvegarde.ts';
import { debutVoyage } from '../lib/taches.ts';
import { aujourdhuiIso, formatDateHeureDansFuseau, fuseauTelephone } from '../lib/temps.ts';
import { BoutonConfirme } from './commun.tsx';
import { dateDuJour, enregistrerFichier } from './fichier.ts';

type Apercu = { donnees: Partial<Donnees>; avertissements: string[] };

function resume(d: Partial<Donnees>): string {
  const parties: string[] = [];
  if (d.vols) parties.push(`${d.vols.length} vol${d.vols.length > 1 ? 's' : ''}`);
  if (d.etapes) parties.push(`${d.etapes.length} étape${d.etapes.length > 1 ? 's' : ''}`);
  if (d.logements) parties.push(`${d.logements.length} logement${d.logements.length > 1 ? 's' : ''}`);
  if (d.trajets) parties.push(`${d.trajets.length} trajet${d.trajets.length > 1 ? 's' : ''}`);
  if (d.taches) parties.push(`${d.taches.length} tâche${d.taches.length > 1 ? 's' : ''}`);
  if (d.personnes) parties.push(`${d.personnes.length} personne${d.personnes.length > 1 ? 's' : ''}`);
  if (d.creneaux) parties.push(`${d.creneaux.length} créneau${d.creneaux.length > 1 ? 'x' : ''}`);
  if (d.groupes) parties.push(`${d.groupes.length} groupe${d.groupes.length > 1 ? 's' : ''}`);
  if (d.joursPlan) parties.push(`${d.joursPlan.length} réglage${d.joursPlan.length > 1 ? 's' : ''} de jour`);
  if (d.lieuxPerso) parties.push(`${d.lieuxPerso.length} lieu${d.lieuxPerso.length > 1 ? 'x' : ''} ajouté${d.lieuxPerso.length > 1 ? 's' : ''}`);
  if (d.suiviLieux) parties.push(`${d.suiviLieux.length} envie${d.suiviLieux.length > 1 ? 's' : ''} ou note${d.suiviLieux.length > 1 ? 's' : ''} sur des lieux`);
  if (d.pratiquePerso) parties.push(`${d.pratiquePerso.length} fiche${d.pratiquePerso.length > 1 ? 's' : ''} Pratique`);
  if (d.compteurs) parties.push(`${d.compteurs.length} compteur${d.compteurs.length > 1 ? 's' : ''}`);
  if (d.reglages) parties.push('les réglages');
  return parties.join(', ');
}

// Ce que l'import va remplacer, avec ce qu'il y a aujourd'hui dans le téléphone
function remplacees(d: Partial<Donnees>, actuel: Donnees): string {
  const parties: string[] = [];
  if (d.vols) parties.push(`vols (aujourd'hui ${actuel.vols.length})`);
  if (d.etapes) parties.push(`étapes (aujourd'hui ${actuel.etapes.length})`);
  if (d.logements) parties.push(`logements (aujourd'hui ${actuel.logements.length})`);
  if (d.trajets) parties.push(`trajets (aujourd'hui ${actuel.trajets.length})`);
  if (d.taches) parties.push(`tâches (aujourd'hui ${actuel.taches.length})`);
  if (d.personnes) parties.push(`personnes (aujourd'hui ${actuel.personnes.length})`);
  if (d.creneaux) parties.push(`créneaux (aujourd'hui ${actuel.creneaux.length})`);
  if (d.groupes) parties.push(`groupes (aujourd'hui ${actuel.groupes.length})`);
  if (d.joursPlan) parties.push(`réglages de jour (aujourd'hui ${actuel.joursPlan.length})`);
  if (d.lieuxPerso) parties.push(`lieux ajoutés (aujourd'hui ${actuel.lieuxPerso.length})`);
  if (d.suiviLieux) parties.push(`envies sur les lieux (aujourd'hui ${actuel.suiviLieux.length})`);
  if (d.pratiquePerso) parties.push(`fiches Pratique ajoutées (aujourd'hui ${actuel.pratiquePerso.length})`);
  if (d.compteurs) parties.push(`compteurs (aujourd'hui ${actuel.compteurs.length})`);
  if (d.reglages) parties.push('réglages');
  return parties.join(', ');
}

export function ImportExport() {
  const { donnees, meta, avantImport } = useStore();
  const sauvegarde = etatSauvegarde(meta, donneesVidesQ(donnees), aujourdhuiIso(), debutVoyage(donnees));
  const [texte, definirTexte] = useState('');
  const [apercu, definirApercu] = useState<Apercu | null>(null);
  const [erreurs, definirErreurs] = useState<string[]>([]);
  const [message, definirMessage] = useState<string | null>(null);

  function analyser(contenu: string) {
    definirMessage(null);
    const r = lireTexteImport(contenu);
    if (r.ok) {
      definirApercu({ donnees: r.donnees, avertissements: r.avertissements });
      definirErreurs([]);
    } else {
      definirApercu(null);
      definirErreurs(r.erreurs);
    }
  }

  async function surFichier(e: Event) {
    const entree = e.currentTarget as HTMLInputElement;
    const fichier = entree.files?.[0];
    if (!fichier) return;
    analyser(await fichier.text());
    entree.value = '';
  }

  async function importer() {
    if (!apercu) return;
    await importerDonnees(apercu.donnees);
    definirMessage(`Import terminé : ${resume(apercu.donnees)}. Si ce n'est pas ce que tu voulais, « Annuler le dernier import » remet tes données d'avant.`);
    definirApercu(null);
    definirTexte(''); // on ne laisse pas les données collées à l'écran
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(exporterJson(donnees));
      await noterSauvegarde();
      definirMessage('Copié. Colle-le où tu veux le garder (Notes, un message à toi-même...).');
    } catch {
      definirMessage('La copie a échoué. Utilise plutôt « Enregistrer un fichier ».');
    }
  }

  async function fichier() {
    const resultat = await enregistrerFichier(`on-fait-quoi-${dateDuJour()}.json`, exporterJson(donnees), 'application/json');
    if (resultat !== 'annule') await noterSauvegarde();
    if (resultat === 'partage') definirMessage('Fichier partagé.');
    if (resultat === 'telecharge') definirMessage('Fichier téléchargé.');
  }

  async function annuler() {
    const fait = await annulerDernierImport();
    definirMessage(fait ? "Dernier import annulé : tes données d'avant sont revenues." : "Impossible d'annuler : la copie d'avant l'import n'a pas été retrouvée.");
  }

  return (
    <section class="carte">
      <h2>Mes données</h2>
      <p class="discret">
        Elles sont enregistrées dans ce téléphone seulement. Le fichier d'export contient tout ton voyage : ne le publie nulle part.
      </p>

      <div class={`message ${sauvegarde.niveau === 'urgent' || sauvegarde.niveau === 'rappel' ? 'attention' : 'info'}`} role="status" aria-label="État de la sauvegarde">
        <strong>{sauvegarde.titre}</strong>
        {sauvegarde.detail !== '' && <span>{sauvegarde.detail}</span>}
        {meta.derniereSauvegarde !== '' && !Number.isNaN(new Date(meta.derniereSauvegarde).getTime()) && (
          <span class="discret">
            Heure exacte : {formatDateHeureDansFuseau(new Date(meta.derniereSauvegarde).getTime(), fuseauTelephone())}
          </span>
        )}
      </div>

      <h3>Importer un fichier de voyage</h3>
      <p class="discret">
        Pour restaurer une sauvegarde : choisis son fichier (ou colle son texte), vérifie ce que l'app va remplacer, puis « Importer ». Avant de remplacer quoi que ce soit, l'app garde une copie de tes données actuelles.
      </p>
      <label class="champ">
        <span class="champ-etiquette">Choisir un fichier</span>
        <input type="file" accept="application/json,.json" onChange={surFichier} />
      </label>
      <label class="champ">
        <span class="champ-etiquette">…ou coller son contenu</span>
        <textarea
          rows={4}
          value={texte}
          placeholder="Colle ici le texte du fichier"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => definirTexte(e.currentTarget.value)}
        />
      </label>
      <button type="button" class="bouton secondaire" disabled={texte.trim() === ''} onClick={() => analyser(texte)}>
        Vérifier le texte collé
      </button>

      {erreurs.length > 0 && (
        <div class="message erreur" role="alert">
          <strong>Ce fichier n'a pas pu être lu. Rien n'a été modifié.</strong>
          <ul>
            {erreurs.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {apercu && (
        <div class="message info" role="status">
          <p>
            <strong>Fichier valide.</strong> Il contient : {resume(apercu.donnees)}.
          </p>
          <p>Ces sections seront remplacées par celles du fichier : {remplacees(apercu.donnees, donnees)}. Le reste de tes données n'est pas touché.</p>
          {apercu.avertissements.length > 0 && (
            <ul>
              {apercu.avertissements.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <div class="rangee">
            <button type="button" class="bouton" onClick={() => void importer()}>
              Importer
            </button>
            <button type="button" class="bouton secondaire" onClick={() => definirApercu(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <h3>Exporter une sauvegarde</h3>
      <div class="rangee">
        <button type="button" class="bouton secondaire" onClick={() => void copier()}>
          Copier mes données
        </button>
        <button type="button" class="bouton secondaire" onClick={() => void fichier()}>
          Enregistrer un fichier
        </button>
      </div>

      {message && (
        <div class="message ok" role="status">
          {message}
        </div>
      )}

      {avantImport !== '' && (
        <>
          <h3>Annuler le dernier import</h3>
          <p class="discret">
            Copie gardée le {formatDateHeureDansFuseau(new Date(avantImport).getTime(), fuseauTelephone())} (heure de ton téléphone), juste avant l'import. Elle est effacée par « Supprimer toutes mes données ».
          </p>
          <BoutonConfirme
            libelle="Annuler le dernier import"
            question="Remettre tes données comme elles étaient avant le dernier import ? Ce qui a été modifié depuis sera perdu."
            oui="Oui, annuler l'import"
            onConfirme={() => void annuler()}
          />
        </>
      )}

      <h3>Tout effacer</h3>
      <BoutonConfirme
        libelle="Supprimer toutes mes données"
        question="Supprimer tous les vols, compteurs et réglages de ce téléphone ? C'est définitif : fais d'abord une sauvegarde si besoin."
        oui="Oui, tout supprimer"
        onConfirme={async () => {
          await toutSupprimer();
          definirMessage('Toutes les données ont été supprimées de ce téléphone.');
        }}
      />
    </section>
  );
}

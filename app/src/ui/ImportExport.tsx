import { useState } from 'preact/hooks';
import { exporterJson, importerDonnees, toutSupprimer, useStore } from '../data/store.ts';
import type { Donnees } from '../data/types.ts';
import { lireTexteImport } from '../data/validation.ts';
import { BoutonConfirme } from './commun.tsx';

type Apercu = { donnees: Partial<Donnees>; avertissements: string[] };

function resume(d: Partial<Donnees>): string {
  const parties: string[] = [];
  if (d.vols) parties.push(`${d.vols.length} vol${d.vols.length > 1 ? 's' : ''}`);
  if (d.compteurs) parties.push(`${d.compteurs.length} compteur${d.compteurs.length > 1 ? 's' : ''}`);
  if (d.reglages) parties.push('les réglages');
  return parties.join(', ');
}

function dateDuJour(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Enregistre le fichier : feuille de partage de l'iPhone (Enregistrer dans Fichiers, AirDrop...)
// ou téléchargement classique sur ordinateur.
async function enregistrerFichier(json: string): Promise<'partage' | 'telecharge' | 'annule'> {
  const nom = `on-fait-quoi-${dateDuJour()}.json`;
  const fichier = new File([json], nom, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: nom });
      return 'partage';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'annule';
    }
  }
  const url = URL.createObjectURL(fichier);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'telecharge';
}

export function ImportExport() {
  const { donnees } = useStore();
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
    definirMessage(`Import terminé : ${resume(apercu.donnees)}.`);
    definirApercu(null);
    definirTexte(''); // on ne laisse pas les données collées à l'écran
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(exporterJson(donnees));
      definirMessage('Copié. Colle-le où tu veux le garder (Notes, un message à toi-même...).');
    } catch {
      definirMessage('La copie a échoué. Utilise plutôt « Enregistrer un fichier ».');
    }
  }

  async function fichier() {
    const resultat = await enregistrerFichier(exporterJson(donnees));
    if (resultat === 'partage') definirMessage('Fichier partagé.');
    if (resultat === 'telecharge') definirMessage('Fichier téléchargé.');
  }

  return (
    <section class="carte">
      <h2>Mes données</h2>
      <p class="discret">
        Elles sont enregistrées dans ce téléphone seulement. Le fichier d'export contient tout ton voyage : ne le publie nulle part.
      </p>

      <h3>Importer un fichier de voyage</h3>
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
          {apercu.donnees.vols && (
            <p>
              L'import remplace tes {donnees.vols.length} vol{donnees.vols.length > 1 ? 's' : ''} actuel{donnees.vols.length > 1 ? 's' : ''} par ceux du fichier.
            </p>
          )}
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

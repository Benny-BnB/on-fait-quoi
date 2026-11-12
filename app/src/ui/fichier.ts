// Enregistrer ou partager un fichier depuis l'app : feuille de partage de l'iPhone (Enregistrer dans Fichiers,
// AirDrop, Messages…) ou téléchargement classique sur ordinateur. Rien n'est envoyé à un serveur.

export function dateDuJour(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type ResultatFichier = 'partage' | 'telecharge' | 'annule';

// À appeler directement depuis le clic sur un bouton (le téléphone refuse la feuille de partage sinon)
export async function enregistrerFichier(nom: string, contenu: string, type: string): Promise<ResultatFichier> {
  const fichier = new File([contenu], nom, { type });
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

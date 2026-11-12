// Code à scanner (QR code) fabriqué dans le téléphone : rien n'est envoyé à un service en ligne.
// Le calcul du code est fait par la petite bibliothèque « qrcode-generator » (licence MIT), embarquée dans l'app.

import qrcode from 'qrcode-generator';

export type MatriceQr = {
  taille: number; // nombre de carrés par côté
  version: number; // 1 à 40 : plus c'est grand, plus le code est dense et difficile à scanner
  sombre: (ligne: number, colonne: number) => boolean;
};

// Version la plus grande que l'on accepte d'afficher : au-delà, le code devient trop fin pour qu'un téléphone le lise bien
export const VERSION_QR_MAX = 25;

// Le code du texte, ou null s'il est trop gros pour un code lisible
export function creerQr(texte: string, versionMax = VERSION_QR_MAX): MatriceQr | null {
  try {
    const qr = qrcode(0, 'L'); // 0 = la plus petite version qui convient ; niveau L = le plus de place
    qr.addData(texte, 'Byte');
    qr.make();
    const taille = qr.getModuleCount();
    const version = (taille - 17) / 4;
    if (version > versionMax) return null;
    return { taille, version, sombre: (l, c) => qr.isDark(l, c) };
  } catch {
    return null; // texte plus grand que le plus grand QR code possible
  }
}

// Le dessin du code en SVG : un seul tracé, avec la marge blanche obligatoire de 4 carrés
export function cheminSvgQr(m: MatriceQr): { viewBox: string; chemin: string } {
  const marge = 4;
  let chemin = '';
  for (let l = 0; l < m.taille; l++) {
    let c = 0;
    while (c < m.taille) {
      if (!m.sombre(l, c)) {
        c++;
        continue;
      }
      let fin = c;
      while (fin < m.taille && m.sombre(l, fin)) fin++;
      chemin += `M${c + marge} ${l + marge}h${fin - c}v1h${c - fin}z`;
      c = fin;
    }
  }
  const total = m.taille + marge * 2;
  return { viewBox: `0 0 ${total} ${total}`, chemin };
}

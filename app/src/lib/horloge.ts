import { useEffect, useState } from 'preact/hooks';

// Heure actuelle (ms depuis 1970), mise à jour à chaque seconde pile.
// Quand on revient sur l'app après l'avoir quittée, elle se recale tout de suite.
export function useMaintenant(): number {
  const [maintenant, definirMaintenant] = useState<number>(() => Date.now());
  useEffect(() => {
    let minuteur: number | undefined;
    const planifier = () => {
      // On vise le début de la seconde suivante (+15 ms) pour que l'affichage ne dérive pas
      const attente = 1000 - (Date.now() % 1000) + 15;
      minuteur = window.setTimeout(() => {
        definirMaintenant(Date.now());
        planifier();
      }, attente);
    };
    planifier();
    const surVisibilite = () => {
      if (document.visibilityState === 'visible') definirMaintenant(Date.now());
    };
    document.addEventListener('visibilitychange', surVisibilite);
    return () => {
      window.clearTimeout(minuteur);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, []);
  return maintenant;
}

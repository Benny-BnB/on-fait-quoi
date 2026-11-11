# On fait quoi ?

Application personnelle pour organiser un voyage : quoi faire, et quand. Gratuite, sans serveur, sans publicité, sans suivi. Elle s'installe sur l'écran d'accueil d'un iPhone et fonctionne hors ligne (mode avion compris).

Le cahier des charges complet est dans [CAHIER-DES-CHARGES.md](CAHIER-DES-CHARGES.md).

## Où en est l'app

Étape 4 sur 10. L'app s'installe, fonctionne hors ligne, gère les vols et affiche des compteurs justes à la seconde. Chaque vol garde l'heure locale de sa ville et le nom de son fuseau horaire : l'instant exact se calcule à partir de là, donc le fuseau du téléphone ne change rien. Elle gère aussi les étapes du voyage et leurs logements (statut « à trouver », « à vérifier », « réservé » ou « confirmé »), signale les nuits sans logement, et permet d'ajouter, modifier, déplacer ou supprimer un logement sans toucher au code.

Les trajets (mode, durée, prix par personne, source et date de consultation) peuvent être liés à un vol : l'app calcule alors l'heure de départ conseillée (décollage moins le délai d'arrivée à l'aéroport moins la durée du trajet). Aucune durée ni aucun prix n'est inventé : sans source, ils s'affichent « à vérifier ». L'onglet Planning montre, jour par jour, les créneaux imposés (vols, trajets, arrivées et départs de logement) et signale les trajets manquants, les chevauchements et les départs trop tardifs. Les activités libres, les check-lists et les fiches de lieux arrivent étape par étape.

## Installer sur iPhone

1. Ouvrir l'adresse du site dans **Safari** (pas dans un autre navigateur).
2. Toucher le bouton **Partager**, puis **Sur l'écran d'accueil**.
3. Ouvrir l'app **une première fois avec une connexion Internet**, puis la rouvrir une seconde fois.
4. L'écran d'accueil de l'app indique « Mode avion : Prêt » quand tout est enregistré sur le téléphone.

## Données personnelles

Ce dépôt est **public** et ne contient **aucune donnée personnelle**. Les vols, logements, adresses, participants, planning et check-lists sont saisis ou importés dans l'app et restent **sur le téléphone**. Un fichier privé local (jamais envoyé sur GitHub, protégé par `.gitignore`) sert uniquement à préparer le fichier d'import.

Ne jamais saisir dans l'app ni dans le dépôt : numéro de passeport, numéro de billet, numéro de carte bancaire, mots de passe.

## Sauvegarde

Les données de l'app sont dans le navigateur du téléphone, qui peut les effacer. Dans **Réglages > Mes données**, on peut importer un fichier de voyage (fichier ou texte collé), copier ses données ou les enregistrer dans un fichier. Un rappel automatique de sauvegarde n'existe pas encore.

Le format du fichier d'import est décrit et contrôlé dans `app/src/data/validation.ts` : un fichier erroné est refusé avec un message clair et ne modifie rien.

## Pour développer

Il faut [Node.js](https://nodejs.org) (version 20.19 ou plus récente).

```bash
cd app
npm install        # télécharge les briques de code (une seule fois)
npm run dev        # lance l'app en local pour la regarder
npm test           # lance les tests automatiques (heures, fuseaux, import)
npm run build      # vérifie le code et les tests, puis fabrique le site dans app/dist
```

Choix techniques : Vite (fabrication d'un site statique), Preact (affichage), TypeScript (détection d'erreurs), vite-plugin-pwa (installation et hors ligne).

`npm audit` signale quelques alertes sur des outils de fabrication (le module qui prépare le hors-ligne). Elles ne concernent pas le code livré dans l'app : `npm audit --omit=dev` n'en trouve aucune.

## Structure du dépôt

- `app/` : le code de l'app
- `data/lieux/` : la base publique de lieux (sans donnée personnelle), à venir
- `.github/workflows/` : la publication automatique sur GitHub Pages
- `private/` : données privées, **ignoré par Git**

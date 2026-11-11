# On fait quoi ?

Application personnelle pour organiser un voyage : quoi faire, et quand. Gratuite, sans serveur, sans publicité, sans suivi. Elle s'installe sur l'écran d'accueil d'un iPhone et fonctionne hors ligne (mode avion compris).

Le cahier des charges complet est dans [CAHIER-DES-CHARGES.md](CAHIER-DES-CHARGES.md).

## Où en est l'app

Étape 1 sur 10 : les fondations. Pour l'instant l'app ne fait que s'installer et fonctionner hors ligne. Les vols, les compteurs, le planning, les check-lists et les fiches de lieux arrivent étape par étape.

## Installer sur iPhone

1. Ouvrir l'adresse du site dans **Safari** (pas dans un autre navigateur).
2. Toucher le bouton **Partager**, puis **Sur l'écran d'accueil**.
3. Ouvrir l'app **une première fois avec une connexion Internet**, puis la rouvrir une seconde fois.
4. L'écran d'accueil de l'app indique « Mode avion : Prêt » quand tout est enregistré sur le téléphone.

## Données personnelles

Ce dépôt est **public** et ne contient **aucune donnée personnelle**. Les vols, logements, adresses, participants, planning et check-lists sont saisis ou importés dans l'app et restent **sur le téléphone**. Un fichier privé local (jamais envoyé sur GitHub, protégé par `.gitignore`) sert uniquement à préparer le fichier d'import.

Ne jamais saisir dans l'app ni dans le dépôt : numéro de passeport, numéro de billet, numéro de carte bancaire, mots de passe.

## Sauvegarde

Les données de l'app sont dans le navigateur du téléphone, qui peut les effacer. Export, import et sauvegarde seront ajoutés dans une étape suivante : ils n'existent pas encore.

## Pour développer

Il faut [Node.js](https://nodejs.org) (version 20.19 ou plus récente).

```bash
cd app
npm install        # télécharge les briques de code (une seule fois)
npm run dev        # lance l'app en local pour la regarder
npm run build      # vérifie le code et fabrique le site dans app/dist
```

Choix techniques : Vite (fabrication d'un site statique), Preact (affichage), TypeScript (détection d'erreurs), vite-plugin-pwa (installation et hors ligne).

`npm audit` signale quelques alertes sur des outils de fabrication (le module qui prépare le hors-ligne). Elles ne concernent pas le code livré dans l'app : `npm audit --omit=dev` n'en trouve aucune.

## Structure du dépôt

- `app/` : le code de l'app
- `data/lieux/` : la base publique de lieux (sans donnée personnelle), à venir
- `.github/workflows/` : la publication automatique sur GitHub Pages
- `private/` : données privées, **ignoré par Git**

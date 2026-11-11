# On fait quoi ? - Cahier des charges V1

Version du 11/11/2026. Document pour Claude Code.
Ce fichier ne contient aucune donnée personnelle et peut aller sur GitHub.
Les données personnelles (vols, logements, famille, adresses) sont dans DONNEES-PRIVEES.md, qui ne doit JAMAIS aller sur GitHub.

---

## 0. Pour Samy : comment démarrer

1. Crée un dossier de projet sur ton ordinateur, par exemple "on-fait-quoi".
2. Mets-y les deux fichiers : CAHIER-DES-CHARGES.md et DONNEES-PRIVEES.md.
3. Ouvre Claude Code dans ce dossier et colle ce message :

   "Lis CAHIER-DES-CHARGES.md en entier, puis DONNEES-PRIVEES.md. Je n'ai aucune base en programmation : explique chaque étape en français simple et chaque commande avant de la lancer. Avant tout, crée le fichier .gitignore pour que DONNEES-PRIVEES.md et le dossier private/ ne partent jamais sur GitHub, et montre-moi que c'est bien le cas. Ensuite fais l'étape 1 du plan (section 10), puis attends mon accord pour passer à l'étape suivante."

4. À la fin de chaque étape, teste sur ton iPhone et dis à Claude Code ce qui ne va pas.

Consigne pour Claude Code : Samy n'est pas développeur. Une seule étape à la fois, des explications courtes, jamais de jargon sans explication, et toujours la commande exacte à copier.

---

## 1. But

Une app personnelle pour un voyage de plusieurs semaines (Thaïlande, puis Émirats). Elle répond à la question "quoi faire, et quand ?" et organise tout le séjour :

- propositions de visites, lieux à ne pas manquer, promenades, nourriture, spots, plages, marchés, vie nocturne, activités en famille ;
- pour chaque proposition : prix (monnaie locale et euro), durée, horaires, source ;
- un planning de tout le séjour, rempli à l'avance ou au jour le jour ;
- des compteurs (vols et autres) ;
- des check-lists avec dates souhaitées et échéances.

Nom de l'app : On fait quoi ?
Langue de l'interface : français.

---

## 2. Contraintes non négociables

1. Coût zéro. Aucun abonnement, aucune API payante, aucun serveur à payer, aucun compte développeur Apple. Outils et hébergement gratuits uniquement.
2. Rien de personnel sur GitHub. Le dépôt et le site sont publics (GitHub Pages est gratuit pour un dépôt public seulement). Vols, logements, adresses, références de réservation, famille, planning et check-lists restent sur le téléphone ou dans le fichier privé local.
3. Tout est modifiable dans l'app, à tout moment, sans repasser par Claude Code : vols, logements, étapes, dates, participants, contraintes, budget, planning, check-lists, lieux, compteurs. Des plans changent et des amis peuvent se joindre sur place. Aucune donnée ne doit être figée dans le code.
4. Rien n'est inventé. Chaque prix, durée et horaire a une source et une date de consultation. Sinon l'app affiche "à vérifier" (voir section 7).
5. Fonctionne hors ligne, y compris en mode avion, après la première ouverture.
6. Cible : iPhone, Safari, app installée sur l'écran d'accueil (PWA). Pas de store.
7. Interface sobre, utilisable d'une main, peu d'écrans, gros boutons, actions en 2 touches maximum. Mode sombre bien géré.
8. Formats : dates JJ/MM/AAAA, heure 24 h, prix en euro au format 1.234,56€, prix en monnaie locale avec son code (THB, AED).
9. Pas de texte inventé dans l'interface : pas de promesse que l'app ne tient pas.

---

## 3. Personnes, profils et groupes

L'app doit gérer des personnes et des groupes librement créés par l'utilisateur.

Personne :
- prénom ;
- âge ou tranche d'âge (optionnel) ;
- alimentation : texte libre et étiquettes (végétarien, halal, allergies, etc.) ;
- mobilité : marche longue limitée, station debout limitée, poussette, fauteuil, escaliers ;
- confort : sensible au froid, sensible à la chaleur ;
- notes ;
- présence : les dates où la personne est avec le groupe (une personne peut arriver, partir ou s'ajouter en cours de séjour).

Groupe : un ensemble de personnes avec un nom (par exemple "les parents", "les enfants", "tout le monde"). On peut créer, modifier et supprimer groupes et personnes en un geste.

Le filtre "Qui" de la demande du jour et chaque créneau du planning utilisent ces groupes. Quand plusieurs groupes sont choisis (un mélange de deux ou trois), l'app cumule les contraintes : une proposition ne doit pas contredire la contrainte la plus forte (par exemple alimentation, marche limitée, âge des enfants). Les contraintes servent de filtres et d'alertes, pas d'interdits : l'utilisateur peut passer outre.

---

## 4. Modèle de données

Tout est stocké côté téléphone, sauf la base de lieux qui est publique. Types principaux (noms de champs à adapter par Claude Code) :

Étape
- nom, pays, devise, fuseau horaire (nom IANA), date de début, date de fin.

Logement
- étape, nom, lien, adresse, coordonnées GPS, arrivée (date, heure), départ (date, heure), statut (à trouver, réservé, confirmé), référence de réservation, notes.
- Plusieurs logements possibles par étape. Un logement peut être ajouté, déplacé, remplacé ou supprimé à tout moment.

Vol
- compagnie, numéro de vol, référence de réservation, aéroport de départ et d'arrivée (codes), date et heure locales de départ et d'arrivée, terminal, passagers, statut, notes.
- L'instant exact du départ se calcule avec le fuseau de l'aéroport de départ (voir section 8).

Trajet
- de, à, mode (train, taxi, appli de VTC, bateau, bus, métro, voiture, scooter, à pied), début, durée estimée, prix par personne (devise), source, lien éventuel avec un vol ou un logement.

Événement fixe
- nom, lieu, dates et heures, type (festival, repas, fête, anniversaire), contenu libre. Les événements fixes deviennent des créneaux imposés dont le contenu se remplit quand l'utilisateur veut.

Créneau (planning)
- jour, début et fin (ou période : matin, midi, après-midi, soir, nuit), type (imposé ou libre), titre, lien vers un lieu, un vol, un trajet, un logement ou un événement, participants, budget estimé et réel, durée, statut (idée, prévu, réservé, fait, annulé), humeur (calme, actif, gourmand, festif), plan B (un créneau alternatif lié), note, compteur associé (oui ou non).

Lieu (fiche, base publique)
- identité : nom, étape, quartier, adresse, coordonnées GPS ;
- classement : une ou plusieurs catégories, étiquettes, "incontournable" oui ou non avec la source qui le justifie ;
- description : une à deux phrases factuelles ;
- durée : minimum et maximum en minutes ;
- prix : par personne, minimum et maximum, monnaie locale, avec source ;
- horaires : par jour, jours de fermeture, fermetures de fin d'année ;
- réservation : nécessaire ou non, lien ;
- conditions : intérieur ou extérieur, tenue exigée, meilleur moment de la journée, sensibilité à la pluie ;
- public : adultes, enfants (tranche d'âge), seniors, accessibilité (peu de marche, poussette, fauteuil, escaliers), options alimentaires ;
- sources : lien, date de consultation, statut "vérifié" ou "à vérifier", date de dernière vérification ;
- suivi personnel (téléphone seulement) : favori, ajouté au planning, fait, note.

Tâche (check-list)
- titre, liste (reste à faire, à emporter), date souhaitée, échéance, statut (à faire, fait), note, lien.

Compteur
- cible (un vol, un créneau, une date libre), libellé, visible ou caché, délai avant la cible (par exemple partir 3 h avant).

Réglages
- taux de change (devise, taux, date, source), budget par jour et par personne, par pays et pour le groupe, rythme (nombre d'activités par jour, heure de lever, pauses), à éviter (foule, longs trajets, chaleur, activités extrêmes), délais d'arrivée à l'aéroport (vol international, vol intérieur), transports acceptés (tous par défaut).

---

## 5. Écrans et fonctions

### 5.1 Accueil
- La demande "Quoi faire, quand ?" (5.2).
- Les compteurs visibles (5.6).
- Deux raccourcis : Planning, Check-lists.
- Un bouton pour passer en vue "Aujourd'hui" : le planning du jour, la prochaine chose à faire, le prochain trajet.

### 5.2 Quoi faire, quand ?
Champs de la demande :
- Où : étape en cours par défaut selon la date, ou une autre étape.
- Quand : une date et un créneau (matin, midi, après-midi, soir) ou une heure de début et un temps disponible.
- Qui : personnes ou groupes (voir section 3).
- Envie : une ou plusieurs catégories (section 6), ou "surprends-moi".
- Budget maximum par personne, durée maximum.
- Transport : à pied, taxi, appli de VTC, bateau, scooter, voiture, train, métro (tous par défaut).
- À éviter ce jour : foule, longs trajets, chaleur, activités extrêmes. Se règle quand l'utilisateur veut, selon l'humeur.
- Rythme du jour : nombre d'activités, heure de lever, pauses.
- Recherche en texte libre : recherche par mots-clés dans les fiches enregistrées. Pas d'IA ni d'API externe (coût zéro).

Résultats : une liste de propositions triées sur des critères visibles (distance, prix, durée, horaires), jamais sur une opinion. Chaque proposition affiche : nom, catégorie, durée, prix par personne en monnaie locale et en euro, distance depuis le logement, horaires, "ouvert à ce moment" (oui, non, à vérifier), pour qui elle convient, source, et un bouton "ajouter au planning".

Règles de filtrage automatiques :
- Aucune proposition qui empêche d'attraper un vol, trajet vers l'aéroport inclus.
- Les créneaux déjà imposés (événement fixe, trajet, vol) sont respectés.
- Un lieu fermé au créneau demandé est signalé, pas masqué.
- Un lieu qui contredit une contrainte du groupe est signalé avec la raison.

### 5.3 Planning
- Couvre tout le séjour, du premier au dernier jour. Ouvert dès le premier jour : l'utilisateur peut remplir n'importe quelle journée à l'avance, ou ne rien planifier et décider sur place.
- Vue séjour (tous les jours) et vue jour.
- Deux types de créneaux :
  - Imposé : vols, trajets vers les aéroports et entre étapes, arrivée et départ des logements, événements fixes. Générés automatiquement à partir des vols, logements, trajets et événements. Modifiables après confirmation (retard, changement d'heure).
  - Libre : activités, repas, repos, notes. Vides au départ. Remplis par une idée, une proposition de l'app ou un texte libre.
- Changer d'avis à tout moment sur un créneau libre : bouton "Autre idée" (ouvre les propositions filtrées pour ce créneau : même étape, même horaire, même durée), remplacer, vider, déplacer vers un autre créneau ou un autre jour, échanger deux créneaux, dupliquer, annuler, garder un plan B.
- Ajouter une proposition de l'écran 5.2 directement dans le créneau de son choix.
- Totaux de budget et de temps par jour et pour le séjour.
- Alertes : chevauchement, créneau trop proche d'un vol, lieu fermé, trajet manquant, contrainte d'un participant non respectée.
- Si un créneau imposé change (vol décalé), les créneaux libres voisins sont signalés, jamais déplacés automatiquement.
- Les créneaux faits passent dans un historique.
- Participants modifiables par jour et par créneau.

### 5.4 Fiches lieux
- Format de la section 4. Fiche consultable hors ligne.
- Chaque fiche a un bouton "ouvrir dans Plans ou Google Maps".
- L'utilisateur peut ajouter ses propres lieux et marquer un lieu comme "souhait" (lieu voulu, prix et durée pas encore sourcés).
- Un champ non sourcé affiche "à vérifier".

### 5.5 Check-lists
- Deux listes : reste à faire et à emporter. Cochables, modifiables, supprimables.
- Chaque tâche a une date souhaitée et une échéance. Règle : ce qui peut être réglé tout de suite est réglé tout de suite. La date souhaitée est la plus proche possible, l'échéance est la limite.
- Une tâche faite quitte la liste active et passe dans "Fait". Elle ne compte plus dans ce qui reste.
- Regroupement par urgence : aujourd'hui, cette semaine, d'ici la date de départ, pendant le voyage.
- Compteur de progression. Tâches en retard bien visibles.
- Le contenu de départ est dans DONNEES-PRIVEES.md.

### 5.6 Compteurs
- Tous les compteurs sont disponibles. Chacun est un widget que l'utilisateur affiche ou cache sur l'accueil.
- Par défaut, un seul est visible : le compteur du prochain vol. Il indique le décollage. Dès l'heure de départ passée, le compteur passe au vol suivant.
- L'utilisateur peut ajouter un compteur sur n'importe quel créneau du planning (départ de l'hôtel, arrivée, aéroport, activité, repas) ou sur une date libre, et le supprimer.
- Affichage : jours, heures, minutes, secondes. Sous le compteur : libellé, vol, trajet, heure locale, référence, terminal si connu.
- Heure conseillée de départ pour un vol : heure du vol moins le délai d'arrivée à l'aéroport (réglage) moins la durée du trajet.
- Le compteur reste juste même si le téléphone change de fuseau horaire (section 8).
- Fonctionne hors ligne.

### 5.7 Réglages
- Personnes et groupes, budget, rythme, à éviter, transports acceptés, délais d'aéroport, taux de change avec sa date.
- Données privées : import, export, sauvegarde, suppression.

### 5.8 Partage, agenda et rappels
- Export du planning en fichier d'agenda .ics, compatible Apple Calendar et Microsoft Outlook. L'utilisateur l'importe dans son agenda et partage ensuite son agenda avec ses proches. Les événements ont des alertes (rappels fiables via l'agenda).
- Partage du planning par un code à scanner (QR) ou un lien contenant les données compressées. Si le planning est trop gros pour un code, proposer un export en fichier.
- Pas de synchronisation automatique avec l'agenda tant qu'elle demande un service payant ou un serveur : Claude Code l'étudie et signale si une option gratuite existe.
- Notifications de l'app sur iPhone : à tester pendant la création, sans promesse. Claude Code dit clairement ce qui marche et ce qui ne marche pas.

### 5.9 Rubrique Pratique, par étape
- Trajets entre villes et vers les aéroports : mode, prix, durée, source.
- Transferts, bateaux, trains, durée de correspondance.
- Retrait d'argent, eSIM, numéros utiles, formalités avec renvoi vers les sites officiels.

---

## 6. Catégories et étiquettes

Douze catégories :
1. Incontournables
2. Culture et histoire
3. Nature et paysages
4. Plages et îles
5. Promenades et randonnées
6. Sport et aventure
7. Nourriture
8. Bars et vie nocturne
9. Marchés et shopping
10. Bien-être
11. Spots et photo
12. En famille et événements

Étiquettes transversales (filtres) :
- gratuit, budget moyen, plus cher ;
- moins d'1 h, 1 à 3 h, demi-journée, journée ;
- pluie possible (plan B à l'intérieur) ;
- réservation nécessaire ;
- accessible à pied depuis le logement ;
- calme ou festif ;
- matin, après-midi, soir ;
- pour qui : adultes, enfants (tranche d'âge), seniors, accessibilité, options alimentaires.

Pour les activités en famille, l'app privilégie par groupe :
- seniors : rythme calme, peu de marche, lieux climatisés, repas, culture, bien-être, accès facile ;
- adultes : shopping, cafés et brunchs, spa, plage, rooftops, expériences, photo ;
- enfants : parcs, aquariums, plage, piscine, ateliers, animaux, spectacles, adaptés à l'âge ;
- mélange de groupes : activités où chacun trouve sa place (repas, plage, promenades, marchés, spectacles, sorties à la journée).
Le prix s'affiche par personne et pour le total du groupe.

---

## 7. Règles de fiabilité (pas d'invention)

- Chaque prix, durée et horaire a un lien source et une date de consultation. Sans source fiable : "à vérifier".
- Sources acceptées en premier : site officiel du lieu ou de l'opérateur, billetterie, office du tourisme, page du transporteur. Un blog ou un guide est signalé comme source secondaire et ne suffit pas seul pour un prix.
- Prix : montant ou fourchette publiés, jamais arrondis au jugé. Conversion en euro avec le taux enregistré et sa date.
- Durée : durée publiée si elle existe. Sinon durée estimée, marquée "estimée", avec la base du calcul.
- Les notes et avis s'affichent avec leur source et leur nombre.
- Un lieu "incontournable" l'est selon une source citée (liste officielle ou guide nommé), pas selon une opinion de Claude.
- Fermetures de fin d'année (24, 25, 31 décembre et 1er janvier) vérifiées une par une.
- Sécurité et formalités : renvoi vers les sources officielles (conseils aux voyageurs du SPF Affaires étrangères belge, autorités locales). L'app ne donne pas de conseil juridique ou médical.
- Avant le départ : contrôle des liens et de la date de dernière vérification de chaque fiche. L'app affiche "vérifié il y a X jours".
- Claude Code récupère les informations en ligne quand c'est possible. S'il n'y a pas accès, il le dit à Samy et laisse "à vérifier". Il n'écrit jamais un prix ou un horaire de mémoire.

---

## 8. Technique

Format
- App web installable (PWA) : manifeste, icônes, service worker, balises pour iOS. Installation par Safari, "Ajouter à l'écran d'accueil".
- Technologie : la plus simple à maintenir pour quelqu'un qui ne programme pas. Une application statique, sans serveur. Claude Code choisit, justifie en deux phrases et en informe Samy.

Hébergement
- GitHub Pages, dépôt public, déploiement automatique à chaque modification (GitHub Actions, gratuit pour un dépôt public).

Hors ligne
- L'app et la base de lieux sont mises en cache par le service worker. Les mises à jour s'installent quand une connexion existe.
- Test obligatoire en mode avion sur iPhone.

Stockage
- Données personnelles : dans le téléphone (IndexedDB ou équivalent). Le stockage du navigateur peut être effacé : prévoir un export et un import de sauvegarde, et un rappel de sauvegarde avant le départ.
- Base de lieux : fichier public dans le dépôt, sans donnée personnelle.

Données privées
- DONNEES-PRIVEES.md reste sur l'ordinateur de Samy, hors de GitHub (.gitignore).
- Claude Code en tire un fichier d'import (par exemple private/donnees-voyage.json, aussi dans .gitignore). Samy l'importe une fois dans l'app, depuis le téléphone (partage de fichier ou copier-coller).
- Avant chaque commit, Claude Code vérifie qu'aucun fichier privé n'est inclus et le dit à Samy.
- Ne jamais saisir dans l'app ni dans le dépôt : numéro de passeport, numéro de billet, numéro de carte bancaire, mots de passe.

Fuseaux horaires et compteurs
- Chaque vol stocke l'heure locale de départ et le nom du fuseau IANA de l'aéroport de départ (par exemple Europe/Brussels, Asia/Dubai, Asia/Bangkok). L'instant exact se calcule à partir de là.
- Les compteurs se calculent depuis l'horloge du téléphone, hors ligne.

Fichier d'agenda (.ics)
- Générer les heures en UTC pour éviter les problèmes de fuseau. Ajouter une alerte (VALARM) configurable. Tester l'import dans Apple Calendar.

Cartes
- Un lien "ouvrir dans Plans ou Google Maps" sur chaque lieu. Carte hors ligne intégrée : option, seulement si elle reste légère.

Taux de change
- Saisi à la main avec sa date. Mise à jour en ligne possible depuis une source gratuite et citée, sans clé payante.

Qualité
- Accessibilité de base : texte lisible, contrastes, boutons assez grands.
- Pas de suivi, pas de publicité, pas de service tiers qui reçoit des données personnelles.

---

## 9. Structure du dépôt (proposition)

- README.md : ce que fait l'app, comment l'installer, comment sauvegarder.
- CAHIER-DES-CHARGES.md : ce fichier.
- app/ : le code.
- data/lieux/ : la base publique de lieux, un fichier par étape.
- private/ : données privées, dans .gitignore.
- .gitignore : doit contenir DONNEES-PRIVEES.md et private/.

---

## 10. Plan de construction

Une étape à la fois. Chaque étape finit par un test sur l'iPhone de Samy. Samy valide avant la suivante. Dates cibles à ajuster avec lui.

Étape 1 - Fondations (cible 15/11)
- Dépôt GitHub, squelette de l'app, installation sur l'écran d'accueil, déploiement sur GitHub Pages, .gitignore privé vérifié.
- Test : l'app s'installe sur l'iPhone et s'ouvre en mode avion.

Étape 2 - Données privées, vols et compteurs (cible 15/11)
- Import du fichier privé, écran Vols modifiable, compteur du prochain vol, widgets de compteurs affichables ou cachables, ajout d'un compteur libre.
- Test : le compteur est juste (comparer avec les heures des billets) et reste juste si le fuseau du téléphone change.

Étape 3 - Étapes et logements (cible 22/11)
- Étapes, logements modifiables, ajout et déplacement d'un logement, statut "à trouver".
- Test : ajouter un logement manquant depuis l'app sans toucher au code.

Étape 4 - Trajets et créneaux imposés (cible 22/11)
- Trajets entre étapes et vers les aéroports, génération des créneaux imposés dans le planning, heure conseillée de départ pour chaque vol.

Étape 5 - Check-lists (cible 22/11)
- Deux listes, dates souhaitées et échéances, "fait" retire de la liste active, progression.

Étape 6 - Planning complet (cible 29/11)
- Créneaux libres, déplacement, échange, plan B, totaux, alertes, participants par créneau, vue séjour et vue jour, historique.
- Test : remplir une journée en 2 minutes et la modifier sans effort.

Étape 7 - Fiches lieux et "Quoi faire, quand ?" (cible 03/12)
- Format de fiche, écran de demande, résultats, "Autre idée", recherche par mots-clés.
- Base de lieux sourcés pour la première étape du voyage, avec les souhaits déjà exprimés (voir DONNEES-PRIVEES.md). Première version utilisable de l'app : 04/12 au plus tard.

Étape 8 - Profils, groupes et réglages (cible 10/12)
- Personnes, groupes, contraintes, "Qui", "À éviter", rythme, budget. Base de lieux pour les étapes suivantes, une étape à la fois, dans l'ordre du voyage.

Étape 9 - Base famille (cible 17/12)
- Activités en famille pour la dernière étape du voyage, par groupe et par mélange de groupes. Rubrique Pratique.

Étape 10 - Partage, sauvegarde et contrôle final (cible 19/12)
- Export .ics, QR, sauvegarde et import, contrôle des sources et des liens, tests hors ligne.

Pendant tout le voyage : Samy peut demander des ajouts de lieux à Claude Code, et modifie le reste directement dans l'app.

---

## 11. Critères d'acceptation globaux

- L'app s'installe sur iPhone et fonctionne en mode avion.
- Aucune information personnelle n'est visible dans le dépôt public ni sur le site publié.
- Chaque donnée de la base de lieux a une source et une date, ou affiche "à vérifier".
- Samy peut modifier seul : un vol, un logement, une étape, un participant, une contrainte, un créneau, une tâche, un compteur, un budget.
- Le compteur du prochain vol est exact à la seconde près par rapport à l'heure du billet.
- Le planning permet de remplir tout le séjour à l'avance et de changer n'importe quel créneau à tout moment.
- Le coût total est de 0,00€.

---

## 12. Ce que Claude Code doit demander à Samy

- Les informations marquées "à compléter" dans DONNEES-PRIVEES.md, quand il en a besoin.
- Son nom d'utilisateur GitHub et le nom du dépôt à créer.
- Avant chaque étape : valider le périmètre en deux phrases.
- À chaque doute : poser la question plutôt que deviner.

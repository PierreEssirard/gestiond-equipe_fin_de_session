# Choc des cultures : le jeu de l'équipe Charlie (GIN761)

Jeu interactif de 10 minutes pour la fin de votre présentation sur *Management interculturel* (O. Meier).
L'écran du projecteur montre une salle de classe en 3D. Les élèves scannent un QR code, rejoignent l'équipe **Stuttgart** (Daimler) ou l'équipe **Detroit** (Chrysler) et répondent sur leur téléphone. Leur avatar bouge dans la salle selon leurs réponses, et Mélanie Cloutier et Philippe Joly commentent à voix haute.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Écran du projecteur (hôte) : salle 3D, QR code, questions, scores, profs |
| `player.html` | Page téléphone des élèves (ouverte par le QR code) |
| `config.js` | **À modifier** : config Firebase, questions, répliques des profs |
| `scene.js` | La salle 3D (Three.js) |
| `net.js` | Connexion temps réel (Firebase, ou mode répétition local) |
| `database.rules.json` | Règles de sécurité Firebase à coller dans la console |

## 1. Répéter tout de suite (sans Firebase)

Le jeu tourne déjà en **mode répétition** tant que `FIREBASE = null` dans `config.js`.

1. Servez le dossier en local, car les modules JavaScript ne marchent pas en double-cliquant le fichier. Dans le dossier :
   `python -m http.server 8000`
2. Ouvrez `http://localhost:8000/index.html` dans Chrome.
3. Appuyez sur **B** pour ajouter 12 joueurs fictifs (vous pouvez appuyer plusieurs fois).
4. Pour jouer vous-même, ouvrez `http://localhost:8000/player.html?r=CODE` dans un **autre onglet du même navigateur**, avec le code affiché à l'écran.

En mode répétition, seuls les onglets du même navigateur se parlent. Pour de vrais téléphones, il faut Firebase.

## 2. Créer la base Firebase (gratuit, environ 10 minutes)

1. Allez sur <https://console.firebase.google.com>, puis **Ajouter un projet** (ex. `choc-des-cultures`). Google Analytics est inutile.
2. Dans le projet : **Créer > Realtime Database > Créer une base de données**. Prenez la région `us-central1` et démarrez en **mode verrouillé**.
3. Onglet **Règles** : remplacez tout par le contenu de `database.rules.json`, puis **Publier**.
4. Roue dentée **Paramètres du projet > Général > Vos applications > icône Web `</>`**. Donnez un nom, sans Hosting, puis copiez l'objet `firebaseConfig`.
5. Dans `config.js`, remplacez `export const FIREBASE = null;` par :

```js
export const FIREBASE = {
  apiKey: "…",
  authDomain: "…firebaseapp.com",
  databaseURL: "https://…-default-rtdb.firebaseio.com",
  projectId: "…",
  appId: "…"
};
```

Vérifiez que `databaseURL` est bien présent. S'il manque, copiez l'URL affichée en haut de l'onglet **Realtime Database**.

## 3. Mettre en ligne avec GitHub Pages

1. Créez un dépôt GitHub public (ex. `choc-des-cultures`) et poussez le contenu de ce dossier à la racine :
   ```bash
   git init && git add . && git commit -m "Jeu Choc des cultures"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/choc-des-cultures.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings > Pages > Source : Deploy from a branch > main / (root) > Save**.
3. Après une minute, le jeu est en ligne sur `https://VOTRE-COMPTE.github.io/choc-des-cultures/`.

Le QR code pointe automatiquement vers `player.html` à la même adresse.

## 4. Le jour de la présentation

- Sur l'ordinateur branché au projecteur, ouvrez l'adresse GitHub Pages dans **Chrome**, puis appuyez sur **F** (plein écran).
- Branchez le son : les profs parlent avec la synthèse vocale du navigateur. Sous Windows, une voix française du Canada (ex. *Microsoft Sylvie*) est utilisée si elle est installée (Paramètres > Heure et langue > Voix). Sinon, le jeu prend la meilleure voix française disponible.
- Testez la veille avec deux ou trois téléphones sur le Wi-Fi de l'université.
- Si l'ordinateur rame, appuyez sur **Q** (qualité réduite, sans ombres).

### Commandes (clavier ou télécommande de présentation)

| Touche | Action |
|---|---|
| Espace, →, Page suivante | Suivant · ferme la question et révèle la réponse |
| ←, Page précédente | Étape précédente |
| B | Ajouter 12 joueurs fictifs |
| S | Voix des profs on/off |
| F | Plein écran |
| Q | Qualité haute / réduite |

Pendant l'accueil, cliquer sur le nom d'un joueur le retire de la partie (pratique pour un pseudo inapproprié).

## 5. Déroulement (environ 10 minutes)

| # | Activité | Bloc | Mécanique |
|---|---|---|---|
| 1 | Les 4 coins | A · Culture et styles de management | Choix A-D, l'avatar va dans le coin choisi |
| 2 | La ligne humaine | A · Hofstede | Curseur 0-100, l'avatar se place sur la ligne |
| 3 | Vrai ou faux | B · Diversité et conflits | Vrai = l'avatar se lève, faux = il reste assis |
| 4 | La course au tableau | C et D · Négociation, communication | Scène Klaus contre Mike, puis la réponse la plus rapide gagne. Les premiers de chaque équipe courent au tableau |
| 5 | La fusion | Cas Daimler-Chrysler | Les deux équipes doivent voter la même bonne réponse |

**Points** : bonne réponse 100 + bonus de vitesse jusqu'à 50 · ligne humaine : jusqu'à 150 selon l'écart · course : +50 au premier de chaque équipe · fusion réussie : 150 pour tous.
Le score d'équipe est la **moyenne** par joueur, pour que des équipes de tailles différentes restent comparables.

## 6. Modifier le contenu

Tout se trouve dans `config.js` : questions, explications, durées (`t`, en secondes) et répliques des profs, classées par situation (`great`, `mid`, `bad`, `none`, `retort`…).
Vérifiez les chiffres avec le livre de Meier avant la présentation. Les scores d'Hofstede utilisés sont les scores classiques (France : distance hiérarchique 68, contrôle de l'incertitude 86 ; États-Unis : individualisme 91 ; Allemagne : 35 / 65 / 67).

## 7. Après la présentation

Dans la console Firebase, supprimez le nœud `rooms` ou remettez les règles à `".read": false, ".write": false`. Les règles fournies laissent n'importe qui écrire dans `rooms` : c'est pratique pour un événement de classe, pas pour un usage permanent.

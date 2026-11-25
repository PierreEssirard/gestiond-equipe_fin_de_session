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
| `logic.js` | Règles sans affichage : points, places sans chevauchement, synchronisation (testées par `npm test`) |
| `tests/` | Tests automatiques (voir plus bas) |
| `database.rules.json` | Règles de sécurité Firebase à coller dans la console |
| `voices.js` | Textes parlés (narrateur, profs) partagés entre le jeu et le script de voix |
| `tools/generer-voix.mjs` | Génère les voix ElevenLabs dans `voix/` (à lancer sur votre ordinateur) |

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

À l'écran, il n'y a qu'un bouton **Suivant**. Tout le reste se fait au clavier :

| Touche | Action |
|---|---|
| Espace, →, Page suivante | Suivant · ferme la question et révèle la réponse |
| ←, Page précédente | Étape précédente |
| B | Ajouter 12 joueurs fictifs |
| S | Voix on/off |
| F | Plein écran |
| Q | Qualité haute / réduite (si l'ordinateur rame) |
| N (deux fois) | Nouvelle partie (efface les joueurs et les scores) |

### Voix du narrateur et des profs (ElevenLabs)

Un narrateur lit les consignes, les questions et les réponses, puis les profs commentent. Klaus et Mike jouent leur scène à voix haute.

**Voix humaines ElevenLabs (déjà en place).** Les 95 répliques ont été générées avec ElevenLabs et sont stockées dans la base Firebase (branche `voix`, en lecture seule). Le jeu les charge au démarrage. La clé API n'est stockée nulle part.

Pour régénérer après avoir modifié un texte ou une voix dans `config.js` :
1. Dans la console Firebase, onglet **Règles**, passez `voix` en `".write": true` et publiez.
2. Ouvrez `https://VOTRE-COMPTE.github.io/VOTRE-DEPOT/tools/voix.html`, collez une clé API ElevenLabs (permission *Text to Speech*) et cliquez sur **Générer les voix manquantes**. Cochez *Tout régénérer* si vous avez changé de voix.
3. Remettez `voix` en `".write": false`.

Alternative hors ligne : `node tools/generer-voix.mjs` génère les mêmes fichiers dans `voix/` (voir l'en-tête du script).

Si vous modifiez une question ou une réplique dans `config.js`, relancez le script : il ne génère que les nouvelles répliques. Pour changer de voix, ajoutez `--force` pour tout régénérer. `node tools/generer-voix.mjs --dry` affiche le nombre de caractères sans rien générer.

**Sans fichiers ElevenLabs**, le jeu utilise la synthèse vocale du navigateur. Dans ce cas, préférez Microsoft Edge, qui propose des voix naturelles en français du Canada (*Sylvie*, *Antoine*…).

Les navigateurs bloquent le son tant qu'on n'a pas cliqué sur la page : cliquez une fois sur l'écran d'accueil (ou appuyez sur F pour le plein écran) avant que la classe arrive.

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

## 7. Personnages 3D

Les personnages (dossier `assets/`) sont des modèles humains de type Mixamo (Adobe), repris du dépôt public [4-Impact/inequality-simulator](https://github.com/4-Impact/inequality-simulator), puis compressés pour le web (textures 1024 px, environ 1 Mo par personnage). Les animations disponibles sont : attente, marche, déception et célébration. La position assise est calculée par le jeu.

## 7 bis. Salle de classe réaliste (éclairage précalculé)

La salle est modélisée dans Blender par un script (`tools/room/build_room.py`), aux mêmes cotes que le jeu :
fenêtres avec cadres, convecteurs et store, plafond suspendu avec ossature et luminaires encastrés,
murs en blocs de béton peints, tables en stratifié, chaises à coque, bureau en chêne, portables, cahiers,
gourdes, sacs à dos, plantes, babillard, horloge, porte avec hublot…
Les textures (sol en dalles de vinyle, blocs, plafond, bois, stratifié…) sont générées par `tools/room/textures.py`.

Tout l'éclairage de la salle est **précalculé par lancer de rayons** (moteur Cycles de Blender) :
lumière des plafonniers et du ciel, ombres douces, lumière qui rebondit sur les murs et le sol,
coins plus sombres. Le résultat est débruité (OpenImageDenoise) et stocké dans une texture (`assets/room_lm.webp`).
Seul le soleil direct reste calculé en temps réel, pour les ombres mobiles des personnages.
Les personnages sont éclairés par une capture à 360° de la salle elle-même.
C'est plus réaliste **et** plus léger pour l'ordinateur que l'ancien éclairage (9 lampes en temps réel + occlusion).

- Si la salle réaliste ne se charge pas, le jeu affiche automatiquement l'ancienne salle simplifiée.
- Pour forcer la salle simplifiée sur un ordinateur faible : ajoutez `&room=0` à l'adresse
  (exemple : `index.html?room=0`).
- Les téléphones reçoivent une version allégée (`room_m.glb`, textures réduites) et une lightmap 2048 px
  qui contient aussi le soleil direct et ses ombres : une seule passe de rendu par image, sans carte d'ombres
  ni post-traitement (l'étalonnage est fait dans les matériaux), et seule la résolution s'adapte si le
  téléphone peine (jamais de recompilation, donc pas d'à-coup).

Pour régénérer la salle (environ 45 minutes de calcul sur 2 cœurs) :
```bash
python3.11 -m venv venv && venv/bin/pip install bpy pillow numpy      # Blender 5 en module Python
python3 tools/room/textures.py tex                                     # textures
python3 tools/room/sky.py <faces_Park2> sky 90                         # panorama extérieur
venv/bin/python tools/room/build_room.py --tex tex --sky sky --out out --lm 4096 --samples 64
venv/bin/python tools/room/build_room.py --tex tex --sky sky --out out_p --lm 2048 --pack-lm 4096 \
    --samples 64 --sun-scale 0.5128 --check out/lm_raw.exr --bake-only      # lightmap téléphones (soleil inclus, ≈ 1 h)
python3 tools/room/package.py out sky assets --mobile out_p             # compression pour le web
```
`--sun-scale` vaut 1 / `gain` (voir `assets/room.json`) : le soleil précalculé a la même intensité que le
soleil temps réel du projecteur. `--check` vérifie que les UV sont identiques à celles du premier calcul.

**Crédits** : vue extérieure « Park2 » d'Emil Persson ([Humus](https://www.humus.name), licence CC BY 3.0).
Voix générées avec [ElevenLabs](https://elevenlabs.io) (narrateur, Mélanie et Philippe : voix conçues avec Voice Design, français standard).

## 8. Après la présentation

Dans la console Firebase, supprimez le nœud `rooms` ou remettez les règles à `".read": false, ".write": false`. Les règles fournies laissent n'importe qui écrire dans `rooms` : c'est pratique pour un événement de classe, pas pour un usage permanent.

## Synchronisation projecteur ↔ téléphones

Le projecteur est la seule source de vérité : c'est lui qui fait bouger les personnages.
Cinq fois par seconde, tant que quelque chose bouge, il publie un instantané compact de la salle
(position, orientation, assis/debout, marche, réaction, parole de chaque personnage) dans
`rooms/<code>/snap`, et l'état du décor (coins, ligne, drapeau, tableau) dans `rooms/<code>/world`.
Les téléphones n'inventent rien : ils affichent ces instantanés avec 0,3 s de retard, en interpolant
entre deux instantanés. Résultat mesuré par les tests : même position au centimètre près, mouvement
fluide, décalage de 0,15 à 0,5 s. Si le projecteur est rechargé, les téléphones se recalent tout seuls.

## Tests automatiques

À lancer après chaque modification :

```bash
npm install          # une seule fois
npm test             # règles du jeu, points, configuration, voix (2 secondes)
npm run e2e          # vraie partie : projecteur + 2 téléphones dans Chrome/Edge (1 à 3 minutes)
npm run e2e:jeu      # partie complète jouée depuis 2 téléphones : chaque type d'activité, points, résultat final
npm run e2e:rendu    # rendu 3D : pas d'écran noir, perte du contexte WebGL, téléphone léger, décor de secours
npm run check        # tout ce qui précède
npm run voix:check   # en ligne : chaque réplique a sa voix dans Firebase (lecture seule)
```

Le test de rendu reproduit notamment le « flash noir » : un seul pixel invalide (NaN ou infini, venant
d'une normale dégénérée ou d'un reflet trop intense) était étalé par le halo lumineux sur tout l'écran.
Ces valeurs sont maintenant neutralisées avant le halo ; le test vérifie que l'image reste intacte.
Il vérifie aussi qu'un redimensionnement n'efface jamais le canevas entre deux images, que l'image revient
après une perte du contexte WebGL (pilote réinitialisé) et que le téléphone reste dans son budget de dessin.

Le test de bout en bout vérifie notamment qu'après un rechargement du projecteur ou une nouvelle partie
dans la même salle, les téléphones peuvent encore répondre (aucune réponse « fantôme » d'une partie précédente).
Si Chrome n'est pas trouvé : `CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" npm run e2e`.

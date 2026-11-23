/* =====================================================================
   CHOC DES CULTURES — configuration
   1) Collez votre configuration Firebase ci-dessous (voir README.md).
      Laissez null pour le mode répétition (joueurs fictifs, sans réseau).
   2) Modifiez librement les questions et les répliques des profs.
   ===================================================================== */

export const FIREBASE = {
  apiKey: "AIzaSyC-QuYAp71_j0g5mWNRL7qMLRo7kkeHZ24",
  authDomain: "gin761-jeu.firebaseapp.com",
  databaseURL: "https://gin761-jeu-default-rtdb.firebaseio.com",
  projectId: "gin761-jeu",
  appId: "1:945359943688:web:74eb17f23a1b332297b9bd"
};
/* Exemple :
export const FIREBASE = {
  apiKey: "AIza...",
  authDomain: "choc-des-cultures.firebaseapp.com",
  databaseURL: "https://choc-des-cultures-default-rtdb.firebaseio.com",
  projectId: "choc-des-cultures",
  appId: "1:...:web:..."
};
*/

export const GAME = {
  title: 'Choc des cultures',
  subtitle: 'Équipe Charlie · GIN761 · Management interculturel (O. Meier)',
  minutes: 10,
  teams: [
    { name: 'Stuttgart', tag: 'Daimler-Benz', color: '#3d74d6' },
    { name: 'Detroit', tag: 'Chrysler', color: '#d8453a' }
  ],
  corners: [
    { l: 'A', color: '#e8b730' },
    { l: 'B', color: '#2fb3a1' },
    { l: 'C', color: '#e06a9a' },
    { l: 'D', color: '#ee8434' }
  ],
  acts: [
    { type: 'corners', name: 'Les 4 coins', bloc: 'Bloc A · Culture et styles de management',
      rule: 'Répondez sur votre téléphone : votre avatar se déplace dans le coin choisi. Vitesse et justesse rapportent des points.',
      qs: [
        { q: 'Selon Hofstede, quelle dimension mesure jusqu’où les moins puissants acceptent une répartition inégale du pouvoir ?',
          opts: ['L’individualisme', 'La distance hiérarchique', 'Le contrôle de l’incertitude', 'La masculinité'], ok: 1, t: 20,
          why: 'Distance hiérarchique : élevée en France (68), plus faible en Allemagne (35) et aux États-Unis (40).' },
        { q: 'Quelle culture est la plus « profonde », apprise tôt sous forme de valeurs ?',
          opts: ['La culture nationale', 'La culture d’entreprise', 'La culture de métier', 'La culture d’équipe'], ok: 0, t: 20,
          why: 'La culture nationale repose sur des valeurs acquises dès l’enfance ; la culture d’entreprise, surtout sur des pratiques.' }
      ] },
    { type: 'line', name: 'La ligne humaine', bloc: 'Bloc A · Le modèle d’Hofstede',
      rule: 'Estimez le score sur votre téléphone, de 0 à 100. Votre avatar se place sur la ligne. Plus vous êtes proche, plus vous gagnez.',
      qs: [
        { q: 'Score de la France en contrôle de l’incertitude ?', val: 86, t: 25,
          why: '86 sur 100, un des plus élevés d’Europe. Allemagne : 65, États-Unis : 46 (scores classiques d’Hofstede).' },
        { q: 'Score des États-Unis en individualisme ?', val: 91, t: 25,
          why: '91 sur 100, le plus haut du classement classique d’Hofstede. France : 71, Allemagne : 67.' }
      ] },
    { type: 'standsit', name: 'Vrai ou faux', bloc: 'Bloc B · Diversité et conflits culturels',
      rule: 'Vrai : votre avatar se lève. Faux : il reste assis. 15 secondes par affirmation.',
      qs: [
        { q: 'Une équipe multiculturelle est automatiquement plus performante qu’une équipe homogène.', ok: false, t: 15,
          why: 'La diversité est une ressource et un risque. Mal gérée, l’équipe multiculturelle fait moins bien qu’une équipe homogène.' },
        { q: 'L’ethnocentrisme, c’est juger les autres cultures avec les normes de la sienne.', ok: true, t: 15,
          why: 'C’est une des erreurs classiques à l’origine des conflits culturels.' },
        { q: 'Dans une culture à contexte fort, le message passe surtout par les mots dits explicitement.', ok: false, t: 15,
          why: 'En contexte fort (E. T. Hall), le sens passe par l’implicite, la relation et le non-verbal.' }
      ] },
    { type: 'race', name: 'La course au tableau', bloc: 'Blocs C et D · Négociation et communication',
      rule: 'Regardez la scène, puis répondez le plus vite possible. La première bonne réponse de chaque équipe court au tableau.',
      qs: [
        { scene: [['k', 'Guten Tag, Herr Johnson. Voici le dossier : quatre-vingts pages d’analyse.'], ['m', 'Appelle-moi Mike ! On lance le modèle vite, on corrigera en route.'], ['k', 'Sans plan validé ? C’est beaucoup trop risqué.'], ['m', 'Relax ! Le risque fait partie du jeu.']],
          q: 'Quelle dimension d’Hofstede explique le mieux ce choc ?', opts: ['Le contrôle de l’incertitude', 'L’orientation long terme', 'La masculinité', 'L’indulgence'], ok: 0, t: 20,
          why: 'Allemagne 65 contre États-Unis 46 : Klaus réduit l’incertitude par l’analyse et les règles, Mike la tolère.' },
        { scene: [['m', 'Bon, on tranche maintenant : on garde mon plan.'], ['k', '…'], ['k', 'Il ne répond pas et attend la prochaine réunion.']],
          q: 'Face à Mike, quel mode de Thomas-Kilmann Klaus adopte-t-il ?', opts: ['La compétition', 'La collaboration', 'L’évitement', 'L’accommodation'], ok: 2, t: 20,
          why: 'L’évitement : ni ses intérêts ni ceux de Mike ne sont traités. Le conflit est reporté, pas réglé.' }
      ] },
    { type: 'fusion', name: 'La fusion', bloc: 'Cas fil rouge · Daimler-Chrysler',
      rule: 'Tout le monde vote. La fusion réussit seulement si Stuttgart et Detroit choisissent la même réponse, et la bonne. Parlez-vous !',
      qs: [
        { q: 'Daimler-Chrysler : « fusion entre égaux » de 36 G$ en 1998, revendue 7,4 G$ en 2007. Quelle leçon en tirer ?',
          opts: ['Le problème était seulement financier', 'L’intégration culturelle a été négligée', 'Les cultures nationales n’ont aucun effet', 'Il fallait fusionner encore plus vite'], ok: 1, t: 45,
          why: 'Une culture formelle et hiérarchique, une autre informelle et rapide, jamais intégrées : ce n’était pas une fusion entre égaux.' }
      ] }
  ],
  takeaways: [
    'La culture ne disparaît pas dans une fusion : elle se gère.',
    'La diversité devient une force quand on nomme les différences.',
    'Équipe multiculturelle : clarifier les rôles et oser dire les vraies choses.'
  ]
};

/* ---------- Voix ElevenLabs (générées à l'avance par tools/generer-voix.mjs) ----------
   Remplacez les identifiants par des voix françaises ou québécoises de la Voice Library
   d'ElevenLabs (bouton « Add to my voices », puis copiez le « Voice ID »).
   Par défaut : voix standard d'ElevenLabs, qui parlent français avec le modèle multilingue. */
export const ELEVEN = {
  model: 'eleven_multilingual_v2',
  voices: {
    N: 'JBFqnCBsd6RMkjVDRZzb',  // narrateur (George, voix posée de conteur)
    M: 'EXAVITQu4vr4xnSDxMaL',  // Mélanie Cloutier (Sarah)
    P: 'IKne3meq5aSn9XLyUdCD',  // Philippe Joly (Charlie, ton décontracté)
    k: 'onwK4e9ZLuTAKqWW03F9',  // Klaus (Daniel, ton autoritaire)
    mi: 'CwhRBWXzGAHq8TQ4Fs17'  // Mike (Roger)
  },
  settings: {
    default: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    N: { stability: 0.6, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
    P: { stability: 0.35, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true }
  }
};

/* ---------- Les profs (apparence générique, pas des portraits) ---------- */
export const PROFS = {
  M: { name: 'Mélanie Cloutier', role: 'Professeure, GIN761', voice: 'f' },
  P: { name: 'Philippe Joly', role: 'Professeur invité', voice: 'm' }
};

/* Répliques. M = Mélanie Cloutier (sérieuse, rit volontiers), P = Philippe Joly (pince-sans-rire).
   Chaque entrée est un petit échange : une liste de [qui, texte] joués à la suite.
   Ses deux expressions fétiches sont placées à des moments fixes (accueil, fusion, course, fin)
   pour ne revenir qu'une ou deux fois par partie.
   great : ≥ 75 % de bonnes réponses · mid : 40 à 75 % · bad : < 40 % · none : personne n'a répondu */
export const LINES = {
  lobby: [
    ['M', 'Bonjour à tous. Sortez vos téléphones et scannez le code : pour une fois, c’est permis.'],
    ['P', 'Profitez-en. Sont vilains étudiants, mais aujourd’hui, on vous fait confiance.'],
    ['M', 'Ha ! Il plaisante. Enfin, je crois.']
  ],
  intro: {
    corners: [['P', 'Premier jeu : les quatre coins. Ne suivez pas forcément votre voisin.'], ['M', 'Exactement. Réfléchissez avant de choisir.']],
    line: [['M', 'Une estimation, ça se justifie. Pensez aux scores d’Hofstede vus en classe.'], ['P', 'Et si vous n’avez aucune idée, visez le milieu. Ça marche rarement, mais bon.']],
    standsit: [['P', 'Vrai ou faux. Simple, rapide, sans appel.'], ['M', 'Lisez bien la phrase : un seul mot peut tout changer.']],
    race: [['M', 'Observez bien la scène. Un conflit mal nommé est un conflit qui revient.'], ['P', 'Et soyez rapides : ici, la vitesse compte aussi.']],
    fusion: [['P', 'Dernière épreuve. Stuttgart et Detroit doivent s’entendre sur une seule réponse.'], ['M', 'Parlez-vous. C’est tout le sujet de la présentation.']]
  },
  great: [
    [['P', 'Impressionnant. Je soupçonne que quelqu’un a vraiment lu le livre.'], ['M', 'Ha ! Plusieurs, même. Bravo à tous.']],
    [['M', 'Excellent. Une équipe qui partage le même cadre de référence, c’est exactement ce qu’on cherche.'], ['P', 'Je n’ai rien à ajouter. Pour une fois.']],
    [['P', 'C’est presque trop beau. Je soupçonne une fusion secrète entre Stuttgart et Detroit.'], ['M', 'Ha ha ! Ce serait la première fusion réussie de l’histoire de l’automobile.']],
    [['M', 'Très bien. Vous êtes passés de la formation à la performance, comme chez Tuckman.'], ['P', 'Tuckman serait fier. Moi aussi, un peu.']]
  ],
  mid: [
    [['M', 'La moitié de la classe a compris. L’autre moitié, on en reparle en révision.'], ['P', 'L’autre moitié regardait son téléphone pour autre chose que le jeu, à mon avis.']],
    [['P', 'Moitié-moitié. On dirait une fusion entre égaux : ça a l’air bien sur papier.'], ['M', 'Ha ! C’est exactement le cas Daimler-Chrysler.']],
    [['M', 'Petite question pour vous : avez-vous osé dire les vraies choses à votre équipe ?'], ['P', 'Moi, je les dis toujours. C’est d’ailleurs ce qu’on me reproche.'], ['M', 'Ha ha ! C’est vrai.']],
    [['P', 'On dirait une réunion sans ordre du jour : tout le monde parle, personne ne décide.'], ['M', 'Ha ! Pensez à votre animateur de réunion.']]
  ],
  bad: [
    [['P', 'Bon. On ne va pas se mentir, ce n’était pas votre meilleure.'], ['M', 'Ce n’est pas un échec, c’est un apprentissage. On relira ce chapitre ensemble.']],
    [['M', 'Celle-là était difficile, je vous l’accorde.'], ['P', 'Difficile, oui. Impossible, non.']],
    [['P', 'Même Daimler-Chrysler a fait mieux. Et ils ont perdu vingt-neuf milliards.'], ['M', 'Ha ha ! Ne le prenez pas mal, il dit ça avec affection.']],
    [['M', 'Au moins, la sécurité psychologique est là : personne n’a eu peur de se tromper.'], ['P', 'Ça, je confirme. Personne n’a eu peur.']]
  ],
  none: [
    [['P', 'Allô ? Il y a quelqu’un ? Réveillez-vous !'], ['M', 'Ha ! Le Wi-Fi a peut-être plus de retard que vous.']],
    [['M', 'Personne n’a répondu. Silence culturel, ou silence de fin de session ?'], ['P', 'Fin de session. Je reconnais l’odeur du café froid.']]
  ],
  raceWin: [['P', 'Tabarnak, regardez-moi ça courir ! On se croirait aux Jeux olympiques.'], ['M', 'Ha ! C’est bien la première fois qu’on court vers le tableau dans mon cours.']],
  fusionOk: [['M', 'Fusion réussie. Vous avez intégré vos deux cultures, mieux que Daimler-Chrysler.'], ['P', 'Tabarnak. Je suis presque ému.'], ['M', 'Ha ! Il est ému. Notez la date.']],
  fusionKo: [['P', 'Fusion ratée. Comme en 2007, finalement.'], ['M', 'Deux cultures, deux réponses : c’est exactement le cas qu’on vient d’étudier.']],
  final: [['M', 'Bravo à tous. Une belle démonstration de ce que la diversité apporte quand elle est bien gérée.'], ['P', 'Sont vilains étudiants… mais ce sont mes vilains étudiants préférés.'], ['M', 'Ha ha ! Il ne le dira qu’une fois. Merci à l’équipe Charlie !']]
};

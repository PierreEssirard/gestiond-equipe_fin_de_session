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
    N: '3hviE7nONcivv0HJiYKo',  // narrateur : voix conçue, français standard sans accent (Voice Design)
    M: 'By8JYBR318pkS66woKw6',  // Mélanie Cloutier : voix conçue, français standard, posée et claire
    P: '0LdaC3Mnoysn5aLaXVz8',  // Philippe Joly : voix conçue, français standard, chaleureuse et taquine
    k: 'onwK4e9ZLuTAKqWW03F9',  // Klaus (Daniel, ton autoritaire)
    mi: 'CwhRBWXzGAHq8TQ4Fs17'  // Mike (Roger)
  },
  settings: {
    default: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    N: { stability: 0.6, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
    P: { stability: 0.35, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true }
  },
  /* réglages particuliers : le cri de Philippe, très expressif */
  lineSettings: [
    { who: 'P', match: /^YOUHOU/, settings: { stability: 0.2, similarity_boost: 0.75, style: 0.9, use_speaker_boost: true } }
  ]
};
export const voiceSettings = (who, text) => (ELEVEN.lineSettings.find(x => x.who === who && x.match.test(text)) || {}).settings || ELEVEN.settings[who] || ELEVEN.settings.default;

/* ---------- Les profs (apparence générique, pas des portraits) ---------- */
export const PROFS = {
  M: { name: 'Mélanie Cloutier', role: 'Professeure, GIN761', voice: 'f' },
  P: { name: 'Philippe Joly', role: 'Professeur invité', voice: 'm' }
};

/* Répliques. M = Mélanie Cloutier (sérieuse et souriante, rit aux blagues de Philippe), P = Philippe Joly (le drôle).
   Chaque entrée est un petit échange : une liste de [qui, texte] joués à la suite.
   Aucune réplique ne revient deux fois dans une partie : chaque réserve est tirée sans remise
   (great, mid, bad : au moins 9 échanges, autant que de questions hors fusion ; waiting : une par question).
   Expressions fétiches de Philippe, à des moments fixes : « Tabarouette » (consignes de la ligne et de la course,
   fin de la fusion, course gagnée), « vilains étudiants » (accueil et fin), « CréH, arrête d’utiliser Claude »
   (première question de la ligne), « YOUHOUUUUU » à la première bonne réponse majoritaire (gros plan, saut).
   great : ≥ 75 % de bonnes réponses · mid : 40 à 75 % · bad : < 40 % · none : personne n'a répondu */
export const LINES = {
  lobby: [
    ['M', 'Bonjour à tous. Sortez vos téléphones et scannez le code : pour une fois, c’est permis.'],
    ['P', 'Profitez-en. Sont vilains étudiants, mais aujourd’hui, on vous fait confiance.'],
    ['M', 'Ha ! Il plaisante. Enfin, je crois.']
  ],
  /* pendant l'attente des joueurs, toutes les 30 s environ */
  lobbyMore: [
    [['P', 'Je vois encore des téléphones dans les poches. Allez, on scanne le code !'], ['M', 'Ha ha ! Plus vite on commence, plus vite on apprend.']],
    [['P', 'Choisissez bien votre camp : Stuttgart ou Detroit, c’est pour la vie.'], ['M', 'Ha ! Pour dix minutes, Philippe. Pas pour la vie.']],
    [['M', 'Pendant que tout le monde se connecte : qui a lu le chapitre sur Daimler-Chrysler ?'], ['P', 'Moi. Deux fois. Je ne comprends toujours pas pourquoi ils ont fusionné.'], ['M', 'Ha ha ! Vous allez comprendre aujourd’hui.']],
    [['P', 'Moi, je reste neutre. Ni Stuttgart ni Detroit : aujourd’hui, je suis Suisse.'], ['M', 'Ha ha ! L’évitement, c’est aussi un mode de gestion de conflit.']],
    [['M', 'Si le code ne fonctionne pas, demandez à votre voisin. C’est déjà du travail d’équipe.'], ['P', 'Et si votre voisin ne répond pas, c’est une culture à contexte fort.']]
  ],
  intro: {
    corners: [['P', 'Premier jeu : les quatre coins. Ne suivez pas forcément votre voisin.'], ['M', 'Exactement. Réfléchissez avant de choisir.']],
    line: [['M', 'Une estimation, ça se justifie. Pensez aux scores d’Hofstede vus en classe.'], ['P', 'Tabarouette, des chiffres ! Si vous n’avez aucune idée, visez le milieu. Ça marche rarement.'], ['M', 'Ha ha ! Ne l’écoutez pas. Fiez-vous plutôt à votre cours.']],
    standsit: [['P', 'Vrai ou faux. Simple, rapide, sans appel.'], ['M', 'Lisez bien la phrase : un seul mot peut tout changer.']],
    race: [['M', 'Observez bien la scène. Un conflit mal nommé est un conflit qui revient.'], ['P', 'Tabarouette, une course ! Soyez rapides : ici, la vitesse compte aussi.']],
    fusion: [['P', 'Dernière épreuve. Stuttgart et Detroit doivent s’entendre sur une seule réponse.'], ['M', 'Parlez-vous. C’est tout le sujet de la présentation.']]
  },
  /* pendant la première question de la ligne (des chiffres qu'on pourrait chercher en ligne) */
  claude: [['P', 'Je vois des téléphones qui chauffent… CréH, arrête d’utiliser Claude !'], ['M', 'Ha ha ha ! Il vous a à l’œil, je vous préviens.']],
  /* pendant la question de la fusion */
  waitFusion: [['P', 'Stuttgart, Detroit : parlez-vous ! C’est maintenant ou jamais.'], ['M', 'Et écoutez vraiment l’autre équipe. Toute la fusion se joue là.']],
  /* pendant les questions, une fois la question lue (sans changer de caméra) */
  waiting: [
    [['P', 'Allez, on se décide. Même un comité allemand aurait déjà voté.'], ['M', 'Ha ! Pas sûr. Il leur faudrait d’abord un rapport de quatre-vingts pages.']],
    [['M', 'Ne vous fiez pas à la foule : la bonne réponse n’est pas toujours la plus populaire.']],
    [['P', 'Je vois des gens qui changent d’avis. C’est ça, la flexibilité culturelle ?'], ['M', 'Ha ha ! Disons que c’est permis.']],
    [['P', 'Le chrono tourne. Un Américain aurait déjà répondu deux fois.']],
    [['M', 'Pensez au contexte, pas seulement aux mots. Edward Hall serait fier de vous.']],
    [['P', 'Si vous hésitez, choisissez avec confiance. Au pire, vous aurez tort avec style.'], ['M', 'Ha ha ! Ce n’est pas une méthode que je recommande.']],
    [['P', 'Je ne dis rien. Mais je regarde.']],
    [['M', 'Vous pouvez en discuter entre vous. Dans une équipe, on a le droit de se parler.']],
    [['P', 'Petite pression amicale : votre note n’en dépend pas. Enfin, presque pas.'], ['M', 'Ha ha ! Elle n’en dépend pas du tout, rassurez-vous.']],
    [['P', 'Ça réfléchit fort dans la salle. J’entends presque les neurones.']]
  ],
  /* première bonne réponse majoritaire : gros plan sur Philippe qui crie et saute, bras levés */
  youhou: [['P', 'YOUHOUUUUU !', 'youhou'], ['M', 'Ha ha ha ! Philippe, on se calme, il reste encore des questions !'], ['P', 'Je ne me calme jamais quand mes étudiants ont raison.']],
  great: [
    [['P', 'Impressionnant. Je soupçonne que quelqu’un a vraiment lu le livre.'], ['M', 'Ha ! Plusieurs, même. Bravo à tous.']],
    [['M', 'Excellent. Une équipe qui partage le même cadre de référence, c’est exactement ce qu’on cherche.'], ['P', 'Je n’ai rien à ajouter. Pour une fois.']],
    [['P', 'C’est presque trop beau. Je soupçonne une fusion secrète entre Stuttgart et Detroit.'], ['M', 'Ha ha ! Ce serait la première fusion réussie de l’histoire de l’automobile.']],
    [['M', 'Très bien. Vous êtes passés de la formation à la performance, comme chez Tuckman.'], ['P', 'Tuckman serait fier. Moi aussi, un peu.']],
    [['P', 'Là, je suis inquiet. Vous êtes trop bons, ça cache quelque chose.'], ['M', 'Ha ha ! Ou alors ils ont simplement étudié, Philippe.']],
    [['M', 'Bravo. Vous avez nommé la différence au lieu de l’ignorer : c’est toute la clé.'], ['P', 'Je prends des notes. Pour mon propre cours.']],
    [['P', 'Regardez-moi cette synergie ! Daimler et Chrysler auraient payé cher pour ça.'], ['M', 'Ha ! Trente-six milliards, pour être exacte.']],
    [['M', 'Belle réponse d’équipe : diverse, mais alignée.'], ['P', 'Je n’aurais pas dit mieux. Alors je ne dis rien.'], ['M', 'Ha ha ! Une première.']],
    [['P', 'Si ça continue, je vais devoir vous mettre une bonne note.'], ['M', 'Ha ha ! Heureusement, ce n’est pas lui qui corrige.']]
  ],
  mid: [
    [['M', 'La moitié de la classe a compris. L’autre moitié, on en reparle en révision.'], ['P', 'L’autre moitié regardait son téléphone pour autre chose que le jeu, à mon avis.']],
    [['P', 'Moitié-moitié. On dirait une fusion entre égaux : ça a l’air bien sur papier.'], ['M', 'Ha ! C’est exactement le cas Daimler-Chrysler.']],
    [['M', 'Petite question pour vous : avez-vous osé dire les vraies choses à votre équipe ?'], ['P', 'Moi, je les dis toujours. C’est d’ailleurs ce qu’on me reproche.'], ['M', 'Ha ha ! C’est vrai.']],
    [['P', 'On dirait une réunion sans ordre du jour : tout le monde parle, personne ne décide.'], ['M', 'Ha ! Pensez à votre animateur de réunion.']],
    [['P', 'La moitié a raison, l’autre moitié a de l’assurance. Ce n’est pas pareil.'], ['M', 'Ha ! Mais c’est un excellent début de discussion.']],
    [['M', 'Résultat partagé. C’est souvent là qu’une équipe apprend le plus.'], ['P', 'Traduction : vous allez réviser.']],
    [['P', 'On dirait le conseil d’administration de 1998 : personne n’est d’accord.'], ['M', 'Ha ha ! Et on connaît la suite.']],
    [['P', 'Moitié Stuttgart, moitié Detroit. Au moins, c’est équitable.'], ['M', 'Ha ! Équitable, oui. Efficace, pas encore.']],
    [['M', 'Quand une équipe se divise, prenez le temps de comprendre pourquoi.'], ['P', 'Ou tirez à pile ou face. Non, oubliez ce que je viens de dire.'], ['M', 'Ha ha !']]
  ],
  bad: [
    [['P', 'Bon. On ne va pas se mentir, ce n’était pas votre meilleure.'], ['M', 'Ce n’est pas un échec, c’est un apprentissage. On relira ce chapitre ensemble.']],
    [['M', 'Celle-là était difficile, je vous l’accorde.'], ['P', 'Difficile, oui. Impossible, non.']],
    [['P', 'Même Daimler-Chrysler a fait mieux. Et ils ont perdu vingt-neuf milliards.'], ['M', 'Ha ha ! Ne le prenez pas mal, il dit ça avec affection.']],
    [['M', 'Au moins, la sécurité psychologique est là : personne n’a eu peur de se tromper.'], ['P', 'Ça, je confirme. Personne n’a eu peur.']],
    [['P', 'Ouch. Je vais faire comme si je n’avais rien vu.'], ['M', 'Ha ha ! Moi, j’ai tout vu. On en reparle au prochain cours.']],
    [['M', 'Ce n’est pas grave : c’est justement pour ça qu’on fait l’exercice.'], ['P', 'Voilà. Et c’est aussi pour ça que l’examen existe.']],
    [['P', 'Celle-là, même Hofstede l’aurait ratée. Enfin… peut-être pas.'], ['M', 'Ha ! Non, lui l’aurait réussie.']],
    [['P', 'Je constate que l’ethnocentrisme se porte bien dans cette salle.'], ['M', 'Ha ha ! C’est normal : c’est pour ça qu’on l’étudie.']],
    [['M', 'Pas de panique. Un conflit bien géré commence par reconnaître l’erreur.'], ['P', 'Je reconnais. Ce n’était pas fameux.']]
  ],
  none: [
    [['P', 'Allô ? Il y a quelqu’un ? Réveillez-vous !'], ['M', 'Ha ! Le Wi-Fi a peut-être plus de retard que vous.']],
    [['M', 'Personne n’a répondu. Silence culturel, ou silence de fin de session ?'], ['P', 'Fin de session. Je reconnais l’odeur du café froid.']],
    [['P', 'Silence radio. Un vrai réflexe de culture à contexte fort.'], ['M', 'Ha ha ! Ou alors c’est le réseau. Essayons la suivante.']],
    [['M', 'Personne ? Vérifiez votre connexion, on continue.'], ['P', 'Ou réveillez votre voisin. Gentiment.']]
  ],
  raceWin: [['P', 'Tabarouette, regardez-moi ça courir ! On se croirait aux Jeux olympiques.'], ['M', 'Ha ! C’est bien la première fois qu’on court vers le tableau dans mon cours.']],
  fusionOk: [['M', 'Fusion réussie. Vous avez intégré vos deux cultures, mieux que Daimler-Chrysler.'], ['P', 'Tabarouette. Je suis presque ému.'], ['M', 'Ha ! Il est ému. Notez la date.']],
  fusionKo: [['P', 'Tabarouette… Fusion ratée. Comme en 2007, finalement.'], ['M', 'Deux cultures, deux réponses : c’est exactement le cas qu’on vient d’étudier.']],
  final: [['M', 'Bravo à tous. Une belle démonstration de ce que la diversité apporte quand elle est bien gérée.'], ['P', 'Sont vilains étudiants… mais ce sont mes vilains étudiants préférés.'], ['M', 'Ha ha ! Il ne le dira qu’une fois. Merci à l’équipe Charlie !']]
};


# Le Déchiffreur

Jeu d'apprentissage de l'anglais pour francophones, en cours de prototype.

**Jouer sur téléphone :** https://manceau-aurelien.github.io/le-dechiffreur/

## État actuel : étapes 0 à 4 du plan

Le palier 1 se joue de bout en bout : premier lancement, Camp, Expéditions, Carte, Mur, Carnet, Stèle et boss.
Le palier 2, la Ville, a commencé : la carte des quartiers et le Marché sont jouables. L'Auberge, la Gare, les Maisons et le prochain Gardien restent à écrire.
Il reste la finition (étape 5) : accessibilité, export de la progression, statistiques locales, voix définitives et builds de test.

## Lancer le jeu

```bash
npm install
npx expo start --web
```

En développement sur téléphone : lancer `npx expo start`, puis scanner le QR code avec l'application Expo Go.

Chaque envoi sur `master` valide le contenu, le code et les tests, puis republie la version web sur GitHub Pages.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run verify` | Valide le contenu, les types et les tests |
| `npx expo lint` | Vérifie le style du code |
| `npm run gen:audio` | Génère l'audio avec les voix Windows, celles du jeu |
| `npm run gen:audio -- --provider azure` | Génère l'audio avec Azure (`AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`) |

## Limites connues

- **Version web sur téléphone.** Il faut du réseau au fil du jeu, car l'audio se charge à la demande. Sur iPhone, Safari peut effacer la progression après 7 jours sans visite : ajouter le jeu à l'écran d'accueil évite ce risque.
- **Voix.** Le jeu utilise les voix Windows Zira et David, soit 30 Mo en WAV. Le fournisseur Azure est écrit,
  mais il n'a pas encore été exécuté, faute de clé.
- **Pas encore essayé sur téléphone.** Le web et les tests tournent. FSRS et SQLite restent à vérifier sur un appareil réel.
- **Modèle de mémoire.** FSRS-5 avec ses paramètres par défaut, jamais calibrés sur de vrais joueurs. Le journal `review_log` le permettra.

## Tester la mémoire sans attendre

Dans les Réglages, accessibles depuis le Camp, le mode développeur ouvre tout et permet d'avancer l'horloge d'un jour ou de 30 jours.
Le désactiver remet les verrous en place, avec l'horloge avancée.

## Organisation

```
content/      données du palier (briques, phrases, formules, pièges, boss, Stèle) et voix
src/app/      écrans : (tabs)/ Camp, Carte, Mur, Carnet ; bienvenue, expedition, lecon/[id], stele, reglages, antichambre, antre, debrief
src/core/     combat, exercices, mémoire, Expéditions et progression, sans dépendance à l'interface
src/data/     base SQLite et état partagé
src/ui/       composants, exercices et étapes de leçon
src/audio/    lecture et manifeste généré
tools/        check-content, gen-audio, gen-sfx
```

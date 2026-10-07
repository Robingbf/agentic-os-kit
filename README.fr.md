# Agentic OS Kit 🇫🇷

<p align="center"><img src="docs/assets/dashboard.webp" alt="Le dashboard Agentic OS : Today, inbox, le cerveau en anneaux, skills deck et routines" width="100%"></p>

**Ton propre système d'exploitation IA, sur ton ordinateur, construit autour de ta façon de travailler.**

Agentic OS Kit transforme [Claude Code](https://claude.com/claude-code) en centre de commande personnel :

- 🧠 **Mémoire** : une carte de tout ce sur quoi tu travailles, pour que Claude retrouve n'importe quelle info en deux étapes, vérifiée chaque nuit.
- ⏱ **Routines** : de petites tâches planifiées qui préparent les choses pour toi (digest du matin, statistiques, rappels, bilan de la semaine), avec des plafonds de coût.
- 🖥 **Dashboard** : une page privée sur ton ordinateur avec Today, tes pages, un « cerveau » vivant de ton travail, un deck de skills, tes routines, le quota Claude et la santé de ta machine, et une palette « / » pour chercher dans tes fichiers ou poser une question à Claude.
- ✦ **Skills** : tes tâches répétitives, lançables en un clic ou en une phrase.
- 🪟 **App de bureau** : ton OS s'ouvre comme n'importe quelle app (sa propre icône, à ta couleur) ; il démarre tout seul, avec ▶ start / ■ stop dans la barre du haut.

Le dépôt ne contient **aucune donnée et aucune configuration toute faite**. Quand tu l'ouvres dans Claude
Code, une configuration guidée (10 « cartes » courtes) t'interroge : ce que tu fais, ta semaine, tes outils,
ce que tu oublies. Ensuite, elle construit **ton** OS, avec seulement les panneaux, pages, routines et skills
qui te servent. Un vidéaste aura une page Contenu, un freelance une page Clients, un étudiant une page Examens.

## Installation

**Prérequis :** macOS ou Linux (Windows via WSL2) · Python 3.10+ · Git · [Claude Code](https://docs.claude.com/en/docs/claude-code/setup) avec un abonnement Claude Pro / Max / Team (ou une clé API). Rien d'autre : ni npm, ni build, ni base de données.

### Option 1 : avec un prompt (conseillé)

Ouvre Claude Code n'importe où (Terminal, onglet **Code** de l'application Claude, ou extension d'éditeur) et colle :

```text
Installe mon OS agentique personnel depuis https://github.com/Robingbf/agentic-os-kit et configure-le pour moi.
1. Clone-le dans ~/agentic-os (si ce dossier existe déjà, utilise-le sans rien écraser).
2. Lance `bash setup.sh` dedans et corrige, avec mon accord, ce qui manque.
3. Lis ~/agentic-os/CLAUDE.md et ~/agentic-os/setup/START.md, puis déroule les cartes de configuration
   de setup/cards/ dans l'ordre, en travaillant dans ~/agentic-os.
Parle-moi en français, une question à la fois, explique simplement, et demande-moi avant tout
changement permanent.
```

Claude télécharge le kit, vérifie ton ordinateur, puis lance directement la configuration guidée.

### Option 2 : à la main

```bash
git clone https://github.com/Robingbf/agentic-os-kit.git ~/agentic-os
cd ~/agentic-os
bash setup.sh        # vérifie Python, Claude Code, Git et crée les dossiers privés
claude               # puis dis : « salut, on configure mon OS »
```

Jamais utilisé de terminal ? Suis le guide pas à pas : **[INSTALL.fr.md](INSTALL.fr.md)**.

### Après l'installation

- Ouvre tes sessions Claude Code **dans `~/agentic-os`** : le `CLAUDE.md` du kit se charge tout seul, reprend la configuration là où tu t'es arrêté et, une fois terminée, fonctionne comme ton OS.
- Dashboard : ouvre l'**app de bureau** créée pendant la configuration (macOS : `bash tools/desktop-app/build.sh`), ou `python3 dashboard/server.py` puis http://127.0.0.1:8765.

## Les cartes de configuration

| Carte | Ce qui se passe |
|---|---|
| 00 Bienvenue | langue, prérequis, ton abonnement, fuseau horaire, nom de ton OS |
| 01 Entretien | qui tu es, ta semaine, tes obligations, ce qui t'échappe (une question à la fois) |
| 02 Outils | tes applis, fichiers et connecteurs (Gmail, Agenda, Notion, Drive…) |
| 03 Carte mémoire | tes domaines de travail, la carte en deux étapes, la vérification nocturne |
| 04 Plan | la conception de **ton** OS : panneaux, pages, routines, skills, coûts. Tu valides. |
| 05 Routines | tes tâches planifiées, en lecture seule, testées une fois chacune |
| 06 Skills | tes skills à la demande et le deck |
| 07 Dashboard | ton dashboard en ligne, la visite guidée, les couleurs |
| 08 Automatisation | planificateur, journaux de session, sauvegardes, chacun avec ton accord explicite |
| 09 Passation | vérifications finales, coût mensuel, comment l'utiliser et le faire évoluer |

Tu peux faire une pause à tout moment : la configuration reprend là où tu t'es arrêté.

## Sécurité

Tout tourne en local. Les routines sont en lecture seule. Le contenu des mails est traité comme de la
donnée, jamais comme des instructions. Les secrets sont masqués. Tes fichiers personnels sont exclus de
git. Chaque changement permanent nécessite ton accord. Détails : [docs/SECURITY.md](docs/SECURITY.md).

## Crédits

L'approche en quatre couches (Memory, Agent, Pulse, Screen) vient du guide gratuit **MAPS** de
[pavrus117](https://github.com/pavrus117/ai-os-maps-guide). Ce kit en est une implémentation indépendante,
avec son propre code et ses propres cartes. Licence MIT.

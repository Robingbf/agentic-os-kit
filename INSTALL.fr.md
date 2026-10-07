# Guide d'installation, étape par étape (aucune expérience requise)

Suis les étapes dans l'ordre. Chacune dit **quoi faire** et **comment savoir que ça a marché**. Compte environ
15 minutes, puis la configuration guidée avec Claude (45 à 90 minutes, que tu peux mettre en pause).

> Le **Terminal** est une application où l'on tape des commandes. Une **commande** est une ligne que tu
> copies, colles, puis valides avec **Entrée**. Si une commande affiche une erreur, copie-la et colle-la à
> Claude (étape 6) : il t'aidera.

## Étape 1 : un abonnement Claude
Il te faut un abonnement Claude (**Pro**, **Max**, **Team** ou **Enterprise**) sur [claude.ai](https://claude.ai),
ou une clé API Anthropic. Pro suffit pour commencer ; Max laisse beaucoup plus de marge aux routines automatiques.
✅ Tu peux te connecter sur claude.ai.

## Étape 2 : ouvrir le Terminal
- **Mac** : `⌘ Commande` + `Espace`, tape `Terminal`, Entrée.
- **Linux** : ouvre ton application Terminal (souvent `Ctrl` + `Alt` + `T`).
- **Windows** : installe WSL2 (cherche « Installer WSL » sur learn.microsoft.com), ouvre « Ubuntu », puis suis les instructions Linux.
✅ Une fenêtre avec un curseur qui clignote est ouverte.

## Étape 3 : installer Claude Code
Suis les instructions officielles : **https://docs.claude.com/en/docs/claude-code/setup** (une commande à copier). Puis vérifie :
```bash
claude --version
```
✅ Un numéro de version s'affiche. Sinon, ferme et rouvre le Terminal, puis réessaie.

## Étape 4 : vérifier Python et Git
```bash
python3 --version
git --version
```
✅ Python **3.10 ou plus**, et Git affiche une version.
Sur Mac, s'il en manque un : `xcode-select --install`, clique sur *Installer*, puis réessaie. Sur Linux : `sudo apt install python3 git`.

## Étape 5 : télécharger le kit
```bash
git clone https://github.com/Robingbf/agentic-os-kit.git ~/agentic-os
cd ~/agentic-os
bash setup.sh
```
Pas de Git ? Clique sur **Code → Download ZIP**, dézippe, renomme le dossier `agentic-os`, place-le dans ton dossier personnel, puis : `cd ~/agentic-os && bash setup.sh`.
✅ `setup.sh` se termine par « Ready. Now run: claude ».

## Étape 6 : lancer Claude dans le dossier du kit
```bash
claude
```
La première fois, Claude Code te demande de te connecter avec ton compte Claude : une page s'ouvre dans ton navigateur, tu valides, puis tu reviens au Terminal. Ensuite, écris simplement :
> **salut, on configure mon OS**

✅ Claude te répond et commence la **carte 00**. Ensuite, il suffit de répondre à ses questions.

## Étape 7 (conseillée) : connecter tes applis
Sur [claude.ai](https://claude.ai) → **Paramètres → Connecteurs**, connecte ce que tu utilises (Gmail, Google Agenda, Google Drive, Notion, Slack…). Ils sont ensuite disponibles dans Claude Code avec le même compte. La carte 02 te dit lesquels valent le coup pour toi. L'OS ne les utilise qu'**en lecture**, sauf si tu demandes explicitement une action.

## Option B : sans terminal, avec l'application Claude (onglet Code)

Si tu utilises Claude Code dans l'**application Claude** (ou l'extension VS Code / JetBrains), tu peux
sauter les étapes 2 à 6 : Claude s'occupe de la partie technique.

1. Installe l'[application Claude](https://claude.ai/download), connecte-toi et ouvre l'onglet **Code**.
2. Démarre une session dans ton **dossier personnel** (choisis-le comme dossier de travail à l'ouverture de la session).
3. Colle ce message :
   > Clone https://github.com/Robingbf/agentic-os-kit dans ~/agentic-os, lance `bash setup.sh` dedans,
   > et dis-moi s'il manque quelque chose sur mon ordinateur.
   Claude te demande l'autorisation avant chaque commande : lis-la, puis accepte.
4. Ouvre une **nouvelle session** dont le dossier de travail est `~/agentic-os`. C'est important : le
   `CLAUDE.md` du kit n'est chargé que si la session tourne dans ce dossier.
5. Dis : **salut, on configure mon OS**. La configuration guidée démarre (carte 00).

Pour le dashboard, demande à Claude : « lance mon dashboard ». Selon ton application, il s'ouvre dans un
panneau d'aperçu, ou Claude te donne l'adresse http://127.0.0.1:8765 à ouvrir dans ton navigateur.

---

## Au quotidien
```bash
cd ~/agentic-os && python3 dashboard/server.py
```
puis ouvre **http://127.0.0.1:8765** dans ton navigateur (mets-le en favori).

## En cas de problème
| Problème | Solution |
|---|---|
| `claude: command not found` | ferme et rouvre le Terminal, relance l'installateur officiel |
| `python3: command not found` | Mac : `xcode-select --install` ; Linux : installe `python3` |
| La page du dashboard ne s'ouvre pas | `python3 dashboard/server.py` tourne-t-il toujours dans un onglet du Terminal ? |
| « Address already in use » | le dashboard tourne déjà : ouvre simplement l'adresse |
| Les routines n'ont pas tourné la nuit | l'ordinateur était en veille ; elles rattrapent au réveil (voir carte 08) |
| Autre chose | lance `claude` dans le dossier et décris le problème : Claude connaît ce kit |

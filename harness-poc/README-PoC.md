# Kit PoC : harness multi-agents Mistral pour le code

Ce kit met en œuvre la recommandation n°1 du rapport : une preuve de concept
qui chaîne quatre rôles (planificateur, codeur, testeur, approbation humaine
assistée d'un réviseur) en supprimant le copier-coller de prompts entre agents.

## Arborescence du kit

```
.vibe/
  config.toml              # Configuration du projet pour la CLI mistral-vibe
  agents/
    planificateur.toml     # Lecture seule stricte, produit le plan
    codeur.toml            # Edition de fichiers + shell restreint (allowlist)
    testeur.toml           # Shell limite a npm test / test:coverage / test:e2e
    reviseur.toml          # Revue lecture seule, recommandation formatée
harness-poc/
  orchestrate_poc.py       # L'orchestrateur (Python, aucune dependance externe)
  README-PoC.md            # Ce fichier
  JOURNAL.md               # Journal appendable des runs (l'etat, versionne)
  TACHES.md                # Backlog des taches a lancer
  taches/                  # Fiches de taches ecrites au fil des runs
  plans/                   # Plans produits par le planificateur
.poc-worktrees/            # Worktrees isoles (cree au 1er run, a gitignorer)
```

## 1. Installation (une seule fois)

Environnement Linux recommande (WSL2 Ubuntu) : la CLI embarque des binaires
non signes bloques par Smart App Control sous Windows.

```bash
curl -LsSf https://astral.sh/uv/install.sh | bash
uv tool install --python 3.14 mistral-vibe
vibe --help
```

Sous Windows natif (seulement si Smart App Control est desactive, decision
irreversible a peser) :

```powershell
irm https://astral.sh/uv/install.ps1 | iex
uv tool install --python-preference only-system --python 3.14 mistral-vibe
```

Authentification : lance `vibe` une premiere fois dans le dossier du projet
et connecte-toi avec ton compte Mistral (ou ta cle API La Plateforme). Les
modeles disponibles se listent avec `/model` dans la session interactive.

## 2. Verifications avant le premier run

1. **Modele** : dans une session `vibe` interactive, tape `/model`. Si un
   modele Devstral y figure, mets-le en `active_model` dans `.vibe/config.toml`
   (ou decommente le preset du fichier). Sinon `mistral-medium-latest` fait
   tourner le PoC.
2. **Confiance du dossier** : la configuration projet `.vibe/` n'est chargee
   que si le dossier est trusted. C'est le cas si tu as deja ouvert `vibe`
   dans le projet et accepte.
3. **Test du role testeur seul** (teste le PoC sans orchestrateur) :

   ```bash
   vibe --agent testeur --prompt "Execute npm test et rends ton verdict." --max-price 1
   ```

   Le testeur doit executer les tests et repondre `VERDICT: PASS` ou
   `VERDICT: FAIL`. C'est le test de faisabilite cle du PoC.

## 3. Lancer un run complet

Depuis la racine du projet :

```bash
uv run harness-poc/orchestrate_poc.py "Ajouter le camembert de repartition par usage dans le tableau de bord"
```

Enchainement automatique :

```
planificateur (lecture seule)  ->  sauvegarde du plan  ->  [plafond --max-price]
        |____ validation humaine du plan (terminal)
codeur (worktree isole)  ->  testeur (npm test)  ->  si ECHEC : boucle (max --iterations)
        |____ revue du reviseur (lecture seule)
        |____ approbation humaine finale -> commit sur la branche poc-...
```

Options utiles :

| Option | Effet |
| :--- | :--- |
| `--iterations 2` | Tours codeur->testeur max (defaut 2) |
| `--prix-code 2` | Plafond en dollars du codeur par tour |
| `--skip-review` | Passe l'etape revue |
| `--skip-install` | Saute npm install si le worktree a deja node_modules |
| `--no-worktree` | Branche a la place du worktree (moins isole : deconseille) |

Budgets par defaut :
plan 1 $, code 2 $/tour, test 0,75 $, revue 0,75 $. Soit un plafond theorique
d'environ 7,50 $ pour un run a 2 tours. Relis `JOURNAL.md` apres chaque run et
verifie que le prix reel facture correspond aux attentes.

## 4. Securite integree au kit

- Chaque role est un **profil d'agent** avec ses propres permissions, pas un
  prompt copie a la main : le testeur ne peut physiquement lancer que les
  commandes de son allowlist ; le planificateur et le revseur ne peuvent
  rien modifier.
- En mode programme, tout appel d'outil non autorise est **refuse et signale**
  a l'agent au lieu d'attendre une reponse humaine. N'utilise jamais
  `--auto-approve` hors sandbox (le kit n'en a pas besoin).
- Chaque etape est plafonnee (`--max-price`, `--max-turns`), le run entier se
  deroule dans un **worktree git isole** : ta branche courante n'est jamais
  touchee, et rien n'est commite sans ta reponse `[o]` au terminal.
- **Committe le kit avant de jouer avec les branches** : les fichiers non
  suivis par git disparaissent au moindre nettoyage de copie de travail.

## 5. Depannage

| Symptome | Cause probable / resolution |
| :--- | :--- |
| `vibe` introuvable | Relance le shell apres l'install uv ; `uv tool update-shell` |
| Erreur WinError 4551 / 0xc0e90002 sous Windows | Smart App Control bloque les binaires non signes : passer par WSL2, ou desactiver SAC (irreversible) |
| Les agents ont un comportement "generique" | `.vibe/` non charge : dossier non trusted. Ouvre `vibe` interactif dans le dossier, accepte. Pour un worktree : `vibe --workdir <chemin>` une fois, accepte, relance le run |
| Testeur repond sans `VERDICT:` | Reponse tronquee ou modele trop faible : relance, ou augmente `--prix-test` |
| npm test echoue dans le worktree | `node_modules` absent : laisse l'etape `npm install` se derouler (ou `--skip-install` apres) |

## 6. Apres le PoC : les tranches suivantes

1. **Validation** (ce kit) : un run par tache, humain au terminal.
2. **Etat durable** : le journal et les fiches sont deja dans le depot ;
   ajouter la reprise apres crash (relire JOURNAL.md + plan et relancer).
3. **Suivi des couts reels** : consigner par run le cout facture a cote du
   plafond, ajuster les budgets.
4. **Reutilisabilite** : une fois les profils stables, copier les generiques
   vers `~/.vibe/agents/` (valables pour tous tes projets) et ne garder au
   niveau projet que les surcharges (allowlist de tests, instructions stack).
5. **Files d'attente** : seulement si le volume le justifie, etudier Archon
   (option A du rapport) avec un provider custom autour de ce meme
   `vibe --prompt-file --output json`.

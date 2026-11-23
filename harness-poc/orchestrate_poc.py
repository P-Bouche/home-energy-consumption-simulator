#!/usr/bin/env python3
"""Orchestrateur PoC du harness Mistral multi-agents.

Enchaîne planificateur -> codeur -> testeur -> (optionnel) réviseur -> approbation humaine,
via la CLI mistral-vibe en mode programme. Chaque étape est plafonnée en prix et en tours.

Usage :
    uv run harness-poc/orchestrate_poc.py "Description de la tâche à réaliser" [options]

Important :
    - Place-toi à la racine du dépôt git du projet.
    - La CLI `vibe` doit être installée et authentifiée (voir harness-poc/README-PoC.md).
    - Appels shell restreints : aucune commande hors allowlist ne passe au codeur
      ni au testeur (profils .vibe/agents/), les autres appels sont refusés
      en mode programme.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# --- Console robuste (accents dans les sorties agents) ------------------------
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

VIBE = shutil.which("vibe") or "vibe"
JOURNAL = Path("harness-poc/JOURNAL.md")
PLANS_DIR = Path("harness-poc/plans")
VERDICT_RE = re.compile(r"VERDICT:\s*(PASS|FAIL)", re.IGNORECASE)


def stamp() -> str:
    return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def slugify(text: str, maxlen: int = 24) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return (s[:maxlen].rstrip("-")) or "tache"


def header(msg: str) -> None:
    print(f"\n{'=' * 70}\n{msg}\n{'=' * 70}", flush=True)


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", **kw)


def git(*args: str) -> subprocess.CompletedProcess:
    return run(["git", *args])


def journal_append(text: str) -> None:
    JOURNAL.parent.mkdir(parents=True, exist_ok=True)
    with JOURNAL.open("a", encoding="utf-8") as f:
        f.write(text.rstrip() + "\n")


def run_vibe(workdir: Path, agent: str, prompt: str, max_price: float,
             max_turns: int) -> tuple[int, str]:
    """Appelle la CLI en mode programme et renvoie (code retour, texte final).

    Le prompt passe par --prompt-file : immune a la limite de longueur des
    arguments de ligne de commande, et aux retours a la ligne.
    """
    fd, prompt_path = tempfile.mkstemp(suffix=".md", prefix="harness-poc-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(prompt)
        cmd = [
            VIBE, "--workdir", str(workdir),
            "--agent", agent,
            "--output", "text",
            "--max-price", f"{max_price:.2f}",
            "--max-turns", str(max_turns),
            "--prompt-file", prompt_path,
        ]
        print(f"\n$ vibe --workdir {workdir} --agent {agent} --max-price {max_price:.2f} "
              f"--max-turns {max_turns} --prompt-file <{len(prompt)} caracteres>", flush=True)
        p = run(cmd)
    finally:
        os.unlink(prompt_path)
    if p.stdout:
        print(p.stdout)
    if p.returncode != 0 and p.stderr:
        print(f"[stderr] {p.stderr[:2000]}", file=sys.stderr)
    return p.returncode, p.stdout or ""


def parse_verdict(text: str) -> str | None:
    matches = VERDICT_RE.findall(text)
    return matches[-1].upper() if matches else None


def ask(label: str, choices: str = "[o]ui / [n]on") -> str:
    return input(f"{label} {choices} > ").strip().lower()


def commit_kit_once() -> None:
    """Le kit (.vibe, harness-poc) doit être suivi par git pour exister dans un worktree."""
    s = git("status", "--porcelain", "--", ".vibe", "harness-poc")
    if s.stdout.strip():
        header("Étape 0 : commit du kit harness (première exécution)")
        git("add", ".vibe", "harness-poc")
        p = git("commit", "-m", "chore(harness-poc): kit orchestration multi-agents Mistral")
        print((p.stdout or p.stderr or "").strip()[:500])
        if p.returncode != 0:
            sys.exit("Commit du kit impossible (dépôt propre et à jour ?). Abandon.")


def setup_worktree(slug: str, worktrees_root: Path) -> Path:
    branch = f"poc-{dt.date.today():%Y%m%d}-{slug}"
    wt = worktrees_root / f"{branch}"
    wt.parent.mkdir(parents=True, exist_ok=True)
    if wt.exists():
        sys.exit(f"Worktree déjà existant : {wt}. Supprime-le ou relance plus tard.")
    p = git("worktree", "add", "-b", branch, str(wt))
    if p.returncode != 0:
        print((p.stderr or "").strip()[:500])
        sys.exit("Création du worktree impossible. Relance avec --no-worktree pour travailler en place.")
    return wt


def npm_install(wt: Path) -> None:
    header("Installation des dépendances du worktree (npm install)")
    print("Cette étape peut durer quelques minutes...", flush=True)
    p = run(["npm", "install"], cwd=str(wt), shell=True)
    print(p.stdout or "", end="")
    if p.returncode != 0:
        print(p.stderr or "", end="", file=sys.stderr)
        sys.exit("npm install a échoué dans le worktree. Abandon.")


def main() -> None:
    ap = argparse.ArgumentParser(description="PoC harness Mistral multi-agents via CLI vibe.")
    ap.add_argument("tache", help="Description de la tâche à planifier puis implémenter.")
    ap.add_argument("--iterations", type=int, default=2,
                    help="Nombre maximal de tours codeur->testeur (défaut 2).")
    ap.add_argument("--prix-plan", type=float, default=1.00)
    ap.add_argument("--prix-code", type=float, default=2.00)
    ap.add_argument("--prix-test", type=float, default=0.75)
    ap.add_argument("--prix-revue", type=float, default=0.75)
    ap.add_argument("--no-worktree", action="store_true",
                    help="Travaille sur une branche à la place du dossier courant (moins isolé).")
    ap.add_argument("--skip-review", action="store_true",
                    help="Passe l'étape de revue par l'agent réviseur.")
    ap.add_argument("--skip-install", action="store_true",
                    help="Ne lance pas npm install dans le worktree (si node_modules déjà présent).")
    args = ap.parse_args()

    if git("rev-parse", "--is-inside-work-tree").returncode != 0:
        sys.exit("Pas dans un dépôt git. Lance ce script depuis la racine du projet.")

    slug = slugify(args.tache)
    header(f"PoC harness Mistral - tâche : {args.tache}")
    print(f"Budgets max par étape : plan {args.prix_plan} $ | code {args.prix_code} $ | "
          f"test {args.prix_test} $ | revue {args.prix_revue} $")
    budget_total = args.prix_plan + args.iterations * (args.prix_code + args.prix_test) + args.prix_revue
    print(f"Budget théorique maximal du run : {budget_total:.2f} $")

    commit_kit_once()

    if args.no_worktree:
        workdir = Path.cwd().resolve()
        branch = f"poc-{dt.date.today():%Y%m%d}-{slug}"
        git("checkout", "-b", branch)
    else:
        worktrees_root = Path.cwd().resolve() / ".poc-worktrees"
        workdir = setup_worktree(slug, worktrees_root)
        if not args.skip_install:
            npm_install(workdir)
        print(f"\nWorktree prêt : {workdir}")
        print("Si la CLI vibe signale ensuite un dossier 'non trusted', ouvre une session "
              "interactive `vibe --workdir` sur ce dossier une seule fois, accepte, puis relance.")

    plans_dir = workdir / PLANS_DIR
    plans_dir.mkdir(parents=True, exist_ok=True)
    plan_file = plans_dir / f"{slug}.md"
    task_file = workdir / "harness-poc" / "taches" / f"{slug}.md"
    task_file.parent.mkdir(parents=True, exist_ok=True)
    task_file.write_text(
        f"# Tâche (dépôt le {dt.date.today():%Y-%m-%d})\n\n{args.tache}\n", encoding="utf-8")

    # -- 1. PLANIFICATION -----------------------------------------------------
    header("Étape 1 : PLANIFICATEUR (lecture seule)")
    code, plan_txt = run_vibe(
        workdir, "planner",
        f"Tâche à planifier (aussi écrite dans harness-poc/taches/{slug}.md) :\n\n"
        f"{args.tache}\n\n"
        "Explore la base de code et produis le plan complet, conformément à tes instructions.",
        args.prix_plan, 25)
    if code != 0 or not plan_txt.strip():
        journal_append(f"## {stamp()} - {slug} - ECHEC planification (exit {code})")
        sys.exit("Planification échouée (voir sortie ci-dessus). Run annulé, rien n'a été modifié.")
    plan_file.write_text(plan_txt, encoding="utf-8")
    print(f"\nPlan sauvegardé : {plan_file}")

    gate = ask("\nValider ce plan ? (sinon le run s'arrête sans rien modifier)", "[o]ui / [n]on")
    if gate not in ("o", "oui", "y"):
        journal_append(f"## {stamp()} - {slug} - plan non approuvé par l'humain. Run annulé.")
        print("Run annulé : aucun fichier modifié (le worktree peut être supprimé).")
        return

    # -- 2/3. BOUCLE CODEUR -> TESTEUR ---------------------------------------
    verdict = "FAIL"
    failure_report = ""
    for tour in range(1, args.iterations + 1):
        header(f"Étape 2 (tour {tour}/{args.iterations}) : CODEUR")
        if tour == 1:
            coder_prompt = (
                f"Tâche : {args.tache}\n"
                f"Le plan approuvé est dans harness-poc/plans/{slug}.md : lis-le, puis "
                "implémente-le intégralement, conformément à tes instructions.")
        else:
            coder_prompt = (
                f"Tâche : {args.tache}\n"
                f"Le plan approuvé est dans harness-poc/plans/{slug}.md.\n"
                f"Le testeur a relevé des échecs au tour précédent. Corrige-les, puis "
                f"vérifie avec les tests allowlistés.\n\n--- Rapport du testeur ---\n{failure_report}")
        code, _ = run_vibe(workdir, "coder", coder_prompt, args.prix_code, 50)
        if code != 0:
            print("Le codeur s'est arrêté avec un code d'erreur, mais on tente les tests.")

        header(f"Étape 3 (tour {tour}/{args.iterations}) : TESTEUR")
        code, test_txt = run_vibe(
            workdir, "tester",
            f"La tâche suivante vient d'être implémentée : {args.tache}\n"
            "Exécute `npm test` (et `npm run test:e2e` si pertinent), puis rends ton verdict "
            "exactement dans le format prévu.",
            args.prix_test, 25)
        verdict = parse_verdict(test_txt) or "FAIL"
        if verdict == "FAIL" and not test_txt.strip():
            print("Réponse du testeur vide ou illisible.")
        print(f"\n>>> VERDICT retenu : {verdict}")
        if verdict == "PASS":
            break
        if tour < args.iterations:
            failure_report = test_txt[-4000:]

    if verdict != "PASS":
        gate = ask("Budget de tours codeur->testeur épuisé sans test au vert.\n"
                   "Continuer quand même jusqu'à la revue ?", "[o]ui / [n]on (abandon)")
        if gate not in ("o", "oui", "y"):
            journal_append(f"## {stamp()} - {slug} - ECHEC : tests non passants après "
                           f"{args.iterations} tours. Worktree conservé pour inspection.")
            print("Run abandonné. Le worktree (et son code) est conservé pour inspection.")
            return

    # -- 4. REVUE (optionnelle) ------------------------------------------------
    if not args.skip_review:
        header("Étape 4 : RÉVISEUR (lecture seule)")
        code, review_txt = run_vibe(
            workdir, "reviewer",
            f"Tâche implémentée : {args.tache}\n"
            f"Plan : harness-poc/plans/{slug}.md. Verdict du testeur : {verdict}.\n"
            "Relis les fichiers modifiés (indiqués dans le plan et dans ton prompt) et "
            "rends ta recommandation formatée.",
            args.prix_revue, 30)
        print(review_txt or "(aucune sortie)")

    # -- 5. APPROBATION HUMAINE ----------------------------------------------
    header("Étape 5 : APPROBATION HUMAINE")
    diff = git("-C", str(workdir), "diff", "--stat")
    print(diff.stdout or "(git diff --stat vide : vérifie que des fichiers ont bien changé)")
    gate = ask("\nApprouver et committer ces changements sur la branche PoC ?",
               "[o]ui / [n]on")
    if gate not in ("o", "oui", "y"):
        journal_append(f"## {stamp()} - {slug} - NON APPROUVÉ par l'humain à l'étape finale. "
                      f"Verdict tests : {verdict}. Worktree conservé.")
        print("Changements non committés ; worktree conservé pour inspection.")
        return

    p = git("-C", str(workdir), "add", "-A")
    p = git("-C", str(workdir), "commit", "-m",
            f"poc({slug}): {args.tache}\n\nGénéré par le harness PoC ({verdict} aux tests).")
    if p.returncode != 0:
        print((p.stderr or p.stdout or "commit impossible").strip()[:500])
        sys.exit("Commit impossible sur la branche PoC.")
    branch_final = git("-C", str(workdir), "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    print(f"\nCommitted sur la branche : {branch_final}")

    journal_append(
        f"## {stamp()} - {slug}\n"
        f"- Tâche : {args.tache}\n"
        f"- Verdict tests : {verdict} (tours : {args.iterations})\n"
        f"- Branche : {branch_final}\n"
        f"- Plan : harness-poc/plans/{slug}.md\n")
    header("Terminé")
    print(f"Prochaines actions manuelles (revue diff/PR) :")
    print(f"  git -C '{workdir}' log -p --stat")
    print(f"  puis merge quand tu veux : git merge {branch_final}  (et suppression du worktree : "
          f"git worktree remove '{workdir}')")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrompu par l'utilisateur.")
        sys.exit(130)
    except FileNotFoundError as e:
        sys.exit(f"Commande introuvable : {e}. Vérifie l'installation (voir README-PoC.md).")

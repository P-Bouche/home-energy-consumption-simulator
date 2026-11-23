# TACHES : backlog du harness PoC

Backlog des tâches à lancer. Une entrée par tâche, priorisée comme dans le
pattern `features.json` du template Harness_Engineering : au démarrage d'un
run, on prend la tâche la plus haute non-terminée.

```
- [ ] (P1) <tâche>
- [ ] (P2) <tâche>
- [x] (P1) <tâche faite> — branche poc-... — <date>
```

Pour lancer l'entrée suivante :

```bash
uv run harness-poc/orchestrate_poc.py "<description>"
```

---

- [ ] (P1) Ajouter le graphique de répartition hebdomadaire par usage dans le tableau de bord
- [ ] (P2) Corriger le test e2e instable du module simulation

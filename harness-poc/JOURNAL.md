# JOURNAL du harness PoC

Ce fichier est **append-only** : chaque run y ajoute une entrée en fin, aucune
entrée existante ne se modifie. Il est versionné dans le dépôt et remplace le
copier-coller de contexte entre agents : chaque run ou chaque humain le relit
pour savoir où en est le chantier.

Format d'une entrée :

```
## <horodatage> - <slug>
- Tâche : <description>
- Verdict tests : PASS | FAIL (tours : N)
- Branche : poc-...
- Plan : harness-poc/plans/<slug>.md
```

---

(Le kit a été installé : la première entrée viendra du premier run.)

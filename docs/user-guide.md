# User Guide — Home Energy Consumption Simulator

A short guide for homeowners using the web app (http://localhost:5173). The interface is in French, so UI labels are quoted in French below. Everything runs locally on your machine.

TODO: add screenshots of the import page, editor panel and comparison table when available.

## 1. Getting started

- Install Node 24.14.1 (pinned in `.nvmrc`) and start the app: see [local development](local-development.md). On Windows, `.\start-dev.ps1` does everything.
- Web app: http://localhost:5173 · API (for developers): http://localhost:3000, interactive documentation at `/docs`.

## 2. Import your DPE (XML)

1. On the home page (« Importer un DPE (XML) »), click **« Choisir un fichier DPE… »** and select your DPE file (`.xml`).
2. The file is imported in under a second. A success banner shows « Bâtiment importé : `<id>` » and an **import report** appears.
3. An invalid file shows an error banner and nothing is saved.

### Reading the import report

- Fields read directly from the DPE are **measured**.
- **« Champs inférés »** are values the app had to assume (the DPE did not provide them). Each shows its `source`, `confidence` score and date, with a color: green ≥ 0.8, orange ≥ 0.5, red below. Inferred values are never presented as certain.
- **Missing / unrecognized fields** are listed so you know what was not in the file.

## 3. Run the energy simulation

1. Below the import report, the panel « Simulation énergétique (Open3CL) » offers **« Lancer la simulation »**.
2. The result shows the **energy label** (« Énergie : X ») and **climate label** (« Climat : X »), the consumption `n kWh/m².an`, emissions `n kg CO₂/m².an`, the totals in kWh and kg CO₂e, and the engine version (« moteur Open3CL v… »).
3. Each run is saved in the building's **history**. Running again on an unchanged building instantly returns the cached result — no recalculation.

## 4. What the numbers mean

- **kWh/m².an** — the dwelling's yearly energy consumption per square meter (all 5 regulated uses: heating, hot water, cooling, lighting, auxiliaries). Lower is better.
- **kg CO₂e/m².an** — yearly greenhouse-gas emissions per square meter.
- **Labels A–G** — the regulatory DPE scale: **A** is the most efficient, **G** the least. « Énergie » is the energy label, « Climat » the emissions (GES) label. A renovation usually moves both (e.g. **D → C**).

## 5. Edit the building (P4 editor) — golden path

The panel « Éditeur du bâtiment (2D) » lets you change the dwelling and see the impact immediately.

1. In the element list, click **« Modifier »** on an element (e.g. a wall).
2. Change a value in the dialog, e.g. the wall's **U (W/m².K)** — a lower U means better insulation. Click **« Enregistrer »**.
3. An **invalid value** (e.g. negative U) is rejected right in the field with an explanatory message; nothing is saved and the version does not change.
4. On **save**: the building version increases (shown as « version N »), the change appears in the **« Piste d'audit »** (old → new value, marked `[user, confiance 1]`), and a **new simulation runs automatically** — the consumption and labels update (on the sample fixture, insulating a wall moves the label D → C).
5. If someone else saved changes in between, your save is refused with **409** and the panel shows « Conflit de version : le bâtiment a été modifié ailleurs. État rechargé (version N), réessayez. » — the panel reloads the current state; just redo your edit and save again.
6. **« Annuler le dernier changement »** undoes the last edit: it restores the previous value *with its original provenance* (the DPE value, not a user value), is itself recorded in the audit trail, and the displayed simulation result is refreshed — usually straight from the cache, since the restored building hashes back to the original input.

TODO: screenshot of the editor dialog with a field error, and of the audit trail.

## 6. Compare renovation scenarios (P5) — golden path

The panel « Scénarios de rénovation (P5) » lets you price several renovation packages before doing any work.

1. Create a scenario: name + description (e.g. « Isolation des murs »), then **« Ajouter une commande »** → pick an element (e.g. a wall) and a change (e.g. U = 0.2 W/m².K). Click **« Créer le scénario »**. The scenario appears in the list.
2. Click **« Simuler »** on a scenario: it is simulated through the same regulatory engine as the current building.
3. Click **« Comparer les scénarios »**: a table appears with the current state pinned as **« État initial »**, and one row per scenario with its absolute consumption/emissions, its labels, the **deltas vs the current state** in kWh and in kg CO₂e (negative = savings), the **« Changement d'étiquette »** (e.g. « D → C »), and its **« Rang »** (1 = the scenario saving the most kWh). Comparing again from cache takes well under a second.
4. Click **« Appliquer »** on a scenario to apply it to the building: the building state changes, the change is written to the audit trail, the version increases, and the current state is re-simulated.
5. Deleting a scenario only removes the scenario and its links — the building and its simulation results are never deleted.

TODO: screenshot of the comparison table.

## 7. The 3D model (P3)

Click **« Voir le modèle 3D »** after an import — that is the entry point. (Fallback: open the route `#/building/<buildingId>` directly, using the id shown in the « Bâtiment importé » banner.) Then: orbit/zoom around the dwelling, click an element to see its properties (U-value, area, orientation, confidence). Elements whose geometry was inferred are visually marked, with `{ source, confidence }` on hover. Once a simulation has run, a heat-loss overlay colors the envelope elements by their share of total losses.

## 8. For developers

The REST API is documented interactively at http://localhost:3000/docs (OpenAPI): import, buildings, geometry, simulations and jobs, editing (`PATCH /buildings/:id` with `If-Match`, audit, undo), scenarios (create, simulate, compare, apply, delete). All energy figures come from the Open3CL engine only — the app never computes energy itself.

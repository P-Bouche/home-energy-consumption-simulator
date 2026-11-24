# Home Energy Consumption Simulator — Domain Language

The domain is a residential **Digital Energy Twin** for French dwellings: one `Building` imported from a DPE diagnostic, simulated with the regulatory 3CL-DPE method, editable through commands, and comparable across renovation scenarios.

## Language

### The building

**Building**:
The aggregate root: one dwelling being modeled. Owns every zone, room, envelope element and system, and is edited only through building commands.
_Avoid_: property, house, logement

**DPE**:
The *Diagnostic de Performance Énergétique* — the French regulatory XML diagnostic that is the source document of every import.
_Avoid_: certificate, energy report, audit (on its own)

**Zone**:
A zone of the dwelling as described by the DPE. Current imports produce a single zone per building.
_Avoid_: area, sector, thermal zone (a different concept, see below)

**Thermal zone**:
The heated volume used by the energy calculation, derived from the heated surface of the heating installations.
_Avoid_: zone, heated area

**Room**:
A room of the dwelling. A room belongs to exactly one zone.
_Avoid_: space, pièce (alone)

### The envelope

**Envelope element**:
An element of the building envelope separating the heated volume from outside or unheated spaces — a wall, roof, floor, window or door. Carries an area and a U-value.
_Avoid_: component, part, surface

**Wall**: an opaque vertical envelope element. **Roof**: an upper floor slab. **Floor**: a lower floor slab. **Window**: a glazed opening. **Door**: an opaque opening.
_Avoid_: mur, baie, porte (the DPE element names are source vocabulary, not our terms)

### The systems

**Heating system** / **Ventilation system** / **Photovoltaic system**:
The dwelling's heating, ventilation and solar installations, as described by the DPE.
_Avoid_: equipment, appliance, installation (alone)

### Provenance of data

**Confidence value**:
The provenance wrapper `{ value, source, confidence, importDate }` carried by every imported or inferred value, so inferred data is never presented as measured.
_Avoid_: metadata, annotation

**Measured value**:
A value read verbatim from the DPE document: confidence = 1, source names the XML path.
_Avoid_: raw, exact

**Inferred value**:
A value produced by an inference rule because the DPE is incomplete: confidence strictly below 1, source names the rule.
_Avoid_: estimate, guess, default (a default is one kind of inference rule, not the concept)

**Import report**:
The structured record of one import: every parsed field, every inferred field with its confidence metadata, every unrecognized element, every missing field. No gap in the source document is ever silent.
_Avoid_: log, summary, manifest

### Simulation

**Open3CL (3CL-DPE)**:
The regulatory French energy-calculation method (3CL-DPE) and its open-source engine: the single source of truth for every energy figure the platform produces.

**Simulation**:
One run of Open3CL on a building.
_Avoid_: run, calculation

**Simulation result**:
The outcome of a simulation: primary-energy consumption (kWh), GES emissions (kg CO2e), the energy and climate labels, and the raw engine output kept verbatim.
_Avoid_: output, report

**Simulation job**:
The lifecycle envelope of an asynchronous simulation: queued, running, then done or failed.
_Avoid_: task, process

**Energy label** / **Climate label**:
The DPE letters A–G rating respectively the energy consumption and the GES emissions of the dwelling.
_Avoid_: rating, grade, score, etiquette (alone)

**Heat-loss projection**:
The read-only distribution of the engine-reported envelope losses over the reconstructed geometry. It never computes a loss itself.
_Avoid_: loss calculation, loss breakdown

### Editing and scenarios

**Building command**:
A versioned, auditable edit targeting one element of one building by its id. Commands are the only way a building changes.
_Avoid_: patch, edit, mutation, update (alone)

**Audit entry**:
The append-only record of one applied command: who, when, the command, the old→new field values, and the resulting building version.
_Avoid_: history, log entry, changelog

**Scenario**:
A named set of building commands representing a renovation change-set, simulated and compared against the baseline.
_Avoid_: plan, what-if, change-set (as a name), package of works

**Baseline**:
The building state a scenario is simulated and compared against.
_Avoid_: reference, current state

**Scenario comparison**:
The ranked deltas of each scenario against the baseline: kWh and CO2e saved, label changes, best-saving first.
_Avoid_: diff, ranking (alone)

### Visualization

**3D reconstruction**:
The reconstructed 3D model of the building from the imported data, in meters, with pickable geometry elements that carry their envelope-element id.
_Avoid_: mesh (alone), scene

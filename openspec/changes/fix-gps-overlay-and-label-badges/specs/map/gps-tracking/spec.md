# Spec Delta: GPS Follow-Me Tracking (rendering fidelity)

## Purpose

Lets a preacher walking a territory see their live position, accuracy, and walked route directly on the map through an opt-in follow mode, with safe permission handling and no background resource leaks.

## ADDED Requirements

### Requirement: Position marker renders only at the position point

The GPS overlay SHALL render exactly one position marker at the reported coordinates. The accuracy polygon used to express the radius MUST NOT produce additional markers along its outline; the accuracy area SHALL be represented solely by its fill and outline.

#### Scenario: Position update with accuracy

- **WHEN** a position update arrives with a valid horizontal accuracy value
- **THEN** exactly one marker is shown at the reported position, the accuracy ring renders as a continuous outline, and no markers appear anywhere along the ring

#### Scenario: Position update without valid accuracy

- **WHEN** a position update arrives with a missing, non-finite, or non-positive accuracy value
- **THEN** exactly one marker is shown at the reported position and no accuracy ring or stray markers are rendered

### Requirement: GPS overlay renders above territory decorations

The GPS overlay (position marker, accuracy ring, and breadcrumb trail) SHALL render above territory tile fills, the marked-manzana overlay, the selected-manzana overlay, and territory number labels so its elements display in the GPS color regardless of which territory or mark lies beneath.

#### Scenario: Overlay over a marked manzana

- **WHEN** follow mode is active and the position, accuracy ring, or trail overlaps a marked manzana
- **THEN** the overlapping GPS elements render in the GPS blue, untinted by the mark color beneath them

#### Scenario: Overlay over territory labels

- **WHEN** follow mode is active while territory number badges are visible
- **THEN** the GPS marker renders above the badges

### Requirement: Accuracy outline is continuous and legible

The accuracy circle SHALL be rendered as a solid, continuous outline (never dashed or dotted) with a stroke clearly visible over bright territory fills at typical map zooms.

#### Scenario: Ring over bright territory fill

- **WHEN** the accuracy ring crosses a saturated territory fill
- **THEN** the ring renders as an unbroken, clearly visible stroke in the GPS color

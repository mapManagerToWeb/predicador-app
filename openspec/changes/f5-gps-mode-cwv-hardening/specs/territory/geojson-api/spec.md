# Spec: Territory GeoJSON API Surface

## Purpose

Defines the territory geometry API after removal of the bulk `/all/geojson` snapshot: vector tiles plus per-territory GeoJSON remain, and a lightweight metadata source supplies the non-geometry information the frontend previously derived from the snapshot.

## ADDED Requirements

### Requirement: Bulk snapshot endpoint is absent
The system SHALL NOT expose `GET /api/v1/territories/all/geojson` — neither through the API gateway nor on the territory service directly; requests SHALL result in 404.

#### Scenario: Request through the gateway
- **WHEN** a client requests `GET /api/v1/territories/all/geojson` via the API gateway
- **THEN** the response is 404 and no territory data is returned

#### Scenario: Request directly to the territory service
- **WHEN** a client requests `GET /api/v1/territories/all/geojson` on the territory service
- **THEN** the response is 404

### Requirement: Per-territory GeoJSON remains available
`GET /api/v1/territories/{numero}/geojson` SHALL continue to return the full GeoJSON geometry for one territory, as required by hybrid edit mode (partial draw / snap).

#### Scenario: Fetch a single territory
- **WHEN** a client requests `GET /api/v1/territories/{numero}/geojson` for an existing territory
- **THEN** the response is 200 with that territory's GeoJSON geometry

### Requirement: Lightweight territory metadata replaces the snapshot
The system SHALL provide a lightweight per-territory metadata source that covers the non-geometry information the frontend previously derived from the bulk snapshot: territory identity/number, display name, color, a representative position for label placement, bounds, and manzana counts (used by labels, selection, and report counts). Its payload MUST NOT include per-feature geometry; the `fid` ↔ territory pairing travels with the per-territory GeoJSON feature properties instead (owner-approved Option A, design.md D2).

#### Scenario: Map loads without the bulk snapshot
- **WHEN** the map route loads
- **THEN** no request to `/api/v1/territories/all/geojson` is made, and territory metadata is obtained from the lightweight source instead

#### Scenario: Label placement data available
- **WHEN** the map renders territory labels
- **THEN** each label is positioned from the representative position supplied by the metadata source, without fetching bulk geometry

#### Scenario: Feature-to-territory mapping available
- **WHEN** marks, counts, or overlays resolve which territory a map feature belongs to
- **THEN** the resolution succeeds using the `fid` carried in the per-territory GeoJSON feature properties (Option A) together with the metadata source, matching the behavior previously provided by the snapshot

#### Scenario: Metadata payload contains no geometry
- **WHEN** the metadata source's response is inspected
- **THEN** it contains the metadata fields but no per-feature geometry arrays

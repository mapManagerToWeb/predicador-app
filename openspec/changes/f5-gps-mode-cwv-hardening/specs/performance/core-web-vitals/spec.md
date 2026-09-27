# Spec: Core Web Vitals Budgets

## Purpose

Defines explicit Core Web Vitals budgets for the app's key routes and enforces them in CI, so map and login performance regressions are caught before merge instead of silently degrading field RUM.

## ADDED Requirements

### Requirement: Written CWV budgets for key routes
The repository SHALL define explicit, versioned performance budgets for the `/map` and `/login` routes covering LCP, INP, and CLS, using the same metric definitions reported by the existing RUM pipeline (`/api/v1/rum`), with targets no weaker than the "Good" thresholds (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75).

#### Scenario: Budgets exist and are discoverable
- **WHEN** a developer or CI job looks up the performance budgets in the repository
- **THEN** budgets for `/map` and `/login` exist, specify LCP/INP/CLS targets, and state the measurement method

#### Scenario: Budgets match RUM metrics
- **WHEN** a budget threshold is compared with the corresponding field metric reported by RUM
- **THEN** both use the same metric definition and percentile (p75), so lab and field numbers are comparable

### Requirement: CI enforcement of budgets
CI SHALL fail when a change violates an enforceable budget (build-size budgets and/or lab-measured vitals), with an error that names the route, metric, limit, and measured value.

#### Scenario: Budget violation fails the build
- **WHEN** a pull request causes a measured metric or bundle budget to exceed its limit
- **THEN** the frontend CI workflow fails and the log identifies the offending route, metric, limit, and measured value

#### Scenario: Within budget passes
- **WHEN** all measured metrics and bundle budgets are within their limits
- **THEN** the CI workflow passes the budget gate

### Requirement: Map route meets CWV targets
The `/map` route SHALL meet the defined budgets under lab measurement on a mid-tier device profile: initial load within LCP/CLS budgets, and map interactions (pan, zoom, mode toggles) within the INP budget.

#### Scenario: Cold load of the map
- **WHEN** `/map` is loaded cold under the lab profile
- **THEN** LCP and CLS are within the defined budgets

#### Scenario: Interaction responsiveness
- **WHEN** the user pans, zooms, or toggles a map mode under the lab profile
- **THEN** the resulting INP is within the defined budget

### Requirement: Budgets evolve with the app
Budgets SHALL be maintained in the repository alongside the code they protect; weakening a budget requires updating the documented threshold in the same change that weakens it.

#### Scenario: Threshold change is visible in review
- **WHEN** a change modifies a budget threshold
- **THEN** the modified threshold is part of the reviewed diff rather than an implicit CI configuration change

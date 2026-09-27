# Spec Delta: Territory Number Labels

## Purpose

Makes territory numbers identifiable at a glance on the map by rendering each one as a visually distinct badge that ties the number to its territory's color.

## ADDED Requirements

### Requirement: Territory number badge rendering

Each visible territory number SHALL render in that territory's assigned color, centered inside a white circular badge edged with a thin ring of the same territory color. Badges SHALL only render from zoom level 14 upward.

#### Scenario: Badges at working zoom

- **WHEN** the map is at zoom 14 or above with no territory selection active
- **THEN** every territory shows a white circular badge edged in its territory color, containing its number in that color

#### Scenario: Below minimum zoom

- **WHEN** the map is below zoom level 14
- **THEN** no territory number badges are rendered

#### Scenario: Readability on light territory colors

- **WHEN** a territory's assigned color is light (for example yellow or light green)
- **THEN** the number remains legible thanks to a contrasting dark outline around the text

### Requirement: Badges follow the active selection

Badge visibility SHALL mirror the current territory selection: when territories are selected only their badges render; when the selection is empty all badges render.

#### Scenario: Selection active

- **WHEN** one or more territories are selected
- **THEN** only the selected territories' badges are rendered

#### Scenario: Selection cleared

- **WHEN** the territory selection is cleared
- **THEN** badges for all territories are rendered again

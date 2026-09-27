# Spec: GPS Follow-Me Tracking

## Purpose

Lets a preacher walking a territory see their live position, accuracy, and walked route directly on the map through an opt-in follow mode, with safe permission handling and no background resource leaks.

## ADDED Requirements

### Requirement: Follow-mode activation and deactivation
The map SHALL provide a user-visible control that activates and deactivates GPS follow-me mode. Follow mode is off by default on every map load.

#### Scenario: Activate follow mode
- **WHEN** the user activates the GPS follow control and the browser grants location permission
- **THEN** the map centers on the user's current position and a visible indicator shows that follow mode is active

#### Scenario: Deactivate follow mode
- **WHEN** the user deactivates the GPS follow control
- **THEN** the map stops re-centering on the user, the active indicator disappears, and the location watch is released

#### Scenario: Follow mode defaults off
- **WHEN** the map route is loaded or reloaded
- **THEN** follow mode is inactive and no location watch is running

### Requirement: Manual interaction releases the position lock
Panning or zooming manually while follow mode is active SHALL release the position lock so the user's viewport is not fought over; the control SHALL offer a way to re-center and resume following.

#### Scenario: User pans while following
- **WHEN** the user pans or zooms the map while follow mode is active
- **THEN** the map stops auto-centering on position updates and the control offers a re-center action

#### Scenario: User resumes following
- **WHEN** the user triggers the re-center action
- **THEN** the map centers on the current position and automatic following resumes

### Requirement: Position indicator with accuracy
The system SHALL render the user's current position as a distinct marker including a visual representation of the reported horizontal accuracy.

#### Scenario: Position with accuracy radius
- **WHEN** a position update arrives with a horizontal accuracy value
- **THEN** the user marker is shown together with a circle reflecting the reported accuracy radius

#### Scenario: Accuracy improves or degrades
- **WHEN** subsequent updates report a different accuracy
- **THEN** the accuracy circle resizes to match the latest reported value

### Requirement: Breadcrumb trail of the walked route
While follow mode records positions, the system SHALL accumulate a breadcrumb trail of visited points and render it as a line on the map; the user SHALL be able to clear the trail.

#### Scenario: Trail accumulates while active
- **WHEN** the user walks with follow mode active and receives multiple position updates
- **THEN** the visited points are rendered as a connected trail on the map

#### Scenario: Clear trail
- **WHEN** the user triggers the clear-trail action
- **THEN** the accumulated trail is removed from the map

### Requirement: Permission denial and position errors surface clearly
The system SHALL handle location permission denial, position-unavailable, and timeout conditions without breaking the map, surfacing a clear Spanish-language message with guidance where the user can act on it.

#### Scenario: Permission denied
- **WHEN** the user activates follow mode and the browser reports permission denied
- **THEN** an actionable message is shown, the active indicator is not displayed, and the rest of the map remains usable

#### Scenario: Position unavailable or timeout
- **WHEN** the geolocation watch reports position-unavailable or timeout
- **THEN** the system shows an error state for GPS mode and keeps the map fully interactive

### Requirement: No orphaned location watches
A location watch SHALL exist only while follow mode is engaged (active or paused) or while the legacy status toggle is on; deactivating follow mode, a fatal location error, or leaving the map route SHALL release the follow-mode consumer's watch, and no watch may outlive all of its consumers.

#### Scenario: Watch released on deactivation
- **WHEN** follow mode is deactivated
- **THEN** the underlying geolocation watch is cleared and no further position callbacks update the map

#### Scenario: Watch released on route exit
- **WHEN** the user navigates away from the map route while follow mode is active
- **THEN** the geolocation watch is cleared during route teardown

### Requirement: SSR and insecure-context safety
Location APIs SHALL only be accessed in the browser in a secure context; server-side rendering MUST NOT invoke geolocation.

#### Scenario: SSR renders without geolocation
- **WHEN** the map route markup is server-rendered
- **THEN** no `navigator.geolocation` call occurs and no error is thrown

#### Scenario: Insecure context
- **WHEN** follow mode is activated outside a secure context
- **THEN** the system reports that location is unavailable instead of throwing

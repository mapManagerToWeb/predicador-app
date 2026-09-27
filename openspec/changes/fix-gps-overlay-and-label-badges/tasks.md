# Tasks: fix-gps-overlay-and-label-badges

## 1. GPS overlay rendering fixes

- [x] 1.1 Add `filter: ['==', ['get', 'kind'], 'position']` to the `gps-marker` circle layer in `map-gps-overlay.service.ts`, and strengthen the accuracy outline paint to `line-width: 1.5` / `line-opacity: 0.8` — verify with new/updated cases in `map-gps-overlay.service.spec.ts` asserting the marker layer filter, marker-only rendering with valid accuracy, and the outline paint values
- [x] 1.2 Move `this.gpsFollow.attachEngine(engine)` in `map.ts` `initMaplibre` to after `labelLayer.updateLabels(...)` so the GPS layer stack sits above marked/selected/label layers — verify by reading the final init order in `initMaplibre` (tiles → marked → selected → labels → GPS) and confirming `attachEngine` remains called exactly once
- [x] 1.3 Run `pnpm test -- src/app/features/map/services/map-gps-overlay.service.spec.ts` from `territory-frontend/` and verify all specs pass

## 2. Territory number badges

- [x] 2.1 Add a `color` property to centroid features in `map-label-layer.service.ts` from `rendering.getFeatureLayerByTerritorio(num)?.color` with the existing territory-color fallback, and add the `territory-label-badge` circle layer (territory-colored fill via `['coalesce', ['get','color'], fallback]`, radius 12, white stroke 1.5, `minzoom: 14`) before the symbol layer — verify with spec cases asserting badge layer presence, paint, and layer order relative to the symbol layer *(first-pass badge paint — superseded by task 4.1)*
- [x] 2.2 Restyle the `territory-labels` symbol layer to `text-color: #ffffff` with `text-halo-color: rgba(0,0,0,0.45)` / `text-halo-width: 1`, keeping `text-field`, `text-size`, `minzoom`, and selection filtering unchanged — verify spec cases assert the white text paint and that `updateLabels` selection filtering still passes through unchanged *(first-pass text paint — superseded by task 4.1)*
- [x] 2.3 Run `pnpm test -- src/app/features/map/services/map-label-layer.service.spec.ts` from `territory-frontend/` and verify all specs pass

## 3. Verification and review

- [x] 3.1 Run full frontend gate from `territory-frontend/`: `pnpm run lint`, then `pnpm run build` — verify both succeed with no new lint errors
- [x] 3.2 Run the full map feature spec suite (`pnpm test -- src/app/features/map/`) — verify no regressions in other map services
- [x] 3.3 Visual check on the dev server (`ng serve`, GPS mode over a marked territory at zoom ≥ 14): single center marker, continuous untinted accuracy ring, white numbers inside territory-colored circles — verify against the spec scenarios and the owner's screenshot — verified 2026-09-26: `check-05-follow.png` (follow active over marked 105 at z≥14: single marker + continuous untinted ring + badges 104/106/107/… white-on-color) and `check-06-stopped.png` ("105" badge revealed at the marker's exact spot after stopping follow) *(badge appearance later restyled to a white background by task 4.1)*
- [x] 3.4 Request independent reviewer verdict on the diff — verify VERDICT is PASS before considering the change complete — reviewer subagent returned `VERDICT: PASS` (0 critical, 0 major, 5 minor observations; both focused specs re-run 14/14 + 20/20)

## 4. Owner feedback: white badge background (post-visual-check restyle)

- [x] 4.1 Restyle the badge paint in `map-label-layer.service.ts`: `circle-color: #ffffff`, territory-colored `circle-stroke-color` + `text-color` via `['coalesce', ['get','color'], '#475569']` (dark halo unchanged) — update `map-label-layer.service.spec.ts` assertions to the new paint (white fill, colored ring/text)
- [x] 4.2 Re-run `pnpm test -- src/app/features/map/services/map-label-layer.service.spec.ts` (20/20) and `pnpm run lint` — both green
- [x] 4.3 Update proposal/design/spec-delta artifacts so they describe the white-background badge (and fix the stale `map.ts` line reference the reviewer flagged)
- [x] 4.4 Visual re-check at zoom ≥ 14 (GPS follow active over 105): numbers legible on white circles — screenshot evidence in `docs/superpowers/`: `fix-gps-overlay-restyle-4.4-follow-active.png` (follow active, single marker, badges in new style), `fix-gps-overlay-restyle-4.4-zoom-detail.png` (zoomed badges incl. light gold colors legible via halo + continuous accuracy ring), `fix-gps-overlay-restyle-4.4-badges-all.png` (stopped state, badges across town), `fix-gps-overlay-restyle-4.4-badge-105-revealed.png` ("105" badge revealed at centroid in white/territory-color style)
- [x] 4.5 Independent reviewer verdict on the restyle diff — reviewer subagent returned `VERDICT: PASS WITH MINOR FINDINGS` (0 critical, 0 major, 2 minor documentation-coherence findings — both resolved: superseded-style pointers added to tasks 2.1/2.2/3.3 and the stale centroid-fact line in design.md)

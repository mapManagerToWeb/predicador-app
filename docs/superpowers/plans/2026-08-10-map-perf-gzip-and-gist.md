# Map Performance: GZIP + GiST Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the download size of the territory GeoJSON payload (the main map bottleneck) via HTTP GZIP compression, and add the missing spatial GiST index so future viewport queries are fast.

**Architecture:** Enabling `server.compression` on `territory-service` makes embedded Tomcat compress the GeoJSON response on the fly (only when the client sends `Accept-Encoding: gzip`). Compression is negotiated and decompressed by the browser at the network layer, so it is completely transparent to Leaflet/Angular — `TerritorioService.getAllGeoJson()` keeps receiving plain text. A Flyway migration `V2` adds the GiST index on `manzanas_territorio.geometry`.

**Tech Stack:** Spring Boot 4.0 (embedded Tomcat), Flyway, PostgreSQL/PostGIS, Angular 22 + Leaflet (frontend untouched).

## Global Constraints

- Do **not** modify frontend code — GZIP must be transparent (no changes to `TerritorioService`, `MapTerritoryLayerService`, or Leaflet).
- Put the compression config in `backend/territory-service/src/main/resources/application.yml` (bundled with the jar and always loaded) under the existing `server:` block.
- The `min-response-size` threshold must not compress small responses (set 1024 bytes).
- `mime-types` must include `application/json` (the GeoJSON endpoint returns `application/json`).
- GiST index migration must follow Flyway conventions for territory-service: history table `flyway_schema_history_territory`, next version after `V1` (`V1__add_indexes.sql`), `IF NOT EXISTS`, and must not collide with reporting's own `V1`.
- Preserve existing `MANZANAS` schema/table names exactly as used by `V1__add_indexes.sql` (`manzanas_territorio`, `territory_settings`).

---

### Task 1: Enable GZIP compression on territory-service

**Files:**
- Modify: `backend/territory-service/src/main/resources/application.yml` (`server:` block, currently only `port: 8081`)

**Interfaces:**
- Consumes: nothing.
- Produces: the `/api/v1/territories/all/geojson` (and every `application/json`) response served by `territory-service` is now gzip-compressed when the client sends `Accept-Encoding: gzip`.

- [ ] **Step 1: Add compression config**

Edit the `server:` block in `backend/territory-service/src/main/resources/application.yml`. It currently reads:

```yaml
server:
  port: 8081
```

Change it to:

```yaml
server:
  port: 8081
  compression:
    enabled: true
    mime-types: application/json
    min-response-size: 1024
```

- [ ] **Step 2: Restart territory-service**

Start order (from `backend/`): `config-server` → `discovery-server` → `api-gateway` → `territory-service`. The service already needs the DB exported (PostGIS + `DB_URL`/`DB_USERNAME`/`DB_PASSWORD`). Confirm it boots and reaches `ACTIVE` in Eureka.

- [ ] **Step 3: Direct verification on the origin**

Measure compressed vs plain size straight from `territory-service` (port 8081):

```bash
curl -s -o /tmp/all-plain.json http://localhost:8081/api/v1/territories/all/geojson
curl -s -H "Accept-Encoding: gzip" -o /tmp/all-gzip.json.gz http://localhost:8081/api/v1/territories/all/geojson
ls -l /tmp/all-plain.json /tmp/all-gzip.json.gz
```

Expected: `/tmp/all-gzip.json.gz` is substantially smaller than `/tmp/all-plain.json` (typically 60–90% reduction for the repetitive GeoJSON). Verify the header is set:

```bash
curl -s -H "Accept-Encoding: gzip" -D - -o /dev/null http://localhost:8081/api/v1/territories/all/geojson | grep -i -E "content-encoding|content-type"
```

Expected: `content-encoding: gzip` and `content-type: application/json`.

- [ ] **Step 4: End-to-end verification through the gateway**

The frontend calls the gateway (port 8080), not the origin. Confirm the encoding survives the Spring Cloud Gateway proxy:

```bash
curl -s -H "Accept-Encoding: gzip" -D - -o /dev/null http://localhost:8080/api/v1/territories/all/geojson | grep -i "content-encoding"
```

Expected: `content-encoding: gzip`. If the gateway strips the header (returns no `content-encoding` or a plain body), do **not** proceed — perform Task 4 instead of stopping.

- [ ] **Step 5: Commit**

```bash
git add backend/territory-service/src/main/resources/application.yml
git commit -m "perf(territory): enable gzip compression on geoJSON responses"
```

---

### Task 2: Add GiST spatial index on manzanas_territorio.geometry

**Files:**
- Create: `backend/territory-service/src/main/resources/db/migration/V2__add_geometry_gist_index.sql`

**Interfaces:**
- Consumes: the existing `manzanas_territorio` table (same as `V1__add_indexes.sql`).
- Produces: a GiST index `idx_manzanas_territorio_geometry_gist` on `geometry`, enabling fast bbox/intersection lookups for the future viewport query.

- [ ] **Step 1: Write the migration**

Create `backend/territory-service/src/main/resources/db/migration/V2__add_geometry_gist_index.sql`:

```sql
CREATE INDEX IF NOT EXISTS idx_manzanas_territorio_geometry_gist
ON manzanas_territorio
USING GIST (geometry);
```

- [ ] **Step 2: Apply the migration**

Flyway runs at territory-service startup (history table `flyway_schema_history_territory`). Restart the service and confirm the migration applies without error in the logs.

Optionally (manual, idempotent):

```sql
ANALYZE manzanas_territorio;
```

- [ ] **Step 3: Verify the index exists**

```bash
curl -s -H "Accept-Encoding: gzip" http://localhost:8080/actuator/health | grep -i up
```

Then check the index in the DB (or via a one-off `psql`):

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'manzanas_territorio'
  AND indexname = 'idx_manzanas_territorio_geometry_gist';
```

Expected: one row whose `indexdef` starts with `CREATE INDEX ... USING gist`.

- [ ] **Step 4: Run backend unit tests**

From `backend/`:

```bash
mvn -pl territory-service test
```

Expected: BUILD SUCCESS. (New migration only adds an index; no Java code changed, existing tests must stay green.)

- [ ] **Step 5: Commit**

```bash
git add backend/territory-service/src/main/resources/db/migration/V2__add_geometry_gist_index.sql
git commit -m "feat(territory): add GiST index on manzanas_territorio.geometry"
```

---

### Task 3 (conditional): Enable compression at the api-gateway if passthrough strips it

Only execute this task if **Task 1 Step 4** failed (no `content-encoding: gzip` through port 8080).

**Files:**
- Modify: `backend/config-server/src/main/resources/config/api-gateway.yml` (`server:` block) OR `backend/api-gateway/src/main/resources/application.yml`

**Interfaces:**
- Consumes: the gateway's `server:` block.
- Produces: gateway compresses every response it serves, so the browser receives gzip regardless of whether the origin header passes through.

- [ ] **Step 1: Add compression config**

In the gateway config `server:` block, add:

```yaml
server:
  port: 8080
  compression:
    enabled: true
    mime-types: application/json
    min-response-size: 1024
```

- [ ] **Step 2: Re-verify end-to-end**

```bash
curl -s -H "Accept-Encoding: gzip" -D - -o /dev/null http://localhost:8080/api/v1/territories/all/geojson | grep -i "content-encoding"
```

Expected: `content-encoding: gzip` and a smaller download.

- [ ] **Step 3: Commit**

```bash
git add backend/api-gateway/src/main/resources/application.yml
git commit -m "perf(gateway): enable gzip compression fallback"
```

---

## Future / Out of scope (documented, not implemented)

These were evaluated and deferred — do not implement unless metrics show the dataset growing to thousands of manzanas:

1. **Viewport endpoint** (`GET /api/v1/territories/geojson?bbox=`): requires a frontend refactor because today's visibility logic depends on loading **all** territory bounds into `dataCache` (`map-territory-layer.service.ts`). Any new endpoint **must** return snake_case properties (`territorio_padre`, `nombre_bloque`) and the composite id `territorio_padre || '-' || nombre_bloque` used in `onEachFeature` (`map-territory-layer.service.ts:239-240`), otherwise selection breaks.
2. **MVT / MapLibre** — only worth it at much larger scale; the app's `snapToContour`/partial-draw interaction makes a full migration risky.

## Self-review

- **Spec coverage:** GZIP (user's requested approach) → Task 1; GiST index (AI rec. #7a) → Task 2; gateway fallback → Task 3. MVT/viewport deferred with explicit rationale.
- **Placeholder scan:** every code/YAML/SQL/curl step has concrete content; the only conditional is Task 3, clearly gated on a single observable check.
- **Type/name consistency:** migration table name `manzanas_territorio` matches `V1__add_indexes.sql`; the GiST index name matches the standard naming already used in the repo (`idx_manzanas_territorio_*`); property names flagged for the future endpoint match the frontend consumers.

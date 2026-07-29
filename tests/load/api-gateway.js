// k6 load test for Predicador API Gateway.
//
// Run:
//   k6 run --vus 10 --duration 30s tests/load/api-gateway.js
//
// Prerequisites:
//   - k6 installed (brew install k6)
//   - API gateway running at BASE_URL

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";

const errorRate = new Rate("errors");
const geojsonDuration = new Trend("geojson_load_duration", true);
const reportDuration = new Trend("report_create_duration", true);

export const options = {
  stages: [
    { duration: "10s", target: 5 }, // ramp up
    { duration: "20s", target: 10 }, // steady state
    { duration: "10s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95% under 2s
    errors: ["rate<0.1"], // <10% error rate
  },
};

export default function () {
  // 1. Health check
  const healthRes = http.get(`${BASE_URL}/actuator/health`);
  check(healthRes, {
    "health status is 200": (r) => r.status === 200,
  });
  errorRate.add(healthRes.status !== 200);
  sleep(0.5);

  // 2. Get all territories GeoJSON
  const geoStart = Date.now();
  const geoRes = http.get(`${BASE_URL}/api/v1/territories/all/geojson`);
  geojsonDuration.add(Date.now() - geoStart);
  check(geoRes, {
    "geojson status is 200": (r) => r.status === 200,
    "geojson is valid": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.type === "FeatureCollection";
      } catch {
        return false;
      }
    },
  });
  errorRate.add(geoRes.status !== 200);
  sleep(1);

  // 3. Get territory list
  const listRes = http.get(`${BASE_URL}/api/v1/territories`);
  check(listRes, {
    "territory list is 200": (r) => r.status === 200,
    "territory list has data": (r) => {
      try {
        return JSON.parse(r.body).length > 0;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(listRes.status !== 200);
  sleep(0.5);

  // 4. Get today's reports
  const reportsRes = http.get(`${BASE_URL}/api/v1/reports/today`);
  check(reportsRes, {
    "reports status is 200": (r) => r.status === 200,
  });
  errorRate.add(reportsRes.status !== 200);
  sleep(1);

  // 5. RUM metric ingestion
  const rumRes = http.post(
    `${BASE_URL}/api/v1/rum`,
    JSON.stringify({
      name: "LCP",
      value: Math.random() * 3000,
      route: "/map",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(rumRes, {
    "rum ingest is 204": (r) => r.status === 204,
  });
  errorRate.add(rumRes.status !== 204);
  sleep(2);
}

# ADR 0020: A read-only "Sistema" module in the admin panel

## Status

Accepted

## Context

The admin wants to see the VPS from the panel: memory, disk, CPU, containers
and backups. Portainer (already installed, exposed by IP with a strong
password) covers restarting and stopping containers. Whoever controls the
Docker socket controls the whole server (database, WhatsApp credentials,
backups), and the repository is public.

## Decision

- **Read-only.** The panel shows; it never commands Docker. Restarting or
  stopping stays in Portainer, linked from the module (`PORTAINER_URL`, not in
  the repo).
- **The gateway never touches the Docker socket.** It talks to `docker-lectura`,
  an HAProxy (`docker-lectura/haproxy.cfg`) that only allows `GET` on
  `/containers/json` and `/containers/<id>/stats`. Everything else is denied,
  notably `/containers/<id>/json` (inspect), which would expose every
  service's environment variables (passwords). It runs as root only to read
  the socket: no capabilities, read-only filesystem, no published ports, on an
  `internal` network shared only with the gateway.
- **Host metrics** come from `/proc` and the root filesystem as seen from the
  gateway container (they are the VPS's: memory, CPU, the disk Docker uses).
- **Backups** come from GitHub's public API (runs of `respaldo-bdd.yml` and the
  size of the latest good artifact), cached 10 minutes to stay far below the
  60 requests/hour unauthenticated limit. No token is stored. Restoring stays
  in `scripts/db/restaurar.sh` over SSH, on purpose.
- **Access:** admin session (URL rule in `SecurityRules.GATEWAY` and again in
  the handler, ADR 0016) plus the admin password typed again, which grants an
  in-memory pass (HttpOnly, SameSite=Strict cookie on `/api/v1/sistema`) that
  expires after 15 minutes idle and always after 1 hour. Pass errors are 403
  with a `code`, never 401, so the panel session is not dropped. Password
  attempts share the login rate limit.

## Consequences

- A compromised gateway can list containers and their memory, nothing more.
- If Docker or GitHub cannot be reached, the module says so instead of showing
  empty lists.
- Restarting the gateway forgets the passes: the admin types the password again.

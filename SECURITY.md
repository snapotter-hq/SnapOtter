# Security Policy

## Supported Versions

Only the latest release of SnapOtter receives security updates. We recommend always running the most recent version.

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous releases | No |

Self-hosted deployments should subscribe to [GitHub release notifications](https://github.com/snapotter-hq/snapotter/releases) and upgrade promptly when security patches are published.

## Reporting a Vulnerability

**Do not open a public GitHub issue or pull request for security vulnerabilities.**

To report a vulnerability, email **contact@snapotter.com** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- The affected version(s)
- Any suggested fix, if available

### Response Timeline

| Stage | Timeline |
|-------|----------|
| Acknowledgment | Within 48 hours |
| Critical severity patch | Within 7 days |
| Non-critical severity patch | Within 30 days |

After acknowledging your report, we will keep you informed of our progress toward a fix. Once a patch is released, we will credit you in the release notes unless you prefer to remain anonymous.

### Severity Classification

| Severity | Definition |
|----------|------------|
| Critical | Remote code execution, authentication bypass, data exfiltration without authentication |
| High | Privilege escalation, stored XSS, SQL injection, SSRF with internal network access |
| Medium | CSRF, information disclosure of non-sensitive data, denial of service |
| Low | Missing security headers on non-sensitive endpoints, verbose error messages |

## Security Architecture

### Authentication and Access Control

- **Password hashing**: scrypt with 32-byte random salt and 64-byte derived key
- **Timing-safe comparison**: All credential verification uses `crypto.timingSafeEqual` to prevent timing attacks
- **Password policy**: Minimum 8 characters with uppercase, lowercase, and numeric requirements
- **Session management**: Cryptographically random UUIDs, configurable expiration (`SESSION_DURATION_HOURS`), automatic cleanup of expired sessions
- **Credential rotation**: Password changes invalidate all other sessions and revoke all API keys for the affected user
- **Brute-force protection**: Per-endpoint rate limiting on the login route (`LOGIN_ATTEMPT_LIMIT`)
- **API keys**: Hashed with scrypt (same parameters as passwords), SHA-256 prefix index for O(1) lookup, optional expiration, scoped permissions
- **Role-based access control**: Hierarchical roles (admin > editor > user) with granular permissions. Escalation prevention blocks creating or promoting users above your own role. Last-admin and self-demote protections prevent lockout

### Input Validation

- **Image uploads**: Magic-byte verification against a known format table, null-byte buffer detection, configurable megapixel limit (`MAX_MEGAPIXELS`), configurable upload size limit (`MAX_UPLOAD_SIZE_MB`)
- **SVG sanitization**: Strips DOCTYPE declarations (XXE prevention), removes `<script>` tags, `<foreignObject>` elements, event handlers, and blocks dangerous URI schemes (`javascript:`, `data:text/html`, `file:`, external URLs in `href`/`xlink:href`)
- **API validation**: Zod schemas on tool routes and environment config; manual validation on auth routes
- **Database queries**: Parameterized via Drizzle ORM (PostgreSQL), no raw string concatenation
- **Database privileges**: The application connects with DML rights only (`SELECT`, `INSERT`, `UPDATE`, `DELETE` on its own tables). Schema changes run on a separate privileged connection, opened at boot and closed before the first request. On installs created by the current image neither role is a cluster superuser, so SQL injection cannot reach `COPY ... FROM PROGRAM`, `pg_read_file`, or extension installation. See [Least-privilege roles](https://docs.snapotter.com/guide/database#least-privilege-roles)

### HTTP Security

The following headers are set on all responses:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `0` (modern best practice) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (sent in all environments; browsers ignore it over plain HTTP) |
| `Content-Security-Policy` | Restrictive policy with `default-src 'self'` |

### Rate Limiting

- Global rate limiting via `@fastify/rate-limit` (configurable with `RATE_LIMIT_PER_MIN`)
- Stricter per-route limits on authentication endpoints
- Static assets excluded from rate limiting

### Container Security

- **Non-root execution**: Dedicated `snapotter` user and group created at build time. The entrypoint starts as root only to fix volume permissions, then drops privileges via `gosu`
- **Root prevention**: PUID/PGID of 0 are explicitly rejected with a warning
- **PID 1**: `tini` handles zombie reaping and signal forwarding
- **Multi-stage build**: Production image contains only runtime dependencies
- **No baked credentials**: Auth defaults (`AUTH_ENABLED`, `DEFAULT_USERNAME`, `DEFAULT_PASSWORD`) are set at container runtime, never in image layers
- **Health check**: Built-in `HEALTHCHECK` instruction with 30-second intervals
- **PUID/PGID support**: Bind mount permission conflicts are resolved by remapping the runtime user to match host UID/GID

### Audit Logging

Security-relevant events are dual-written to structured stdout (for log aggregators) and to the PostgreSQL database:

`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `API_KEY_CREATED`, `API_KEY_DELETED`, `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED`, `SETTINGS_UPDATED`, `FILE_UPLOADED`, `FILE_DELETED`

### Error Handling

- Stack traces are suppressed in production (`NODE_ENV=production`)
- Internal server errors return a generic message to clients
- Optional Sentry integration for error tracking

## Shared Responsibility Model

SnapOtter is a self-hosted application. Security is a shared responsibility between the SnapOtter maintainers and the deployer.

| Area | SnapOtter maintainers | Deployer |
|------|-------------------|----------|
| Application code | Patch vulnerabilities, follow secure coding practices | Keep SnapOtter updated to the latest release |
| Docker image | Publish hardened images with non-root user, minimal attack surface | Pull updates regularly, scan images with your own tooling |
| Dependencies | Monitor and update npm/pip dependencies | N/A |
| Authentication | Provide secure auth implementation (scrypt, RBAC, brute-force protection) | Change default credentials before production use, enforce strong passwords |
| TLS/HTTPS | Support `TRUST_PROXY` for termination at a reverse proxy, defaulting to private-network peers only | Configure and maintain TLS certificates and reverse proxy; set `TRUST_PROXY` to match your actual topology |
| Network security | Bind to `0.0.0.0` for container flexibility | Restrict network exposure with firewalls, do not expose port 1349 directly to the internet |
| Host OS | N/A | Patch and harden the host operating system |
| Secrets management | Never bake credentials into image layers | Manage env vars securely (Docker secrets, Vault, etc.), rotate the default admin password |
| Data backups | Store data in `/data` for easy volume mounting | Implement backup and disaster recovery for the `/data` volume |
| Monitoring | Emit structured audit logs and health check endpoints | Collect logs, set up alerting, monitor `/api/v1/health` |

## Hardening Checklist

The following configurations are recommended for production deployments:

### Required

- [ ] Change the default admin password immediately after first login (enforced by `mustChangePassword` unless `SKIP_MUST_CHANGE_PASSWORD=true`)
- [ ] Place SnapOtter behind a TLS-terminating reverse proxy (nginx, Caddy, Traefik)
- [ ] Set `CORS_ORIGIN` to your specific domain(s) if cross-origin access is needed (default in production is same-origin only)

### Strongly Recommended

- [ ] Set `RATE_LIMIT_PER_MIN` to an appropriate value for your workload (e.g., `60`)
- [ ] Set `MAX_UPLOAD_SIZE_MB` to limit upload sizes (e.g., `50`)
- [ ] Set `MAX_MEGAPIXELS` to prevent memory exhaustion from oversized images (e.g., `100`)
- [ ] Set `MAX_USERS` to limit account creation
- [ ] Set `SESSION_DURATION_HOURS` to a value appropriate for your environment (default: `168` / 7 days)
- [ ] Set `LOGIN_ATTEMPT_LIMIT` to a low value (default: `10`)
- [ ] Set `TRUST_PROXY` to match your topology (see "Client IP resolution" below)
- [ ] Use named Docker volumes instead of bind mounts for the `/data` directory
- [ ] Run with explicit `PUID`/`PGID` matching your host user

### Additional Hardening

- [ ] Set `MAX_BATCH_SIZE` to limit batch processing resource consumption
- [ ] Set `MAX_PIPELINE_STEPS` to limit pipeline complexity
- [ ] Set `PROCESSING_TIMEOUT_S` to prevent long-running operations from monopolizing resources
- [ ] Set `MAX_SVG_SIZE_MB` to limit SVG upload sizes
- [ ] Set `MAX_PDF_PAGES` to limit PDF processing scope
- [ ] Forward structured logs to a centralized log aggregator (audit events emit at `info` level, so do not set `LOG_LEVEL` above `info` or audit stdout output will be suppressed)
- [ ] Monitor the `/api/v1/health` endpoint with your infrastructure monitoring
- [ ] Restrict Docker socket access if running alongside other containers

## Client IP resolution (`TRUST_PROXY`)

`request.ip` is the key for every IP-scoped control: the global rate limiter, the login brute-force limiter, the enterprise IP allowlist, and IP attribution in the audit log. `TRUST_PROXY` decides which peers are allowed to set that value with an `X-Forwarded-For` header.

The default is `loopback,linklocal,uniquelocal`, so only a peer on a private network is believed:

| Value | Who may set the client IP | Use it when |
|-------|---------------------------|-------------|
| `loopback,linklocal,uniquelocal` (default) | Peers on `127.0.0.0/8`, `169.254.0.0/16`, `10/8`, `172.16/12`, `192.168/16` and the IPv6 equivalents | Anything normal: a direct `docker run`, or a reverse proxy on the same host, a Docker network, or your LAN |
| `false` | Nobody. `request.ip` is always the socket peer | You want header handling off entirely and accept that a proxied deployment shares one rate-limit bucket |
| `true` | Anyone who connects | Only when a proxy you control sits in front on a **public** address. Never on a directly exposed instance |
| `10.0.0.5,192.0.2.7` or a CIDR list | Exactly the peers you name | You want to name your proxies rather than trust a whole range |

A bare number (a hop count) is no longer accepted; see the upgrade note below.

Setting `true` on an instance that is reachable directly makes `request.ip` attacker-controlled: a caller who rotates the header gets a fresh rate-limit bucket on every request, which removes brute-force protection from the login route and makes the IP allowlist bypassable.

### Docker Desktop caveat

On Docker Desktop (macOS and Windows) a published port is served through a userland proxy that rewrites the source address to the VM gateway, `192.168.65.1`. Every client arrives as that one private address, so:

- the default trust list believes it, and a forged `X-Forwarded-For` still moves `request.ip`
- setting `TRUST_PROXY=false` does not help either: it just collapses every client into a single bucket keyed on the gateway, so one abusive caller rate-limits everyone

No value of `TRUST_PROXY` recovers the real client address on that platform, because it is discarded before the application sees it. Docker Desktop is a development target. Deploy on Linux, where published ports use NAT and the real source address survives, and put a reverse proxy in front for anything internet-facing.

## Upgrade notes

### Hop counts in `TRUST_PROXY` are rejected

fastify 5.12.1 stopped honouring a numeric `trustProxy` (GHSA-3m5p-2c4r-xxw2): a hop count cannot validate the immediate peer, so a client connecting directly could spoof `X-Forwarded-For` by supplying enough hops. Upstream now fails closed on a number, which would have turned `TRUST_PROXY=2` into "trust no proxy" with no warning. SnapOtter refuses to start on a numeric value instead and says so in the log.

If you had a hop count configured, replace it with one of the forms in the table above: `false` when nothing proxies this instance (the old `0`), a comma-separated list of addresses, CIDRs, or the named ranges (`loopback,linklocal,uniquelocal`) to name the proxies, or `true` when a proxy you control reaches SnapOtter from a public address.

### Client IP resolution changed (`TRUST_PROXY`)

The shipped default moved from `true` to `loopback,linklocal,uniquelocal`. Most deployments need no action: a reverse proxy on the same host, a Docker network, or a LAN holds a private address and is still believed.

Set `TRUST_PROXY=true` explicitly if your proxy reaches SnapOtter from a **public** address, for example a cloud load balancer on a different network. If you do not, `X-Forwarded-For` from that proxy is ignored and every request is attributed to the proxy's address, which puts all your users in one rate-limit bucket and breaks an IP allowlist keyed on real client addresses.

### `files:own` and `pipelines:own` are now enforced

Both permissions appeared in the roles editor but no route checked them, so unticking either had no effect. They are now enforced on the file-library routes (`/api/v1/files*`) and the saved-pipeline routes (`/api/v1/pipeline/save`, `/list`, `DELETE /:id`).

All three built-in roles (`admin`, `editor`, `user`) include both permissions, so they are unaffected. Only a **custom role that deliberately omitted one** changes behaviour, which is what unticking the box was meant to do in the first place. Holding the broader `files:all` or `pipelines:all` is sufficient on its own, so no role is locked out for lacking the `:own` half.

If a custom role loses access it did not expect to lose, add the missing permission back in Settings, Roles.

Ad-hoc pipeline execution (`/api/v1/pipeline/execute` and `/batch`) is unchanged: it stores nothing and remains governed by `tools:use`.

## Dependency Management

- npm dependencies are locked via `pnpm-lock.yaml` with `--frozen-lockfile` in CI and Docker builds
- Python dependencies are pinned to exact versions in the Dockerfile
- GitHub Dependabot or similar tooling is recommended for automated dependency update PRs

## Disclosure Policy

We follow coordinated disclosure. After a fix is released:

1. The vulnerability is documented in the GitHub release notes
2. A CVE is requested for critical and high severity issues
3. The reporter is credited unless they request anonymity

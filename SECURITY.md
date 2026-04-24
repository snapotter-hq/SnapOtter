# Security Policy

## Supported Versions

Only the latest release of SnapOtter receives security updates. We recommend always running the most recent version.

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous releases | No |

Self-hosted deployments should subscribe to [GitHub release notifications](https://github.com/snapotter-hq/snapotter/releases) and upgrade promptly when security patches are published.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

To report a vulnerability, email **security@snapotter.local** with:

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
- **Database queries**: Parameterized via Drizzle ORM (SQLite) — no raw string concatenation

### HTTP Security

The following headers are set on all responses:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `0` (modern best practice) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only) |
| `Content-Security-Policy` | Restrictive policy with `default-src 'self'` (production only) |

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

Security-relevant events are dual-written to structured stdout (for log aggregators) and to the SQLite database:

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
| TLS/HTTPS | Support `TRUST_PROXY` for termination at a reverse proxy | Configure and maintain TLS certificates and reverse proxy |
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
- [ ] Use named Docker volumes instead of bind mounts for the `/data` directory
- [ ] Run with explicit `PUID`/`PGID` matching your host user

### Additional Hardening

- [ ] Set `MAX_BATCH_SIZE` to limit batch processing resource consumption
- [ ] Set `MAX_PIPELINE_STEPS` to limit pipeline complexity
- [ ] Set `PROCESSING_TIMEOUT_S` to prevent long-running operations from monopolizing resources
- [ ] Set `MAX_SVG_SIZE_MB` to limit SVG upload sizes
- [ ] Set `MAX_PDF_PAGES` to limit PDF processing scope
- [ ] Forward structured logs to a centralized log aggregator (audit events emit at `info` level — do not set `LOG_LEVEL` above `info` or audit stdout output will be suppressed)
- [ ] Monitor the `/api/v1/health` endpoint with your infrastructure monitoring
- [ ] Restrict Docker socket access if running alongside other containers

## Dependency Management

- npm dependencies are locked via `pnpm-lock.yaml` with `--frozen-lockfile` in CI and Docker builds
- Python dependencies are pinned to exact versions in the Dockerfile
- GitHub Dependabot or similar tooling is recommended for automated dependency update PRs

## Disclosure Policy

We follow coordinated disclosure. After a fix is released:

1. The vulnerability is documented in the GitHub release notes
2. A CVE is requested for critical and high severity issues
3. The reporter is credited unless they request anonymity

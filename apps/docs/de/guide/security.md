---
description: Leitfaden zur Sicherheitshärtung für SnapOtter. Container-Sicherheit, Netzwerkisolierung, Docker-Secrets, Kubernetes-Bereitstellung und Compliance-Artefakte.
i18n_source_hash: c682d19a84ce
i18n_provenance: machine
i18n_output_hash: df09b9bfe849
---

# Sicherheit & Härtung {#security-hardening}

SnapOtter verarbeitet Dateien vollständig auf Ihrer Infrastruktur. Es sendet standardmäßig anonyme, inhaltslose Produktanalysen und Absturzberichte, um das Projekt zu verbessern. Es sendet niemals Ihre Dateien, Dateinamen, Dateiinhalte, OCR-Ausgaben, Bildmetadaten oder Dokumenttexte. Optionales Feedback wird nur gesendet, nachdem ein Benutzer es abgeschickt hat, nur wenn Analysen aktiviert sind, und Kontaktfelder werden nur mit ausdrücklicher Kontaktzustimmung einbezogen. Ein Administrator kann Analysen und die Feedback-Erfassung mit einem Klick unter Einstellungen > System > Datenschutz deaktivieren, ohne dass ein Neubau erforderlich ist. Die Dateiverarbeitung bleibt stets innerhalb Ihres Containers.

Der Container läuft als dedizierter Nicht-Root-Benutzer (`snapotter`), wobei alle Linux-Capabilities bis auf den minimal erforderlichen Satz entfernt wurden. Die vollständige Richtlinie zur Offenlegung von Schwachstellen und die Sicherheitsarchitektur finden Sie in [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) auf GitHub.

## Container-Härtung {#container-hardening}

Die [standardmäßige docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) enthält Sicherheitshärtung für die Produktion. Hier eine Aufschlüsselung der einzelnen Optionen und warum sie wichtig sind:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      # Bind to localhost only for internet-facing deployments:
      - "127.0.0.1:1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_PASSWORD=change-me-immediately
      - RATE_LIMIT_PER_MIN=1000
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

    # --- Resource limits ---
    mem_limit: 6g            # Prevents runaway memory from crashing the host
    memswap_limit: 6g        # No swap - fail fast instead of degrading the host
    cpus: 4                  # Cap CPU usage to 4 cores
    pids_limit: 512          # Prevents fork bombs

    # --- Capability restrictions ---
    cap_drop:
      - ALL                  # Drop ALL Linux capabilities first
    cap_add:
      - CHOWN                # Needed for volume permission setup
      - SETUID               # Needed for gosu privilege drop (root -> snapotter)
      - SETGID               # Needed for gosu privilege drop
      - DAC_OVERRIDE         # Needed for volume permission setup
      - FOWNER               # Needed for volume permission setup

    # --- Logging ---
    logging:
      driver: json-file
      options:
        max-size: "50m"      # Rotate logs at 50 MB
        max-file: "5"        # Keep 5 rotated log files

    # --- Health check ---
    healthcheck:
      test: ["CMD", "curl", "-sf", "--max-time", "5", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3

    shm_size: "2gb"          # Required for Python ML shared memory
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

### Warum `no-new-privileges` nicht gesetzt ist {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` wird absichtlich weggelassen. Der Entrypoint startet als Root, um die Volume-Eigentümerschaft zu korrigieren, und wechselt dann über [gosu](https://github.com/tianon/gosu) zum Benutzer `snapotter`, was setuid erfordert. Sobald der Rechteentzug abgeschlossen ist, läuft der Prozess als `snapotter`, wobei alle Capabilities außer den oben aufgeführten fünf entfernt sind.

Wenn Sie Kubernetes oder Dockers Flag `--user` verwenden, um direkt als Nicht-Root zu laufen (unter Umgehung von gosu), ist es sicher, `no-new-privileges` zu aktivieren.

### Warum `read_only` nicht gesetzt ist {#why-read-only-is-not-set}

`read_only: true` ist nicht gesetzt, weil das PUID/PGID-Remapping beim Start in `/etc/passwd` und `/etc/group` schreibt. Wenn Sie stattdessen Dockers Flag `--user` oder Kubernetes `runAsUser` verwenden, können Sie ein schreibgeschütztes Root-Dateisystem sicher aktivieren.

## Netzwerkisolierung {#network-isolation}

Während des normalen Betriebs stellt der Container **null ausgehende Netzwerkverbindungen** her. Die gesamte Dateiverarbeitung erfolgt lokal mit gebündelten Bibliotheken.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Die einzige Ausnahme sind **AI-Modell-Downloads**: Wenn ein Benutzer über die UI ein AI-Funktionsbündel installiert, lädt der Container Modelldateien von GitHub Releases und PyPI herunter. Diese Downloads erfolgen einmal pro Bündel und werden im Volume `/data` gespeichert.

**Firewall-Empfehlungen:**

| Szenario | Ausgehende Regel |
|---|---|
| Air-Gapped (ohne AI) | Gesamten ausgehenden Datenverkehr des Containers blockieren |
| AI-Bündel erforderlich | HTTPS zu `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` während der Installation zulassen, danach blockieren |
| Nach der AI-Installation | Gesamten ausgehenden Datenverkehr blockieren - Modelle werden lokal zwischengespeichert |

Zur Konfiguration eines Reverse-Proxys (Nginx, Traefik, Caddy, Cloudflare Tunnels) siehe den [Bereitstellungsleitfaden](/de/guide/deployment#reverse-proxy).

## Docker-Secrets {#docker-secrets}

Vermeiden Sie bei Produktionsbereitstellungen, Secrets als Klartext-Umgebungsvariablen zu übergeben. Der Entrypoint unterstützt Dockers `_FILE`-Konvention: Mounten Sie ein Secret als Datei und setzen Sie die entsprechende `_FILE`-Variable auf ihren Pfad.

**Unterstützte Secrets:**

| Variable | `_FILE`-Entsprechung |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Beispiel mit Docker-Compose-Secrets:**

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD_FILE=/run/secrets/snapotter_password
      - COOKIE_SECRET_FILE=/run/secrets/cookie_secret
    secrets:
      - snapotter_password
      - cookie_secret

secrets:
  snapotter_password:
    file: ./secrets/snapotter_password.txt
  cookie_secret:
    file: ./secrets/cookie_secret.txt
```

::: tip 
Docker-Compose-Secrets (ohne Swarm) erfordern Compose v2.23 oder neuer.
:::

## Kubernetes-Bereitstellung {#kubernetes-deployment}

Der Entrypoint erkennt, wenn der Container bereits als Nicht-Root läuft (z. B. über Kubernetes `runAsUser`), und überspringt den gosu-Rechteentzug automatisch. In diesem Fall kann er die gemounteten Volumes nicht selbst per chown ändern, daher prüft er, ob sie beschreibbar sind, und beendet sich frühzeitig mit umsetzbaren Hinweisen, falls sie es nicht sind. Siehe [Speicherberechtigungen](/de/guide/deployment#storage-permissions) für `fsGroup` und Setups mit fremder UID (TrueNAS, OpenShift).

**Empfohlener Pod-SecurityContext:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snapotter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: snapotter
  template:
    metadata:
      labels:
        app: snapotter
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
      containers:
        - name: snapotter
          image: snapotter/snapotter:latest
          ports:
            - containerPort: 1349
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 6Gi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /data
            - name: workspace
              mountPath: /tmp/workspace
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: snapotter-data
        - name: workspace
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

Da `runAsUser: 999` auf Pod-Ebene gesetzt ist, überspringt der Entrypoint gosu vollständig. Dadurch sind die Capabilities `allowPrivilegeEscalation: false` und `drop: [ALL]` ohne Konflikt möglich.

Zur Ressourcendimensionierung siehe [Hardware-Anforderungen](/de/guide/deployment#hardware-requirements).

## Sicherung und Wiederherstellung {#backup-and-recovery}

Der persistente Zustand ist auf zwei Volumes aufgeteilt:

| Volume | Inhalt | Kritisch? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL-Datenbank (Benutzer, Einstellungen, Pipelines, Jobs, Audit-Log) | Ja |
| `/data` (App-Volume) | Vom Benutzer hochgeladene Dateien, AI-Modelle, Python-venv | Teilweise (siehe unten) |

Innerhalb des Volumes `/data`:

| Pfad | Inhalt | Kritisch? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Benutzerdateien und Verarbeitungsergebnisse | Ja |
| `/data/ai/` | Heruntergeladene AI-Modelldateien | Nein (erneut herunterladbar) |
| `/data/venv/` | Virtuelle Python-Umgebung | Nein (beim Start neu erstellt) |

### Datenbanksicherung {#database-backup}

Verwenden Sie `pg_dump`, um die Datenbank zu sichern, während der Stack läuft:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Alternativ stoppen Sie den Stack und erstellen einen Snapshot des Volumes `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Sicherung der Benutzerdateien {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

AI-Modelle umfassen insgesamt bis zu etwa 24 GB über alle Bündel hinweg. Da sie erneut herunterladbar sind, schließen Sie `/data/ai/` und `/data/venv/` von Sicherungen aus, um Speicherplatz zu sparen. Nur die Datenbank und die Benutzerdateien sind kritisch.

## Compliance-Artefakte {#compliance-artifacts}

Jede SnapOtter-Version enthält die folgenden Sicherheitsartefakte:

| Artefakt | Format | Wo zu finden |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) Asset: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) Asset: `snapotter-v{version}-sbom.spdx.json` |
| Schwachstellen-Scan | Trivy JSON | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) Asset: `snapotter-v{version}-trivy.json` |
| Schwachstellen-Scan | SARIF | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Statische Analyse | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), läuft wöchentlich + pro PR |
| Abhängigkeitsprüfung | GitHub-nativ | Prüfung pro PR, schlägt bei Hinzufügungen mit hoher Kritikalität fehl |
| Python-Abhängigkeits-Audit | pip-audit | CI-Ausführungsprotokoll bei jedem Push |
| Sicherheitsrichtlinie | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) im Repository |
| Abhängigkeitsaktualisierungen | Dependabot | Automatisierte wöchentliche PRs für npm, pip, Docker, Actions |

**Eigenen Scan ausführen:**

Laden Sie die SBOM aus dem Release herunter und scannen Sie sie mit dem Werkzeug Ihrer Wahl:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
Die SBOM und der Schwachstellen-Scan spiegeln genau das für diese Version veröffentlichte Image wider. Nach der Bereitstellung installierte AI-Modellbündel sind nicht in der SBOM enthalten, da sie zur Laufzeit heruntergeladen werden.
:::

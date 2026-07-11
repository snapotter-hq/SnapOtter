---
description: "Leitfaden zur Sicherheitshärtung für SnapOtter. Container-Sicherheit, Netzwerkisolierung, Docker-Secrets, Kubernetes-Deployment und Compliance-Artefakte."
i18n_source_hash: 986f7658430c
i18n_provenance: machine
i18n_output_hash: 807a330f6ec7
---

# Sicherheit & Härtung {#security-hardening}

SnapOtter verarbeitet Dateien vollständig auf deiner Infrastruktur. Es sendet standardmäßig anonyme, inhaltsfreie Produkt-Analytics und Absturzberichte, um das Projekt zu verbessern. Es sendet niemals deine Dateien, Dateinamen, Dateiinhalte, OCR-Ausgaben, Bild-Metadaten oder Dokumenttext. Optionales Feedback wird nur gesendet, nachdem ein Benutzer es abgeschickt hat, nur wenn Analytics aktiviert ist, und Kontaktfelder werden nur mit ausdrücklicher Kontaktzustimmung einbezogen. Ein Administrator kann Analytics und Feedback-Erfassung mit einem Klick unter Einstellungen > System > Datenschutz ausschalten, kein Neuaufbau erforderlich. Die Dateiverarbeitung bleibt immer innerhalb deines Containers.

Der Container läuft als dedizierter Non-Root-Benutzer (`snapotter`) mit allen entfernten Linux-Capabilities außer dem minimal erforderlichen Satz. Für die vollständige Richtlinie zur Offenlegung von Schwachstellen und die Sicherheitsarchitektur siehe [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) auf GitHub.

## Container-Härtung {#container-hardening}

Die [Standard-docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) enthält Produktions-Sicherheitshärtung. Hier ist eine Aufschlüsselung jeder Option und warum sie wichtig ist:

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

`security_opt: [no-new-privileges:true]` wird bewusst weggelassen. Der Entrypoint startet als root, um die Volume-Eigentümerschaft zu korrigieren, und fällt dann über [gosu](https://github.com/tianon/gosu) auf den `snapotter`-Benutzer zurück, was setuid erfordert. Sobald der Privilegienabwurf abgeschlossen ist, läuft der Prozess als `snapotter` mit allen entfernten Capabilities außer den fünf oben aufgeführten.

Wenn du Kubernetes oder Dockers `--user`-Flag verwendest, um direkt als Non-Root zu laufen (und gosu zu umgehen), kann `no-new-privileges` sicher aktiviert werden.

### Warum `read_only` nicht gesetzt ist {#why-read-only-is-not-set}

`read_only: true` ist nicht gesetzt, weil die PUID/PGID-Neuzuordnung beim Start nach `/etc/passwd` und `/etc/group` schreibt. Wenn du Dockers `--user`-Flag oder Kubernetes `runAsUser` anstelle von PUID/PGID verwendest, kannst du ein schreibgeschütztes Root-Dateisystem sicher aktivieren.

## Netzwerkisolierung {#network-isolation}

Während des normalen Betriebs stellt der Container **null ausgehende Netzwerkverbindungen** her. Die gesamte Dateiverarbeitung geschieht lokal mit mitgelieferten Bibliotheken.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Die einzige Ausnahme sind **KI-Modell-Downloads**: Wenn ein Benutzer ein KI-Feature-Bundle über die Oberfläche installiert, lädt der Container das vorgefertigte Bundle-Archiv von Hugging Face herunter, plus einige einzelne Modelldateien von GitHub Releases, Google Storage und PyPI. Diese Downloads geschehen einmal pro Bundle und werden im `/data`-Volume gespeichert.

**Firewall-Empfehlungen:**

| Szenario | Ausgehende Regel |
|---|---|
| Air-Gapped (keine KI) | Blockiere allen ausgehenden Verkehr vom Container |
| KI-Bundles benötigt | Erlaube HTTPS zu `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` während der Installation, dann blockieren |
| Nach der KI-Installation | Blockiere allen ausgehenden Verkehr - Modelle sind lokal zwischengespeichert |

Bundle-Archive werden aus dem Xet-Storage von Hugging Face bereitgestellt, das über die `*.xethub.hf.co`-Endpunkte parallel überträgt und die Multi-GB-Bundle-Downloads schnell macht. Wenn deine Firewall `huggingface.co` erlaubt, aber `*.xethub.hf.co` blockiert, gelingen die Installationen dennoch, fallen aber auf einen langsameren Single-Stream-Download zurück; setze also die Xet-Hosts auf die Allowlist, um auf dem schnellen Pfad zu bleiben. Vollständig offline durchgeführte Installationen können all dies überspringen und stattdessen den [Offline-Bundle-Import](/de/guide/deployment) verwenden.

Für die Reverse-Proxy-Konfiguration (Nginx, Traefik, Caddy, Cloudflare Tunnels) siehe den [Deployment-Leitfaden](/de/guide/deployment#reverse-proxy).

## Docker-Secrets {#docker-secrets}

Für Produktions-Deployments solltest du das Übergeben von Secrets als Klartext-Umgebungsvariablen vermeiden. Der Entrypoint unterstützt Dockers `_FILE`-Konvention: Binde ein Secret als Datei ein und setze die entsprechende `_FILE`-Variable auf ihren Pfad.

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

## Kubernetes-Deployment {#kubernetes-deployment}

Der Entrypoint erkennt, wenn der Container bereits als Non-Root läuft (z. B. über Kubernetes `runAsUser`), und überspringt den gosu-Privilegienabwurf automatisch. In diesem Fall kann er die eingebundenen Volumes nicht selbst chownen, daher überprüft er, ob sie beschreibbar sind, und beendet sich frühzeitig mit umsetzbaren Hinweisen, falls nicht - siehe [Speicherberechtigungen](/de/guide/deployment#storage-permissions) für `fsGroup`- und Fremd-UID-Setups (TrueNAS, OpenShift).

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

Da `runAsUser: 999` auf Pod-Ebene gesetzt ist, überspringt der Entrypoint gosu vollständig. Dies erlaubt die Capabilities `allowPrivilegeEscalation: false` und `drop: [ALL]` ohne Konflikt.

Für die Ressourcendimensionierung siehe [Hardware-Anforderungen](/de/guide/deployment#hardware-requirements).

## Backup und Wiederherstellung {#backup-and-recovery}

Der persistente Zustand ist über zwei Volumes verteilt:

| Volume | Inhalt | Kritisch? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL-Datenbank (Benutzer, Einstellungen, Pipelines, Jobs, Audit-Log) | Ja |
| `/data` (App-Volume) | Von Benutzern hochgeladene Dateien, KI-Modelle, Python-venv | Teilweise (siehe unten) |

Innerhalb des `/data`-Volumes:

| Pfad | Inhalt | Kritisch? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Benutzerdateien und Verarbeitungsergebnisse | Ja |
| `/data/ai/` | Heruntergeladene KI-Modelldateien | Nein (erneut herunterladbar) |
| `/data/venv/` | Virtuelle Python-Umgebung | Nein (beim Start neu gebaut) |

### Datenbank-Backup {#database-backup}

Verwende `pg_dump`, um die Datenbank zu sichern, während der Stack läuft:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Alternativ stoppe den Stack und erstelle einen Snapshot des `SnapOtter-pgdata`-Volumes:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Backup der Benutzerdateien {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

KI-Modelle machen über alle Bundles hinweg bis zu etwa 24 GB aus. Da sie erneut herunterladbar sind, schließe `/data/ai/` und `/data/venv/` von Backups aus, um Platz zu sparen. Nur die Datenbank und die Benutzerdateien sind kritisch.

## Compliance-Artefakte {#compliance-artifacts}

Jedes SnapOtter-Release enthält die folgenden Sicherheitsartefakte:

| Artefakt | Format | Wo zu finden |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub-Release](https://github.com/snapotter-hq/SnapOtter/releases)-Asset: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub-Release](https://github.com/snapotter-hq/SnapOtter/releases)-Asset: `snapotter-v{version}-sbom.spdx.json` |
| Schwachstellen-Scan | Trivy JSON | [GitHub-Release](https://github.com/snapotter-hq/SnapOtter/releases)-Asset: `snapotter-v{version}-trivy.json` |
| Schwachstellen-Scan | SARIF | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Statische Analyse | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), läuft wöchentlich + pro PR |
| Dependency-Review | GitHub nativ | Prüfung pro PR, scheitert bei Ergänzungen hoher Schwere |
| Python-Dependency-Audit | pip-audit | CI-Laufprotokoll bei jedem Push |
| Sicherheitsrichtlinie | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) im Repository |
| Dependency-Updates | Dependabot | Automatisierte wöchentliche PRs für npm, pip, Docker, Actions |

**Deinen eigenen Scan ausführen:**

Lade die SBOM aus dem Release herunter und scanne sie mit deinem bevorzugten Tool:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
Die SBOM und der Schwachstellen-Scan spiegeln genau das für dieses Release veröffentlichte Image wider. Nach dem Deployment installierte KI-Modell-Bundles sind nicht in der SBOM enthalten, da sie zur Laufzeit heruntergeladen werden.
:::

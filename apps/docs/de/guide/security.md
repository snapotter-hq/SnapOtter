---
description: "Sicherheitshärtungsleitfaden für SnapOtter. Container-Sicherheit, Netzwerkisolierung, Docker Secrets, Kubernetes-Bereitstellung und Compliance-Artefakte."
i18n_source_hash: 5cf773ddb4c0
i18n_provenance: machine
i18n_output_hash: 754972374965
i18n_hash_version: 2
---

# Sicherheit und Härtung {#security-hardening}

SnapOtter verarbeitet Dateien vollständig auf Ihrer Infrastruktur. Standardmäßig sendet es anonyme, inhaltsfreie Produktanalysen und Absturzberichte, um das Projekt zu verbessern. Es sendet niemals Ihre Dateien, Dateinamen, Dateiinhalte, OCR-Ausgaben, Bildmetadaten oder Dokumenttexte. Optionales Feedback wird nur gesendet, nachdem ein Benutzer es abgeschickt hat, nur bei aktivierten Analysen, und Kontaktfelder sind nur mit ausdrücklicher Kontakteinwilligung enthalten. Ein Administrator kann Analysen und die Feedbackerfassung mit einem Klick unter Einstellungen > System > Datenschutz ausschalten, ohne Neubau. Die Dateiverarbeitung bleibt immer innerhalb Ihres Containers.

Der Container läuft als dedizierter Nicht-root-Benutzer (`snapotter`), bei dem alle Linux-Capabilities bis auf die minimal erforderliche Menge entfernt sind. Die vollständige Richtlinie zur Offenlegung von Schwachstellen und die Sicherheitsarchitektur finden Sie in [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) auf GitHub.

## Container-Härtung {#container-hardening}

Die kanonischen Compose-Dateien für [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) und [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) sind die maßgebliche Quelle. Kopieren Sie kein verkürztes Beispiel in die Produktion; stellen Sie die Datei aus dem von Ihnen geprüften Release-Tag bereit.

Beide Stacks wenden folgende Kontrollen an:

- Limits für Speicher, Swap, CPU und PIDs begrenzen außer Kontrolle geratene native Verarbeitung.
- Jeder Dienst entfernt alle Linux-Capabilities. Die Anwendung fügt nur `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` für die Volume-Eigentümerschaft, den unumkehrbaren Identitätswechsel mit `gosu` und die ordnungsgemäße Signalweiterleitung wieder hinzu. PostgreSQL und Redis erhalten nur die Teilmenge, die ihre offiziellen Entrypoints benötigen.
- `security_opt: [no-new-privileges:true]` verhindert, dass Prozesse in den Containern von Anwendung, PostgreSQL und Redis zusätzliche Rechte erlangen. Das bleibt mit `gosu` kompatibel: Der Entrypoint beginnt als root, bereitet die Volumes vor und wechselt erst dann zum dedizierten Benutzer `snapotter`.
- Die Image-Eingaben von PostgreSQL und Redis sind per Digest fixiert. Auch die Anwendung sollte auf ein geprüftes Release-Tag oder einen Digest fixiert werden statt auf `latest`.
- Health-Checks, begrenzte JSON-Log-Rotation, dauerhaftes Redis-AOF und die Neustart-Richtlinie sind zentral in den kanonischen Dateien definiert.

Binden Sie bei einer aus dem Internet erreichbaren Bereitstellung Port 1349 an Loopback und beenden Sie TLS an einem gepflegten Reverse-Proxy. Erzeugen Sie eindeutige Zugangsdaten für PostgreSQL und Redis, speichern Sie Secrets in geschützten Dateien oder einem Secret-Manager und ändern Sie das initiale Administratorpasswort umgehend.

### Warum `read_only` nicht gesetzt ist {#why-read-only-is-not-set}

`read_only: true` ist nicht gesetzt, weil die PUID/PGID-Umsetzung beim Start nach `/etc/passwd` und `/etc/group` schreibt. Wenn Sie anstelle von PUID/PGID das Docker-Flag `--user` oder Kubernetes `runAsUser` verwenden, können Sie bedenkenlos ein schreibgeschütztes Root-Dateisystem aktivieren.

## Netzwerkisolierung {#network-isolation}

Die Dateiverarbeitung ist lokal, aber eine Standardinstallation ist **kein System ohne ausgehenden Datenverkehr**. Anonyme Produktanalysen verwenden PostHog und die Absturzberichte Sentry, wenn die Telemetrie aktiviert ist. Setzen Sie `SNAPOTTER_TELEMETRY=0` (oder deaktivieren Sie Analysen unter Einstellungen > System > Datenschutz), um beides auszuschalten. SnapOtter nimmt niemals hochgeladene Dateien, Dateinamen, OCR-Ausgaben, Dokumenttexte oder andere Dateiinhalte in diese Ereignisse auf.

Anderer ausgehender Datenverkehr ist funktionsabhängig: Die Installation von KI-Bundles/-Modellen lädt signierte Release-Eingaben herunter; der URL-Import ruft eine vom Benutzer angeforderte öffentliche URL ab; und ausdrücklich konfigurierte Integrationen wie OIDC, SAML, OpenTelemetry, Webhooks, S3-kompatibler Speicher oder Ähnliches kontaktieren die vom Administrator gewählten Ziele. Modell-Downloads zur Laufzeit sind standardmäßig deaktiviert. Setzen Sie `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` nur, wenn Sie sich ausdrücklich für automatische Fallback-Downloads entscheiden. Ein [Offline-Bundle-Import](/de/guide/deployment) kann KI-Funktionen ohne ausgehenden Modell-Datenverkehr zur Laufzeit bereitstellen.

**Firewall-Empfehlungen:**

| Szenario | Regel für ausgehenden Datenverkehr |
|---|---|
| Air-Gap | Setzen Sie `SNAPOTTER_TELEMETRY=0` und `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, nutzen Sie den Offline-Import von KI-Bundles, deaktivieren Sie URL-Import und externe Integrationen und blockieren Sie dann den ausgehenden Datenverkehr |
| Standard-Telemetrie | Erlauben Sie die PostHog- und Sentry-Endpunkte aus Ihren Browser-/Netzwerk-Logs; deaktivieren Sie die Telemetrie, wenn die Richtlinie sie nicht zulässt |
| KI-Bundles erforderlich | Erlauben Sie während der Installation HTTPS zu `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; blockieren Sie diese Hosts danach |
| Externe Integrationen | Erlauben Sie nur die genauen vom Administrator konfigurierten Ziele für OIDC/SAML/OTLP/Webhook/Objektspeicher |

Bundle-Archive werden aus dem Xet-Speicher von Hugging Face ausgeliefert, der über die `*.xethub.hf.co`-Endpunkte parallel überträgt und Downloads von Bundles mit mehreren GB schnell macht. Wenn Ihre Firewall `huggingface.co` erlaubt, aber `*.xethub.hf.co` blockiert, gelingen Installationen weiterhin, fallen aber auf einen langsameren Download mit einem einzelnen Stream zurück. Setzen Sie die Xet-Hosts daher auf die Allowlist, um den schnellen Weg zu behalten. Vollständig offline durchgeführte Installationen können all das überspringen und stattdessen den [Offline-Bundle-Import](/de/guide/deployment) nutzen.

Die Konfiguration von Reverse-Proxys (Nginx, Traefik, Caddy, Cloudflare Tunnels) finden Sie in der [Bereitstellungsanleitung](/de/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Vermeiden Sie bei Produktivbereitstellungen, Secrets als Klartext-Umgebungsvariablen zu übergeben. Der Entrypoint unterstützt die Docker-Konvention `_FILE`: Binden Sie ein Secret als Datei ein und setzen Sie die entsprechende Variable `_FILE` auf deren Pfad.

**Unterstützte Secrets:**

| Variable | Entsprechung mit `_FILE` |
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

Der Entrypoint erkennt, wenn der Container bereits als Nicht-root-Benutzer läuft (z. B. über Kubernetes `runAsUser`), und überspringt den gosu-Rechtewechsel automatisch. In diesem Fall kann er die eingebundenen Volumes nicht selbst per chown übernehmen. Er prüft daher, ob sie beschreibbar sind, und bricht frühzeitig mit umsetzbaren Hinweisen ab, falls nicht. Siehe [Speicherberechtigungen](/de/guide/deployment#storage-permissions) für `fsGroup` und Setups mit fremder UID (TrueNAS, OpenShift).

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

Da `runAsUser: 999` auf Pod-Ebene gesetzt ist, überspringt der Entrypoint gosu vollständig. Das erlaubt die Capabilities `allowPrivilegeEscalation: false` und `drop: [ALL]` ohne Konflikt.

Hinweise zur Ressourcendimensionierung finden Sie unter [Hardwareanforderungen](/de/guide/deployment#hardware-requirements).

## Backup und Wiederherstellung {#backup-and-recovery}

Der Produktions-Compose-Stack definiert vier Volumes. Stoppen Sie den eingehenden Datenverkehr und lassen Sie aktive Aufträge abschließen, bevor Sie ein koordiniertes Backup erstellen, damit PostgreSQL, Redis und der Dateizustand denselben Zeitpunkt beschreiben.

| Volume | Inhalt | Behandlung bei der Wiederherstellung |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL-Benutzer, Einstellungen, Pipelines, Aufträge, Dateimetadaten und Audit-Log | Kritisch; verwenden Sie für eine portable Wiederherstellung einen fail-fast-Logikdump |
| `SnapOtter-data` | Gespeicherte Bibliotheksobjekte, Logs und KI-Zustand (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Sichern Sie das gesamte Volume; um Platz zu sparen, lassen Sie den gesamten KI-Zustand bewusst weg und installieren Sie die Bundles neu |
| `SnapOtter-redisdata` | Redis-AOF für den dauerhaften BullMQ-Warteschlangenzustand | Sichern Sie nach dem Pausieren der App und dem Erzwingen von `SAVE`; erforderlich, um in die Warteschlange gestellte Arbeit exakt fortzusetzen |
| `SnapOtter-workspace` | Temporäre Objektspeicher-Schlüssel (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Nicht sichern, nachdem alle Aufträge abgearbeitet oder abgebrochen wurden; niemals verwerfen, solange Aufträge aktiv sind |

Compose stellt Volume-Namen normalerweise den Projektnamen voran. Ermitteln Sie das tatsächliche Quell-Volume aus dem eingebundenen Container, anstatt anzunehmen, dass ein Anzeigename wie `SnapOtter-data` der Name des Docker-Volumes ist.

### Datenbank-Backup {#database-backup}

Verwenden Sie das benutzerdefinierte Archivformat von PostgreSQL und überprüfen Sie das Archiv, bevor Sie das Backup als vollständig betrachten:

```bash
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore only into a fresh/disposable target first; any SQL error fails the command.
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Testen Sie jedes Backup, indem Sie es in einen isolierten Stack zurückspielen, Datenbankeinträge und Datei-Prüfsummen kontrollieren und die Anwendung starten. Das `tests/qa/backup-restore-drill.sh` des Repositorys automatisiert dieses Release-Gate gegen ein explizites `QA_IMAGE`.

Wenn Ihre Plattform stattdessen absturzkonsistente Volume-Snapshots erstellt, stoppen Sie zuerst den gesamten Stack und erstellen Sie von allen kritischen Volumes einen Snapshot als einen Satz. Eine Rohkopie des PostgreSQL-Datenverzeichnisses aus einem laufenden Container ist kein unterstütztes logisches Backup.

### Datei- und Warteschlangen-Backup {#file-and-queue-backup}

Pausieren Sie die Anwendung, bevor Sie Datei- und Warteschlangen-Volumes sichern. Verwenden Sie `docker inspect`, um den tatsächlichen Volume-Namen zu ermitteln, erzwingen Sie, dass Redis seinen aktuellen Zustand persistiert, und archivieren Sie mit erhaltener Eigentümerschaft und Berechtigungen:

```bash
docker stop SnapOtter
docker exec SnapOtter-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE
docker stop SnapOtter-redis

DATA_VOLUME="$(docker inspect SnapOtter --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
REDIS_VOLUME="$(docker inspect SnapOtter-redis --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"

install -d -m 700 backup
docker run --rm -v "$DATA_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-data.tar.gz -C /source .
docker run --rm -v "$REDIS_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-redis.tar.gz -C /source .
sha256sum backup/snapotter-*.tar.gz > backup/SHA256SUMS
```

Starten Sie Redis vor der Anwendung neu. Wenn Sie `/data/ai` absichtlich ausschließen, entfernen Sie den gesamten KI-Unterbaum, anstatt einen `installed.json`-Eintrag ohne seine Modelle oder virtuelle Umgebung beizubehalten. Halten Sie Backup-Dateien verschlüsselt, zugriffsgeschützt und getrennt vom Host, auf dem SnapOtter läuft.

## Compliance-Artefakte {#compliance-artifacts}

Jedes SnapOtter-Release enthält die folgenden Sicherheitsartefakte:

| Artefakt | Format | Fundort |
|---|---|---|
| Release-Subjektbindung | Kanonisches JSON + GitHub-Attestierung | Asset des [GitHub-Releases](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| Archiv-SBOM | CycloneDX- und SPDX-JSON | Release-Assets: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Image-SBOM | CycloneDX- und SPDX-JSON | Release-Assets: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Schwachstellen-Scans | Trivy-JSON | Release-Assets mit passendem Präfix `archive-linux-{arch}` oder `image-linux-{arch}` |
| Schwachstellen-Scan | SARIF | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Statische Analyse | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), läuft wöchentlich + pro PR |
| Abhängigkeitsprüfung | GitHub-nativ | Prüfung pro PR, schlägt bei neuen Abhängigkeiten mit hohem Schweregrad fehl |
| Python-Abhängigkeitsaudit | pip-audit | CI-Lauf-Log bei jedem Push |
| Sicherheitsrichtlinie | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) im Repository |
| Abhängigkeitsaktualisierungen | Dependabot | Automatisierte wöchentliche PRs für npm, pip, Docker, Actions |

**Eigenen Scan ausführen:**

Laden Sie das Release-Subjekt-Manifest herunter und überprüfen Sie, dass es vom Release-Workflow attestiert wurde:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Das Manifest erfasst `releaseTag`, `releaseCommit` und `workflowTriggerCommit` getrennt. Überprüfen Sie, dass `releaseCommit` der aus dem unveränderlichen Tag aufgelöste Commit ist, und prüfen Sie dann den SHA-256-Digest des Archivs, Images, der SBOM oder des Scans, den Sie verwenden, anhand seines Eintrags in `subjects`. Diese Unterscheidung ist beabsichtigt: Das Auschecken eines neu erstellten Release-Commits ändert nichts an der Commit-Identität in den OIDC-Zugangsdaten des Workflows.

Sie können auch eine heruntergeladene SBOM oder das Image direkt scannen:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
Image-SBOMs und -Scans spiegeln das exakte architekturspezifische Image wider, das für dieses Release veröffentlicht wurde. Archiv-SBOMs und -Scans beschreiben das vorgefertigte Archiv separat. KI-Modell-Bundles, die nach der Bereitstellung installiert werden, sind in diesen SBOMs nicht enthalten, da sie zur Laufzeit heruntergeladen werden.
:::
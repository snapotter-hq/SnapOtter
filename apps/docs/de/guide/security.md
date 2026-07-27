---
description: "Leitfaden zur Sicherheitshärtung für SnapOtter. Container-Sicherheit, Netzwerkisolierung, Docker-Secrets, Kubernetes-Deployment und Compliance-Artefakte."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: ec85a2663f1c
i18n_hash_version: 2
---

# Sicherheit & Härtung {#security-hardening}

SnapOtter verarbeitet Dateien vollständig auf deiner Infrastruktur. Es sendet standardmäßig anonyme, inhaltsfreie Produkt-Analytics und Absturzberichte, um das Projekt zu verbessern. Es sendet niemals deine Dateien, Dateinamen, Dateiinhalte, OCR-Ausgaben, Bild-Metadaten oder Dokumenttext. Optionales Feedback wird nur gesendet, nachdem ein Benutzer es abgeschickt hat, nur wenn Analytics aktiviert ist, und Kontaktfelder werden nur mit ausdrücklicher Kontaktzustimmung einbezogen. Ein Administrator kann Analytics und Feedback-Erfassung mit einem Klick unter Einstellungen > System > Datenschutz ausschalten, kein Neuaufbau erforderlich. Die Dateiverarbeitung bleibt immer innerhalb deines Containers.

Der Container läuft als dedizierter Non-Root-Benutzer (`snapotter`) mit allen entfernten Linux-Capabilities außer dem minimal erforderlichen Satz. Für die vollständige Richtlinie zur Offenlegung von Schwachstellen und die Sicherheitsarchitektur siehe [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) auf GitHub.

## Containerhärtung {#container-hardening}

Die kanonischen Compose-Dateien [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) und [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) sind die Quelle der Wahrheit. Kopieren Sie kein gekürztes Beispiel in die Produktion. Stellen Sie die Datei mit dem von Ihnen überprüften Release-Tag bereit.

Beide Stapel wenden die folgenden Steuerelemente an:

- Speicher-, Swap-, CPU- und PID-Grenzwerte führen zu einer außer Kontrolle geratenen nativen Verarbeitung.
- Jeder Dienst lässt alle Linux-Funktionen fallen. Die Anwendung fügt nur `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` für den Volume-Besitz, den unidirektionalen `gosu`-Identitätsverlust und die ordnungsgemäße Signalweiterleitung zurück. PostgreSQL und Redis erhalten nur die Teilmenge, die ihre offiziellen Einstiegspunkte benötigen.

– `security_opt: [no-new-privileges:true]` verhindert, dass Prozesse in den Anwendungs-, PostgreSQL- und Redis-Containern zusätzliche Berechtigungen erhalten. Dies bleibt mit `gosu` kompatibel: Der Einstiegspunkt beginnt als Root, bereitet die Volumes vor und fällt nur auf den dedizierten `snapotter`-Benutzer.

– PostgreSQL- und Redis-Bildeingaben werden durch Digest gepinnt. Die Anwendung sollte ebenfalls an ein verifiziertes Release-Tag oder Digest angeheftet werden und nicht an `latest`.

– Gesundheitsprüfungen, begrenzte JSON-Protokollrotation, dauerhaftes Redis AOF und Neustartrichtlinie werden zentral in den kanonischen Dateien definiert.

Binden Sie für eine mit dem Internet verbundene Bereitstellung Port 1349 an den Loopback und beenden Sie TLS an einem verwalteten Reverse-Proxy. Generieren Sie eindeutige PostgreSQL- und Redis-Anmeldeinformationen, speichern Sie Geheimnisse in geschützten Dateien oder einem Secret Manager und ändern Sie sofort das anfängliche Administratorkennwort.

### Warum `read_only` nicht auf {#why-read-only-is-not-set} gesetzt ist

`read_only: true` ist nicht festgelegt, da die PUID/PGID-Neuzuordnung beim Start in `/etc/passwd` und `/etc/group` schreibt. Wenn Sie das `--user`-Flag von Docker oder Kubernetes `runAsUser` anstelle von PUID/PGID verwenden, können Sie sicher ein schreibgeschütztes Root-Dateisystem aktivieren.

## Netzwerkisolation {#network-isolation}

Die Dateiverarbeitung erfolgt lokal, aber eine Standardinstallation ist **kein ausgangsfreies System**. Anonyme Produktanalysen nutzen PostHog und Absturzberichte nutzen Sentry, wenn Telemetrie aktiviert ist. Stellen Sie `SNAPOTTER_TELEMETRY=0` ein (oder deaktivieren Sie die Analyse unter Einstellungen > System > Datenschutz), um beides zu deaktivieren. SnapOtter bezieht niemals hochgeladene Dateien, Dateinamen, OCR-Ausgaben, Dokumenttexte oder andere Dateiinhalte in diese Ereignisse ein.

Anderer ausgehender Datenverkehr ist funktionsgesteuert: Die AI-Bundle-/Modellinstallation lädt signierte Release-Eingaben herunter; Der URL-Import ruft eine vom Benutzer angeforderte öffentliche URL ab. und explizit konfigurierte OIDC, SAML, OpenTelemetry, Webhooks, S3-kompatibler Speicher oder ähnliche Integrationen wenden sich an die vom Administrator ausgewählten Ziele. Modell-Downloads zur Laufzeit sind standardmäßig deaktiviert. Setzen Sie `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` nur, um automatische Fallback-Downloads ausdrücklich zu aktivieren. Ein [Offline-Bundle-Import](/de/guide/deployment) kann KI-Funktionen ohne Laufzeitmodellausgang bereitstellen.

**Firewall-Empfehlungen:**

|Szenario|Ausgehende Regel|
|---|---|
|Luftspaltig|Legen Sie `SNAPOTTER_TELEMETRY=0` und `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` fest, verwenden Sie den Offline-AI-Bundle-Import, deaktivieren Sie den URL-Import und externe Integrationen und blockieren Sie dann den ausgehenden Datenverkehr|
|Standardtelemetrie|Erlauben Sie die in Ihren Browser-/Netzwerkprotokollen aufgeführten PostHog- und Sentry-Endpunkte; Deaktivieren Sie die Telemetrie, wenn die Richtlinie dies nicht zulässt|
|KI-Pakete erforderlich|Erlauben Sie während der Installation HTTPS zu `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; Blockieren Sie dann diese Hosts|
|Externe Integrationen|Lassen Sie nur die genauen vom Administrator konfigurierten OIDC-/SAML-/OTLP-/Webhook-/Objektspeicherziele zu|

Bundle-Archive werden vom Xet-Speicher von Hugging Face bereitgestellt, der parallel über die `*.xethub.hf.co`-Endpunkte übertragen wird und Paket-Downloads mit mehreren GB schnell ermöglicht. Wenn Ihre Firewall `huggingface.co` zulässt, `*.xethub.hf.co` jedoch blockiert, sind Installationen weiterhin erfolgreich, greifen jedoch auf einen langsameren Single-Stream-Download zurück. Setzen Sie die Xet-Hosts daher auf die Zulassungsliste, um auf dem schnellen Pfad zu bleiben. Vollständige Offline-Installationen können dies alles überspringen und stattdessen [Offline-Bundle-Import](/de/guide/deployment) verwenden.

Informationen zur Reverse-Proxy-Konfiguration (Nginx, Traefik, Caddy, Cloudflare Tunnels) finden Sie im [Bereitstellungshandbuch](/de/guide/deployment#reverse-proxy).

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

## Sicherung und Wiederherstellung {#backup-and-recovery}

Der Compose-Produktionsstapel definiert vier Bände. Stoppen Sie den eingehenden Datenverkehr und lassen Sie aktive Jobs beenden, bevor Sie ein koordiniertes Backup erstellen, damit PostgreSQL, Redis und Dateistatus denselben Zeitpunkt beschreiben.

|Volumen|Inhalt|Erholungsbehandlung|
|---|---|---|
|`SnapOtter-pgdata`|PostgreSQL-Benutzer, Einstellungen, Pipelines, Jobs, Dateimetadaten und Prüfprotokoll|Kritisch; Verwenden Sie einen ausfallsicheren logischen Speicherauszug für die tragbare Wiederherstellung|
|`SnapOtter-data`|Gespeicherte Bibliotheksobjekte, Protokolle und AI-Status (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Sichern Sie das gesamte Volume; Um Platz zu sparen, lassen Sie bewusst alle AI-Status weg und installieren Sie die Bundles neu|
|`SnapOtter-redisdata`|Redis AOF für dauerhaften BullMQ-Warteschlangenstatus|Sichern Sie, nachdem Sie die App angehalten und `SAVE` erzwungen haben. erforderlich, um die in der Warteschlange befindliche Arbeit genau fortzusetzen|
|`SnapOtter-workspace`|Temporäre Objektspeicherschlüssel (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Führen Sie kein Backup durch, nachdem alle Jobs gelöscht oder abgebrochen wurden. Verwerfen Sie es niemals, während Jobs aktiv sind|

Compose stellt Volume-Namen normalerweise den Projektnamen voran. Lösen Sie das tatsächliche Quell-Volume aus dem gemounteten Container auf, anstatt davon auszugehen, dass ein Anzeigename wie `SnapOtter-data` der Name des Docker-Volumes ist.

### Datenbanksicherung {#database-backup}

Verwenden Sie das benutzerdefinierte Archivformat von PostgreSQL und überprüfen Sie das Archiv, bevor Sie die Sicherung als abgeschlossen betrachten:

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

Testen Sie jedes Backup, indem Sie es in einem isolierten Stapel wiederherstellen, Datenbankeinträge und Dateiprüfsummen überprüfen und die Anwendung starten. Das `tests/qa/backup-restore-drill.sh` des Repositorys automatisiert dieses Release-Gate gegen ein explizites `QA_IMAGE`.

Wenn Ihre Plattform stattdessen absturzkonsistente Volume-Snapshots erstellt, stoppen Sie zuerst den gesamten Stack und erstellen Sie Snapshots aller kritischen Volumes als einen Satz. Eine Rohkopie des PostgreSQL-Datenverzeichnisses aus einem laufenden Container ist kein unterstütztes logisches Backup.

### Datei- und Warteschlangensicherung {#file-and-queue-backup}

Halten Sie die Anwendung an, bevor Sie Datei- und Warteschlangenvolumes erfassen. Verwenden Sie `docker inspect`, um den tatsächlichen Volume-Namen aufzulösen, Redis zu zwingen, seinen aktuellen Status beizubehalten, und unter Beibehaltung von Besitz und Berechtigungen zu archivieren:

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

Starten Sie Redis vor der Anwendung neu. Wenn Sie `/data/ai` absichtlich ausschließen, entfernen Sie den gesamten AI-Teilbaum, anstatt einen `installed.json`-Datensatz ohne seine Modelle oder die virtuelle Umgebung beizubehalten. Bewahren Sie Sicherungsdateien verschlüsselt, zugriffskontrolliert und getrennt vom Host auf, auf dem SnapOtter ausgeführt wird.

## Compliance-Artefakte {#compliance-artifacts}

Jede SnapOtter-Version enthält die folgenden Sicherheitsartefakte:

| Artefakt | Format | Wo es zu finden ist |
|---|---|---|
| Betreffbindung freigeben | Kanonische JSON + GitHub-Bescheinigung | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) Asset: `snapotter-v{version}-release-subjects.json` |
| Archiv SBOM | CycloneDX und SPDX JSON | Release-Assets: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Bild SBOM | CycloneDX und SPDX JSON | Release-Assets: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Schwachstellenscans | Trivy JSON | Geben Sie Assets mit passenden `archive-linux-{arch}`- oder `image-linux-{arch}`-Präfixen frei |
| Schwachstellenscan | SARIF | Registerkarte [GitHub Sicherheit](https://github.com/snapotter-hq/SnapOtter/security). |
| Statische Analyse | CodeQL (JS/TS + Python) | Registerkarte [GitHub Sicherheit](https://github.com/snapotter-hq/SnapOtter/security), wird wöchentlich und pro PR ausgeführt |
| Abhängigkeitsüberprüfung | GitHub nativ | Die Prüfung pro PR schlägt bei Ergänzungen mit hohem Schweregrad fehl |
| Python Abhängigkeitsprüfung | pip-audit | CI-Ausführungsprotokoll bei jedem Push |
| Sicherheitspolitik | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) im Repository |
| Abhängigkeitsaktualisierungen | Dependabot | Automatisierte wöchentliche PRs für npm, pip, Docker, Aktionen |

**Führen Sie Ihren eigenen Scan durch:**

Laden Sie das Release-Subjekt-Manifest herunter und überprüfen Sie, ob es vom Release-Workflow bestätigt wurde:

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Das Manifest zeichnet `releaseTag`, `releaseCommit` und `workflowTriggerCommit` separat auf. Stellen Sie sicher, dass es sich bei `releaseCommit` um den Commit handelt, der aus dem unveränderlichen Tag entfernt wurde, und überprüfen Sie dann den SHA-256-Digest des Archivs, Images, SBOM oder Scans, den Sie verwenden, anhand seines Eintrags in `subjects`. Diese Unterscheidung ist beabsichtigt: Das Auschecken eines neu erstellten Release-Commits ändert nicht die Commit-Identität in den OIDC-Anmeldeinformationen des Workflows.

Sie können auch ein heruntergeladenes SBOM oder das Bild direkt scannen:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
Das Image SBOMs und die Scans spiegeln genau das architekturspezifische Image wider, das für diese Version veröffentlicht wurde. Archiv SBOMs und Scans beschreiben das vorgefertigte Archiv separat. Nach der Bereitstellung installierte AI-Modellpakete sind in diesen SBOMs nicht enthalten, da sie zur Laufzeit heruntergeladen werden.
:::

---
description: "Handleiding voor beveiligingsverharding van SnapOtter. Containerbeveiliging, netwerkisolatie, Docker-secrets, Kubernetes-implementatie en compliance-artefacten."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 9637a13165d0
i18n_hash_version: 2
---

# Beveiliging & verharding {#security-hardening}

SnapOtter verwerkt bestanden volledig op je eigen infrastructuur. Het verstuurt standaard anonieme, inhoudsloze productanalytics en crashrapporten om het project te helpen verbeteren. Het verstuurt nooit je bestanden, bestandsnamen, bestandsinhoud, OCR-uitvoer, afbeeldingsmetadata of documenttekst. Optionele feedback wordt alleen verzonden nadat een gebruiker deze indient, alleen wanneer analytics is ingeschakeld, en contactvelden worden alleen opgenomen met expliciete contacttoestemming. Een beheerder kan analytics en het vastleggen van feedback met één klik uitschakelen onder Instellingen > Systeem > Privacy, geen herbouw vereist. Bestandsverwerking blijft altijd binnen je container.

De container draait als een dedicated niet-root-gebruiker (`snapotter`) met alle Linux-capabilities verwijderd behalve de minimaal vereiste set. Zie voor het volledige beleid voor kwetsbaarheidsonthulling en de beveiligingsarchitectuur [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) op GitHub.

## Containerharding {#container-hardening}

De canonieke [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) en [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) Compose-bestanden zijn de bron van de waarheid. Kopieer geen verkort voorbeeld naar productie; implementeer het bestand vanaf de releasetag die u heeft geverifieerd.

Beide stapels passen de volgende besturingselementen toe:

- Geheugen-, swap-, CPU- en PID-limieten bevatten op hol geslagen native verwerking.
- Elke service laat alle Linux-mogelijkheden vallen. De applicatie voegt alleen `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` toe voor volume-eigendom, de eenrichtings-`gosu`-identiteitsdaling en sierlijke signaaldoorsturing. PostgreSQL en Redis ontvangen alleen de subset die hun officiële toegangspunten nodig hebben.
- `security_opt: [no-new-privileges:true]` voorkomt dat processen in de applicatie-, PostgreSQL- en Redis-containers extra rechten krijgen. Dit blijft compatibel met `gosu`: het toegangspunt begint als root, bereidt de volumes voor en gaat alleen naar de toegewijde `snapotter`-gebruiker.
- PostgreSQL- en Redis-afbeeldingsinvoer wordt vastgezet door digest. De applicatie moet ook worden vastgemaakt aan een geverifieerde releasetag of samenvatting in plaats van aan `latest`.
- Gezondheidscontroles, begrensde JSON-logboekrotatie, duurzame Redis AOF en herstartbeleid worden centraal in de canonieke bestanden gedefinieerd.

Voor een internetgerichte implementatie bindt u poort 1349 aan loopback en beëindigt u TLS bij een onderhouden omgekeerde proxy. Genereer unieke PostgreSQL- en Redis-inloggegevens, sla geheimen op in beveiligde bestanden of in een geheime manager en wijzig het initiële beheerderswachtwoord onmiddellijk.

### Waarom `read_only` niet is ingesteld op {#why-read-only-is-not-set}

`read_only: true` is niet ingesteld omdat het opnieuw toewijzen van PUID/PGID bij het opstarten naar `/etc/passwd` en `/etc/group` schrijft. Als u Docker's `--user`-vlag of Kubernetes `runAsUser` gebruikt in plaats van PUID/PGID, kunt u veilig een alleen-lezen rootbestandssysteem inschakelen.

## Netwerkisolatie {#network-isolation}

Bestandsverwerking is lokaal, maar een standaardinstallatie is **geen uitgaand systeem**. Anonieme productanalyses gebruiken PostHog en crashrapportage gebruikt Sentry wanneer telemetrie is ingeschakeld. Stel `SNAPOTTER_TELEMETRY=0` in (of schakel analyses uit onder Instellingen > Systeem > Privacy) om beide uit te schakelen. SnapOtter neemt nooit geüploade bestanden, bestandsnamen, OCR-uitvoer, documenttekst of andere bestandsinhoud op in deze gebeurtenissen.

Ander uitgaand verkeer is functiegestuurd: AI-bundel-/modelinstallatie downloadt ondertekende release-invoer; URL-import haalt een door de gebruiker aangevraagde openbare URL op; en expliciet geconfigureerde OIDC, SAML, OpenTelemetry, webhooks, S3-compatibele opslag of soortgelijke integraties maken contact met de door de beheerder gekozen bestemmingen. Modeldownloads tijdens runtime zijn standaard uitgeschakeld. Stel `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` alleen in om automatische fallback-downloads expliciet in te schakelen. Met een [offlinebundelimport](/nl/guide/deployment) kunnen AI-functies worden ingericht zonder uitgaand runtimemodel.

**Firewall-aanbevelingen:**

|Scenario|Uitgaande regel|
|---|---|
|Luchtopening|Stel `SNAPOTTER_TELEMETRY=0` en `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` in, gebruik offline AI-bundelimport, schakel URL-import en externe integraties uit en blokkeer vervolgens uitgaand verkeer|
|Standaardtelemetrie|Sta de PostHog- en Sentry-eindpunten toe die worden vermeld in uw browser-/netwerklogboeken; schakel telemetrie uit als het beleid dit niet toestaat|
|AI-bundels nodig|Sta tijdens de installatie HTTPS naar `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` toe; blokkeer vervolgens die hosts|
|Externe integraties|Alleen de exacte door de beheerder geconfigureerde OIDC/SAML/OTLP/webhook/object-storage-bestemmingen toestaan|

Bundelarchieven worden geleverd vanuit de Xet-opslag van Hugging Face, die parallel wordt overgedragen via de `*.xethub.hf.co`-eindpunten en waardoor downloads van bundels van meerdere GB snel verlopen. Als uw firewall `huggingface.co` toestaat maar `*.xethub.hf.co` blokkeert, slagen de installaties nog steeds, maar vallen ze terug op een langzamere download in één stream. Zet daarom de Xet-hosts op de toelatingslijst om op het snelle pad te blijven. Bij volledig offline installaties kunt u dit allemaal overslaan en in plaats daarvan [Offline Bundle Import](/nl/guide/deployment) gebruiken.

Voor reverse proxy-configuratie (Nginx, Traefik, Caddy, Cloudflare Tunnels), zie de [Implementatiehandleiding](/nl/guide/deployment#reverse-proxy).

## Docker-secrets {#docker-secrets}

Vermijd bij productie-implementaties het doorgeven van secrets als platte-tekst-omgevingsvariabelen. De entrypoint ondersteunt Dockers `_FILE`-conventie: koppel een secret als bestand en stel de bijbehorende `_FILE`-variabele in op het pad ervan.

**Ondersteunde secrets:**

| Variabele | `_FILE`-equivalent |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Voorbeeld met Docker Compose-secrets:**

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
Docker Compose-secrets (zonder Swarm) vereisen Compose v2.23 of later.
:::

## Kubernetes-implementatie {#kubernetes-deployment}

De entrypoint detecteert wanneer de container al als niet-root draait (bijv. via Kubernetes `runAsUser`) en slaat de gosu-privilegeverlaging automatisch over. In dat geval kan het de gekoppelde volumes niet zelf chown'en, dus verifieert het of ze beschrijfbaar zijn en stopt het vroegtijdig met bruikbare aanwijzingen als dat niet zo is — zie [Opslagpermissies](/nl/guide/deployment#storage-permissions) voor `fsGroup` en foreign-UID-configuraties (TrueNAS, OpenShift).

**Aanbevolen Pod SecurityContext:**

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

Omdat `runAsUser: 999` op podniveau is ingesteld, slaat de entrypoint gosu volledig over. Dit maakt `allowPrivilegeEscalation: false`- en `drop: [ALL]`-capabilities zonder conflict mogelijk.

Zie voor de dimensionering van resources [Hardwarevereisten](/nl/guide/deployment#hardware-requirements).

## Back-up en herstel {#backup-and-recovery}

De productie Compose-stack definieert vier volumes. Stop het binnendringen en laat actieve taken voltooien voordat u een gecoördineerde back-up maakt, zodat PostgreSQL, Redis en de bestandsstatus hetzelfde tijdstip beschrijven.

|Volume|Inhoud|Herstelbehandeling|
|---|---|---|
|`SnapOtter-pgdata`|PostgreSQL-gebruikers, instellingen, pijplijnen, taken, metagegevens van bestanden en auditlogboek|Kritisch; gebruik een fail-fast logische dump voor draagbaar herstel|
|`SnapOtter-data`|Opgeslagen bibliotheekobjecten, logboeken en AI-status (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Maak een back-up van het hele volume; om ruimte te besparen, laat u opzettelijk alle AI-statussen weg en installeert u de bundels opnieuw|
|`SnapOtter-redisdata`|Redis AOF voor duurzame BullMQ-wachtrijstatus|Maak een back-up nadat u de app hebt gepauzeerd en `SAVE` hebt geforceerd; vereist om het werk in de wachtrij precies te hervatten|
|`SnapOtter-workspace`|Tijdelijke objectopslagsleutels (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Maak geen back-up nadat alle taken zijn leeggemaakt of geannuleerd; gooi het nooit weg terwijl er banen actief zijn|

Bij Compose worden volumenamen normaal gesproken voorafgegaan door de projectnaam. Los het echte bronvolume op vanuit de gekoppelde container in plaats van aan te nemen dat een weergavenaam zoals `SnapOtter-data` de Docker-volumenaam is.

### Databaseback-up {#database-backup}

Gebruik het aangepaste archiefformaat van PostgreSQL en verifieer het archief voordat u de back-up als voltooid beschouwt:

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

Test elke back-up door deze terug te zetten naar een geïsoleerde stapel, databaserecords en bestandscontrolesommen te controleren en de toepassing te starten. De `tests/qa/backup-restore-drill.sh` van de repository automatiseert de vrijgavepoort tegen een expliciete `QA_IMAGE`.

Als uw platform in plaats daarvan crash-consistente volume-snapshots maakt, stop dan eerst de hele stack en maak een snapshot van alle kritieke volumes als één set. Een onbewerkte kopie van de PostgreSQL-gegevensmap uit een actieve container is geen ondersteunde logische back-up.

### Bestands- en wachtrijback-up {#file-and-queue-backup}

Pauzeer de toepassing voordat u bestands- en wachtrijvolumes vastlegt. Gebruik `docker inspect` om de daadwerkelijke volumenaam om te zetten, Redis te dwingen de huidige status te behouden en te archiveren met behoud van eigendom en machtigingen:

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

Start Redis opnieuw vóór de toepassing. Als u opzettelijk `/data/ai` uitsluit, verwijder dan de hele AI-subboom in plaats van een `installed.json`-record te behouden zonder de modellen of virtuele omgeving ervan. Houd back-upbestanden gecodeerd, met toegangscontrole en gescheiden van de host waarop SnapOtter draait.

## Nalevingsartefacten {#compliance-artifacts}

Elke SnapOtter-release bevat de volgende beveiligingsartefacten:

| Artefact | Formaat | Waar je het kunt vinden |
|---|---|---|
| Onderwerpbinding vrijgeven | Canonieke JSON + GitHub-attest | [GitHub-vrijgave](https://github.com/snapotter-hq/SnapOtter/releases) item: `snapotter-v{version}-release-subjects.json` |
| Archief SBOM | CycloneDX en SPDX JSON | Activa vrijgeven: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Afbeelding SBOM | CycloneDX en SPDX JSON | Activa vrijgeven: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Kwetsbaarheidsscans | Trivy JSON | Activa vrijgeven met overeenkomende `archive-linux-{arch}`- of `image-linux-{arch}`-voorvoegsels |
| Kwetsbaarheidsscan | SARIF | Tabblad [GitHub Beveiliging](https://github.com/snapotter-hq/SnapOtter/security). |
| Statische analyse | CodeQL (JS/TS + Python) | Tabblad [GitHub Beveiliging](https://github.com/snapotter-hq/SnapOtter/security), wordt wekelijks + per PR uitgevoerd |
| Afhankelijkheidsbeoordeling | GitHub eigen | Controle per PR, mislukt bij zeer ernstige toevoegingen |
| Python-afhankelijkheidsaudit | pip-audit | CI voert log uit bij elke druk |
| Beveiligingsbeleid | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) in de repository |
| Afhankelijkheidsupdates | Dependabot | Geautomatiseerde wekelijkse PR's voor npm, pip, Docker, acties |

**Uw eigen scan uitvoeren:**

Download het release-onderwerpmanifest en controleer of dit is bevestigd door de releaseworkflow:

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Het manifest registreert `releaseTag`, `releaseCommit` en `workflowTriggerCommit` afzonderlijk. Controleer of `releaseCommit` de commit is die is gepeld uit de onveranderlijke tag en verifieer vervolgens de SHA-256-samenvatting van het archief, de afbeelding, SBOM of de scan die u gebruikt, ten opzichte van de vermelding ervan in `subjects`. Dit onderscheid is opzettelijk gemaakt: het uitchecken van een nieuw gemaakte release commit verandert niets aan de commit-identiteit in de OIDC-referentie van de workflow.

U kunt ook een gedownloade SBOM of de afbeelding rechtstreeks scannen:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
Afbeelding SBOMs en scans weerspiegelen de exacte architectuurspecifieke afbeelding die voor die release is gepubliceerd. Archief SBOMs en scans beschrijven het vooraf gebouwde archief afzonderlijk. AI-modelbundels die na de implementatie zijn geïnstalleerd, zijn niet opgenomen in deze SBOMs omdat ze tijdens runtime worden gedownload.
:::

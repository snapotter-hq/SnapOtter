---
description: "Beveiligingsgids voor SnapOtter. Containerbeveiliging, netwerkisolatie, Docker secrets, Kubernetes-implementatie en compliance-artefacten."
i18n_source_hash: 5cf773ddb4c0
i18n_provenance: machine
i18n_output_hash: 481d83d8f81d
i18n_hash_version: 2
---

# Beveiliging en hardening {#security-hardening}

SnapOtter verwerkt bestanden volledig op uw eigen infrastructuur. Standaard verstuurt het anonieme, inhoudsvrije productanalyses en crashrapporten om het project te helpen verbeteren. Het verstuurt nooit uw bestanden, bestandsnamen, bestandsinhoud, OCR-uitvoer, afbeeldingsmetadata of documenttekst. Optionele feedback wordt alleen verzonden nadat een gebruiker die heeft ingediend, alleen wanneer analyse is ingeschakeld, en contactgegevens worden alleen meegestuurd met expliciete toestemming voor contact. Een beheerder kan analyse en het vastleggen van feedback met één klik uitschakelen onder Settings > System > Privacy, zonder opnieuw te bouwen. Bestandsverwerking blijft altijd binnen uw container.

De container draait als een speciale niet-rootgebruiker (`snapotter`) waarbij alle Linux-capabilities zijn weggelaten behalve de minimaal vereiste set. Voor het volledige beleid voor het melden van kwetsbaarheden en de beveiligingsarchitectuur, zie [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) op GitHub.

## Containerhardening {#container-hardening}

De canonieke Compose-bestanden voor [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) en [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) zijn de bron van waarheid. Kopieer geen verkort voorbeeld naar productie; implementeer het bestand van de releasetag die u hebt gecontroleerd.

Beide stacks passen de volgende maatregelen toe:

- Limieten voor geheugen, swap, CPU en PID's beperken op hol geslagen native verwerking.
- Elke service laat alle Linux-capabilities vallen. De applicatie voegt alleen `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` weer toe voor volume-eigendom, de eenrichtings-identiteitswissel `gosu` en het netjes doorsturen van signalen. PostgreSQL en Redis krijgen alleen de subset die hun officiële entrypoints nodig hebben.
- `security_opt: [no-new-privileges:true]` voorkomt dat processen in de applicatie-, PostgreSQL- en Redis-containers extra rechten verkrijgen. Dit blijft compatibel met `gosu`: de entrypoint begint als root, bereidt de volumes voor en schakelt pas daarna over naar de speciale gebruiker `snapotter`.
- Image-invoer voor PostgreSQL en Redis is vastgezet op digest. De applicatie moet eveneens worden vastgezet op een gecontroleerde releasetag of digest in plaats van op `latest`.
- Healthchecks, begrensde JSON-logrotatie, duurzame Redis AOF en het herstartbeleid worden centraal in de canonieke bestanden gedefinieerd.

Koppel voor een implementatie die aan internet is blootgesteld poort 1349 aan loopback en beëindig TLS bij een onderhouden reverse proxy. Genereer unieke PostgreSQL- en Redis-inloggegevens, bewaar geheimen in beveiligde bestanden of een secretmanager en wijzig het initiële beheerderswachtwoord direct.

### Waarom `read_only` niet is ingesteld {#why-read-only-is-not-set}

`read_only: true` is niet ingesteld omdat PUID/PGID-remapping bij het opstarten naar `/etc/passwd` en `/etc/group` schrijft. Als u in plaats van PUID/PGID de Docker-vlag `--user` of Kubernetes `runAsUser` gebruikt, kunt u veilig een alleen-lezen root-bestandssysteem inschakelen.

## Netwerkisolatie {#network-isolation}

Bestandsverwerking is lokaal, maar een standaardinstallatie is **geen systeem zonder uitgaand verkeer**. Anonieme productanalyse gebruikt PostHog en crashrapportage gebruikt Sentry wanneer telemetrie is ingeschakeld. Stel `SNAPOTTER_TELEMETRY=0` in (of schakel analyse uit onder Settings > System > Privacy) om beide uit te schakelen. SnapOtter neemt geüploade bestanden, bestandsnamen, OCR-uitvoer, documenttekst of andere bestandsinhoud nooit op in die gebeurtenissen.

Ander uitgaand verkeer wordt door functies bepaald: installatie van AI-bundels en modellen downloadt ondertekende release-invoer; URL-import haalt een door de gebruiker opgegeven openbare URL op; en expliciet geconfigureerde OIDC-, SAML-, OpenTelemetry-, webhook-, S3-compatibele opslag- of vergelijkbare integraties nemen contact op met de door de beheerder gekozen bestemmingen. Modeldownloads tijdens runtime zijn standaard uitgeschakeld. Stel `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` alleen in om expliciet te kiezen voor automatische fallback-downloads. Een [import van een offline bundel](/nl/guide/deployment) kan AI-functies beschikbaar maken zonder uitgaand modelverkeer tijdens runtime.

**Firewallaanbevelingen:**

| Scenario | Regel voor uitgaand verkeer |
|---|---|
| Air-gapped | Stel `SNAPOTTER_TELEMETRY=0` en `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0` in, gebruik import van offline AI-bundels, schakel URL-import en externe integraties uit en blokkeer daarna uitgaand verkeer |
| Standaardtelemetrie | Sta de PostHog- en Sentry-endpoints toe die in uw browser-/netwerklogs staan; schakel telemetrie uit als het beleid ze niet toestaat |
| AI-bundels nodig | Sta tijdens de installatie HTTPS naar `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` toe; blokkeer die hosts daarna |
| Externe integraties | Sta alleen de exacte door de beheerder geconfigureerde OIDC-/SAML-/OTLP-/webhook-/objectopslagbestemmingen toe |

Bundelarchieven worden aangeboden vanaf de Xet-opslag van Hugging Face, die parallel via de endpoints `*.xethub.hf.co` overdraagt en multi-GB-bundeldownloads snel maakt. Staat uw firewall `huggingface.co` toe maar blokkeert hij `*.xethub.hf.co`, dan slagen installaties nog steeds maar vallen ze terug op een tragere download met één stroom, dus zet de Xet-hosts op de toelatingslijst om het snelle pad te behouden. Volledig offline installaties kunnen dit alles overslaan en in plaats daarvan [Import van offline bundels](/nl/guide/deployment) gebruiken.

Voor de configuratie van een reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels) zie de [Implementatiegids](/nl/guide/deployment#reverse-proxy).

## Docker secrets {#docker-secrets}

Vermijd voor productie-implementaties het doorgeven van geheimen als omgevingsvariabelen in platte tekst. De entrypoint ondersteunt de `_FILE`-conventie van Docker: koppel een geheim als bestand en stel de bijbehorende variabele `_FILE` in op het pad ervan.

**Ondersteunde geheimen:**

| Variabele | Equivalent met `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Voorbeeld met Docker Compose secrets:**

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
Docker Compose secrets (zonder Swarm) vereisen Compose v2.23 of nieuwer.
:::

## Kubernetes-implementatie {#kubernetes-deployment}

De entrypoint detecteert wanneer de container al als niet-root draait (bijvoorbeeld via Kubernetes `runAsUser`) en slaat de gosu-rechtendaling automatisch over. In dat geval kan hij de gekoppelde volumes niet zelf met chown overnemen, dus controleert hij of ze schrijfbaar zijn en stopt hij vroegtijdig met bruikbare aanwijzingen als dat niet zo is. Zie [Opslagrechten](/nl/guide/deployment#storage-permissions) voor `fsGroup` en setups met een vreemde UID (TrueNAS, OpenShift).

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

Omdat `runAsUser: 999` op podniveau is ingesteld, slaat de entrypoint gosu volledig over. Hierdoor zijn de capabilities `allowPrivilegeEscalation: false` en `drop: [ALL]` zonder conflict mogelijk.

Voor het bepalen van de omvang van resources zie [Hardwarevereisten](/nl/guide/deployment#hardware-requirements).

## Back-up en herstel {#backup-and-recovery}

De Compose-stack voor productie definieert vier volumes. Stop inkomend verkeer en laat actieve jobs afronden voordat u een gecoördineerde back-up maakt, zodat PostgreSQL, Redis en de bestandsstatus hetzelfde moment in de tijd beschrijven.

| Volume | Inhoud | Behandeling bij herstel |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL-gebruikers, instellingen, pipelines, jobs, bestandsmetadata en auditlog | Kritiek; gebruik een fail-fast logische dump voor overdraagbaar herstel |
| `SnapOtter-data` | Opgeslagen bibliotheekobjecten, logs en AI-status (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Maak een back-up van het hele volume; laat om ruimte te besparen bewust alle AI-status weg en installeer de bundels opnieuw |
| `SnapOtter-redisdata` | Redis AOF voor duurzame BullMQ-wachtrijstatus | Maak een back-up nadat u de app hebt gepauzeerd en `SAVE` hebt geforceerd; vereist om wachtrijwerk exact te hervatten |
| `SnapOtter-workspace` | Tijdelijke objectopslagsleutels (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Geen back-up maken nadat alle jobs zijn afgerond of geannuleerd; gooi het nooit weg terwijl jobs actief zijn |

Compose voegt normaal gesproken de projectnaam als voorvoegsel toe aan volumenamen. Bepaal het echte bronvolume vanuit de gekoppelde container in plaats van aan te nemen dat een weergavenaam zoals `SnapOtter-data` de naam van het Docker-volume is.

### Databaseback-up {#database-backup}

Gebruik het aangepaste archiefformaat van PostgreSQL en controleer het archief voordat u de back-up als compleet beschouwt:

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

Test elke back-up door deze te herstellen in een geïsoleerde stack, databaserecords en bestandschecksums te controleren en de applicatie te starten. De `tests/qa/backup-restore-drill.sh` van de repository automatiseert die releasepoort tegen een expliciete `QA_IMAGE`.

Als uw platform in plaats daarvan crash-consistente volumesnapshots maakt, stop dan eerst de hele stack en maak een snapshot van alle kritieke volumes als één set. Een ruwe kopie van de PostgreSQL-datamap vanuit een draaiende container is geen ondersteunde logische back-up.

### Bestanden- en wachtrijback-up {#file-and-queue-backup}

Pauzeer de applicatie voordat u de bestands- en wachtrijvolumes vastlegt. Gebruik `docker inspect` om de werkelijke volumenaam te bepalen, forceer Redis om de huidige status op te slaan en archiveer met behoud van eigendom en rechten:

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

Start Redis opnieuw op vóór de applicatie. Als u `/data/ai` bewust uitsluit, verwijder dan de hele AI-substructuur in plaats van een record van `installed.json` te bewaren zonder de bijbehorende modellen of virtuele omgeving. Houd back-upbestanden versleuteld, toegangsbeperkt en gescheiden van de host waarop SnapOtter draait.

## Compliance-artefacten {#compliance-artifacts}

Elke SnapOtter-release bevat de volgende beveiligingsartefacten:

| Artefact | Formaat | Waar te vinden |
|---|---|---|
| Release subject binding | Canonieke JSON + GitHub-attestatie | Asset van de [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| Archief-SBOM | CycloneDX en SPDX JSON | Release-assets: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Image-SBOM | CycloneDX en SPDX JSON | Release-assets: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Kwetsbaarheidsscans | Trivy JSON | Release-assets met overeenkomende voorvoegsels `archive-linux-{arch}` of `image-linux-{arch}` |
| Kwetsbaarheidsscan | SARIF | Tabblad [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Statische analyse | CodeQL (JS/TS + Python) | Tabblad [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), draait wekelijks + per PR |
| Dependency review | GitHub native | Controle per PR, faalt bij toevoegingen met hoge ernst |
| Python-dependency-audit | pip-audit | CI-runlog bij elke push |
| Beveiligingsbeleid | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) in de repository |
| Dependency-updates | Dependabot | Geautomatiseerde wekelijkse PR's voor npm, pip, Docker, Actions |

**Uw eigen scan uitvoeren:**

Download het manifest van het releasesubject en controleer of het door de releaseworkflow is geattesteerd:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Het manifest legt `releaseTag`, `releaseCommit` en `workflowTriggerCommit` afzonderlijk vast. Controleer dat `releaseCommit` de commit is die uit de onveranderlijke tag is afgeleid, en controleer vervolgens de SHA-256-digest van het archief, de image, de SBOM of de scan die u gebruikt aan de hand van de vermelding ervan in `subjects`. Dit onderscheid is bewust: het uitchecken van een nieuw aangemaakte releasecommit verandert de commit-identiteit in de OIDC-inloggegevens van de workflow niet.

U kunt ook een gedownloade SBOM of de image rechtstreeks scannen:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
Image-SBOM's en scans weerspiegelen de exacte architectuurspecifieke image die voor die release is gepubliceerd. Archief-SBOM's en scans beschrijven het vooraf gebouwde archief afzonderlijk. AI-modelbundels die na de implementatie worden geïnstalleerd, zijn niet opgenomen in deze SBOM's omdat ze tijdens runtime worden gedownload.
:::

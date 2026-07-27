---
description: "Guide för säkerhetshärdning för SnapOtter. Containersäkerhet, nätverksisolering, Docker-hemligheter, Kubernetes-distribution och efterlevnadsartefakter."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: 82c030bca91d
i18n_hash_version: 2
---

# Säkerhet och härdning {#security-hardening}

SnapOtter bearbetar filer helt och hållet på din infrastruktur. Den skickar anonym, innehållsfri produktanalys och kraschrapporter som standard för att hjälpa till att förbättra projektet. Den skickar aldrig dina filer, filnamn, filinnehåll, OCR-utdata, bildmetadata eller dokumenttext. Valfri feedback skickas endast efter att en användare har skickat in den, endast när analys är aktiverad, och kontaktfält inkluderas endast med uttryckligt kontaktsamtycke. En administratör kan stänga av analys- och feedbackinsamling med ett klick under Settings > System > Privacy, ingen ombyggnad krävs. Filbearbetning stannar alltid inuti din container.

Containern körs som en dedikerad icke-root-användare (`snapotter`) med alla Linux-behörigheter borttagna utom den minsta uppsättning som krävs. För den fullständiga policyn för sårbarhetsrapportering och säkerhetsarkitekturen, se [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) på GitHub.

## Behållarhärdning {#container-hardening}

De kanoniska [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) och [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) Compose-filerna är källan till sanningen. Kopiera inte ett förkortat exempel till produktion; distribuera filen från releasetaggen du verifierade.

Båda stackarna tillämpar följande kontroller:

- Minnes-, swap-, CPU- och PID-gränser innehåller skenande inbyggd bearbetning.
- Varje tjänst tar bort alla Linux-funktioner. Applikationen lägger endast till `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` för volymägande, enkelriktad `gosu`-identitetsminskning och graciös signalvidarebefordran. PostgreSQL och Redis får bara den delmängd som deras officiella startpunkter behöver.
- `security_opt: [no-new-privileges:true]` förhindrar processer i applikations-, PostgreSQL- och Redis-behållare från att få ytterligare privilegier. Detta förblir kompatibelt med `gosu`: ingångspunkten börjar som root, förbereder volymerna och sjunker endast till den dedikerade `snapotter`-användaren.
- PostgreSQL- och Redis-bildingångar fästs av sammanfattning. Applikationen bör på samma sätt fästas till en verifierad release-tagg eller sammanfattning snarare än `latest`.
- Hälsokontroller, begränsad JSON-loggrotation, hållbar Redis AOF och omstartspolicy definieras centralt i de kanoniska filerna.

För en Internet-vänd distribution, bind port 1349 till loopback och avsluta TLS vid en bibehållen omvänd proxy. Skapa unika PostgreSQL- och Redis-uppgifter, lagra hemligheter i skyddade filer eller en hemlighetshanterare och ändra det ursprungliga administratörslösenordet omedelbart.

### Varför `read_only` inte är inställd {#why-read-only-is-not-set}

`read_only: true` är inte inställt eftersom PUID/PGID-ommappning skriver till `/etc/passwd` och `/etc/group` vid start. Om du använder Dockers `--user`-flagga eller Kubernetes `runAsUser` istället för PUID/PGID, kan du säkert aktivera ett skrivskyddat rotfilsystem.

## Nätverksisolering {#network-isolation}

Filbehandlingen är lokal, men en standardinstallation är **inte ett utgångsfritt system**. Anonym produktanalys använder PostHog och kraschrapportering använder Sentry när telemetri är aktiverat. Ställ in `SNAPOTTER_TELEMETRY=0` (eller inaktivera analys under Inställningar > System > Sekretess) för att stänga av båda. SnapOtter inkluderar aldrig uppladdade filer, filnamn, OCR-utdata, dokumenttext eller annat filinnehåll i dessa händelser.

Annan utgående trafik är funktionsdriven: AI-paket/modellinstallation laddar ner signerade release-ingångar; URL-import hämtar en användarbegärd offentlig URL; och explicit konfigurerade OIDC, SAML, OpenTelemetry, webhooks, S3-kompatibel lagring eller liknande integrationer kontaktar de destinationer som administratören valt. Modellnedladdningar under körning är inaktiverade som standard. Ange `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` endast för att uttryckligen aktivera automatiska reservnedladdningar. En [offline-paketimport](/sv/guide/deployment) kan tillhandahålla AI-funktioner utan körtidsmodellutgång.

**Brandväggsrekommendationer:**

|Scenario|Utgående regel|
|---|---|
|Luftgap|Ställ in `SNAPOTTER_TELEMETRY=0` och `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, använd offline AI-paketimport, inaktivera URL-import och externa integrationer, blockera sedan utgående|
|Standard telemetri|Tillåt PostHog- och Sentry-slutpunkterna listade av din webbläsare/nätverksloggar; inaktivera telemetri om policyn inte tillåter dem|
|AI-buntar behövs|Under installationen, tillåt HTTPS till `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; blockera sedan dessa värdar|
|Externa integrationer|Tillåt endast de exakt administratörskonfigurerade OIDC/SAML/OTLP/webhook/object-storage-destinationerna|

Bundle-arkiv serveras från Hugging Faces Xet-lagring, som överförs över `*.xethub.hf.co`-ändpunkterna parallellt och är det som gör nedladdningar av multi-GB-buntar snabba. Om din brandvägg tillåter `huggingface.co` men blockerar `*.xethub.hf.co`, kommer installationerna fortfarande att lyckas men faller tillbaka till en långsammare enkelströmsnedladdning, så godkännandelista Xet-värdarna för att hålla sig på den snabba vägen. Helt offlineinstallationer kan hoppa över allt detta och använda [Offline Bundle Import](/sv/guide/deployment) istället.

För omvänd proxykonfiguration (Nginx, Traefik, Caddy, Cloudflare Tunnels), se [Deployment guide](/sv/guide/deployment#reverse-proxy).

## Docker-hemligheter {#docker-secrets}

För produktionsdistributioner, undvik att skicka hemligheter som klartextmiljövariabler. Startpunkten stöder Dockers `_FILE`-konvention: montera en hemlighet som en fil och ange motsvarande `_FILE`-variabel till dess sökväg.

**Hemligheter som stöds:**

| Variabel | `_FILE`-motsvarighet |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Exempel med Docker Compose-hemligheter:**

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
Docker Compose-hemligheter (utan Swarm) kräver Compose v2.23 eller senare.
:::

## Kubernetes-distribution {#kubernetes-deployment}

Startpunkten upptäcker när containern redan körs som icke-root (t.ex. via Kubernetes `runAsUser`) och hoppar över gosu-privilegiesläppet automatiskt. I det fallet kan den inte köra chown på de monterade volymerna själv, så den verifierar att de är skrivbara och avslutar tidigt med användbar vägledning om de inte är det — se [Lagringsbehörigheter](/sv/guide/deployment#storage-permissions) för `fsGroup`- och främmande-UID-uppsättningar (TrueNAS, OpenShift).

**Rekommenderad Pod SecurityContext:**

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

Eftersom `runAsUser: 999` anges på podnivå hoppar startpunkten över gosu helt. Detta tillåter `allowPrivilegeEscalation: false`- och `drop: [ALL]`-behörigheter utan konflikt.

För resursdimensionering, se [Hårdvarukrav](/sv/guide/deployment#hardware-requirements).

## Säkerhetskopiering och återställning {#backup-and-recovery}

Produktionsstacken Compose definierar fyra volymer. Stoppa ingressen och låt aktiva jobb avslutas innan du tar en koordinerad säkerhetskopia så att PostgreSQL, Redis och filtillstånd beskriver samma tidpunkt.

|Volym|Innehåll|Återhämtningsbehandling|
|---|---|---|
|`SnapOtter-pgdata`|PostgreSQL-användare, inställningar, pipelines, jobb, filmetadata och granskningslogg|Kritisk; använd en felsnabb logisk dump för bärbar återställning|
|`SnapOtter-data`|Sparade biblioteksobjekt, loggar och AI-tillstånd (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Säkerhetskopiera hela volymen; för att spara utrymme, utelämna medvetet alla AI-tillstånd och installera om dess buntar|
|`SnapOtter-redisdata`|Redis AOF för hållbart BullMQ-kötillstånd|Säkerhetskopiera efter att ha pausat appen och tvingat `SAVE`; krävs för att återuppta köarbete exakt|
|`SnapOtter-workspace`|Tillfälliga objektlagringsnycklar (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Säkerhetskopiera inte efter att alla jobb har tömts eller avbrutits; kassera den aldrig medan jobben är aktiva|

Compose prefix normalt volymnamn med projektnamnet. Lös upp den verkliga källvolymen från den monterade behållaren istället för att anta att ett visningsnamn som `SnapOtter-data` är Docker-volymens namn.

### Databassäkerhetskopiering {#database-backup}

Använd PostgreSQL:s anpassade arkivformat och verifiera arkivet innan du behandlar säkerhetskopieringen som komplett:

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

Testa varje säkerhetskopia genom att återställa den till en isolerad stack, kontrollera databasposter och filkontrollsummor och starta programmet. Förvarets `tests/qa/backup-restore-drill.sh` automatiserar den frigöringsgrinden mot en explicit `QA_IMAGE`.

Om din plattform tar kraschkonsistenta volymögonblicksbilder istället, stoppa först hela stacken och ta ögonblicksbilder av alla kritiska volymer som en uppsättning. En rå PostgreSQL-datakatalogkopia från en körande behållare är inte en logisk säkerhetskopia som stöds.

### Säkerhetskopiering av fil och kö {#file-and-queue-backup}

Pausa programmet innan du registrerar fil- och kövolymer. Använd `docker inspect` för att lösa det faktiska volymnamnet, tvinga Redis att bevara sitt nuvarande tillstånd och arkivera med äganderätt och behörigheter bevarade:

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

Starta om Redis före applikationen. Om du avsiktligt utesluter `/data/ai`, ta bort hela AI-underträdet istället för att bevara en `installed.json`-post utan dess modeller eller virtuell miljö. Håll säkerhetskopieringsfiler krypterade, åtkomstkontrollerade och åtskilda från värden som kör SnapOtter.

## Efterlevnadsartefakter {#compliance-artifacts}

Varje SnapOtter-version innehåller följande säkerhetsartefakter:

| Artefakt | Formatera | Var man hittar den |
|---|---|---|
| Släpp ämnesbindning | Canonical JSON + GitHub intyg | [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases) tillgång: `snapotter-v{version}-release-subjects.json` |
| Arkiv SBOM | CycloneDX och SPDX JSON | Frisläppande tillgångar: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Bild SBOM | CycloneDX och SPDX JSON | Frisläppande tillgångar: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Sårbarhetsskanningar | Trivy JSON | Släpp tillgångar med matchande `archive-linux-{arch}`- eller `image-linux-{arch}`-prefix |
| Sårbarhetsskanning | SARIF | Fliken [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security). |
| Statisk analys | CodeQL (JS/TS + Python) | Fliken [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), körs varje vecka + per PR |
| Beroendegranskning | GitHub infödd | Per-PR-kontroll, misslyckas vid tillägg med hög stränghet |
| Python beroende granskning | pip-audit | CI kör logga på varje tryck |
| Säkerhetspolicy | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) i arkivet |
| Beroendeuppdateringar | Dependabot | Automatiserade veckovisa PR för npm, pip, Docker, Actions |

**Kör din egen skanning:**

Ladda ned release-subject-manifestet och verifiera att det intygades av release-arbetsflödet:

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Manifestet registrerar `releaseTag`, `releaseCommit` och `workflowTriggerCommit` separat. Verifiera att `releaseCommit` är commit som tas bort från den oföränderliga taggen, verifiera sedan SHA-256-sammandraget av arkivet, bilden, SBOM eller skanningen som du konsumerar mot dess post i `subjects`. Denna distinktion är avsiktlig: att checka ut en nyskapad release-commit ändrar inte commit-identiteten i arbetsflödets OIDC-referens.

Du kan också skanna en nedladdad SBOM eller bilden direkt:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
Bild SBOMs och skanningar återspeglar den exakta arkitekturspecifika bilden som publicerats för den versionen. Arkiv SBOMs och skanningar beskriver det förbyggda arkivet separat. AI-modellpaket som installerats efter distribution ingår inte i dessa SBOMs eftersom de laddas ner under körning.
:::

---
description: "Säkerhetshärdningsguide för SnapOtter. Containersäkerhet, nätverksisolering, Docker-hemligheter, Kubernetes-driftsättning och efterlevnadsartefakter."
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: 43ac1e1dfd6a
i18n_hash_version: 2
---

# Säkerhet och härdning {#security-hardening}

SnapOtter bearbetar filer helt på din egen infrastruktur. Som standard skickar det anonym, innehållsfri produktanalys och kraschrapporter för att hjälpa till att förbättra projektet. Det skickar aldrig dina filer, filnamn, filinnehåll, OCR-utdata, bildmetadata eller dokumenttext. Valfri feedback skickas först när en användare lämnar in den, bara när analys är aktiverat, och kontaktfält inkluderas bara med uttryckligt samtycke till kontakt. En administratör kan stänga av insamling av analys och feedback med ett klick under Settings > System > Privacy, utan ombyggnad. Filbearbetningen stannar alltid inuti din container.

Containern körs som en dedikerad icke-root-användare (`snapotter`) där alla Linux-capabilities är borttagna utom den nödvändiga minimimängden. För den fullständiga policyn för sårbarhetsrapportering och säkerhetsarkitekturen, se [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) på GitHub.

## Containerhärdning {#container-hardening}

De kanoniska Compose-filerna för [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) och [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) är den auktoritativa källan. Kopiera inte ett förkortat exempel till produktion. Driftsätt filen från den utgåvetagg du har verifierat.

Båda stackarna tillämpar följande kontroller:

- Gränser för minne, swap, CPU och PID begränsar skenande inbyggd bearbetning.
- Varje tjänst tar bort alla Linux-capabilities. Applikationen lägger bara tillbaka `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` för volymägarskap, den enkelriktade identitetsnedgraderingen `gosu` och vidarebefordran av signaler på ett kontrollerat sätt. PostgreSQL och Redis får bara den delmängd som deras officiella entrypoints behöver.
- `security_opt: [no-new-privileges:true]` hindrar processer i applikations-, PostgreSQL- och Redis-containrarna från att få ytterligare privilegier. Det är fortfarande kompatibelt med `gosu`: entrypointen startar som root, förbereder volymerna och byter bara ned till den dedikerade användaren `snapotter`.
- Avbilderna för PostgreSQL och Redis är låsta med digest. Applikationen bör likaså låsas till en verifierad utgåvetagg eller ett digest i stället för `latest`.
- Hälsokontroller, begränsad JSON-loggrotation, beständig Redis AOF och omstartspolicy definieras centralt i de kanoniska filerna.

För en driftsättning mot internet, bind port 1349 till loopback och avsluta TLS i en underhållen omvänd proxy. Generera unika inloggningsuppgifter för PostgreSQL och Redis, lagra hemligheter i skyddade filer eller en hemlighetshanterare och byt det ursprungliga administratörslösenordet direkt.

### Varför `read_only` inte är angivet {#why-read-only-is-not-set}

`read_only: true` är inte angivet eftersom omkartläggning av PUID/PGID skriver till `/etc/passwd` och `/etc/group` vid start. Om du använder Dockers flagga `--user` eller Kubernetes `runAsUser` i stället för PUID/PGID kan du säkert aktivera ett skrivskyddat rotfilsystem.

## Nätverksisolering {#network-isolation}

Filbearbetningen är lokal, men en standardinstallation är **inte ett system utan utgående trafik**. Anonym produktanalys använder PostHog och kraschrapportering använder Sentry när telemetri är aktiverad. Ange `SNAPOTTER_TELEMETRY=0` (eller stäng av analys under Settings > System > Privacy) för att stänga av båda. SnapOtter tar aldrig med uppladdade filer, filnamn, OCR-utdata, dokumenttext eller annat filinnehåll i dessa händelser.

Annan utgående trafik styrs av funktioner: installation av AI-paket och modeller laddar ned signerade utgåveindata, URL-import hämtar en offentlig URL som användaren begär, och uttryckligen konfigurerade OIDC, SAML, OpenTelemetry, webhooks, S3-kompatibel lagring eller liknande integrationer kontaktar de mål som administratören har valt. Nedladdning av modeller vid körning är avstängd som standard. Ange `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` endast för att uttryckligen välja automatiska reservnedladdningar. En [import av offlinepaket](/sv/guide/deployment) kan tillhandahålla AI-funktioner utan utgående trafik för modeller vid körning.

**Rekommendationer för brandvägg:**

| Scenario | Regel för utgående trafik |
|---|---|
| Luftgapad | Ange `SNAPOTTER_TELEMETRY=0` och `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, använd import av AI-paket offline, stäng av URL-import och externa integrationer, blockera sedan utgående trafik |
| Standardtelemetri | Tillåt de PostHog- och Sentry-slutpunkter som visas i webbläsarens eller nätverkets loggar. Stäng av telemetri om policyn inte tillåter dem |
| AI-paket behövs | Tillåt HTTPS till `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org` under installationen, blockera sedan dessa värdar |
| Externa integrationer | Tillåt bara de exakta OIDC/SAML/OTLP/webhook/objektlagringsmål som administratören har konfigurerat |

Paketarkiv serveras från Hugging Faces Xet-lagring, som överför över slutpunkterna `*.xethub.hf.co` parallellt och är det som gör att nedladdningar av paket på flera GB går snabbt. Om din brandvägg tillåter `huggingface.co` men blockerar `*.xethub.hf.co` lyckas installationerna ändå men faller tillbaka på en långsammare nedladdning med en enda ström, så tillåtslista Xet-värdarna för att hålla dig på den snabba vägen. Helt offlineinstallationer kan hoppa över allt detta och använda [Import av offlinepaket](/sv/guide/deployment) i stället.

För konfiguration av omvänd proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), se [Driftsättningsguiden](/sv/guide/deployment#reverse-proxy).

## Docker-hemligheter {#docker-secrets}

I produktionsdriftsättningar bör du undvika att skicka hemligheter som miljövariabler i klartext. Entrypointen stöder Dockers konvention `_FILE`: montera en hemlighet som en fil och ange motsvarande variabel `_FILE` till dess sökväg.

**Hemligheter som stöds:**

| Variabel | Motsvarighet med `_FILE` |
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

## Kubernetes-driftsättning {#kubernetes-deployment}

Entrypointen upptäcker när containern redan körs som icke-root (t.ex. via Kubernetes `runAsUser`) och hoppar automatiskt över gosu-privilegienedgraderingen. I så fall kan den inte själv köra chown på de monterade volymerna, så den kontrollerar att de är skrivbara och avslutar tidigt med användbar vägledning om de inte är det. Se [Lagringsbehörigheter](/sv/guide/deployment#storage-permissions) för `fsGroup` och uppsättningar med främmande UID (TrueNAS, OpenShift).

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

Eftersom `runAsUser: 999` anges på podnivå hoppar entrypointen över gosu helt. Det gör att capabilities `allowPrivilegeEscalation: false` och `drop: [ALL]` kan användas utan konflikt.

För dimensionering av resurser, se [Hårdvarukrav](/sv/guide/deployment#hardware-requirements).

## Säkerhetskopiering och återställning {#backup-and-recovery}

Compose-stacken för produktion definierar fyra volymer. Stoppa inkommande trafik och låt aktiva jobb bli klara innan du tar en samordnad säkerhetskopia, så att PostgreSQL, Redis och filtillstånd beskriver samma tidpunkt.

| Volym | Innehåll | Hantering vid återställning |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL-användare, inställningar, pipelines, jobb, filmetadata och granskningslogg | Kritisk. Använd en logisk dump som avbryts vid första fel för portabel återställning |
| `SnapOtter-data` | Sparade biblioteksobjekt, loggar och AI-tillstånd (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Säkerhetskopiera hela volymen. För att spara utrymme, utelämna medvetet allt AI-tillstånd och installera om dess paket |
| `SnapOtter-redisdata` | Redis AOF för beständigt BullMQ-könstillstånd | Säkerhetskopiera efter att ha pausat appen och framtvingat `SAVE`. Krävs för att återuppta köat arbete exakt |
| `SnapOtter-workspace` | Tillfälliga objektlagringsnycklar (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Säkerhetskopiera inte. Töm eller avbryt alla jobb först, och kasta aldrig bort den medan jobb är aktiva |

Compose lägger normalt projektnamnet som prefix på volymnamn. Ta reda på den verkliga källvolymen från den monterade containern i stället för att anta att ett visningsnamn som `SnapOtter-data` är Docker-volymens namn.

### Databassäkerhetskopia {#database-backup}

Använd PostgreSQL:s anpassade arkivformat och verifiera arkivet innan du betraktar säkerhetskopian som komplett:

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

Testa varje säkerhetskopia genom att återställa den i en isolerad stack, kontrollera databasposter och filkontrollsummor och starta applikationen. Repositoryts `tests/qa/backup-restore-drill.sh` automatiserar den utgåvekontrollen mot en uttrycklig `QA_IMAGE`.

Om din plattform i stället tar ögonblicksbilder av volymer som är kraschkonsistenta, stoppa först hela stacken och ta ögonblicksbild av alla kritiska volymer som en uppsättning. En rå kopia av PostgreSQL:s datakatalog från en körande container är ingen logisk säkerhetskopia som stöds.

### Säkerhetskopia av filer och köer {#file-and-queue-backup}

Pausa applikationen innan du tar fil- och könvolymerna. Använd `docker inspect` för att ta reda på det faktiska volymnamnet, tvinga Redis att spara sitt aktuella tillstånd och arkivera med ägarskap och behörigheter bevarade:

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

Starta om Redis före applikationen. Om du medvetet utesluter `/data/ai`, ta bort hela AI-underträdet i stället för att bevara en post för `installed.json` utan dess modeller eller virtuella miljö. Håll säkerhetskopior krypterade, åtkomstkontrollerade och åtskilda från värden som kör SnapOtter.

## Efterlevnadsartefakter {#compliance-artifacts}

Varje SnapOtter-utgåva innehåller följande säkerhetsartefakter:

| Artefakt | Format | Var du hittar den |
|---|---|---|
| Bindning av utgåveämne | Kanonisk JSON + GitHub-attestering | Tillgång i [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM för arkiv | CycloneDX och SPDX JSON | Utgåvetillgångar: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM för avbild | CycloneDX och SPDX JSON | Utgåvetillgångar: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Sårbarhetsskanningar | Trivy JSON | Utgåvetillgångar med matchande prefix `archive-linux-{arch}` eller `image-linux-{arch}` |
| Sårbarhetsskanning | SARIF | Fliken [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Statisk analys | CodeQL (JS/TS + Python) | Fliken [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), körs varje vecka + per PR |
| Beroendegranskning | GitHub, inbyggd | Kontroll per PR, misslyckas vid tillägg med hög allvarlighetsgrad |
| Granskning av Python-beroenden | pip-audit | CI-körningslogg vid varje push |
| Säkerhetspolicy | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) i repositoryt |
| Beroendeuppdateringar | Dependabot | Automatiska veckovisa PR:er för npm, pip, Docker, Actions |

**Köra din egen skanning:**

Ladda ned manifestet för utgåveämnet och verifiera att det attesterades av utgåvearbetsflödet:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Manifestet registrerar `releaseTag`, `releaseCommit` och `workflowTriggerCommit` separat. Verifiera att `releaseCommit` är den commit som avlästs från den oföränderliga taggen, och verifiera sedan SHA-256-digestet för det arkiv, den avbild, den SBOM eller den skanning du använder mot dess post i `subjects`. Skillnaden är avsiktlig: att checka ut en nyskapad utgåvecommit ändrar inte commit-identiteten i arbetsflödets OIDC-referens.

Du kan också skanna en nedladdad SBOM eller själva avbilden direkt:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
SBOM:er och skanningar för avbilder speglar den exakta arkitekturspecifika avbild som publicerades för den utgåvan. SBOM:er och skanningar för arkiv beskriver det förbyggda arkivet separat. AI-modellpaket som installeras efter driftsättning ingår inte i dessa SBOM:er eftersom de laddas ned vid körning.
:::

---
description: "Alle SnapOtter-omgevingsvariabelen met standaardwaarden. Configureer authenticatie, opslag, AI-modellen, analytics en meer."
i18n_source_hash: 25970c776f7c
i18n_provenance: human
i18n_output_hash: 05e18ac893a3
i18n_hash_version: 2
---

# Configuratie {#configuration}

Alle configuratie gebeurt via omgevingsvariabelen. Elke variabele heeft een verstandige standaardwaarde, zodat SnapOtter direct werkt zonder er ook maar één in te stellen.

## Omgevingsvariabelen {#environment-variables}

### Server {#server}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `PORT` | `1349` | Poort waarop de server luistert. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maximaal aantal verzoeken per minuut per IP. Stel in op 0 om rate limiting uit te schakelen. |
| `CORS_ORIGIN` | (leeg) | Door komma's gescheiden toegestane origins voor CORS, of leeg voor alleen dezelfde origin. |
| `LOG_LEVEL` | `info` | Uitgebreidheid van logging. Een van: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Welke peers het client-IP via `X-Forwarded-For` mogen zetten. De standaardwaarde gelooft alleen een peer uit een privénetwerk, dus een reverse proxy op een Docker-netwerk of in een LAN wordt vertrouwd en de vervalste header van een publieke client niet. Stel alleen `true` in wanneer er een proxy die jij beheert vóór zit op een openbaar adres. |

### Authenticatie {#authentication}

De twee booleans hieronder accepteren alleen `true` en `false`. Al het andere, `1` of `yes` of `on`, komt niet door de validatie en de server stopt voordat hij begint te luisteren.

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `AUTH_ENABLED` | `true` | Vereist aanmelden. Stel in op `false` om helemaal zonder accounts te draaien, wat elk verzoek adminrechten geeft, dus houd dat op een vertrouwd netwerk. |
| `DEFAULT_USERNAME` | `admin` | Gebruikersnaam voor het initiële adminaccount. Wordt alleen bij de eerste keer opstarten gebruikt. |
| `DEFAULT_PASSWORD` | `admin` | Wachtwoord voor het initiële adminaccount. Wijzig dit na de eerste keer aanmelden. |
| `MAX_USERS` | `0` (onbeperkt) | Maximaal aantal geregistreerde gebruikersaccounts. Stel in op 0 voor onbeperkt. |
| `SESSION_DURATION_HOURS` | `168` | Levensduur van de aanmeldsessie in uren (standaard 7 dagen). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Stel in op `true` om de verplichte wachtwoordwijzigingsprompt bij de eerste aanmelding over te slaan. |

### Opslag {#storage}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` of `s3`. S3 en MinIO vereisen een licentie met de s3_storage-functie plus de `S3_*`-variabelen hieronder. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL-connectiestring. De Compose-stack wijst deze naar zijn `postgres`-service; laat hem leeg (samen met `REDIS_URL`) om de ingebedde modus te krijgen. |
| `REDIS_URL` | `redis://localhost:6379` | Redis-connectiestring (gebruikt voor BullMQ-taakwachtrijen). Compose wijst deze naar zijn `redis`-service. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Map voor tijdelijke bestanden tijdens de verwerking. Wordt automatisch opgeschoond. De image stelt `/tmp/workspace` in. |
| `FILES_STORAGE_PATH` | `./data/files` | Map voor persistente gebruikersbestanden (geüploade afbeeldingen, opgeslagen resultaten). De image stelt `/data/files` in. |

### S3-objectopslag {#s3-object-storage}

Wordt alleen gelezen wanneer `STORAGE_MODE=s3`. Ontbreekt een van de drie verplichte variabelen, dan mislukt het opstarten met de naam van de variabele die je hebt weggelaten.

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `S3_BUCKET` | (leeg) | Bucket die uploads en uitvoer bevat. Verplicht. |
| `S3_ACCESS_KEY_ID` | (leeg) | Access key. Verplicht. In de container kun je hem in plaats daarvan koppelen, via `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (leeg) | Secret key. Verplicht. Dezelfde bestandsconventie: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Regio van de bucket. |
| `S3_ENDPOINT` | (leeg) | Aangepast endpoint voor MinIO, R2, Backblaze en andere S3-compatibele opslag. Leeg betekent AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Stel in op `true` voor MinIO en al het andere dat `endpoint/bucket/key` wil in plaats van virtual-hostadressering. |
| `S3_PREFIX` | (leeg) | Sleutelprefix, zodat één bucket meerdere instanties kan bevatten. |

### Versleuteling in rust {#encryption-at-rest}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (leeg) | 64 hexadecimale tekens (32 bytes). Versleutelt gevoelige instellingen die in de database zijn opgeslagen. Alles wat geen 64 hexadecimale tekens is, wordt bij het opstarten geweigerd. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (leeg) | De sleutel waar je vanaf roteert, met dezelfde indeling. Stel beide in tijdens een rotatie zodat bestaande rijen nog steeds ontsleuteld worden, en verwijder deze daarna. |

### Ingebedde modus {#embedded-mode}

Draai de image zonder `DATABASE_URL` en zonder `REDIS_URL` en hij start zijn eigen PostgreSQL 17 en Redis binnen de container, gebonden aan loopback, met alle gegevens op het `/data`-volume. Dit herstelt de `docker run`-ervaring met één commando voor snelle start, homelab en upgrades vanaf 1.x. Het is een gemakspad, geen productiedeployment: draai voor productie de Compose-stack met 3 containers met aparte PostgreSQL en Redis. De ingebedde modus vereist dat de container als root draait en is niet compatibel met runtimes met een willekeurige UID (OpenShift, Kubernetes `runAsNonRoot`); gebruik daar Compose.

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `EMBEDDED` | `auto` | Automatisch ingeschakeld wanneer zowel `DATABASE_URL` als `REDIS_URL` niet zijn ingesteld. Stel in op `0` om het uit te schakelen (de app faalt dan direct als er geen externe `DATABASE_URL`/`REDIS_URL` is ingesteld, in plaats van stilletjes een database binnen de container te starten). |
| `REDIS_MAXMEMORY` | `512mb` | Geheugenlimiet voor de ingebedde Redis (alleen in de ingebedde modus). Verlaag deze op hosts met beperkt geheugen, zoals een Raspberry Pi. |

Upgraden vanaf 1.x: plaats je oude `snapotter.db` op `/data/snapotter.db` in het volume en de ingebedde modus importeert het bij de eerste keer opstarten in de ingebedde PostgreSQL. De import draait één keer; latere opstarts slaan deze over.

Opmerking over telemetrie: de ingebedde modus erft de analytics-standaard van de image net als elke andere configuratie. De gepubliceerde image wordt geleverd met analytics aan; bouw met `--build-arg SNAPOTTER_ANALYTICS=off`, of gebruik de admin-opt-out in de app, om het uit te schakelen.

### Verwerkingslimieten {#processing-limits}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (onbeperkt) | Maximale bestandsgrootte per upload in megabytes. Stel in op 0 voor onbeperkt. De gepubliceerde image wordt geleverd met `0`; een build vanaf de broncode begint op 100. |
| `MAX_BATCH_SIZE` | `0` (onbeperkt) | Maximaal aantal bestanden in één batchverzoek. Stel in op 0 voor onbeperkt. De gepubliceerde image wordt geleverd met `0`; een build vanaf de broncode begint op 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Aantal batchtaken dat parallel draait. Stel in op 0 om automatisch te detecteren op basis van beschikbare CPU-cores. |
| `MAX_MEGAPIXELS` | `0` (onbeperkt) | Maximaal toegestane beeldresolutie in megapixels. Stel in op 0 voor onbeperkt. |
| `MAX_WORKER_THREADS` | `0` (auto) | Maximaal aantal worker-threads voor beeldverwerking. Stel in op 0 om automatisch te detecteren op basis van beschikbare CPU-cores. |
| `PROCESSING_TIMEOUT_S` | `0` (geen limiet) | Maximale verwerkingstijd per verzoek in seconden. Stel in op 0 voor geen timeout. |
| `MAX_PIPELINE_STEPS` | `20` | Maximaal aantal stappen in een pijplijn. Stel in op 0 voor geen limiet. |
| `MAX_CANVAS_PIXELS` | `0` (geen limiet) | Maximale canvasgrootte in pixels voor uitvoerafbeeldingen. Stel in op 0 voor geen limiet. |
| `MAX_SVG_SIZE_MB` | `50` | Grootste SVG die vóór het opschonen wordt geaccepteerd, in megabytes. `0` gedraagt zich hier anders dan in de rijen eromheen. Het verwijdert de groottelimiet vóór het parsen volledig in plaats van hem te verhogen, dus laat deze ingesteld staan. |
| `MAX_PDF_PAGES` | `0` (onbeperkt) | Maximaal aantal PDF-pagina's voor PDF-naar-image-conversie. Stel in op 0 voor onbeperkt. |

### Opschoning {#cleanup}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Hoe lang niet-opgeslagen verwerkingsresultaten (ruwe uploads en tooluitvoer) worden bewaard vóór automatische verwijdering. Bestanden die je expliciet opslaat in de Files-bibliotheek worden niet beïnvloed en blijven bestaan totdat je ze verwijdert. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Hoe vaak de opschoontaak draait. |

### Weergave {#appearance}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `DEFAULT_THEME` | `light` | Standaardthema voor nieuwe sessies. `light`, `dark` of `system`. |
| `DEFAULT_LOCALE` | `en` | Standaardtaal van de interface. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Standaard toollay-out. `sidebar` of `fullscreen`. |

### Docker-permissies {#docker-permissions}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `PUID` | `999` | Draai het containerproces als deze UID. Stel in om overeen te komen met je hostgebruiker voor bind mounts (`id -u`). |
| `PGID` | `999` | Draai het containerproces als deze GID. Stel in om overeen te komen met je hostgroep voor bind mounts (`id -g`). |

## Docker-voorbeeld {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Wijzig dit voor niet-lokale implementaties
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

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

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Volumes {#volumes}

De Docker Compose-stack gebruikt vier volumes:

- `/data` (app) - AI-modellen, Python-venv en gebruikersbestanden. Koppel dit om geüploade bestanden en geïnstalleerde AI-bundels te behouden bij herstarts.
- `/tmp/workspace` (app) - Tijdelijke opslag voor bestanden die worden verwerkt. Dit mag vluchtig zijn, maar het koppelen ervan voorkomt dat de beschrijfbare laag van de container volloopt.
- `SnapOtter-pgdata` (postgres) - PostgreSQL-datamap. Deze bevat alle relationele gegevens (gebruikers, instellingen, pijplijnen, taken, auditlog). Maak een back-up via `pg_dump` of een volumesnapshot.
- `SnapOtter-redisdata` (redis) - Redis append-only-bestand voor duurzame taakwachtrijen.

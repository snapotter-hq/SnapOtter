---
description: "Alle SnapOtter-omgevingsvariabelen met standaardwaarden. Configureer authenticatie, opslag, AI-modellen, analytics en meer."
i18n_source_hash: caa895c0ba16
i18n_provenance: machine
i18n_output_hash: e068968cb111
i18n_hash_version: 2
---

# Configuratie {#configuration}

Alle configuratie verloopt via omgevingsvariabelen. Elke variabele heeft een zinvolle standaardwaarde, dus SnapOtter werkt direct zonder dat u er een instelt.

## Omgevingsvariabelen {#environment-variables}

### Server {#server}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `PORT` | `1349` | Poort waarop de server luistert. |
| `BASE_PATH` | (leeg) | Openbaar implementatiepad, bijvoorbeeld `/snapotter`. Leeg of `/` serveert op de hoofdmap van het domein. Wordt tijdens runtime toegepast; er is geen nieuwe image-build nodig. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maximaal aantal verzoeken per minuut per IP. Stel in op 0 om rate limiting uit te schakelen. |
| `CORS_ORIGIN` | (leeg) | Kommagescheiden toegestane origins voor CORS, of leeg voor alleen dezelfde origin. |
| `LOG_LEVEL` | `info` | Uitgebreidheid van de logging. Een van: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Welke peers het client-IP mogen instellen via `X-Forwarded-For`. De standaardinstelling vertrouwt alleen een peer in een privénetwerk, zodat een reverse proxy op een Docker-netwerk of LAN wordt vertrouwd en een vervalste header van een publieke client niet. Stel `true` alleen in als er een proxy onder uw beheer op een openbaar adres voor staat. |

### Authenticatie {#authentication}

De twee booleans hieronder accepteren alleen `true` en `false`. Al het andere, `1` of `yes` of `on`, mislukt bij de validatie en de server stopt voordat hij gaat luisteren.

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `AUTH_ENABLED` | `true` | Vereis een login. Stel in op `false` om zonder accounts te draaien, waardoor elk verzoek beheerdersrechten krijgt. Beperk dat dus tot een vertrouwd netwerk. |
| `DEFAULT_USERNAME` | `admin` | Gebruikersnaam voor het eerste beheerdersaccount. Wordt alleen bij de eerste start gebruikt. |
| `DEFAULT_PASSWORD` | `admin` | Wachtwoord voor het eerste beheerdersaccount. Wijzig dit na de eerste login. |
| `MAX_USERS` | `0` (onbeperkt) | Maximaal aantal geregistreerde gebruikersaccounts. Stel in op 0 voor onbeperkt. |
| `SESSION_DURATION_HOURS` | `168` | Levensduur van een loginsessie in uren (standaard 7 dagen). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Stel in op `true` om de verplichte wachtwoordwijziging bij de eerste login over te slaan. |

### Opslag {#storage}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` of `s3`. S3 en MinIO vereisen een licentie met de functie s3_storage plus de onderstaande `S3_*`-variabelen. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL-verbindingsreeks, en de verbinding waarop elk verzoek wordt afgehandeld. Vanaf 2.3.0 geldt: stel ook `DATABASE_MIGRATION_URL` in en dit wordt de runtimerol met minimale rechten, die alleen DML heeft op de tabellen van de app en niets anders. De Compose-stack wijst het naar de service `postgres`; laat het (samen met `REDIS_URL`) ongedefinieerd om de embedded-modus te krijgen. |
| `DATABASE_MIGRATION_URL` | (leeg) | Bevoorrechte verbinding, alleen tijdens het opstarten gebruikt om migraties uit te voeren en de runtimerol rechten te geven, en gesloten vóór het eerste verzoek. Laat u dit leeg, dan draait SnapOtter met één rol, waarbij `DATABASE_URL` beide taken uitvoert. Zie [Rollen met minimale rechten](/ja/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Redis-verbindingsreeks (gebruikt voor BullMQ-jobwachtrijen). Compose wijst dit naar de service `redis`. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Map voor tijdelijke bestanden tijdens de verwerking. Wordt automatisch opgeruimd. De image stelt `/tmp/workspace` in. |
| `FILES_STORAGE_PATH` | `./data/files` | Map voor permanente gebruikersbestanden (geüploade afbeeldingen, opgeslagen resultaten). De image stelt `/data/files` in. |

### S3-objectopslag {#s3-object-storage}

Wordt alleen gelezen wanneer `STORAGE_MODE=s3`. Ontbreekt een van de drie verplichte variabelen, dan mislukt het opstarten met de naam van de variabele die u hebt weggelaten.

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `S3_BUCKET` | (leeg) | Bucket met uploads en uitvoer. Verplicht. |
| `S3_ACCESS_KEY_ID` | (leeg) | Toegangssleutel. Verplicht. In de container kunt u deze in plaats daarvan mounten via `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (leeg) | Geheime sleutel. Verplicht. Zelfde bestandsconventie: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Regio van de bucket. |
| `S3_ENDPOINT` | (leeg) | Aangepast eindpunt voor MinIO, R2, Backblaze en andere S3-compatibele opslag. Leeg betekent AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Stel in op `true` voor MinIO en al het andere dat `endpoint/bucket/key` wil in plaats van virtual-host-adressering. |
| `S3_PREFIX` | (leeg) | Sleutelvoorvoegsel, zodat één bucket meerdere instanties kan bevatten. |

### Versleuteling in rust {#encryption-at-rest}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (leeg) | 64 hexadecimale tekens (32 bytes). Versleutelt gevoelige instellingen die in de database zijn opgeslagen. Alles wat geen 64 hexadecimale tekens is, wordt bij het opstarten geweigerd. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (leeg) | De sleutel waarvan u afstapt, in hetzelfde formaat. Stel beide in tijdens een rotatie zodat bestaande rijen nog kunnen worden ontsleuteld, en verwijder deze daarna. |

### Embedded-modus {#embedded-mode}

Start u de image zonder `DATABASE_URL` en zonder `REDIS_URL`, dan start hij binnen de container zijn eigen PostgreSQL 17 en Redis, gebonden aan loopback, met alle gegevens op het volume `/data`. Dit herstelt de ervaring met één enkel `docker run`-commando voor snel starten, homelab en upgrades vanaf 1.x. Het is een gemaksroute, geen productie-implementatie: draai voor productie de Compose-stack met drie containers en aparte PostgreSQL en Redis. De embedded-modus vereist dat de container als root draait en is niet compatibel met runtimes met willekeurige UID (OpenShift, Kubernetes `runAsNonRoot`); gebruik daar Compose.

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `EMBEDDED` | `auto` | Wordt automatisch ingeschakeld wanneer zowel `DATABASE_URL` als `REDIS_URL` niet zijn ingesteld. Stel in op `0` om uit te schakelen (de app stopt dan direct als er geen externe `DATABASE_URL`/`REDIS_URL` is ingesteld, in plaats van stilzwijgend een database in de container te starten). |
| `REDIS_MAXMEMORY` | `512mb` | Geheugenlimiet voor de embedded Redis (alleen embedded-modus). Verlaag deze op hosts met weinig geheugen, zoals een Raspberry Pi. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Aantal seconden dat het opstarten wacht tot de embedded Redis antwoordt op `PING` voordat het opgeeft. Bij een time-out stopt de container en logt hij waarom, in plaats van te blijven hangen. Hele seconden van 1 tot 999999; er is geen onbeperkte waarde, omdat eindeloos wachten juist de storing is die deze grens moet voorkomen. Verhoog dit alleen als een trage host de grens bereikt. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Hetzelfde, voor de embedded PostgreSQL. De klok start nadat `initdb` bij de eerste start klaar is, dus hij dekt het starten van de server en het herstel na een crash, niet het aanmaken van de database zelf. |

Upgraden vanaf 1.x: plaats uw oude `snapotter.db` op `/data/snapotter.db` in het volume en de embedded-modus importeert het bij de eerste start in de embedded PostgreSQL. De import wordt één keer uitgevoerd; latere starts slaan hem over.

Opmerking over telemetrie: de embedded-modus erft de analytics-standaard van de image, net als elke andere configuratie. De gepubliceerde image wordt geleverd met analytics ingeschakeld; bouw met `--build-arg SNAPOTTER_ANALYTICS=off`, of gebruik de opt-out voor beheerders in de app, om dit uit te schakelen.

### Verwerkingslimieten {#processing-limits}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (onbeperkt) | Maximale bestandsgrootte per upload in megabytes. Stel in op 0 voor onbeperkt. De gepubliceerde image levert `0`; een build vanuit de broncode begint op 100. |
| `MAX_BATCH_SIZE` | `0` (onbeperkt) | Maximaal aantal bestanden in één batchverzoek. Stel in op 0 voor onbeperkt. De gepubliceerde image levert `0`; een build vanuit de broncode begint op 100. |
| `CONCURRENT_JOBS` | `0` (automatisch) | Aantal batchjobs dat parallel draait. Stel in op 0 om automatisch te bepalen op basis van de beschikbare CPU-kernen. |
| `MAX_MEGAPIXELS` | `0` (onbeperkt) | Maximaal toegestane afbeeldingsresolutie in megapixels. Stel in op 0 voor onbeperkt. |
| `MAX_WORKER_THREADS` | `0` (automatisch) | Maximaal aantal workerthreads voor beeldverwerking. Stel in op 0 om automatisch te bepalen op basis van de beschikbare CPU-kernen. |
| `PROCESSING_TIMEOUT_S` | `0` (geen limiet) | Maximale verwerkingstijd per verzoek in seconden. Stel in op 0 voor geen time-out. |
| `MAX_PIPELINE_STEPS` | `20` | Maximaal aantal stappen in een pipeline. Stel in op 0 voor geen limiet. |
| `MAX_CANVAS_PIXELS` | `0` (geen limiet) | Maximale canvasgrootte in pixels voor uitvoerafbeeldingen. Stel in op 0 voor geen limiet. |
| `MAX_SVG_SIZE_MB` | `50` | Grootste SVG die vóór het opschonen wordt geaccepteerd, in megabytes. `0` gedraagt zich hier anders dan in de rijen eromheen. Het verwijdert de groottelimiet vóór het parsen volledig in plaats van die te verhogen, dus laat deze ingesteld. |
| `MAX_PDF_PAGES` | `0` (onbeperkt) | Maximaal aantal PDF-pagina's voor PDF-naar-afbeelding-conversie. Stel in op 0 voor onbeperkt. |

### Engines {#engines}

SnapOtter zoekt elk verwerkingsprogramma op `$PATH` binnen de container, dus deze blijven leeg tenzij u een eigen build mount.

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `FFMPEG_PATH` | (leeg) | Pad naar het programma `ffmpeg` achter de video- en audiotools. |
| `FFPROBE_PATH` | (leeg) | Pad naar `ffprobe`, dat mediabestanden leest voordat ze worden verwerkt. Wijs het naar dezelfde build als `FFMPEG_PATH`. |
| `QPDF_PATH` | (leeg) | Pad naar `qpdf`, gebruikt door de PDF-tools en om geüploade PDF's te controleren. |
| `SOFFICE_PATH` | (leeg) | Pad naar `soffice` van LibreOffice, gebruikt voor conversies van kantoordocumenten. |
| `PDFCPU_PATH` | (leeg) | Pad naar `pdfcpu`, gebruikt door sommige PDF-tools. |
| `SNAPOTTER_HW_ACCEL` | (leeg) | Familie van hardwarematige video-encoders, `nvenc` of `vaapi`. Leeg codeert in software. |

`SNAPOTTER_HW_ACCEL` vereist een ffmpeg die met die encoderfamilie is gebouwd, en de ffmpeg in de image heeft geen van beide. Met het eigen programma van de image valt de instelling terug op software-encodering en meldt dat in het opstartlog. Om het te gebruiken mount u uw eigen ffmpeg-build, wijst u `FFMPEG_PATH` en `FFPROBE_PATH` ernaar en geeft u de container het GPU-apparaat. Stel voor `nvenc` ook `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video` in: de image vraagt alleen om `compute,utility`, en zonder `video` mount de NVIDIA-runtime de encodeerbibliotheek niet, zodat de encoder wel wordt vermeld maar elke encodering mislukt. Een padoverschrijving die niet bestaat of niet uitvoerbaar is, wordt eveneens in het opstartlog genoemd, en elke job die dat programma nodig heeft mislukt totdat u het pad herstelt of de instelling verwijdert.

De gepubliceerde Compose-bestanden geven alle zes door vanuit `.env`, dus instellen daar volstaat.

### Opschonen {#cleanup}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Hoe lang niet-opgeslagen verwerkingsresultaten (ruwe uploads en toolresultaten) worden bewaard vóór automatische verwijdering. Bestanden die u expliciet in de bestandenbibliotheek opslaat, worden niet beïnvloed en blijven bestaan totdat u ze verwijdert. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Hoe vaak de opschoontaak draait. |

### Uiterlijk {#appearance}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `DEFAULT_THEME` | `light` | Standaardthema voor nieuwe sessies. `light`, `dark` of `system`. |
| `DEFAULT_LOCALE` | `en` | Standaardtaal van de interface. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Standaardindeling van de tools. `sidebar` of `fullscreen`. |

### Docker-rechten {#docker-permissions}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `PUID` | `999` | Draai het containerproces onder deze UID. Stel in op die van uw hostgebruiker voor bind mounts (`id -u`). |
| `PGID` | `999` | Draai het containerproces onder deze GID. Stel in op die van uw hostgroep voor bind mounts (`id -g`). |

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
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
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

- `/data` (app) - AI-modellen, Python-venv en gebruikersbestanden. Mount dit om geüploade bestanden en geïnstalleerde AI-bundels te behouden na herstarts.
- `/tmp/workspace` (app) - Tijdelijke opslag voor bestanden die worden verwerkt. Dit mag vluchtig zijn, maar door het te mounten voorkomt u dat de beschrijfbare laag van de container volloopt.
- `SnapOtter-pgdata` (postgres) - PostgreSQL-gegevensmap. Hierin staan alle relationele gegevens (gebruikers, instellingen, pipelines, jobs, auditlog). Maak een back-up via `pg_dump` of een volume-snapshot.
- `SnapOtter-redisdata` (redis) - Append-only-bestand van Redis voor duurzame jobwachtrijen.

---
description: "Alla miljövariabler i SnapOtter med standardvärden. Konfigurera autentisering, lagring, AI-modeller, analys med mera."
i18n_source_hash: 02edb8bd70e5
i18n_provenance: machine
i18n_output_hash: 7cc4e9e29d3b
i18n_hash_version: 2
---

# Konfiguration {#configuration}

All konfiguration görs med miljövariabler. Varje variabel har ett rimligt standardvärde, så SnapOtter fungerar direkt utan att någon av dem sätts.

## Miljövariabler {#environment-variables}

### Server {#server}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `PORT` | `1349` | Porten som servern lyssnar på. |
| `HOST` | `0.0.0.0` | IP-adressen som servern lyssnar på. I ett bridge-nätverk (standard för `docker run` och Compose) behåller du `0.0.0.0` (eller `::`), annars slutar publicerade portar att fungera. Vid en native-installation eller en container i värdens nätverk håller `127.0.0.1` API:t borta från nätverket; placera en omvänd proxy framför för fjärråtkomst. [Inbäddat läge](#embedded-mode) fungerar bara med `0.0.0.0`, `::` eller `127.0.0.1`, eftersom dess startkontroll anropar `127.0.0.1`. Med någon annan adress, `::1` inräknad, räknas containern aldrig som startad, och en senare krasch stoppar den i stället för att starta om servern. Allt som inte är en IP-adress, `localhost` inräknat, stoppar servern vid uppstart. |
| `BASE_PATH` | (tom) | Publik distributionssökväg, t.ex. `/snapotter`. Tom eller `/` serverar på domänens rot. Tillämpas vid körning; ingen ombyggnad av avbilden krävs. |
| `RATE_LIMIT_PER_MIN` | `1000` | Högsta antal förfrågningar per minut och IP. Ange 0 för att inaktivera hastighetsbegränsning. |
| `CORS_ORIGIN` | (tom) | Kommaseparerade tillåtna ursprung för CORS, eller tom för endast samma ursprung. |
| `LOG_LEVEL` | `info` | Loggningsnivå. En av: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Vilka peers som får ange klientens IP via `X-Forwarded-For`. Standardvärdet litar bara på en peer i ett privat nätverk, så en omvänd proxy i ett Docker-nätverk eller ett LAN är betrodd medan en falsk rubrik från en publik klient inte är det. Ange `true` endast när en proxy som du kontrollerar står framför på en publik adress. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | (inte satt) | Besvarar analysfrågan vid första starten i förväg, så att ingen tillfrågas. Om den inte är satt frågar en ny instans sin administratör och skickar ingenting förrän den fått svar. `off` startar den med ”Anonymous Product Analytics” avstängt; `on` startar den påslagen. Den fyller bara i inställningen så länge ingen har valt ett värde. När inställningen väl har sparats, av en administratör eller av denna variabel, gör en ändring av variabeln ingenting; en administratör kan fortfarande ändra den under Settings > System > Privacy. |

### Autentisering {#authentication}

De två booleska värdena nedan accepterar bara `true` och `false`. Allt annat, `1` eller `yes` eller `on`, misslyckas vid valideringen och servern avslutas innan den börjar lyssna.

| Variabel | Standard | Beskrivning |
|---|---|---|
| `AUTH_ENABLED` | `true` | Kräv inloggning. Ange `false` för att köra helt utan konton, vilket ger varje förfrågan administratörsbehörighet, så begränsa det till ett betrott nätverk. |
| `DEFAULT_USERNAME` | `admin` | Användarnamn för det första administratörskontot. Används bara vid första körningen. |
| `DEFAULT_PASSWORD` | `admin` | Lösenord för det första administratörskontot. Ändra det efter första inloggningen. |
| `MAX_USERS` | `0` (obegränsat) | Högsta antal registrerade användarkonton. Ange 0 för obegränsat. |
| `SESSION_DURATION_HOURS` | `168` | Inloggningssessionens livslängd i timmar (standard är 7 dagar). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Ange `true` för att hoppa över den tvingade uppmaningen om lösenordsbyte vid första inloggningen. |

### Lagring {#storage}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` eller `s3`. S3 och MinIO kräver en licens med funktionen s3_storage samt variablerna `S3_*` nedan. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Anslutningssträng till PostgreSQL, och anslutningen som alla förfrågningar betjänas på. Från och med 2.3.0, ange även `DATABASE_MIGRATION_URL` så blir detta rollen med lägst behörighet vid körning, med DML på appens tabeller och inget annat. Compose-stacken pekar den mot sin tjänst `postgres`; lämna den osatt (tillsammans med `REDIS_URL`) för att få inbäddat läge. |
| `DATABASE_MIGRATION_URL` | (tom) | Privilegierad anslutning, används bara under uppstart för att köra migreringar och ge behörigheter till körningsrollen, och stängs sedan före den första förfrågan. Lämnas den tom kör SnapOtter med en enda roll, där `DATABASE_URL` gör båda jobben. Se [Roller med lägst behörighet](/sv/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Anslutningssträng till Redis (används för BullMQ-jobbköer). Compose pekar den mot sin tjänst `redis`. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Katalog för temporära filer under bearbetning. Rensas automatiskt. Avbilden sätter `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Katalog för permanenta användarfiler (uppladdade bilder, sparade resultat). Avbilden sätter `/data/files`. |

### S3-objektlagring {#s3-object-storage}

Läses bara när `STORAGE_MODE=s3`. Saknas någon av de tre obligatoriska misslyckas starten med namnet på variabeln du utelämnade.

| Variabel | Standard | Beskrivning |
|---|---|---|
| `S3_BUCKET` | (tom) | Bucket som innehåller uppladdningar och utdata. Obligatorisk. |
| `S3_ACCESS_KEY_ID` | (tom) | Åtkomstnyckel. Obligatorisk. I containern kan du i stället montera den via `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (tom) | Hemlig nyckel. Obligatorisk. Samma filkonvention: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Bucketens region. |
| `S3_ENDPOINT` | (tom) | Anpassad slutpunkt för MinIO, R2, Backblaze och andra S3-kompatibla lager. Tom betyder AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Ange `true` för MinIO och allt annat som vill ha `endpoint/bucket/key` i stället för virtual-host-adressering. |
| `S3_PREFIX` | (tom) | Nyckelprefix, så att en bucket kan rymma flera instanser. |

### Kryptering i vila {#encryption-at-rest}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (tom) | 64 hexadecimala tecken (32 byte). Krypterar känsliga inställningar som lagras i databasen. Allt som inte är 64 hexadecimala tecken avvisas vid start. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (tom) | Nyckeln du byter bort från, i samma format. Ange båda under en rotation så att befintliga rader fortfarande kan dekrypteras, och ta sedan bort denna. |

### Inbäddat läge {#embedded-mode}

Kör avbilden utan `DATABASE_URL` och utan `REDIS_URL` så startar den sin egen PostgreSQL 17 och Redis inuti containern, bundna till loopback, med all data på volymen `/data`. Detta återställer upplevelsen av ett enda kommando, `docker run`, för snabbstart, hemmalabb och uppgraderingar från 1.x. Det är en bekvämlighetsväg, inte en produktionsdistribution: kör i produktion den tre containrar stora Compose-stacken med separata PostgreSQL och Redis. Inbäddat läge kräver att containern körs som root och är inkompatibelt med körmiljöer med godtyckligt UID (OpenShift, Kubernetes `runAsNonRoot`); använd Compose där.

| Variabel | Standard | Beskrivning |
|---|---|---|
| `EMBEDDED` | `auto` | Aktiveras automatiskt när både `DATABASE_URL` och `REDIS_URL` är osatta. Ange `0` för att inaktivera det (appen avslutas då direkt om ingen extern `DATABASE_URL`/`REDIS_URL` är satt, i stället för att tyst starta en databas i containern). |
| `REDIS_MAXMEMORY` | `512mb` | Minnestak för den inbäddade Redis (endast inbäddat läge). Sänk det på minnesbegränsade värdar som en Raspberry Pi. |
| `EMBEDDED_PG_PORT` | `5432` | Loopback-port för den inbäddade PostgreSQL (endast inbäddat läge). Ändra den bara när containern delar ett nätverk där 5432 är upptagen, till exempel `--network host`. Den måste skilja sig från `EMBEDDED_REDIS_PORT` och vara över 1023, eftersom PostgreSQL körs som en oprivilegierad användare som inte kan binda en privilegierad port i värdens nätverk. |
| `EMBEDDED_REDIS_PORT` | `6379` | Samma sak, för den inbäddade Redis, som också körs som en oprivilegierad användare. |
| `EMBEDDED_DB_PASSWORDS` | (tom) | Ange `1` för att vid nästa uppstart generera slumpmässiga lösenord för den inbäddade PostgreSQL:s roller och för Redis, sparade i `/data/.embedded-db-secrets`. TCP-inloggningar kräver dem sedan. På en volym som först skapades av 2.3.0 eller senare kan PostgreSQL:s superuser inte logga in över TCP alls; på en äldre volym är databasägaren superuser, och det är dess lösenord som skyddar den. Använd det när andra program delar containerns nätverk, till exempel med `--network host`. Det förblir påslaget för den volymen: lösenorden används vid varje uppstart även om du tar bort variabeln, och att radera `/data/.embedded-db-secrets` ger dig bara nya lösenord, eller en uppstart som misslyckas om variabeln inte är satt. Om containern inte startar för att en av de filerna är skadad, radera den filen med `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` och starta containern igen; nästa uppstart skapar en ny. Variabeln tar `1`, `0` eller tomt, och alla andra värden stoppar uppstarten. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Sekunder som uppstarten väntar på att den inbäddade Redis svarar på `PING` innan den ger upp. Vid tidsgräns stoppas containern och loggar orsaken i stället för att hänga sig. Hela sekunder från 1 till 999999; det finns inget obegränsat värde, eftersom att vänta för evigt är just det fel som gränsen finns för att förhindra. Höj den bara om en långsam värd överskrider den. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Samma sak, för den inbäddade PostgreSQL. Klockan startar efter att `initdb` vid första uppstarten är klar, så den täcker serverstart och kraschåterställning snarare än den första skapandet av databasen. |

Uppgradering från 1.x: lägg din gamla `snapotter.db` på `/data/snapotter.db` i volymen så importerar inbäddat läge den till den inbäddade PostgreSQL vid första uppstarten. Importen körs en gång; senare uppstarter hoppar över den.

Notering om telemetri: inbäddat läge ärver avbildens standardinställning för analys som all annan konfiguration. Den publicerade avbilden kan skicka analysdata, men en ny instans frågar först sin administratör och skickar ingenting förrän den fått svar. För att inaktivera den, svara nej, bygg med `--build-arg SNAPOTTER_ANALYTICS=off`, ange `SNAPOTTER_ANALYTICS_DEFAULT=off` före första uppstarten, eller använd administratörens avanmälan i appen.

### Bearbetningsgränser {#processing-limits}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (obegränsat) | Största filstorlek per uppladdning i megabyte. Ange 0 för obegränsat. Den publicerade avbilden levereras med `0`; en källbygge startar på 100. |
| `MAX_BATCH_SIZE` | `0` (obegränsat) | Högsta antal filer i en enskild batchförfrågan. Ange 0 för obegränsat. Den publicerade avbilden levereras med `0`; ett källbygge startar på 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Antal batchjobb som körs parallellt. Ange 0 för att automatiskt detektera utifrån tillgängliga CPU-kärnor. |
| `MAX_MEGAPIXELS` | `0` (obegränsat) | Högsta tillåtna bildupplösning i megapixlar. Ange 0 för obegränsat. |
| `MAX_WORKER_THREADS` | `0` (auto) | Högsta antal arbetstrådar för bildbearbetning. Ange 0 för att automatiskt detektera utifrån tillgängliga CPU-kärnor. |
| `PROCESSING_TIMEOUT_S` | `0` (ingen gräns) | Tidsgräns för varje anrop till den Python sidecar som kör AI-verktygen, i sekunder. Ange 0 för ingen tidsgräns. Den begränsar inte bild-, PDF- eller mediejobb; det gör `JOB_TIMEOUT_FAST_S` och `JOB_TIMEOUT_LONG_S`. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Sekunder som AI:ns Python sidecar och körmiljön för exakt OCR är inaktiva innan de avslutas och frigör sitt minne (cirka 1,3 GB och 0,7 GB när de är uppvärmda). Båda startar igen vid nästa förfrågan, så det första AI-anropet efter en avslutning vid inaktivitet får betala kostnaden för att starta biblioteken, några sekunder. Ange 0 för att hålla dem igång. Standardvärdet matchar `AI_SESSION_IDLE_TIMEOUT`, så att inlästa modeller inte släpps tidigare än den inställningen anger. Om du höjer `AI_SESSION_IDLE_TIMEOUT`, höj även detta värde så att de matchar. |
| `JOB_TIMEOUT_FAST_S` | `120` | Tidsfrist för ett jobb i de snabba poolerna (bild- och dokumentverktyg), i sekunder. Ett jobb som pågår längre misslyckas med ett tidsgränsfel. Ange 0 för ingen gräns. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Tidsfrist för ett jobb i de långa poolerna (AI- och medieverktyg, plus alla verktyg som är markerade som långvariga), i sekunder. Ange 0 för ingen gräns. PDF-OCR i lägena Balanced och Best förlänger sin egen tidsfrist efter sidantal (2 och 5 minuter per sida), upp till 6 timmar, så en stor PDF kräver inte att detta höjs. |
| `SYNC_WAIT_MS` | `8000` | Hur länge en verktygsförfrågan väntar på sitt jobb innan API:t slutar vänta och returnerar `202` med ett jobb-id att följa via SSE, i millisekunder. Det stoppar inte jobbet. Ange 0 för att vänta på jobbet hur länge det än tar. |
| `MAX_PIPELINE_STEPS` | `20` | Högsta antal steg i en pipeline. Ange 0 för ingen gräns. |
| `MAX_CANVAS_PIXELS` | `0` (ingen gräns) | Största dukstorlek i pixlar för utdatabilder. Ange 0 för ingen gräns. |
| `MAX_SVG_SIZE_MB` | `50` | Största SVG som accepteras före sanering, i megabyte. `0` beter sig annorlunda här än i raderna omkring. Det tar bort storleksgränsen före tolkning helt i stället för att höja den, så låt denna vara satt. |
| `MAX_PDF_PAGES` | `0` (obegränsat) | Högsta antal PDF-sidor för konvertering från PDF till bild. Ange 0 för obegränsat. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Det största fältet `settings` som en verktygsförfrågan får innehålla, i kilobyte, räknat i UTF-8-byte. Förfrågningar över gränsen får `400`. Ange 0 för ingen gräns. Verkliga verktygsinställningar är mycket mindre än 64 KB, så höj detta bara om en klient skickar ovanligt stora inställningar. |

### Motorer {#engines}

SnapOtter slår upp varje bearbetningsprogram på `$PATH` inuti containern, så dessa förblir tomma om du inte monterar ett eget bygge.

| Variabel | Standard | Beskrivning |
|---|---|---|
| `FFMPEG_PATH` | (tom) | Sökväg till binären `ffmpeg` bakom video- och ljudverktygen. |
| `FFPROBE_PATH` | (tom) | Sökväg till `ffprobe`, som läser mediefiler innan de bearbetas. Peka den mot samma bygge som `FFMPEG_PATH`. |
| `QPDF_PATH` | (tom) | Sökväg till `qpdf`, som används av PDF-verktygen och för att kontrollera uppladdade PDF-filer. |
| `SOFFICE_PATH` | (tom) | Sökväg till LibreOffice `soffice`, som används för konvertering av kontorsdokument. |
| `PDFCPU_PATH` | (tom) | Sökväg till `pdfcpu`, som används av vissa PDF-verktyg. |
| `GS_PATH` | (tom) | Sökväg till Ghostscripts `gs`, som används av PDF-verktygen och PDF-OCR. |
| `PANDOC_PATH` | (tom) | Sökväg till `pandoc`, som används vid dokumentkonverteringar. |
| `SNAPOTTER_FONT_FILE` | (tom) | Typsnittsfil för text som ritas på video (bränn in undertexter, vattenstämpla video). Tom använder det första typsnitt som avbilden hittar. |
| `SNAPOTTER_FONT_FAMILY` | (tom) | Familjenamn för `SNAPOTTER_FONT_FILE`. Tom betyder `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (tom) | Familj för hårdvarukodare för video, `nvenc` eller `vaapi`. Tom kodar i mjukvara. |

`SNAPOTTER_HW_ACCEL` kräver en ffmpeg byggd med den kodarfamiljen, och ffmpeg i avbilden har ingen av dem. Med avbildens egen binär faller inställningen tillbaka på mjukvarukodning och säger det i startloggen. För att använda den, montera ditt eget ffmpeg-bygge, peka `FFMPEG_PATH` och `FFPROBE_PATH` mot det och ge containern GPU-enheten. För `nvenc`, ange även `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: avbilden ber bara om `compute,utility`, och utan `video` monterar NVIDIA-körmiljön inte kodningsbiblioteket, så kodaren listas men varje kodning misslyckas. En sökvägsöverskrivning som inte finns eller inte är körbar nämns också i startloggen, och varje jobb som behöver den binären misslyckas tills du rättar sökvägen eller tar bort inställningen.

De publicerade Compose-filerna skickar vidare alla dessa från `.env`, så det räcker att sätta dem där.

### Rensning {#cleanup}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Hur länge osparade bearbetningsresultat (råa uppladdningar och verktygsutdata) behålls innan de raderas automatiskt. Filer som du uttryckligen sparar i filbiblioteket påverkas inte och finns kvar tills du raderar dem. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Hur ofta rensningsjobbet körs. |

### Utseende {#appearance}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `DEFAULT_THEME` | `light` | Standardtema för nya sessioner. `light`, `dark` eller `system`. |
| `DEFAULT_LOCALE` | `en` | Standardspråk för gränssnittet. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Standardlayout för verktyg. `sidebar` eller `fullscreen`. |

### Docker-behörigheter {#docker-permissions}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `PUID` | `999` | Kör containerprocessen som detta UID. Ange så att det matchar din värdanvändare för bind-monteringar (`id -u`). |
| `PGID` | `999` | Kör containerprocessen som detta GID. Ange så att det matchar din värdgrupp för bind-monteringar (`id -g`). |

## Docker-exempel {#docker-example}

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

## Volymer {#volumes}

Docker Compose-stacken använder fyra volymer:

- `/data` (app) - AI-modeller, Python-venv och användarfiler. Montera denna för att behålla uppladdade filer och installerade AI-paket mellan omstarter.
- `/tmp/workspace` (app) - Temporär lagring för filer som bearbetas. Denna kan vara efemär, men en montering hindrar containerns skrivbara lager från att fyllas.
- `SnapOtter-pgdata` (postgres) - Datakatalog för PostgreSQL. Den innehåller all relationsdata (användare, inställningar, pipelines, jobb, granskningslogg). Säkerhetskopiera via `pg_dump` eller volymögonblicksbild.
- `SnapOtter-redisdata` (redis) - Redis append-only-fil för hållbara jobbköer.

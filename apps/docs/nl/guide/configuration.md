---
description: "Alle SnapOtter-omgevingsvariabelen met standaardwaarden. Configureer authenticatie, opslag, AI-modellen, analytics en meer."
i18n_source_hash: 02edb8bd70e5
i18n_provenance: machine
i18n_output_hash: 6ddd0a333ee2
i18n_hash_version: 2
---

# Configuratie {#configuration}

Alle configuratie verloopt via omgevingsvariabelen. Elke variabele heeft een zinvolle standaardwaarde, dus SnapOtter werkt direct zonder dat u er een instelt.

## Omgevingsvariabelen {#environment-variables}

### Server {#server}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `PORT` | `1349` | Poort waarop de server luistert. |
| `HOST` | `0.0.0.0` | IP-adres waarop de server luistert. Houd op een bridge-netwerk (de standaard voor `docker run` en Compose) `0.0.0.0` (of `::`) aan, anders werken gepubliceerde poorten niet meer. Bij een native installatie of een container op het hostnetwerk houdt `127.0.0.1` de API van het netwerk af; zet er een reverse proxy voor voor toegang op afstand. De [embedded-modus](#embedded-mode) werkt alleen met `0.0.0.0`, `::` of `127.0.0.1`, omdat de opstartcontrole ervan `127.0.0.1` aanroept. Met elk ander adres, `::1` inbegrepen, geldt de container nooit als gestart, en een latere crash stopt hem in plaats van de server opnieuw te starten. Alles wat geen IP-adres is, `localhost` inbegrepen, stopt de server bij het opstarten. |
| `BASE_PATH` | (leeg) | Openbaar implementatiepad, bijvoorbeeld `/snapotter`. Leeg of `/` serveert op de hoofdmap van het domein. Wordt tijdens runtime toegepast; er is geen nieuwe image-build nodig. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maximaal aantal verzoeken per minuut per IP. Stel in op 0 om rate limiting uit te schakelen. |
| `API_KEYS_RATE_LIMIT_PER_MIN` | `30` | Maximaal aantal verzoeken per minuut per IP naar de beheerendpoints voor API-sleutels (weergeven, aanmaken, intrekken). Sleutels die voor toolaanroepen worden gebruikt, worden niet beïnvloed. Er is geen onbeperkte waarde: `0` weigert elk verzoek naar die endpoints. |
| `CORS_ORIGIN` | (leeg) | Kommagescheiden toegestane origins voor CORS, of leeg voor alleen dezelfde origin. |
| `LOG_LEVEL` | `info` | Uitgebreidheid van de logging. Een van: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Welke peers het client-IP mogen instellen via `X-Forwarded-For`. De standaardinstelling vertrouwt alleen een peer in een privénetwerk, zodat een reverse proxy op een Docker-netwerk of LAN wordt vertrouwd en een vervalste header van een publieke client niet. Stel `true` alleen in als er een proxy onder uw beheer op een openbaar adres voor staat. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | (niet ingesteld) | Beantwoordt de analytics-vraag bij de eerste start vooraf, zodat niemand die krijgt. Niet ingesteld vraagt een nieuwe instantie het aan de beheerder en verstuurt die niets tot er een antwoord is. `off` start die met "Anonymous Product Analytics" uitgeschakeld; `on` start die ingeschakeld. Het vult de instelling alleen in zolang niemand er een waarde voor heeft gekozen. Zodra de instelling is opgeslagen, door een beheerder of door deze variabele, heeft het wijzigen van de variabele geen effect; een beheerder kan die nog steeds wijzigen onder Settings > System > Privacy. |

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
| `LOGIN_ATTEMPT_LIMIT` | `30` | Maximaal aantal loginverzoeken per minuut per IP. Verdere pogingen krijgen een `429` tot de minuut voorbij is. Herhaalde mislukkingen voor één gebruikersnaam bereiken meestal eerst `LOGIN_THROTTLE_MAX_FAILURES`. Een beheerder kan dit overschrijven onder Settings > System. Er is geen onbeperkte waarde: `0` weigert elke login. Een build vanuit de broncode begint op 10. |
| `LOGIN_THROTTLE_MAX_FAILURES` | `10` | Aantal mislukte wachtwoordlogins dat één gebruikersnaam mag hebben binnen `LOGIN_THROTTLE_WINDOW_S` voordat verdere pogingen voor die naam een `429` krijgen, vanaf welk IP ook. Ze worden weer doorgelaten naarmate de oudste mislukkingen uit het venster verdwijnen. Stel in op 0 om de beperking uit te schakelen. |
| `LOGIN_THROTTLE_WINDOW_S` | `900` | Lengte van dat venster, in seconden. Moet minimaal 1 zijn; de server weigert te starten bij 0. |

### Opslag {#storage}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` of `s3`. S3 en MinIO vereisen een licentie met de functie s3_storage plus de onderstaande `S3_*`-variabelen. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL-verbindingsreeks, en de verbinding waarop elk verzoek wordt afgehandeld. Vanaf 2.3.0 geldt: stel ook `DATABASE_MIGRATION_URL` in en dit wordt de runtimerol met minimale rechten, die alleen DML heeft op de tabellen van de app en niets anders. De Compose-stack wijst het naar de service `postgres`; laat het (samen met `REDIS_URL`) ongedefinieerd om de embedded-modus te krijgen. |
| `DATABASE_MIGRATION_URL` | (leeg) | Bevoorrechte verbinding, alleen tijdens het opstarten gebruikt om migraties uit te voeren en de runtimerol rechten te geven, en gesloten vóór het eerste verzoek. Laat u dit leeg, dan draait SnapOtter met één rol, waarbij `DATABASE_URL` beide taken uitvoert. Zie [Rollen met minimale rechten](/nl/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Redis-verbindingsreeks (gebruikt voor BullMQ-jobwachtrijen). Compose wijst dit naar de service `redis`. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Map voor tijdelijke bestanden tijdens de verwerking. Wordt automatisch opgeruimd. De image stelt `/tmp/workspace` in. |
| `FILES_STORAGE_PATH` | `./data/files` | Map voor permanente gebruikersbestanden (geüploade afbeeldingen, opgeslagen resultaten). De image stelt `/data/files` in. |
| `MAX_STORAGE_PER_USER_MB` | `5000` | Limiet in megabytes voor wat elke gebruiker in de bestandenbibliotheek bewaart. Een opslagactie die de limiet zou overschrijden, wordt geweigerd met het gebruikte aantal en de limiet. Een quotum dat op de gebruiker is ingesteld, heeft voorrang. Stel in op 0 voor onbeperkt. |

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
| `EMBEDDED_PG_PORT` | `5432` | Loopbackpoort voor de embedded PostgreSQL (alleen embedded-modus). Wijzig deze alleen als de container een netwerk deelt waarop 5432 al bezet is, zoals bij `--network host`. De poort moet verschillen van `EMBEDDED_REDIS_PORT` en boven 1023 liggen, omdat PostgreSQL draait als onbevoorrechte gebruiker die op het hostnetwerk geen bevoorrechte poort kan binden. |
| `EMBEDDED_REDIS_PORT` | `6379` | Hetzelfde, voor de embedded Redis, die ook als onbevoorrechte gebruiker draait. |
| `EMBEDDED_DB_PASSWORDS` | (leeg) | Stel in op `1` om bij de volgende start willekeurige wachtwoorden te genereren voor de rollen van de embedded PostgreSQL en voor Redis, bewaard in `/data/.embedded-db-secrets`. TCP-logins hebben ze daarna nodig. Op een volume dat voor het eerst door 2.3.0 of later is aangemaakt, kan de PostgreSQL-superuser helemaal niet via TCP inloggen; op een ouder volume is de database-eigenaar de superuser, en is het wachtwoord daarvan wat hem beschermt. Gebruik dit telkens wanneer andere programma's het netwerk van de container delen, zoals bij `--network host`. Het blijft aan voor dat volume: de wachtwoorden worden bij elke start gebruikt, ook als u deze variabele verwijdert, en het verwijderen van `/data/.embedded-db-secrets` levert u alleen nieuwe op, of een start die mislukt als de variabele niet is ingesteld. Start de container niet omdat een van die bestanden beschadigd is, verwijder dat bestand dan met `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` en start de container opnieuw; de volgende start maakt een nieuw bestand aan. De variabele accepteert `1`, `0` of leeg, en elke andere waarde stopt het opstarten. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Aantal seconden dat het opstarten wacht tot de embedded Redis antwoordt op `PING` voordat het opgeeft. Bij een time-out stopt de container en logt hij waarom, in plaats van te blijven hangen. Hele seconden van 1 tot 999999; er is geen onbeperkte waarde, omdat eindeloos wachten juist de storing is die deze grens moet voorkomen. Verhoog dit alleen als een trage host de grens bereikt. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Hetzelfde, voor de embedded PostgreSQL. De klok start nadat `initdb` bij de eerste start klaar is, dus hij dekt het starten van de server en het herstel na een crash, niet het aanmaken van de database zelf. |

Upgraden vanaf 1.x: plaats uw oude `snapotter.db` op `/data/snapotter.db` in het volume en de embedded-modus importeert het bij de eerste start in de embedded PostgreSQL. De import wordt één keer uitgevoerd; latere starts slaan hem over.

Opmerking over telemetrie: de embedded-modus erft de analytics-standaard van de image, net als elke andere configuratie. De gepubliceerde image kan analytics versturen, maar een nieuwe instantie vraagt het eerst aan de beheerder en verstuurt niets tot er een antwoord is. Om dit uit te schakelen, antwoord nee, bouw met `--build-arg SNAPOTTER_ANALYTICS=off`, stel `SNAPOTTER_ANALYTICS_DEFAULT=off` in vóór de eerste start, of gebruik de opt-out voor beheerders in de app.

### Verwerkingslimieten {#processing-limits}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (onbeperkt) | Maximale bestandsgrootte per upload in megabytes. Stel in op 0 voor onbeperkt. De gepubliceerde image levert `0`; een build vanuit de broncode begint op 100. |
| `MAX_BATCH_SIZE` | `0` (onbeperkt) | Maximaal aantal bestanden in één batchverzoek. Stel in op 0 voor onbeperkt. De gepubliceerde image levert `0`; een build vanuit de broncode begint op 100. |
| `CONCURRENT_JOBS` | `0` (automatisch) | Aantal batchjobs dat parallel draait. Stel in op 0 om automatisch te bepalen op basis van de beschikbare CPU-kernen. |
| `MAX_MEGAPIXELS` | `0` (onbeperkt) | Maximaal toegestane afbeeldingsresolutie in megapixels. Stel in op 0 voor onbeperkt. |
| `MAX_CPU_UPSCALE_MP` | `4` | Grootste invoer, in megapixels, die AI-upscaling accepteert op een host zonder GPU. De opgeschaalde uitvoer is ook beperkt tot 16 keer deze waarde (standaard 64 MP), dus een hoge schaalfactor verlaagt de invoerlimiet nog verder. Een grotere afbeelding wordt vóór het upscalen verkleind tot die past; als het resultaat dan niet groter zou zijn dan het origineel, wordt het verzoek in plaats daarvan geweigerd. Lanczos slaat de invoerlimiet over, maar niet de uitvoerlimiet. Stel in op 0 voor geen limiet, wat veel RAM vraagt: RealESRGAN bouwt intern altijd een 4x-buffer op. |
| `MAX_WORKSPACE_SIZE_GB` | `0` (onbeperkt) | Limiet in GB op de gezamenlijke grootte van uploads en opgeslagen resultaten in de werkruimte. Zodra die is overschreden, krijgen uploads en toolverzoeken een 503 totdat bestanden verlopen na `FILE_MAX_AGE_HOURS`. Stel in op 0 voor onbeperkt; lokale opslag weigert schrijfacties nog steeds met een 503 zodra de schijf minder dan 0,5 GB vrij heeft. De gepubliceerde image levert `0`; een build vanuit de broncode begint op 10. |
| `MAX_WORKER_THREADS` | `0` (automatisch) | Maximaal aantal workerthreads voor beeldverwerking. Stel in op 0 om automatisch te bepalen op basis van de beschikbare CPU-kernen. |
| `PROCESSING_TIMEOUT_S` | `0` (geen limiet) | Time-out voor elke aanroep van de Python-sidecar die de AI-tools uitvoert, in seconden. Stel in op 0 voor geen limiet. Het begrenst geen afbeeldings-, PDF- of mediajobs; dat doen `JOB_TIMEOUT_FAST_S` en `JOB_TIMEOUT_LONG_S`. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Aantal seconden dat de Python-AI-sidecar en de nauwkeurige OCR-runtime inactief blijven voordat ze afsluiten en hun geheugen vrijgeven (ongeveer 1,3 GB en 0,7 GB zodra ze warm zijn). Beide starten opnieuw bij het volgende verzoek, dus de eerste AI-aanroep na een afsluiting wegens inactiviteit betaalt de opstartkosten van de bibliotheken, enkele seconden. Stel in op 0 om ze actief te houden. De standaard komt overeen met `AI_SESSION_IDLE_TIMEOUT`, zodat geladen modellen niet eerder worden verwijderd dan die instelling aangeeft. Verhoogt u `AI_SESSION_IDLE_TIMEOUT`, verhoog dit dan mee. |
| `AI_SESSION_IDLE_TIMEOUT` | `0` (automatisch) | Aantal seconden dat een geladen AI-model na het laatste gebruik in de cache van de sidecar blijft. Automatisch is 600. Gelezen door de Python-sidecar, die ook alle gecachete modellen weggooit wanneer hij afsluit na `AI_SIDECAR_IDLE_TIMEOUT`. |
| `AI_SESSION_CACHE_BYTES` | `0` (automatisch) | Geheugenbudget voor gecachete AI-modellen, in bytes. Automatisch is 40% van het GPU-geheugen, en helemaal geen caching op een host met alleen CPU. Stel het in op een CPU-host om modellen in RAM te cachen; stel het in op 1 om caching uit te schakelen op een GPU-host. Gelezen door de Python-sidecar. |
| `MAX_AI_JOBS_PER_USER` | `5` | Aantal AI-jobs voor één bestand dat een gebruiker tegelijk in de wachtrij of in uitvoering mag hebben. Meer jobs krijgen een `429` totdat er een klaar is. De AI-pool voert één job tegelijk uit, dus zo kan één gebruiker hem niet bezetten. AI-runs voor batches en pipelines tellen niet mee. Stel in op 0 voor onbeperkt. |
| `JOB_TIMEOUT_FAST_S` | `120` | Deadline voor één job op de snelle pools (afbeeldings- en documenttools), in seconden. Een job die langer duurt, mislukt met een time-outfout. Stel in op 0 voor geen limiet. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Deadline voor één job op de lange pools (AI- en mediatools, plus elke tool die als langlopend is gemarkeerd), in seconden. Stel in op 0 voor geen limiet. Balanced en Best PDF-OCR verlengen hun eigen deadline op basis van het aantal pagina's (2 en 5 minuten per pagina), tot 6 uur, dus voor een grote PDF hoeft u dit niet te verhogen. |
| `SYNC_WAIT_MS` | `8000` | Hoe lang een toolverzoek op zijn job wacht voordat de API stopt met wachten en `202` teruggeeft met een job-id om via SSE te volgen, in milliseconden. Het stopt de job niet. Stel in op 0 om op de job te wachten, hoe lang die ook duurt. |
| `MAX_PIPELINE_STEPS` | `20` | Maximaal aantal stappen in een pipeline. Stel in op 0 voor geen limiet. |
| `MAX_PIPELINE_STEP_PIXELS` | `67108864` | Grootste uitvoer die een pipelinestap mag vragen, als breedte maal hoogte in pixels (standaard 8192 x 8192). Een stap waarvan de instellingen meer vragen, wordt geweigerd voordat de pipeline draait. Stel in op 0 voor geen limiet. |
| `MAX_CANVAS_PIXELS` | `0` (geen limiet) | Maximale canvasgrootte in pixels voor uitvoerafbeeldingen. Stel in op 0 voor geen limiet. |
| `MAX_SVG_SIZE_MB` | `50` | Grootste SVG die vóór het opschonen wordt geaccepteerd, in megabytes. `0` gedraagt zich hier anders dan in de rijen eromheen. Het verwijdert de groottelimiet vóór het parsen volledig in plaats van die te verhogen, dus laat deze ingesteld. |
| `MAX_PDF_PAGES` | `0` (onbeperkt) | Maximaal aantal PDF-pagina's voor PDF-naar-afbeelding-conversie. Stel in op 0 voor onbeperkt. |
| `MAX_VIDEO_DURATION_S` | `0` (onbeperkt) | Langste video die de videotools accepteren, in seconden. Langere bestanden worden vóór verwerking geweigerd, met de duur en de limiet in de foutmelding. Stel in op 0 voor onbeperkt. |
| `MAX_AUDIO_DURATION_S` | `0` (onbeperkt) | Hetzelfde, voor de audiotools. |
| `MAX_VIDEO_BITRATE_KBPS` | `0` (onbeperkt) | Hoogste totale bitrate die de videotools accepteren, in kilobits per seconde. Stel in op 0 voor onbeperkt. |
| `PREVIEW_TIMEOUT_S` | `300` | Tijdslimiet voor het coderen van één voorbeeldclip in de browser van een video- of audiobestand, in seconden. Documentvoorbeelden gebruiken in plaats daarvan `LIBREOFFICE_TIMEOUT_S`. Stel in op 0 voor geen limiet. |
| `LIBREOFFICE_TIMEOUT_S` | `120` | Tijdslimiet voor één LibreOffice-conversie (Word, Excel en PowerPoint naar PDF, de documentconverters en documentvoorbeelden), in seconden. `0` betekent hier niet onbeperkt; het valt terug op 120. |
| `GIF_BG_MAX_FRAMES` | `150` | Maximaal aantal frames dat Remove GIF Background accepteert in één animatie. Langere animaties krijgen een `400` met het aantal frames. Stel in op 0 voor geen framelimiet; een apart pixelbudget blijft gelden. |
| `SUBPROCESS_MEMORY_LIMIT_MB` | `0` (uit) | Limiet op de adresruimte, in megabytes, voor elk ffmpeg-, Ghostscript-, qpdf-, LibreOffice-, pandoc- en pdfcpu-proces dat de media- en documentengines starten. De decoders die geüploade afbeeldingen lezen (ImageMagick, exiftool en hun ffmpeg-terugval) worden niet beperkt. Een proces dat de limiet overschrijdt, wordt beëindigd in plaats van de hele container naar de out-of-memory killer te duwen. Het beperkt virtueel geheugen, niet resident geheugen, dus laat ruimte over. De AI-sidecar wordt nooit beperkt. Stel in op 0 om het uit te schakelen en te vertrouwen op de geheugenlimiet van de container. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Grootste `settings`-veld dat een toolverzoek mag bevatten, in kilobytes, geteld in UTF-8-bytes. Verzoeken boven de limiet krijgen een `400`. Stel in op 0 voor geen limiet. Echte toolinstellingen zijn veel kleiner dan 64 KB, dus verhoog dit alleen als een client ongebruikelijk grote instellingen verstuurt. |
| `MAX_SUBTITLE_SIZE_MB` | `1` | Grootste ondertitelbestand (`.srt`, `.vtt`, `.ass`) dat Burn Subtitles en Embed Subtitles accepteren, in megabytes. Grotere bestanden krijgen een `400` met de bestandsgrootte en de limiet. Stel in op 0 voor geen limiet. Een ondertitelbestand voor een speelfilm is meestal ruim onder 1 MB. |
| `MAX_METADATA_TAG_LENGTH` | `10000` | Langste waarde die Edit Metadata in één tag schrijft (artiest, beschrijving, trefwoorden enzovoort), in tekens. Langere waarden krijgen een `400` met de tag en de limiet. Stel in op 0 voor geen limiet. Verhoog dit als u lange bijschriften of beschrijvingen opslaat. Een tagwaarde moet ook passen binnen `MAX_SETTINGS_PAYLOAD_KB` en de limiet per argument van het besturingssysteem (128 KB op Linux). |

### Engines {#engines}

SnapOtter zoekt elk verwerkingsprogramma op `$PATH` binnen de container, dus deze blijven leeg tenzij u een eigen build mount.

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `FFMPEG_PATH` | (leeg) | Pad naar het programma `ffmpeg` achter de video- en audiotools. |
| `FFPROBE_PATH` | (leeg) | Pad naar `ffprobe`, dat mediabestanden leest voordat ze worden verwerkt. Wijs het naar dezelfde build als `FFMPEG_PATH`. |
| `QPDF_PATH` | (leeg) | Pad naar `qpdf`, gebruikt door de PDF-tools en om geüploade PDF's te controleren. |
| `SOFFICE_PATH` | (leeg) | Pad naar `soffice` van LibreOffice, gebruikt voor conversies van kantoordocumenten. |
| `PDFCPU_PATH` | (leeg) | Pad naar `pdfcpu`, gebruikt door sommige PDF-tools. |
| `GS_PATH` | (leeg) | Pad naar `gs` van Ghostscript, gebruikt door de PDF-tools en PDF-OCR. |
| `PANDOC_PATH` | (leeg) | Pad naar `pandoc`, gebruikt door documentconversies. |
| `SNAPOTTER_FONT_FILE` | (leeg) | Lettertypebestand voor tekst die op video wordt getekend (ondertitels inbranden, videowatermerk). Leeg gebruikt het eerste lettertype dat de image vindt. |
| `SNAPOTTER_FONT_FAMILY` | (leeg) | Familienaam van `SNAPOTTER_FONT_FILE`. Leeg betekent `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (leeg) | Familie van hardwarematige video-encoders, `nvenc` of `vaapi`. Leeg codeert in software. |

`SNAPOTTER_HW_ACCEL` vereist een ffmpeg die met die encoderfamilie is gebouwd, en de ffmpeg in de image heeft geen van beide. Met het eigen programma van de image valt de instelling terug op software-encodering en meldt dat in het opstartlog. Om het te gebruiken mount u uw eigen ffmpeg-build, wijst u `FFMPEG_PATH` en `FFPROBE_PATH` ernaar en geeft u de container het GPU-apparaat. Stel voor `nvenc` ook `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video` in: de image vraagt alleen om `compute,utility`, en zonder `video` mount de NVIDIA-runtime de encodeerbibliotheek niet, zodat de encoder wel wordt vermeld maar elke encodering mislukt. Een padoverschrijving die niet bestaat of niet uitvoerbaar is, wordt eveneens in het opstartlog genoemd, en elke job die dat programma nodig heeft mislukt totdat u het pad herstelt of de instelling verwijdert.

De gepubliceerde Compose-bestanden geven ze allemaal door vanuit `.env`, dus instellen daar volstaat.

### Opschonen {#cleanup}

| Variabele | Standaard | Beschrijving |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Hoe lang niet-opgeslagen verwerkingsresultaten (ruwe uploads en toolresultaten) worden bewaard vóór automatische verwijdering. Bestanden die u expliciet in de bestandenbibliotheek opslaat, worden niet beïnvloed en blijven bestaan totdat u ze verwijdert. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Hoe vaak de opschoontaak draait. |
| `JOBS_RETENTION_DAYS` | `30` | Aantal dagen dat een afgerond jobrecord (voltooid, mislukt of geannuleerd) wordt bewaard voordat de bewaaropruiming, die elke 6 uur draait, het verwijdert. Een beheerder kan dit overschrijven onder Settings > System. Gebruikers en teams met een juridische bewaarplicht houden hun records. Stel in op 0 om ze voor altijd te bewaren. |
| `AUDIT_RETENTION_DAYS` | `0` (voor altijd) | Aantal dagen dat auditlogvermeldingen worden bewaard. Dezelfde regels voor overschrijven en juridische bewaarplicht. Er wordt niets verwijderd zolang manipulatiebestendige auditlogging aan staat. Stel in op 0 om ze voor altijd te bewaren. |
| `SNAPOTTER_LICENSE_KEY` | (leeg) | Licentiesleutel die de enterprise-functies ontgrendelt, zoals SAML, SCIM en S3-opslag. Gelezen bij het opstarten, dus herstart na het wijzigen. Een ongeldige of verlopen sleutel logt een waarschuwing en de server draait zonder die functies. In de container kunt u de sleutel in plaats daarvan mounten, via `SNAPOTTER_LICENSE_KEY_FILE` (zie [Docker secrets](/guide/security#docker-secrets)). |

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

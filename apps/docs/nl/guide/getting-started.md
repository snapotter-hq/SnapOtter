---
description: "Installeer SnapOtter met Docker in één opdracht, log in en open uw eerste tool. Behandelt GPU-versnelling, kleine machines, Docker Compose en bouwen vanaf de broncode."
i18n_source_hash: b40014f9f1a3
i18n_provenance: machine
i18n_output_hash: 58c040bd6c35
i18n_hash_version: 2
---

# Aan de slag {#getting-started}

::: tip Eerst proberen, dan installeren
Verken de volledige gebruikersinterface op [demo.snapotter.com](https://demo.snapotter.com), zonder aanmelding of installatie.
:::

## Snelstart {#quick-start}

Voer één opdracht uit:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Open daarna [http://localhost:1349](http://localhost:1349) en log in met `admin` / `admin`. U wordt gevraagd uw wachtwoord te wijzigen bij de eerste aanmelding.

Open nu een tool. Kies er een in de zijbalk, of ga direct naar [Formaat wijzigen](http://localhost:1349/image/resize), zet een afbeelding neer en download het resultaat.

Dat is de hele installatie. Deze ene container draait alles wat nodig is: zonder ingestelde [`DATABASE_URL`](/nl/guide/configuration#env-database-url) start hij zijn eigen PostgreSQL en Redis op de loopback-interface (embedded modus) en bewaart hij alle data in het volume `SnapOtter-data`. Dit is de snelste manier om SnapOtter uit te proberen of zelf te hosten op een homelab. Embedded modus draait als root (de standaard) en schakelt automatisch uit zodra u `DATABASE_URL` instelt. Gebruik voor productie de [Docker Compose-stack](#docker-compose), waarin PostgreSQL en Redis in eigen containers draaien.

Taakresultaten worden niet in het datavolume bewaard, dus ze verdwijnen wanneer de container wordt vervangen (bijvoorbeeld bij een image-upgrade) en hun downloadlinks werken niet meer. [Taakuitvoer bewaren](/nl/guide/deployment#keeping-job-output) in de implementatiegids laat zien hoe u ze bewaart.

::: tip Draaien met 4 GB RAM of minder
Voer op een Raspberry Pi, een oude laptop of een kleine VPS één taak tegelijk uit en beperk de threadpool voor afbeeldingen door `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` aan de opdracht hierboven toe te voegen, en sla de zware AI-bundels over. [Setups met weinig resources](/nl/guide/low-resource#tuning-knobs) noemt de andere limieten die de moeite waard zijn en wat u van beperkte hardware mag verwachten.
:::

::: tip Anonieme productanalyse
SnapOtter bevat standaard anonieme productanalyse. Om het uit te schakelen opent u **Settings → System → Privacy** en zet u **Anonymous Product Analytics** uit. Het stopt direct voor de hele instantie.

U kunt ook de omgevingsvariabele `SNAPOTTER_TELEMETRY=0` (`false` en `off` werken ook) instellen om alle telemetrie voor de instantie uit te schakelen zonder opnieuw te bouwen.

Foutmonitoring wordt verzorgd door [Sentry](https://sentry.io), dat SnapOtter sponsort via zijn open-sourceprogramma.

Zie [Wat SnapOtter verzamelt](/nl/guide/telemetry) voor details over wat er wordt verzameld.
:::

## GPU-versnelling {#gpu-acceleration}

Een NVIDIA GPU maakt de zware AI-tools veel sneller: opschalen (ongeveer 47 keer), gezichtsverbetering (ongeveer 12 keer), transcriptie en achtergrondverwijdering (elk ongeveer 4 keer). OCR, gezichtsdetectie en fotorestauratie blijven CPU-gebaseerd, dus een GPU helpt daar niet. Dezelfde image dekt beide; voeg `--gpus all` toe:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Vereist de [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) op de host. Zonder CUDA valt SnapOtter automatisch terug op de CPU. Versnelling via een Intel/AMD-iGPU met VA-API, Quick Sync of OpenCL wordt momenteel niet ondersteund voor AI-inferentie.

- [Hardwarevereisten](/nl/guide/deployment#full-ai-tools-on-nvidia-cuda) bevat alle GPU- en CPU-tijden, en de [Docker-image-benchmarks](/nl/guide/docker-tags#benchmarks) de warme en koude startwaarden.
- Draaien AI-tools toch op de CPU, zie dan [GPU-versnelling controleren](/nl/guide/deployment#verify-gpu-acceleration).
- Gebruik voor Compose de [NVIDIA CUDA-snelstart](/nl/guide/deployment#quick-start-nvidia-cuda) in de implementatiegids.

## Andere manieren om te installeren {#other-ways-to-install}

### Enkele container met Compose {#single-container-compose}

Dezelfde container in embedded modus als in de snelstart, opgeschreven als Compose-bestand zodat hij makkelijker bij te houden en aan te passen is. Sla het op als `docker-compose.yml` en voer `docker compose up -d` uit:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

Net als de opdracht `docker run` is dit bedoeld om SnapOtter uit te proberen en voor kleine installaties. Elke instelling uit [Configuratie](/nl/guide/configuration) hoort onder `environment`.

### Docker Compose (productie) {#docker-compose}

Gebruik het productiebestand dat bij elke release wordt onderhouden en getest, in plaats van een verkort Compose-voorbeeld van deze pagina over te nemen:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Open [http://localhost:1349](http://localhost:1349) en log in met `admin` / `admin`.

Het canonieke [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) bevat alle vier de runtime-volumes, healthchecks, resourcelimieten, duurzame Redis-configuratie, vastgezette database-/cache-images en de huidige containerhardening. Wijzig het standaard beheerderswachtwoord direct na de eerste aanmelding. Zet voor een reproduceerbare implementatie de SnapOtter-applicatie-image vast op de releasetag of digest die u hebt gecontroleerd, in plaats van `latest` te volgen.

Zie [Configuratie](/nl/guide/configuration) voor alle omgevingsvariabelen en [Beveiliging en hardening](/nl/guide/security) voor geheimen, netwerkbeleid en back-upadvies.

### GitHub Container Registry {#ghcr}

Docker Hub en GHCR publiceren bij elke release dezelfde image. Wissel de imagenaam om van GHCR te pullen:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### Bouwen vanaf de broncode {#build-from-source}

**Vereisten:** Node.js 22.22+, pnpm 9+, Docker (voor Postgres + Redis), Python 3.11+ (voor AI-functies), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## Wat u kunt doen {#what-you-can-do}

### Bestandsverwerking (200+ tools) {#file-processing-200-tools}

| Modaliteit | Aantal | Voorbeeldtools |
|----------|-------|---------------|
| **Afbeelding** | 114 | Formaat wijzigen, Bijsnijden, Comprimeren, Converteren, Achtergrond verwijderen, Opschalen, OCR, Watermerk, Collage, Inkleuren, GIF-tools, formaatpresets |
| **Video** | 63 | Knippen, Bijsnijden, Comprimeren, Converteren, Samenvoegen, Audio extraheren, Automatische ondertitels, Video naar GIF, Formaat wijzigen, Stabiliseren, formaatpresets |
| **Audio** | 57 | Knippen, Samenvoegen, Converteren, Normaliseren, Ruisonderdrukking, Transcriberen, Toonhoogte wijzigen, Fade, Ringtone-maker, formaatpresets |
| **PDF / Document** | 37 | Samenvoegen, Splitsen, Comprimeren, OCR, Watermerk, Redigeren, Word naar PDF, Excel naar PDF, Roteren, Beveiligen, Repareren |
| **Bestanden** | 32 | CSV naar JSON, JSON naar XML, CSV's samenvoegen, CSV splitsen, ZIP maken, ZIP uitpakken, Grafiekmaker, YAML/JSON, Lettertype converteren, Verhoudingscalculator, Base64, formaatpresets |

### Pipelines {#pipelines}

Koppel tools aan elkaar tot workflows met meerdere stappen en pas ze toe op één afbeelding of een hele batch:

1. Open **Pipelines** in de zijbalk.
2. Voeg stappen toe (elke tool, elke instelling).
3. Voer uit op één bestand, of op een hele batch tegelijk.
4. Sla de pipeline op voor later hergebruik.

Pipelines staan standaard 20 stappen toe. Stel [`MAX_PIPELINE_STEPS=0`](/nl/guide/configuration#env-max-pipeline-steps) in om de limiet onbeperkt te maken.

### Bestandsbibliotheek {#file-library}

Elk bestand dat u verwerkt, kan worden opgeslagen in uw **Files**-bibliotheek. SnapOtter houdt de volledige versiegeschiedenis bij, zodat u elke verwerkingsstap kunt terugvolgen van de oorspronkelijke upload tot het eindresultaat.

Opslaan is expliciet: resultaten die u in de bibliotheek opslaat blijven bewaard tot u ze verwijdert, terwijl resultaten die u verwerkt maar niet opslaat na 72 uur automatisch worden gewist (instelbaar via [`FILE_MAX_AGE_HOURS`](/nl/guide/configuration#env-file-max-age-hours)).

### REST API en API-sleutels {#rest-api-api-keys}

Elke tool is bereikbaar via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Genereer API-sleutels onder **Settings → API Keys**. Zie de [REST API-referentie](/nl/api/rest) voor alle endpoints, of ga naar [http://localhost:1349/api/docs](http://localhost:1349/api/docs) voor de interactieve referentie.

### Meerdere gebruikers en teams {#multi-user-teams}

Schakel meerdere gebruikers in met rolgebaseerde toegangscontrole:

- **Admin**: volledige toegang, beheert gebruikers, teams, instellingen en alle bestanden/pipelines/API-sleutels
- **User**: gebruikt tools en beheert eigen bestanden/pipelines/API-sleutels

Maak teams aan onder **Settings → Teams** om gebruikers te groeperen.

Stel [`AUTH_ENABLED=true`](/nl/guide/configuration#env-auth-enabled) in (of `false` voor gebruik door één persoon zonder aanmelding).

## Gebruik het vanaf uw telefoon {#use-it-from-your-phone}

SnapOtter werkt in mobiele browsers en u kunt het als app installeren. Open uw instantie op de telefoon en dan:

- **iPhone / iPad (Safari):** tik op Deel en kies daarna **Zet op beginscherm**.
- **Android (Chrome):** open het browsermenu en tik op **App installeren**.

De geïnstalleerde app opent in een eigen venster, rechtstreeks naar uw instantie.

Eén kanttekening: browsers bieden de installatieprompt alleen aan via HTTPS. Een gewoon HTTP-adres op uw LAN werkt prima in een browsertabblad; zet voor de echte installatie de instantie achter een reverse proxy met een certificaat (zie de [implementatiehandleiding](/nl/guide/deployment)).

Op telefoons en tablets tonen afbeeldingstools een knop **Foto maken** naast de uploadknop. Fotografeer een bon of een whiteboard en het komt direct in de tool terecht.
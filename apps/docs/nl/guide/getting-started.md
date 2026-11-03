---
description: "Installeer SnapOtter met Docker in één opdracht. Inclusief Docker Compose-configuratie, bouwen vanaf de broncode en een volledig functieoverzicht."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: 2cd174b8d528
i18n_hash_version: 2
---

# Aan de slag {#getting-started}

::: tip Eerst proberen, dan installeren
Verken de volledige gebruikersinterface op [demo.snapotter.com](https://demo.snapotter.com) - zonder aanmelding of installatie.
:::

## Snelstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Deze ene container draait alles wat nodig is: zonder ingestelde `DATABASE_URL` start hij zijn eigen PostgreSQL en Redis op de loopback-interface (embedded modus) en bewaart hij alle data in het volume `SnapOtter-data`. Dit is de snelste manier om SnapOtter uit te proberen of zelf te hosten op een homelab. Gebruik voor productie de [canonieke Docker Compose-stack](#docker-compose), waarin PostgreSQL en Redis in eigen containers draaien. Embedded modus draait als root (de standaard) en schakelt automatisch uit zodra u `DATABASE_URL` instelt.

Installeert u op een Raspberry Pi, een oude laptop of een kleine VPS? Zie [Setups met weinig resources](/nl/guide/low-resource) voor een afgestemde handleiding en wat u van beperkte hardware mag verwachten.

U wordt gevraagd uw wachtwoord te wijzigen bij de eerste aanmelding.

::: tip Anonieme productanalyse
SnapOtter bevat standaard anonieme productanalyse. Om dit uit te schakelen opent u **Settings → System → Privacy** en zet u **Anonymous Product Analytics** uit. Het stopt direct voor de hele instantie.

U kunt ook de omgevingsvariabele `SNAPOTTER_TELEMETRY=0` instellen (`false` en `off` werken ook) om alle telemetrie voor de instantie uit te schakelen zonder opnieuw te bouwen.

Foutmonitoring wordt verzorgd door [Sentry](https://sentry.io), dat SnapOtter sponsort via zijn open-sourceprogramma.

Zie [Wat SnapOtter verzamelt](/nl/guide/telemetry) voor details over wat er wordt verzameld.
:::

::: tip NVIDIA CUDA-versnelling
Voeg `--gpus all` toe voor NVIDIA CUDA-versnelde achtergrondverwijdering, opschaling, gezichtsverbetering en restauratie. OCR blijft CPU-gebaseerd en werkt in dezelfde image met of zonder GPU-toegang:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Vereist de [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Valt automatisch terug op de CPU wanneer CUDA niet beschikbaar is. Versnelling via een Intel/AMD-iGPU met VA-API, Quick Sync of OpenCL wordt momenteel niet ondersteund voor AI-inferentie. Zie [Docker-tags](/nl/guide/docker-tags) voor benchmarks. Draaien AI-tools op de CPU ondanks `--gpus all`, zie dan [GPU-versnelling controleren](/nl/guide/deployment#verify-gpu-acceleration).
:::

::: details Ook op GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Beide registries publiceren bij elke release dezelfde image.
:::

## Docker Compose {#docker-compose}

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

Het canonieke [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) bevat alle vier de runtime-volumes, healthchecks, resourcelimieten, duurzame Redis-configuratie, vastgezette database-/cache-images en de huidige containerhardening. Wijzig het standaard beheerderswachtwoord direct na de eerste aanmelding. Zet voor een reproduceerbare implementatie de SnapOtter-applicatie-image vast op de releasetag of digest die u hebt gecontroleerd, in plaats van `latest` te volgen.

Zie [Configuratie](/nl/guide/configuration) voor alle omgevingsvariabelen en [Beveiliging en hardening](/nl/guide/security) voor geheimen, netwerkbeleid en back-upadvies.

## Bouwen vanaf de broncode {#build-from-source}

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
| **Afbeelding** | 112 | Formaat wijzigen, Bijsnijden, Comprimeren, Converteren, Achtergrond verwijderen, Opschalen, OCR, Watermerk, Collage, Inkleuren, GIF-tools, formaatpresets |
| **Video** | 57 | Knippen, Bijsnijden, Comprimeren, Converteren, Samenvoegen, Audio extraheren, Automatische ondertitels, Video naar GIF, Formaat wijzigen, Stabiliseren, formaatpresets |
| **Audio** | 27 | Knippen, Samenvoegen, Converteren, Normaliseren, Ruisonderdrukking, Transcriberen, Toonhoogte wijzigen, Fade, Ringtone-maker, formaatpresets |
| **PDF / Document** | 35 | Samenvoegen, Splitsen, Comprimeren, OCR, Watermerk, Redigeren, Word naar PDF, Excel naar PDF, Roteren, Beveiligen, Repareren |
| **Bestanden** | 23 | CSV naar JSON, JSON naar XML, CSV's samenvoegen, CSV splitsen, ZIP maken, ZIP uitpakken, Grafiekmaker, YAML/JSON |

### Pipelines {#pipelines}

Koppel tools aan elkaar tot workflows met meerdere stappen en pas ze toe op één afbeelding of een hele batch:

1. Open **Pipelines** in de zijbalk.
2. Voeg stappen toe (elke tool, elke instelling).
3. Voer uit op één bestand - of op een hele batch tegelijk.
4. Sla de pipeline op voor later hergebruik.

Pipelines staan standaard 20 stappen toe. Stel `MAX_PIPELINE_STEPS=0` in om de limiet onbeperkt te maken.

### Bestandsbibliotheek {#file-library}

Elk bestand dat u verwerkt, kan worden opgeslagen in uw **Files**-bibliotheek. SnapOtter houdt de volledige versiegeschiedenis bij, zodat u elke verwerkingsstap kunt terugvolgen van de oorspronkelijke upload tot het eindresultaat.

Opslaan is expliciet: resultaten die u in de bibliotheek opslaat blijven bewaard tot u ze verwijdert, terwijl resultaten die u verwerkt maar niet opslaat na 72 uur automatisch worden gewist (instelbaar via `FILE_MAX_AGE_HOURS`).

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

- **Admin**: volledige toegang - beheer gebruikers, teams, instellingen, alle bestanden/pipelines/API-sleutels
- **User**: gebruik tools, beheer eigen bestanden/pipelines/API-sleutels

Maak teams aan onder **Settings → Teams** om gebruikers te groeperen.

Stel `AUTH_ENABLED=true` in (of `false` voor gebruik door één persoon zonder aanmelding).

## Gebruik het vanaf uw telefoon {#use-it-from-your-phone}

SnapOtter werkt in mobiele browsers en u kunt het als app installeren. Open uw instantie op de telefoon en dan:

- **iPhone / iPad (Safari):** tik op Deel en kies daarna **Zet op beginscherm**.
- **Android (Chrome):** open het browsermenu en tik op **App installeren**.

De geïnstalleerde app opent in een eigen venster, rechtstreeks naar uw instantie.

Eén kanttekening: browsers bieden de installatieprompt alleen aan via HTTPS. Een gewoon HTTP-adres op uw LAN werkt prima in een browsertabblad; zet voor de echte installatie de instantie achter een reverse proxy met een certificaat (zie de [implementatiehandleiding](/nl/guide/deployment)).

Op telefoons en tablets tonen afbeeldingstools een knop **Foto maken** naast de uploadknop. Fotografeer een bon of een whiteboard en het komt direct in de tool terecht.

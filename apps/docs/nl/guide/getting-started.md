---
description: "Installeer SnapOtter met Docker in één commando. Inclusief Docker Compose-installatie, bouwen vanaf broncode en een volledig functieoverzicht."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: 034d42379189
i18n_hash_version: 2
---

# Aan de slag {#getting-started}

::: tip Probeer voor je installeert
Verken de volledige UI op [demo.snapotter.com](https://demo.snapotter.com) - geen aanmelding of installatie vereist.
:::

## Snelstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Deze enkele container voert alles uit wat hij nodig heeft: zonder `DATABASE_URL` ingesteld, start hij zijn eigen PostgreSQL en Redis op de loopback-interface (embedded mode) en bewaart hij alle gegevens in het `SnapOtter-data`-volume. Het is de snelste manier om SnapOtter uit te proberen of zelf te hosten op een thuislab. Gebruik voor productie de [canonieke Docker Compose-stack](#docker-compose), die PostgreSQL en Redis in hun eigen containers bewaart. De ingebouwde modus wordt uitgevoerd als root (standaard) en wordt automatisch uitgeschakeld zodra u `DATABASE_URL` instelt.

Installeer je op een Raspberry Pi, een oude laptop of een kleine VPS? Zie [Setups met beperkte resources](/nl/guide/low-resource) voor een afgestemd stappenplan en wat je van beperkte hardware kunt verwachten.

Je wordt bij de eerste login gevraagd je wachtwoord te wijzigen.

::: tip Anonieme Productanalytics
SnapOtter bevat standaard anonieme productanalytics. Om het uit te schakelen, open je **Instellingen → Systeem → Privacy** en zet je **Anonieme Productanalytics** uit. Het stopt onmiddellijk voor de hele instance.

Je kunt ook de omgevingsvariabele `SNAPOTTER_TELEMETRY=0` instellen (`false` en `off` werken ook) om alle telemetrie voor de instance uit te schakelen zonder herbouw.

Foutmonitoring wordt aangedreven door [Sentry](https://sentry.io), dat SnapOtter sponsort via zijn open-source-programma.

Zie [Wat SnapOtter verzamelt](/nl/guide/telemetry) voor details over wat er wordt verzameld.
:::

::: tip NVIDIA CUDA-versnelling
Voeg `--gpus all` toe voor NVIDIA CUDA-versnelde achtergrondverwijdering, opschaling, gezichtsverbetering en restauratie. OCR blijft CPU-gebaseerd en werkt in dezelfde afbeelding met of zonder GPU-toegang:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Vereist de [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Valt automatisch terug naar de CPU wanneer CUDA niet beschikbaar is. Intel/AMD iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt momenteel niet ondersteund voor AI-inferentie. Zie [Docker-tags](/nl/guide/docker-tags) voor benchmarks. Als AI-tools ondanks `--gpus all` op de CPU draaien, zie dan [GPU-versnelling verifiëren](/nl/guide/deployment#verify-gpu-acceleration).
:::

::: details Ook op GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Beide registries publiceren bij elke release dezelfde image.
:::

## Docker Componeer {#docker-compose}

Gebruik het productiebestand dat bij elke release wordt onderhouden en getest in plaats van een verkort Compose-voorbeeld van deze pagina te kopiëren:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

De canonieke [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) omvat alle vier de runtimevolumes, gezondheidscontroles, resourcelimieten, duurzame Redis-configuratie, vastgezette database-/cache-images en de huidige containerverharding. Wijzig het standaard beheerderswachtwoord onmiddellijk na de eerste keer inloggen. Voor een reproduceerbare implementatie maakt u de SnapOtter-toepassingsimage vast aan de releasetag of -digest die u hebt geverifieerd, in plaats van `latest` te volgen.

Zie [Configuratie](/nl/guide/configuration) voor alle omgevingsvariabelen en [Beveiliging en beveiliging](/nl/guide/security) voor geheimen, netwerkbeleid en back-uprichtlijnen.

## Bouwen vanaf broncode {#build-from-source}

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

## Wat je kunt doen {#what-you-can-do}

### Bestandsverwerking (200+ tools) {#file-processing-200-tools}

| Modaliteit | Aantal | Voorbeeldtools |
|----------|-------|---------------|
| **Afbeelding** | 107 | Formaat wijzigen, Bijsnijden, Comprimeren, Converteren, Achtergrond verwijderen, Upscale, OCR, Watermerk, Collage, Inkleuren, GIF-tools, formaatpresets |
| **Video** | 57 | Trimmen, Bijsnijden, Comprimeren, Converteren, Samenvoegen, Audio extraheren, Automatische ondertitels, Video naar GIF, Formaat wijzigen, Stabiliseren, formaatpresets |
| **Audio** | 27 | Trimmen, Samenvoegen, Converteren, Normaliseren, Ruisonderdrukking, Transcriberen, Pitch verschuiven, Fade, Beltoonmaker, formaatpresets |
| **PDF / Document** | 29 | Samenvoegen, Splitsen, Comprimeren, OCR, Watermerk, Redigeren, Word naar PDF, Excel naar PDF, Roteren, Beveiligen, Repareren |
| **Bestanden** | 23 | CSV naar JSON, JSON naar XML, CSV's samenvoegen, CSV splitsen, ZIP maken, ZIP uitpakken, Grafiekmaker, YAML/JSON |

### Pijplijnen {#pipelines}

Koppel tools aan elkaar tot workflows met meerdere stappen en pas ze toe op één afbeelding of een hele batch:

1. Open **Pijplijnen** in de zijbalk.
2. Voeg stappen toe (elke tool, alle instellingen).
3. Draai op één bestand - of een hele batch tegelijk.
4. Sla de pijplijn op voor later hergebruik.

Pijplijnen staan standaard 20 stappen toe. Stel `MAX_PIPELINE_STEPS=0` in om de limiet onbeperkt te maken.

### Bestandsbibliotheek {#file-library}

Elk bestand dat je verwerkt, kan worden opgeslagen in je **Bestanden**-bibliotheek. SnapOtter houdt de volledige versiegeschiedenis bij zodat je elke verwerkingsstap kunt traceren van de oorspronkelijke upload tot de uiteindelijke uitvoer.

Opslaan is expliciet: resultaten die je in de bibliotheek opslaat, blijven bewaard tot je ze verwijdert, terwijl resultaten die je verwerkt en niet opslaat automatisch na 72 uur worden gewist (configureerbaar via `FILE_MAX_AGE_HOURS`).

### REST API & API-sleutels {#rest-api-api-keys}

Elke tool is toegankelijk via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Genereer API-sleutels onder **Instellingen → API-sleutels**. Zie de [REST API-referentie](/nl/api/rest) voor alle endpoints, of bezoek [http://localhost:1349/api/docs](http://localhost:1349/api/docs) voor de interactieve referentie.

### Meerdere gebruikers & teams {#multi-user-teams}

Schakel meerdere gebruikers in met op rollen gebaseerde toegangscontrole:

- **Beheerder**: volledige toegang - beheer gebruikers, teams, instellingen, alle bestanden/pijplijnen/API-sleutels
- **Gebruiker**: gebruik tools, beheer eigen bestanden/pijplijnen/API-sleutels

Maak teams aan onder **Instellingen → Teams** om gebruikers te groeperen.

Stel `AUTH_ENABLED=true` in (of `false` voor gebruik met één gebruiker/eigen gebruik zonder login).

## Gebruik het vanaf je telefoon {#use-it-from-your-phone}

SnapOtter werkt in mobiele browsers, en je kunt het als app installeren. Open je instance op je telefoon en doe dan het volgende:

- **iPhone / iPad (Safari)**: tik op Deel en dan op **Zet op beginscherm**.
- **Android (Chrome)**: open het browsermenu en tik op **App installeren**.

De geïnstalleerde app opent in een eigen venster, direct in je instance.

Eén ding om te weten: browsers bieden de installatie alleen aan via HTTPS. Een gewoon HTTP-adres op je LAN werkt prima in een browsertabblad; voor de echte installatie zet je de instance achter een reverse proxy met een certificaat (zie de [implementatiegids](/nl/guide/deployment)).

Op telefoons en tablets tonen de afbeeldingstools een knop **Foto maken** naast de uploadknop. Fotografeer een bonnetje of een whiteboard en het staat meteen in de tool.

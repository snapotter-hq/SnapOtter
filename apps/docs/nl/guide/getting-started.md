---
description: "Installeer SnapOtter met Docker in één commando. Inclusief Docker Compose-installatie, bouwen vanaf broncode en een volledig functieoverzicht."
i18n_source_hash: 4536d4558b8e
i18n_provenance: machine
i18n_output_hash: d29d27e8097b
---

# Aan de slag {#getting-started}

::: tip Probeer voor je installeert
Verken de volledige UI op [demo.snapotter.com](https://demo.snapotter.com) - geen aanmelding of installatie vereist.
:::

## Snelstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Deze enkele container draait alles wat hij nodig heeft: zonder ingestelde `DATABASE_URL` start hij zijn eigen PostgreSQL en Redis op de loopback-interface (embedded-modus) en houdt alle data in het `SnapOtter-data`-volume. Het is de snelste manier om SnapOtter te proberen of zelf te hosten op een homelab. Draai voor productie de [Docker Compose](#docker-compose)-stack hieronder, die PostgreSQL en Redis in hun eigen containers houdt. De embedded-modus draait als root (de standaard) en schakelt zichzelf automatisch uit zodra je `DATABASE_URL` instelt.

Je wordt bij de eerste login gevraagd je wachtwoord te wijzigen.

::: tip Anonieme Productanalytics
SnapOtter bevat standaard anonieme productanalytics. Om het uit te schakelen, open je **Instellingen → Systeem → Privacy** en zet je **Anonieme Productanalytics** uit. Het stopt onmiddellijk voor de hele instance.

Je kunt ook de omgevingsvariabele `SNAPOTTER_TELEMETRY=0` instellen (`false` en `off` werken ook) om alle telemetrie voor de instance uit te schakelen zonder herbouw.

Foutmonitoring wordt aangedreven door [Sentry](https://sentry.io), dat SnapOtter sponsort via zijn open-source-programma.

Zie [Wat SnapOtter verzamelt](/nl/guide/telemetry) voor details over wat er wordt verzameld.
:::

::: tip NVIDIA CUDA-versnelling
Voeg `--gpus all` toe voor NVIDIA CUDA-versnelde achtergrondverwijdering, upscaling, OCR, gezichtsverbetering en restauratie:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Vereist de [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Valt automatisch terug op CPU wanneer CUDA niet beschikbaar is. Intel/AMD iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt vandaag niet ondersteund voor AI-inferentie. Zie [Docker Tags](/nl/guide/docker-tags) voor benchmarks.
:::

::: details Ook op GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Beide registries publiceren bij elke release dezelfde image.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Zie [Configuratie](/nl/guide/configuration) voor alle omgevingsvariabelen.

## Bouwen vanaf broncode {#build-from-source}

**Vereisten:** Node.js 22+, pnpm 9+, Docker (voor Postgres + Redis), Python 3.10+ (voor AI-functies), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## Wat je kunt doen {#what-you-can-do}

### Bestandsverwerking (200+ tools) {#file-processing-200-tools}

| Modaliteit | Aantal | Voorbeeldtools |
|----------|-------|---------------|
| **Afbeelding** | 105 | Formaat wijzigen, Bijsnijden, Comprimeren, Converteren, Achtergrond verwijderen, Upscale, OCR, Watermerk, Collage, Inkleuren, GIF-tools, formaatpresets |
| **Video** | 57 | Trimmen, Bijsnijden, Comprimeren, Converteren, Samenvoegen, Audio extraheren, Automatische ondertitels, Video naar GIF, Formaat wijzigen, Stabiliseren, formaatpresets |
| **Audio** | 27 | Trimmen, Samenvoegen, Converteren, Normaliseren, Ruisonderdrukking, Transcriberen, Pitch verschuiven, Fade, Beltoonmaker, formaatpresets |
| **PDF / Document** | 42 | Samenvoegen, Splitsen, Comprimeren, OCR, Watermerk, Redigeren, Word naar PDF, Excel naar PDF, Roteren, Beveiligen, Repareren |
| **Bestanden** | 10 | CSV naar JSON, JSON naar XML, CSV's samenvoegen, CSV splitsen, ZIP maken, ZIP uitpakken, Grafiekmaker, YAML/JSON |

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

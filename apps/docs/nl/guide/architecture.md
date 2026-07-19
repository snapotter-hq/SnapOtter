---
description: "Monorepo-structuur, app- en package-architectuur, request-levenscyclus en resourcegebruik van SnapOtter."
i18n_output_hash: 5122b85d1d84
i18n_source_hash: a53946e760b0
i18n_provenance: human
---

# Architectuur {#architecture}

SnapOtter is een monorepo beheerd met pnpm-workspaces en Turborepo. Het wordt uitgerold als een Docker Compose-stack met 3 containers: de SnapOtter-app-image, PostgreSQL 17 en Redis 8.

## Projectstructuur {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Packages {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

De kernbibliotheek voor beeldverwerking, gebouwd op [Sharp](https://sharp.pixelplumbing.com/). Deze handelt alle niet-AI-bewerkingen af: vergroten/verkleinen, bijsnijden, roteren, spiegelen, converteren, comprimeren, metadata verwijderen en kleuraanpassingen (helderheid, contrast, verzadiging, grijstinten, sepia, inverteren, kleurkanalen).

Dit package heeft geen netwerkafhankelijkheden en draait volledig in-process.

### `@snapotter/ai` {#snapotter-ai}

Een bruglaag die native en Python ML runtimes aanroept. De meeste Python-tools gebruiken een persistente dispatcher die zware bibliotheken (PIL, NumPy, MediaPipe, rembg) vooraf importeert, zodat daaropvolgende oproepen de importoverhead overslaan. OCR is geïsoleerd van die veranderlijke gedeelde omgeving: `fast` roept native Tesseract op, terwijl `balanced` en `best` een speciale persistente JSONL dispatcher gebruiken die is vastgemaakt aan de actieve onveranderlijke RapidOCR/ONNX-generatie. Elk verzoek bevat een generation lease. Bij activering wordt eerst een smoke test op een kandidaat uitgevoerd en vervolgens atomair overgeschakeld naar de dispatcher. De eerdere dispatcher loopt leeg voordat het afval wordt opgehaald.

**Modellen worden niet vooraf geladen.** Elk toolscript laadt zijn modelgewichten bij het verzoek van schijf en verwijdert ze zodra het verzoek klaar is. Zie [Resourcegebruik](#resource-footprint) voor het volledige geheugenprofiel.

Ondersteunde bewerkingen: achtergrondverwijdering (rembg/BiRefNet), opschaling (RealESRGAN), gezichtsvervaging (MediaPipe), gezichtsverbetering (GFPGAN/CodeFormer), object wissen (LaMa ONNX), OCR (Tesseract en RapidOCR met PP-OCR ONNX-modellen), inkleuring (DDColor), ruisverwijdering, verwijdering van rode ogen, fotoherstel, pasfoto generatie, transparantiefixatie (BiRefNet HR-matting) en inhoudsbewust formaat wijzigen (Go caire binary).

Python-scripts zijn live in `packages/ai/python/`. Grote optionele modelpakketten worden op aanvraag geïnstalleerd in het permanente `/data/ai`-volume. Nauwkeurige OCR maakt gebruik van ondertekende, platformspecifieke artefacten; Voor de ingebouwde Tesseract-laag is geen download van een modelpakket vereist.

### `@snapotter/shared` {#snapotter-shared}

Gedeelde TypeScript-types, constanten (zoals `APP_VERSION` en tooldefinities) en i18n-vertaalstrings die door zowel de frontend als de backend worden gebruikt.

## Applicaties {#applications}

### API (`apps/api`) {#api-apps-api}

Een Fastify v5-server die 241 toolroutes over vijf modaliteiten (image, video, audio, PDF, file) blootstelt en het volgende afhandelt:
- Bestandsuploads, beheer van tijdelijke werkruimte en persistente bestandsopslag
- Gebruikersbibliotheek voor bestanden (`user_files`-tabel): een opgeslagen bewerking wordt standaard opgeslagen als een onafhankelijk nieuw bestand, of als een aan de bovenliggende rij gekoppelde versie wanneer je het origineel overschrijft. Ze registreert welke tools zijn toegepast (`toolChain`) en krijgt een automatisch gegenereerde miniatuur voor de Files-pagina
- Tooluitvoering (routeert elk toolverzoek naar de image-engine of AI-brug)
- Pijplijnorkestratie (meerdere tools sequentieel aan elkaar koppelen)
- Batchverwerking met concurrentiebeheer via BullMQ-taakwachtrijen (pools: image, media, ai, docs, system)
- Gebruikersauthenticatie, RBAC (admin/user-rollen met een volledige set permissies), beheer van API-sleutels en rate limiting
- Teambeheer - alleen voor admins, CRUD; gebruikers worden aan een team toegewezen via het `team`-veld op hun profiel
- Runtime-instellingen - een key-value store in de `settings`-tabel die `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit` en andere operationele knoppen aanstuurt zonder opnieuw uit te rollen
- Aangepaste branding en runtime-voorkeuren via database-ondersteunde instellingen
- Scalar/OpenAPI-documentatie op `/api/docs`
- De gebouwde frontend als SPA serveren in productie

Belangrijkste dependencies: Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, Zod voor validatie.

De server handelt een nette afsluiting af bij SIGTERM/SIGINT: hij drainert HTTP-verbindingen, stopt BullMQ-workers, sluit de Python-dispatcher af en sluit de databaseverbinding.

### Web (`apps/web`) {#web-apps-web}

Een single-page app in React 19, gebouwd met Vite. Gebruikt Zustand voor statebeheer, Tailwind CSS v4 voor styling en Lucide voor iconen. Communiceert met de API via REST en SSE (voor voortgangsregistratie).

Pagina's omvatten een toolwerkruimte, een Files-pagina voor het beheren van persistente uploads en resultaten, een automatiserings-/pijplijnbouwer en een admin-instellingenpaneel.

De gebouwde frontend wordt in productie geserveerd door de Fastify-backend, dus er is geen aparte webserver in de Docker-container.

### Docs (`apps/docs`) {#docs-apps-docs}

Deze VitePress-site. Wordt automatisch uitgerold naar Cloudflare Pages bij een push naar `main`.

## Hoe een verzoek verloopt {#how-a-request-flows}

1. De gebruiker kiest een tool in de web-UI en uploadt een bestand.
2. De frontend stuurt een multipart POST naar `/api/v1/tools/:section/:toolId` met het bestand en de instellingen.
3. De API-route valideert de invoer met Zod en start vervolgens de verwerking.
4. Voor standaardtools wordt de taak in de juiste BullMQ-pool geplaatst (image, media of docs op basis van modaliteit). De in-process BullMQ-worker oriënteert de afbeelding automatisch op basis van EXIF-metadata, voert de procesfunctie van de tool uit en geeft het resultaat terug.
5. Voor de meeste AI-tools stuurt de TypeScript-bridge een verzoek naar de persistente Python dispatcher. Snelle OCR roept in plaats daarvan Tesseract aan, en nauwkeurige OCR start het vastgezette uitvoerbare bestand vanaf de actieve onveranderlijke OCR-generatie. De aangevraagde OCR-laag wordt vastgesteld bij binnenkomst en wordt tijdens de uitvoering nooit stilzwijgend gewijzigd.
6. Taakvoortgang wordt vastgelegd in de `jobs`-tabel in PostgreSQL, zodat de state herstarts van de container overleeft. Realtime-updates worden geleverd via SSE op `/api/v1/jobs/:jobId/progress`.
7. De API retourneert een `jobId` en `downloadUrl`. De gebruiker downloadt het verwerkte bestand vanaf `/api/v1/download/:jobId/:filename`.

Voor pijplijnen voert de API de uitvoer van elke stap als invoer aan de volgende, en draait ze sequentieel.

Voor batchverwerking gebruikt de API BullMQ-flows met per-stap onderliggende taken en retourneert een ZIP-bestand met alle verwerkte bestanden.

## Resourcegebruik {#resource-footprint}

SnapOtter is ontworpen voor laag geheugengebruik bij inactiviteit. Er wordt bij het opstarten niets vooraf geladen of warm gehouden.

### Bij inactiviteit {#at-idle}

Het Node.js/Fastify-proces, PostgreSQL en Redis draaien. Typisch RAM-gebruik bij inactiviteit is **~200-300 MB** verdeeld over alle drie de containers (Node.js-proces, Postgres en Redis). Geen Python-proces, geen modelgewichten in het geheugen.

### Wat er start, en wanneer {#what-starts-and-when}

| Component | Start wanneer | Geheugen tijdens actief zijn |
|-----------|-------------|---------------------|
| Fastify-server + Postgres + Redis | Bij het starten van de container | ~200-300 MB totaal |
| BullMQ-workers | Bij het starten van de container (in-process) | Eén worker per pool (image, media, ai, docs, system) |
| Python-dispatcher | Bij het eerste AI-toolverzoek | Python-interpreter + vooraf geïmporteerde bibliotheken (PIL, NumPy, MediaPipe, rembg) - geen modelgewichten |
| AI-modelgewichten | Tijdens het verzoek van de specifieke tool | Van schijf geladen, vrijgegeven wanneer het verzoek klaar is |

### Modellen laden {#model-loading}

Alle modelgewichtbestanden (samen enkele GB) staan te allen tijde op schijf in `/opt/models/`. Elk AI-toolscript laadt alleen zijn eigen model(len) in het geheugen voor de duur van een verzoek en geeft ze daarna vrij. Sommige scripts roepen expliciet `del model` en `torch.cuda.empty_cache()` aan na de inferentie om ervoor te zorgen dat het geheugen onmiddellijk wordt teruggegeven.

Er is geen modelcache tussen verzoeken. Dezelfde AI-tool achter elkaar draaien laadt het model telkens opnieuw. Dit houdt het geheugengebruik bij inactiviteit vrijwel op nul, ten koste van een laadvertraging voor het model bij elk AI-verzoek.

### Cold start bij het eerste AI-verzoek {#first-ai-request-cold-start}

De Python-dispatcher draait niet wanneer de container start. Het eerste AI-verzoek zet twee dingen parallel in gang: de dispatcher begint op de achtergrond op te warmen, en het verzoek zelf valt terug op het opstarten van een eenmalige Python-subprocess. Zodra de dispatcher aangeeft klaar te zijn, gebruiken alle volgende AI-verzoeken deze rechtstreeks en slaan ze de kosten van het opstarten van een subprocess over.

---
description: "Monorepo-struktur, app- och paketarkitektur, förfrågningslivscykel och resursavtryck för SnapOtter."
i18n_output_hash: bafad20476af
i18n_source_hash: a53946e760b0
i18n_provenance: human
---

# Arkitektur {#architecture}

SnapOtter är ett monorepo som hanteras med pnpm workspaces och Turborepo. Det distribueras som en Docker Compose-stack med 3 containrar: SnapOtter-appavbildningen, PostgreSQL 17 och Redis 8.

## Projektstruktur {#project-structure}

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

## Paket {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

Kärnbiblioteket för bildbehandling byggt på [Sharp](https://sharp.pixelplumbing.com/). Det hanterar alla icke-AI-operationer: storleksändring, beskärning, rotation, spegling, konvertering, komprimering, borttagning av metadata och färgjusteringar (ljusstyrka, kontrast, mättnad, gråskala, sepia, invertering, färgkanaler).

Detta paket har inga nätverksberoenden och körs helt in-process.

### `@snapotter/ai` {#snapotter-ai}

Ett brygglager som anropar native och Python ML körtider. De flesta Python-verktyg använder en beständig dispatcher som förimporterar tunga bibliotek (PIL, NumPy, MediaPipe, rembg) så att efterföljande anrop hoppar över importkostnader. OCR är isolerad från den föränderliga delade miljön: `fast` anropar inbyggd Tesseract, medan `balanced` och `best` använder en dedikerad beständig JSONL dispatcher som är fäst vid den aktiva oföränderliga RapidOCR/ONNX-generationen. Varje begäran innehåller en generation lease. Aktivering kör först en smoke test på en kandidat och växlar sedan atomärt till dess dispatcher. Den tidigare dispatcher dräneras innan den genereras sopsamlas.

**Modeller är inte förinlästa.** Varje verktygsskript laddar sina modellvikter från disk vid förfrågningstillfället och kasserar dem när förfrågan är klar. Se [Resursavtryck](#resource-footprint) för den fullständiga minnesprofilen.

Operationer som stöds: bakgrundsborttagning (rembg/BiRefNet), uppskalning (RealESRGAN), ansiktsoskärpa (MediaPipe), ansiktsförbättring (GFPGAN/CodeFormer), objektradering (LaMa ONNX), OCR (Tesseract och RapidOCR med PP-OCR ONNX-modeller), färgläggning (DDColor), bullerborttagning, borttagning av röda ögon, foto restaurering, generering av passfoto, transparensfixering (BiRefNet HR-matta), och innehållsmedveten storleksändring (Go caire binär).

Python-skript live i `packages/ai/python/`. Stora valfria modellpaket installeras på begäran i den ihållande `/data/ai`-volymen. Exakt OCR använder signerade, plattformsspecifika artefakter; den inbyggda Tesseract-nivån kräver ingen nedladdning av modellpaket.

### `@snapotter/shared` {#snapotter-shared}

Delade TypeScript-typer, konstanter (som `APP_VERSION` och verktygsdefinitioner) och i18n-översättningssträngar som används av både frontend och backend.

## Applikationer {#applications}

### API (`apps/api`) {#api-apps-api}

En Fastify v5-server som exponerar 241 verktygsrutter över fem modaliteter (image, video, audio, PDF, file) och som hanterar:
- Filuppladdningar, hantering av tillfällig arbetsyta och beständig fillagring
- Användarens filbibliotek (`user_files`-tabellen): en sparad ändring lagras som standard som en oberoende ny fil, eller som en förälderlänkad version när du skriver över originalet. Det registrerar vilka verktyg som tillämpades (`toolChain`) och får en autogenererad miniatyrbild för Files-sidan
- Verktygsexekvering (dirigerar varje verktygsförfrågan till bildmotorn eller AI-bryggan)
- Pipeline-orkestrering (kedjar samman flera verktyg sekventiellt)
- Batchbearbetning med samtidighetskontroll via BullMQ-jobbköer (pooler: image, media, ai, docs, system)
- Användarautentisering, RBAC (admin/user-roller med en fullständig behörighetsuppsättning), hantering av API-nycklar och hastighetsbegränsning
- Teamhantering - endast admin-CRUD; användare tilldelas ett team via `team`-fältet på sin profil
- Körtidsinställningar - ett nyckel-värde-lager i `settings`-tabellen som styr `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit` och andra driftsrattar utan att distribuera om
- Anpassad varumärkesprofilering och körtidsinställningar via databasbaserade inställningar
- Scalar/OpenAPI-dokumentation på `/api/docs`
- Serverar den byggda frontenden som en SPA i produktion

Viktiga beroenden: Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, Zod för validering.

Servern hanterar smidig avstängning vid SIGTERM/SIGINT: den dränerar HTTP-anslutningar, stoppar BullMQ-workers, stänger av Python-dispatchern och stänger databasanslutningen.

### Web (`apps/web`) {#web-apps-web}

En React 19 single-page-app byggd med Vite. Använder Zustand för tillståndshantering, Tailwind CSS v4 för styling och Lucide för ikoner. Kommunicerar med API:et över REST och SSE (för förloppsspårning).

Sidorna inkluderar en verktygsarbetsyta, en Files-sida för hantering av beständiga uppladdningar och resultat, en automatisering/pipelinebyggare och en admininställningspanel.

Den byggda frontenden serveras av Fastify-backenden i produktion, så det finns ingen separat webbserver i Docker-containern.

### Docs (`apps/docs`) {#docs-apps-docs}

Denna VitePress-webbplats. Distribueras automatiskt till Cloudflare Pages vid push till `main`.

## Hur en förfrågan flödar {#how-a-request-flows}

1. Användaren väljer ett verktyg i webbgränssnittet och laddar upp en fil.
2. Frontenden skickar en multipart-POST till `/api/v1/tools/:section/:toolId` med filen och inställningarna.
3. API-rutten validerar indata med Zod och dirigerar sedan bearbetningen.
4. För standardverktyg köas jobbet till lämplig BullMQ-pool (image, media eller docs baserat på modalitet). Den in-process-körda BullMQ-workern orienterar bilden automatiskt baserat på EXIF-metadata, kör verktygets bearbetningsfunktion och returnerar resultatet.
5. För de flesta AI-verktyg skickar TypeScript-bryggan en begäran till den beständiga Python dispatcher. Snabb OCR anropar istället Tesseract, och exakt OCR startar den fästa körbara filen från den aktiva oföränderliga OCR-generationen. Den begärda OCR-nivån är fixerad vid inträde och ändras aldrig tyst under exekvering.
6. Jobbförlopp bevaras i `jobs`-tabellen i PostgreSQL så att tillståndet överlever containeromstarter. Realtidsuppdateringar levereras via SSE på `/api/v1/jobs/:jobId/progress`.
7. API:et returnerar en `jobId` och `downloadUrl`. Användaren laddar ner den bearbetade filen från `/api/v1/download/:jobId/:filename`.

För pipelines matar API:et utdata från varje steg som indata till nästa och kör dem sekventiellt.

För batchbearbetning använder API:et BullMQ-flöden med underjobb per steg och returnerar en ZIP-fil med alla bearbetade filer.

## Resursavtryck {#resource-footprint}

SnapOtter är utformat för låg minnesanvändning i viloläge. Ingenting förinläses eller hålls varmt vid start.

### I viloläge {#at-idle}

Node.js/Fastify-processen, PostgreSQL och Redis körs. Typiskt vilo-RAM är **~200-300 MB** över alla tre containrar (Node.js-processen, Postgres och Redis). Ingen Python-process, inga modellvikter i minnet.

### Vad som startar, och när {#what-starts-and-when}

| Komponent | Startar när | Minne medan aktiv |
|-----------|-------------|---------------------|
| Fastify-server + Postgres + Redis | Containerstart | ~200-300 MB totalt |
| BullMQ-workers | Containerstart (in-process) | En worker per pool (image, media, ai, docs, system) |
| Python-dispatcher | Första AI-verktygsförfrågan | Python-tolk + förimporterade bibliotek (PIL, NumPy, MediaPipe, rembg) - inga modellvikter |
| AI-modellvikter | Under det specifika verktygets förfrågan | Laddade från disk, frigjorda när förfrågan är klar |

### Modellinläsning {#model-loading}

Alla modellviktsfiler (totalt flera GB) ligger på disk i `/opt/models/` hela tiden. Varje AI-verktygsskript laddar endast sin egen modell(er) i minnet under en förfrågans varaktighet och frigör dem sedan. Vissa skript anropar uttryckligen `del model` och `torch.cuda.empty_cache()` efter inferens för att säkerställa att minne returneras omedelbart.

Det finns ingen modellcache mellan förfrågningar. Att köra samma AI-verktyg direkt efter varandra laddar om modellen varje gång. Detta håller vilominnet nära noll till priset av en modellinläsningsfördröjning vid varje AI-förfrågan.

### Kallstart vid första AI-förfrågan {#first-ai-request-cold-start}

Python-dispatchern körs inte när containern startar. Den första AI-förfrågan utlöser två saker parallellt: dispatchern börjar värmas upp i bakgrunden, och själva förfrågan faller tillbaka på en engångsskapad Python-subprocess. När dispatchern signalerar redo använder alla efterföljande AI-förfrågningar den direkt och hoppar över kostnaden för subprocess-skapande.

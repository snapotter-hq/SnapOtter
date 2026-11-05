---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: cd0ff395923b
i18n_hash_version: 2
---
# Miljöer med små resurser {#low-resource-setups}

SnapOtter fungerar bra på liten hårdvara: en Raspberry Pi 4 eller 5, en gammal bärbar dator eller en VPS med 2 GB. Den här sidan är den praktiska guiden för sådana maskiner: vad du kan förvänta dig, en uppsättning att kopiera och klistra in med rimliga gränser, och vilka funktioner du bör hoppa över. Fullständiga benchmarkdata bakom siffrorna finns i [Hårdvarukrav](/sv/guide/deployment#hardware-requirements).

Två hårda begränsningar redan från start:

- **Endast 64-bitars.** Avbilden är byggd för `linux/amd64` och `linux/arm64`. 32-bitars ARM (`armv7`/`armhf`) stöds inte, så första generationens Pi och Pi Zero-familjen är uteslutna.
- **Minimigräns på 2 GB minne (verktyg utan AI).** 512 MB räcker inte för att starta stacken, och 1 GB misslyckas vid batcher med flera filer. 2 GB med 2 kärnor är den minsta konfiguration som kör verktygen utan AI obehindrat.

## Vad som fungerar bra på liten hårdvara {#what-runs-well}

Varje verktyg utan AI fungerar på en maskin med 2 GB / 2 kärnor: hela avsnitten Bild och Filer, PDF-verktyg samt video- och ljudoperationer med strömkopiering (klippning, avstängning av ljud, remux av behållare). De flesta slutförs på under en sekund.

Två arbetsbelastningar är undantag:

- **Omkodning av video** (konvertering mellan codecs) är CPU-bunden. Ett 1080p-klipp som tar ~40 s på en snabb stationär CPU kan ta flera minuter på en CPU i Pi-klass. Operationer med strömkopiering förblir omedelbara.
- **AI-verktyg** har CPU-minnesgränser per paket: 2 GB värd-RAM (0,5 GB ledigt) för ansiktsigenkänning och inbyggd Fast OCR, 4 GiB konfigurerat effektivt minne för Accurate OCR, 4 GB värd-RAM (2 till 3 GB ledigt) för transkribering, Object Eraser och Colorize, bakgrundsborttagning, Upscale och Enhance samt fotorestaurering, och 8 GB värd-RAM (6 GB ledigt) för högkvalitativ inpainting. En maskin med 2 GB kan inte köra Whisper, RealESRGAN, rembg eller LaMa utan att bli OOM-dödad, så SnapOtter kontrollerar ledigt minne innan arbetet skickas till Python-sidecaren och avvisar omedelbart körningar under paketets gräns.

Ingetdera installeras eller körs om du inte använder det: utan installerade AI-paket ligger appen på cirka 360 MB i viloläge, och AI-paket laddas bara ned när en administratör aktiverar dem.

## Genomgång för Raspberry Pi / gammal bärbar dator {#walkthrough}

Det här är den vanliga Compose-installationen från [Kom igång](/sv/guide/getting-started), plus resursgränser och försiktiga tak. Den förutsätter ett 64-bitars operativsystem (på en Pi: Raspberry Pi OS 64-bit eller Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Anmärkningar för maskiner i Pi-klass:

- **Föredra en USB-SSD framför ett SD-kort** för datavolymen och Postgres. Jobbens arbetsytor gör verklig disk-IO, och SD-kort är både långsamma och slits snabbt.
- **Den allt-i-ett-container som körs ensam fungerar också här** (inbäddad Postgres och Redis när `DATABASE_URL`/`REDIS_URL` inte är angivna), och på en minnesbegränsad värd bör du sänka dess inbäddade Redis-tak med `REDIS_MAXMEMORY` (se [Konfiguration](/sv/guide/configuration)). Compose ger finare kontroll per tjänst, vilket är anledningen till att den här genomgången använder det.
- **Lägg till swap på enheter med 2 GB.** Det gör att enstaka toppar (en stor PDF, en batch du glömde begränsa) inte slutar i att processen dödas på grund av slut på minne. zram är det SD-kortsvänliga alternativet.
- Arm64-avbilden är endast CPU. Det finns inget CUDA på ARM-kort.

## Justeringsreglagen {#tuning-knobs}

Alla tak är miljövariabler och dokumenteras fullständigt i [Konfiguration](/sv/guide/configuration). `0` betyder obegränsat eller automatiskt. De som spelar roll på liten hårdvara:

| Variabel | Förslag för liten maskin | Vad den skyddar |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Hur många jobb som körs parallellt. Autodetekteringen använder antalet CPU-kärnor minus ett, vilket fungerar på stora maskiner men är för ivrigt på en maskin med 2 kärnor under minnestryck. |
| `MAX_WORKER_THREADS` | `2` | Trådpoolen för bildbearbetning. |
| `MAX_BATCH_SIZE` | `5` | Batcher är där maskiner med 1-2 GB först får slut på minne. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Hindrar en enda enorm fil från att uppta hela arbetsytan. |
| `MAX_MEGAPIXELS` | `50` | Avkodning av en bild på över 100 MP kostar RAM oavsett filstorlek. |
| `MAX_VIDEO_DURATION_S` | `300` | Långa omkodningar monopoliserar en liten CPU i minuter till timmar. |
| `PROCESSING_TIMEOUT_S` | `600` | Hård övre gräns så att ett skenande jobb så småningom frigör maskinen. |

De här taken gäller vad servern accepterar, så ställ in dem efter vad du faktiskt använder i stället för så små som möjligt. Om du aldrig rör video kostar ett tak på `MAX_VIDEO_DURATION_S` ingenting. Om du skannar dokument dagligen, sätt inget tak på `MAX_PDF_PAGES`.

## Vad du bör hoppa över {#what-to-skip}

- **Tunga AI-paket.** Uppskalning, fotorestaurering och bakgrundsborttagning kräver en GPU eller en snabb CPU med många kärnor, och varje paket kostar 4-5 GB diskutrymme. På en liten maskin ska du helt enkelt inte installera dem. Verktyg vars paket saknas visar en installationsuppmaning i stället för att köras.
- **Omkodning av video som rutinmässig arbetsbelastning.** Enstaka omkodningar går bra (de är bara långsamma). En jämn kö av omkodningar kräver CPU-kärnor, inte en Pi.
- **Oanvända verktyg i allmänhet.** En administratör kan stänga av enskilda verktyg i Settings, vilket tar bort dem från gränssnittet och slutar registrera deras API-rutter. Det sparar inte minne i sig, men hindrar en delad liten instans från att användas för den enda arbetsbelastning som hårdvaran inte klarar.

Om du senare flyttar instansen till kraftigare hårdvara, ta bort taken (sätt tillbaka dem till `0`) så följer samma datavolym med.

---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: 4ad5655688ed
---
# Resurssnåla installationer {#low-resource-setups}

SnapOtter fungerar bra på liten hårdvara: en Raspberry Pi 4 eller 5, en gammal bärbar dator eller en VPS med 2 GB. Den här sidan är den praktiska guiden för sådana maskiner: vad du kan förvänta dig, en kopieringsklar konfiguration med rimliga tak och vilka funktioner du bör hoppa över. Den fullständiga benchmarkdatan bakom dessa siffror finns i [Hårdvarukrav](/sv/guide/deployment#hardware-requirements).

Två hårda begränsningar direkt:

- **Endast 64 bitar.** Avbildningen byggs för `linux/amd64` och `linux/arm64`. 32-bitars ARM (`armv7`/`armhf`) stöds inte, så första generationens Pi och Pi Zero-familjen faller bort.
- **2 GB minne som golv.** Med 512 MB kan stacken inte starta, och 1 GB misslyckas vid batchar med flera filer. 2 GB med 2 kärnor är den minsta konfigurationen som fungerar bekvämt.

## Vad som fungerar bra på liten hårdvara {#what-runs-well}

Alla verktyg utan AI fungerar på en maskin med 2 GB / 2 kärnor: hela sektionerna för bilder och filer, PDF-verktygen samt video- och ljudoperationerna med stream copy (trimma, tysta, byta container). De flesta blir klara på under en sekund.

Två arbetslaster är undantagen:

- **Omkodning av video** (konvertering mellan codecs) begränsas av CPU:n. Ett 1080p-klipp som tar ~40 s på en snabb stationär CPU kan ta flera minuter på en CPU i Pi-klass. Stream copy-operationer förblir omedelbara.
- **AI-verktyg** behöver RAM (4 GB rekommenderas) och disk (de större paketen är 4-5 GB vardera), och de tunga (uppskalning, fotorestaurering, bakgrundsborttagning) är inte praktiska på CPU:er i Pi-klass. Lätt AI som ansiktsdetektering och OCR är användbart om du har minne för det.

Inget av detta installeras eller körs om du inte använder det: utan installerade AI-paket vilar appen på runt 360 MB, och AI-paket laddas bara ner när en administratör aktiverar dem.

## Genomgång för Raspberry Pi / gammal bärbar dator {#walkthrough}

Detta är standardinstallationen med Compose från [Kom igång](/sv/guide/getting-started), plus resursgränser och konservativa tak. Den förutsätter ett 64-bitars operativsystem (på en Pi: Raspberry Pi OS 64-bit eller Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
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
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Anteckningar för maskiner i Pi-klass:

- **Föredra en USB-SSD framför ett SD-kort** för datavolymen och Postgres. Jobbens arbetsytor gör verklig disk-IO, och SD-kort är både långsamma och snabba på att slitas ut.
- **Allt-i-ett-containern fungerar också här** (inbäddad Postgres och Redis när `DATABASE_URL`/`REDIS_URL` inte är satta), och på en värd med begränsat minne bör du sänka taket för dess inbäddade Redis med `REDIS_MAXMEMORY` (se [Konfiguration](/sv/guide/configuration)). Compose ger dig finare kontroll per tjänst, och det är därför den här genomgången använder det.
- **Lägg till swap på enheter med 2 GB.** Det hindrar den enstaka toppen (en stor PDF, en batch du glömde att begränsa) från att sluta i en out-of-memory-kill. zram är det SD-kortvänliga alternativet.
- arm64-avbildningen är endast CPU; det finns ingen CUDA på ARM-kort.

## Justeringsrattarna {#tuning-knobs}

Alla tak är miljövariabler och dokumenteras fullständigt i [Konfiguration](/sv/guide/configuration). `0` betyder obegränsat eller auto. De som spelar roll på liten hårdvara:

| Variabel | Förslag för små maskiner | Vad den skyddar |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Hur många jobb som körs parallellt. Autodetekteringen använder antalet CPU-kärnor minus en, vilket är bra på stora maskiner och för ivrigt på en 2-kärnig låda under minnestryck. |
| `MAX_WORKER_THREADS` | `2` | Trådpool för bildbehandling. |
| `MAX_BATCH_SIZE` | `5` | Batchar är där maskiner med 1-2 GB får slut på minne först. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Hindrar en enda enorm fil från att uppta hela arbetsytan. |
| `MAX_MEGAPIXELS` | `50` | Att avkoda en bild på 100+ MP kostar RAM oavsett filstorlek. |
| `MAX_VIDEO_DURATION_S` | `300` | Långa omkodningar lägger beslag på en liten CPU i minuter till timmar. |
| `PROCESSING_TIMEOUT_S` | `600` | Hårt tak så att ett skenande jobb till slut frigör maskinen. |

Dessa tak gäller vad servern accepterar, så ställ in dem efter vad du faktiskt använder snarare än så lågt som möjligt. Om du aldrig rör video kostar ett `MAX_VIDEO_DURATION_S`-tak ingenting; om du skannar dokument dagligen ska du inte sätta något tak på `MAX_PDF_PAGES`.

## Vad du bör hoppa över {#what-to-skip}

- **Tunga AI-paket.** Uppskalning, fotorestaurering och bakgrundsborttagning vill ha en GPU eller en snabb CPU med många kärnor, och varje paket kostar 4-5 GB disk. På en liten maskin installerar du dem helt enkelt inte; verktyg vars paket saknas visar en installationsuppmaning i stället för att köras.
- **Omkodning av video som rutinarbetslast.** Enstaka omkodningar går bra (de är bara långsamma); en stadig omkodningskö vill ha CPU-kärnor, inte en Pi.
- **Oanvända verktyg i allmänhet.** En administratör kan stänga av enskilda verktyg i Settings, vilket tar bort dem från gränssnittet och slutar registrera deras API-rutter. Det sparar inte minne i sig, men det hindrar en delad liten instans från att användas för just den arbetslast som hårdvaran inte klarar.

Om du senare flyttar instansen till större hårdvara tar du bort taken (sätt tillbaka dem till `0`) och samma datavolym följer med.

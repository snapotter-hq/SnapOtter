---
description: "Wdrażanie SnapOtter w środowisku produkcyjnym z użyciem Docker. Wymagania sprzętowe, konfiguracja GPU i konfiguracje reverse proxy dla Nginx, Traefik i Cloudflare."
i18n_source_hash: 3821f105f4ba
i18n_provenance: machine
i18n_output_hash: 0b24437c054d
i18n_hash_version: 2
---

# Wdrożenie {#deployment}

SnapOtter wdraża się jako stos Docker Compose z 3 kontenerów: obraz aplikacji SnapOtter, PostgreSQL 17 i Redis 8. Obraz aplikacji obsługuje **linux/amd64** (z NVIDIA CUDA do przyspieszania AI) oraz **linux/arm64** (CPU), więc działa natywnie na serwerach Intel/AMD, komputerach Mac z Apple Silicon i urządzeniach ARM, takich jak Raspberry Pi 4/5. Przyspieszanie za pomocą zintegrowanego GPU Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwane w inferencji AI.

Konfigurację GPU, przykłady Docker Compose i przypinanie wersji opisano w [obrazie Docker](./docker-tags).

## Szybki start (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

Aplikacja jest wtedy dostępna pod adresem `http://localhost:1349`.

Powyższy stos łączy się jako właściciel bazy danych. Od SnapOtter 2.3.0 żądania można obsługiwać na roli, która tylko odczytuje i zapisuje wiersze; zobacz [role z minimalnymi uprawnieniami](./database#least-privilege-roles).

> **Limity pobierań Docker Hub?** Zastąp `snapotter/snapotter:latest` przez `ghcr.io/snapotter-hq/snapotter:latest`, aby pobierać obraz z GitHub Container Registry. Oba rejestry otrzymują ten sam obraz przy każdym wydaniu.

## Szybki start (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Dla przyspieszenia NVIDIA CUDA w obsługiwanych narzędziach AI (usuwanie tła, skalowanie w górę, poprawa twarzy):

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

### Weryfikacja przyspieszenia GPU {#verify-gpu-acceleration}

Wykrycie CUDA można sprawdzić w logach:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Jeśli narzędzia AI działają na CPU, mimo że `--gpus all` i NVIDIA Container Toolkit są skonfigurowane poprawnie, należy ponownie zainstalować dany pakiet (na przykład Background Removal) w **Settings → AI Features**. Instalator przywraca wersję GPU ONNX Runtime, którą wersja tylko dla CPU, zainstalowana przez inny pakiet (taki jak transkrypcja), może w przeciwnym razie przesłaniać we wspólnym środowisku AI. Jeśli ponowna instalacja z poziomu interfejsu nie przywraca GPU w starszym obrazie, zobacz ręczną naprawę w [zgłoszeniu #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Wymagania sprzętowe {#hardware-requirements}

Te liczby pochodzą z testów wydajności na różnych systemach, od nowoczesnej stacji roboczej amd64 z NVIDIA RTX 4070 po Raspberry Pi, z uruchomieniem całego katalogu narzędzi na każdym z nich i przeglądem limitów zasobów Docker w celu znalezienia rzeczywistego minimum.

Uruchamiasz na dolnym końcu tych poziomów (Pi, stary laptop, VPS z 2 GB)? [Konfiguracje o niskich zasobach](/pl/guide/low-resource) zamieniają te liczby w konkretny przewodnik z dostrojonymi limitami.

### Krótkie zestawienie {#quick-reference}

| Poziom | Zastosowanie | CPU | RAM | GPU | Pamięć masowa |
|------|----------|-----|-----|-----|---------|
| Minimalny | Narzędzia bez AI (obrazy, pliki, lekkie PDF) oraz wbudowany Fast OCR i wykrywanie twarzy; jeden użytkownik; małe partie | 2 rdzenie | 2 GB | Brak | ~7 GB |
| Zalecany | Wszystkie pięć modalności, w tym wideo, PDF i standardowe pakiety AI na CPU; partie; kilku użytkowników | 4 rdzenie | 4 GB (8 GB dla inpaintingu HQ) | Brak | ~25 GB |
| Pełny | Wszystko w pełnej szybkości, w tym AI na GPU; duże partie; wielu użytkowników | 6-8 rdzeni | 8 GB | NVIDIA 8 GB+ VRAM (12 GB komfortowo) | ~35 GB |

**Architektura: tylko 64-bitowa** (`linux/amd64` lub `linux/arm64`). SnapOtter działa natywnie na serwerach Intel/AMD, komputerach Mac z Apple Silicon i 64-bitowych płytkach ARM, w tym **Raspberry Pi 4 i 5** (4-8 GB). **Nie** działa na 32-bitowym ARM (`armv7`/`armhf`), ponieważ nie budujemy dla niego obrazu, ani na płytkach klasy 512 MB, takich jak Pi Zero, które są poniżej progu pamięci (patrz niżej).

### Minimalny (narzędzia do obrazów, plików i lekkich PDF; bez AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Zasób | Wymaganie |
|---|---|
| CPU | 2 rdzenie |
| RAM | 2 GB |
| Dysk | ~5,5 GB (obraz) + wolumen danych |
| GPU | Niewymagane |

Wszystkie 222 narzędzia katalogu bez AI, czyli obrazy (zmiana rozmiaru, kadrowanie, konwersja, kompresja, korekta, znak wodny), wideo (przycinanie, wyciszanie, remux), audio (konwersja, normalizacja, przycinanie), PDF (scalanie, dzielenie, kompresja, obracanie, ochrona), konwersje plików i dedykowane presety konwersji, działają na skromnym sprzęcie. Większość operacji kończy się w czasie znacznie krótszym niż sekunda, nawet na dużym pliku: obraz 2,7 MB zmienia rozmiar w ~0,05 s i jest ponownie kodowany do WebP w ~2 s.

Próg pamięci jest rzeczywisty, co wykazał przegląd limitów zasobów Docker: **512 MB nie wystarcza do uruchomienia stosu** (nawet pojedyncza zmiana rozmiaru obrazu zostaje zabita), **1 GB** obsługuje operacje na pojedynczych plikach, ale partia wielu plików kończy się brakiem pamięci, a **2 GB / 2 rdzenie** to najmniejsza konfiguracja, która komfortowo obsługuje partie bez AI. Wbudowany Fast OCR i pakiet `face-detection` również mieszczą się w 2 GB, natomiast większe pakiety AI (Whisper, LaMa/DDColor, rembg, RealESRGAN, restauracja zdjęć i inpainting HQ SD1.5) wymagają od 4 do 8 GB RAM i są odrzucane od razu, gdy wolna pamięć jest poniżej progu danego pakietu.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Jedynym wyjątkiem mocno obciążającym CPU jest ponowne kodowanie wideo.** Operacje kopiowania strumieni (przycinanie, wyciszanie, remux kontenera) są natychmiastowe, ale transkodowanie do innego kodeka jest ograniczone przez CPU. Klip 1080p / 45 sekund ponownie zakodowany do VP9 (WebM) trwa około **~40 s** na szybkim nowoczesnym CPU, ~45 s na Apple Silicon, ~80 s na starszym 4-rdzeniowym CPU mobilnym i **~130 s** na starszym 4-rdzeniowym serwerze. Jeśli obciążenie to głównie wideo, należy postawić na liczbę rdzeni i taktowanie CPU lub podnieść limit `cpus:` kontenera: dostarczany plik compose domyślnie ogranicza aplikację do 4 rdzeni (8 w compose dla GPU).

### Zalecany (narzędzia AI na CPU) {#recommended-ai-tools-on-cpu}

| Zasób | Wymaganie |
|---|---|
| CPU | 4 rdzenie |
| RAM | 4 GB |
| Dysk | 3 GB (obraz) + około 20 GB (wszystkie opcjonalne pakiety AI) + obszar roboczy |
| GPU | Niewymagane (zapasowo CPU) |

**To instalacja i uruchamianie większych pakietów AI podnosi zalecenie do 4 GB RAM.** Bez zainstalowanych opcjonalnych pakietów aplikacja w stanie bezczynności zużywa około 360 MB. Starsze narzędzia Python współdzielą sidecar, natomiast dokładny OCR używa dedykowanego, długo działającego dyspozytora przypiętego do aktywnej niezmiennej generacji. Przed aktywacją instalator uruchamia test dymny na kandydacie. Następnie atomowo przełącza się na nowego dyspozytora i opróżnia poprzedniego przed odśmiecaniem. Każdy oficjalny artefakt dokładnego OCR musi przejść swój zestaw wydaniowy dla najgorszego przypadku wewnątrz cgroup o rozmiarze 4 GiB, a zalecane 4 GB hosta zostawia zapas dla aplikacji Node.js, Postgres, Redis, kolejek i współbieżnej pracy.

Większość narzędzi AI jest w pełni użyteczna na CPU; kilka naprawdę potrzebuje GPU. Pomiary na nowoczesnym 4-rdzeniowym CPU:

| Narzędzie AI | Czas na CPU | Użyteczne na CPU? |
|---|---|---|
| Wykrywanie twarzy (blur-faces, smart-crop, red-eye), noise-removal | poniżej 1 s | Tak |
| OCR, transkrypcja, napisy | 1-3 s | Tak |
| Koloryzacja, poprawa twarzy | ~10 s | Tak |
| Usuwanie / zamiana / rozmycie tła | ~29 s | Tak (trzeba poczekać) |
| Skalowanie AI w górę (RealESRGAN) | ~33 s dla małych; minuty dla dużych obrazów | Z ograniczeniami: GPU zdecydowanie zalecane |
| Restauracja zdjęć (pełny potok) | kilka minut | Nie: wymaga GPU lub szybkiego CPU z wieloma rdzeniami |

SnapOtter celowo nie wbudowuje tych pobrań modeli w obraz Docker. Pakiety AI są pobierane dopiero wtedy, gdy administrator włączy powiązane narzędzie, przechowywane w trwałym wolumenie `/data/ai` i współdzielone przez każde narzędzie zależne od tego samego stosu modeli. Dzięki temu końcowy obraz kontenera pozostaje mały, a pełna instalacja AI nadal może osiągnąć większe wartości pamięci masowej podane niżej.

Niektóre narzędzia zależą od więcej niż jednego współdzielonego pakietu. Na przykład Passport Photo wymaga zarówno `background-removal`, jak i `face-detection`; jeśli `background-removal` jest już zainstalowany, włączenie Passport Photo pobiera tylko brakujący pakiet `face-detection`. To samo ponowne wykorzystanie dotyczy wszystkich narzędzi AI.

Pamięć masowa opcjonalnych pakietów AI i progi pamięci CPU (SnapOtter sprawdza dostępną pamięć przed przekazaniem do sidecara Python i natychmiast odrzuca uruchomienia poniżej progu wolnej pamięci pakietu):

| Pakiet | Rozmiar na dysku | Próg pamięci CPU |
|---|---|---|
| Wykrywanie twarzy | 200-300 MB | 2 GB RAM hosta (~0,5 GB wolne) |
| Transkrypcja | ~600 MB | 4 GB RAM hosta (~2 GB wolne) |
| Object eraser + Colorize | 1-2 GB | 4 GB RAM hosta (~2 GB wolne) |
| Dokładny OCR (`balanced`/`best`) | pobranie ~208-234 MiB / po instalacji ~409-488 MiB | 4 GiB skonfigurowanej pamięci efektywnej (`fast` działa na 2 GB) |
| Usuwanie tła | 4-5 GB | 4 GB RAM hosta (~2,5 GB wolne) |
| Upscale + Face enhance + Noise removal | 5-6 GB | 4 GB RAM hosta (~2,5 GB wolne) |
| Restauracja zdjęć | 4-5 GB | 4 GB RAM hosta (~3 GB wolne) |
| Inpainting wysokiej jakości (`inpaint-hq`) | 5-7 GB | 8 GB RAM hosta (~6 GB wolne) |
| **Wszystkie pakiety** | **~25 GB po instalacji** | **4 GB (8 GB z `inpaint-hq`)** |

Fast OCR jest wbudowany w obraz przez Tesseract, dodaje około 25 MiB i nie wymaga opcjonalnego pakietu OCR ani jego wymogu 4 GiB pamięci. Fast obsługuje `auto`, `en`, `de`, `es`, `fr`, `zh` i `ja`, ale nie koreański (`ko`) ani arabski (`ar`). Oba używają `balanced` lub `best`, a zatem wymagają dokładnego pakietu. Dokładny pakiet jest dostępny w oficjalnych kontenerach Linux amd64 i arm64 i uruchamia ONNX Runtime na CPU. Hosty NVIDIA używają tego samego środowiska OCR na CPU, więc OCR nie zależy od wersji CUDA ani architektury GPU. Dokładne środowisko wymaga co najmniej 4 GiB pamięci efektywnej: skonfigurowanego limitu cgroup kontenera, a w jego braku pamięci hosta. SnapOtter odrzuca systemy poniżej tego podpisanego minimum zgodności przed pobraniem pakietu. Instalacja dokładnego pakietu jest też odrzucana na archiwach bare-metal/prebuilt, których libc i ABI Pythona nie można zagwarantować. Na takich nieobsługiwanych hostach OCR dla koreańskiego i arabskiego zwraca jawny błąd niezgodności i nigdy po cichu nie przechodzi na Fast. Jawne żądanie Fast dla koreańskiego zwraca `FEATURE_INCOMPATIBLE` z przyczyną `fast-korean-unsupported` przed umieszczeniem zadania w kolejce.

Repliki współdzielące ten sam `DATA_DIR` muszą używać tej samej architektury CPU; wdrożenia z wieloma replikami należy przypinać za pomocą node affinity. Mieszane repliki amd64/arm64 wymagają osobnych wolumenów danych i niezależnych wdrożeń SnapOtter.

Dokładne środowisko utrzymuje jedną aktywną generację i po aktywacji czyści pamięć podręczną pobierania. W tym wydaniu pierwsza instalacja tymczasowo potrzebuje około 620-720 MiB na archiwum i staging, a aktualizacja może osiągnąć szczyt blisko 1,2 GiB, dopóki stara generacja pozostaje aktywna. Instalator oblicza dokładne wymaganie na podstawie podpisanego indeksu i bieżących generacji przed pobraniem lub rozpakowaniem i kończy się wcześnie błędem, jeśli wolumen danych jest za mały.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Pełny (narzędzia AI na NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Zasób | Wymaganie |
|---|---|
| CPU | 6-8 rdzeni (przygotowanie wideo i współbieżność działają na CPU nawet przy AI na GPU) |
| RAM | 8 GB |
| GPU | NVIDIA z 8+ GB VRAM (zalecane 12 GB) |
| Dysk | ~35 GB łącznie |

GPU NVIDIA (CUDA) radykalnie przyspiesza ciężkie modele AI. Pomiary na RTX 4070 w porównaniu z nowoczesnym CPU:

| Narzędzie AI | Przyspieszenie z GPU | Uwagi |
|---|---|---|
| Skalowanie AI w górę (RealESRGAN 2×) | **~47×** | Największy zysk: poniżej sekundy wobec ~33 s (minuty dla dużych obrazów) |
| Poprawa twarzy (CodeFormer) | **~12×** | ~0,9 s wobec ~11 s |
| Transkrypcja (Whisper) | ~4,5× | |
| Usuwanie / zamiana / rozmycie tła | ~4× | ~7 s na GPU wobec ~29 s na CPU |
| Koloryzacja | ~1,8× | |
| OCR, wykrywanie twarzy, red-eye, noise-removal | ~1× | Już szybkie na CPU: GPU nie pomaga |
| Restauracja zdjęć | brak | Ograniczona przez CPU nawet na GPU (0% wykorzystania GPU); szybki CPU ma tu większe znaczenie niż GPU |

GPU warto mieć dla narzędzi **skalowania w górę, poprawy twarzy, transkrypcji i usuwania tła**. Wykrywanie twarzy, OCR i red-eye są ograniczone przez CPU i już szybkie, więc GPU nic nie wnosi.

Szczytowe zużycie VRAM sięga 7,5 GB podczas skalowania w górę z poprawą twarzy. GPU NVIDIA z 6 GB działa z większością narzędzi AI osobno, ale zawiedzie przy skalowaniu w górę. 8-12 GB VRAM obsługuje wszystko.

Przyspieszanie za pomocą zintegrowanego GPU Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwane w inferencji AI. Zmapowanie `/dev/dri` do kontenera nie włącza przyspieszania AI na GPU; SnapOtter będzie uruchamiać narzędzia AI na CPU, o ile nie jest dostępne NVIDIA CUDA.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### Współbieżni użytkownicy {#concurrent-users}

Równoległe żądania zmiany rozmiaru obrazu wobec domyślnego kontenera aplikacji ograniczonego do 4 rdzeni:

| Współbieżne żądania | Średni czas odpowiedzi | Błędy |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Czas odpowiedzi rośnie podliniowo i bez błędów w miarę nasycania puli workerów. Podniesienie limitu `cpus:` kontenera aplikacji (lub użycie hosta z większą liczbą rdzeni) podnosi pułap. Należy pamiętać, że ciężkie zadania (transkodowanie wideo, AI na CPU) zajmują workera przez cały czas trwania, więc CPU należy dobierać do oczekiwanej liczby współbieżnych ciężkich zadań, a nie tylko do liczby żądań.

### Obsługiwane formaty obrazów {#supported-image-formats}

SnapOtter obsługuje **ponad 55 formatów wejściowych** i **14 formatów wyjściowych**, w tym pliki RAW od ponad 20 producentów aparatów, formaty profesjonalne (PSD, EPS, OpenEXR, HDR), nowoczesne kodeki (JPEG XL, AVIF, HEIC, QOI) oraz formaty naukowe i growe (FITS, DDS).

Szczegóły każdego obsługiwanego formatu, użytego dekodera i dostępnych opcji jakości zawiera [pełna lista formatów](/pl/guide/supported-formats).

### Znane ograniczenia {#known-limitations}

- **Zmiana rozmiaru z uwzględnieniem treści** zawiesza się na dużych obrazach (>5 MP) z powodu ograniczenia w binarium caire. Z mniejszymi obrazami działa poprawnie.
- **Dekodowanie HEIF** trwa 13-23 sekund. HEIC (wariant Apple) jest znacznie szybszy: 0,3-0,9 sekundy.
- **Skalowanie w górę** przekracza limit czasu na CPU dla czegokolwiek większego niż małe obrazy. Do praktycznego użycia wymagane jest GPU.
- **CodeFormer** do poprawy twarzy jest znacznie wolniejszy niż GFPGAN (53 s wobec 2 s na GPU). W większości przypadków zalecany jest GFPGAN.

## Wolumeny {#volumes}

| Punkt montowania / wolumen | Przeznaczenie | Wymagany? |
|---|---|---|
| `/data` (app) | Modele AI, venv Python, pliki użytkowników | **Tak** - bez niego utrata plików |
| `/tmp/workspace` (app) | Tymczasowe pliki przetwarzania (czyszczone automatycznie) | Zalecany |
| `SnapOtter-pgdata` (postgres) | Katalog danych PostgreSQL (użytkownicy, ustawienia, potoki, zadania) | **Tak** - bez niego utrata danych |
| `SnapOtter-redisdata` (redis) | Plik append-only Redis dla trwałych kolejek zadań | Zalecany |

### Bind mounty a wolumeny nazwane {#bind-mounts-vs-named-volumes}

**Wolumeny nazwane** (zalecane) - Docker zarządza uprawnieniami automatycznie:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounty** - uprawnieniami zarządza użytkownik. Ustaw `PUID`/`PGID` zgodnie z użytkownikiem hosta:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Uprawnienia do pamięci masowej {#storage-permissions}

SnapOtter zapisuje w czasie działania w dwóch lokalizacjach: `/data` (pliki użytkowników, logi, modele AI i venv Python) oraz `/tmp/workspace` (tymczasowe miejsce robocze przetwarzania). Obie muszą być zapisywalne dla użytkownika, jako którego działa kontener. Jeśli któraś nie jest, kontener **kończy się błędem od razu przy starcie** z komunikatem wskazującym katalog, działający UID/GID i sposób naprawy, zamiast uruchamiać się jako „healthy”, a potem zawieść przy pierwszym przesłaniu z niejasnym błędem. Katalog logów (`LOG_DIR`, `/data/logs` w obrazie) jest sprawdzany w ten sam sposób, w każdym trybie przechowywania, ponieważ logi pozostają lokalne, nawet gdy pliki są w S3.

Sposób obsługi uprawnień zależy od tego, jak kontener jest uruchamiany:

**Domyślnie (start jako root, przejście na `snapotter`)** - entrypoint startuje jako root, naprawia właściciela zamontowanych wolumenów, a następnie przechodzi na nieuprzywilejowanego użytkownika `snapotter` przez `gosu`. Wolumeny nazwane działają bez konfiguracji. W przypadku bind mountów należy ustawić `PUID`/`PGID` na użytkownika hosta (patrz wyżej), aby zapisywane pliki należały do niego.

**Kubernetes / OpenShift (bez roota przez `runAsUser`)** - kontener uruchomiony bezpośrednio jako użytkownik bez uprawnień roota nie może sam wykonać chown na wolumenach, więc orkiestrator musi uczynić je zapisywalnymi. Ustaw `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Zapisywalne katalogi obrazu mają grupę właściciela GID 0 i są zapisywalne dla grupy, więc pod działający z **dowolnym UID** i dodatkową grupą root (domyślnie w OpenShift) może zapisywać bez `chown`.

**TrueNAS Scale (i inne konfiguracje z „obcym UID”)** - TrueNAS uruchamia aplikacje jako użytkownik bez uprawnień roota (często `568:568`) i montuje datasety hosta należące do innego użytkownika, więc ani entrypoint, ani `fsGroup` same z siebie nie czynią ich zapisywalnymi. Należy wybrać jedno:

- **Uruchomić aplikację jako root** (zalecane) - pozostawić użytkownika aplikacji nieustawionego lub ustawić go na `0` i pozwolić domyślnemu entrypointowi naprawić uprawnienia i przejść na `snapotter`.
- **Uruchomić jako UID `999`** - ustawić użytkownika/grupę aplikacji na `999:999` (wbudowany użytkownik `snapotter` SnapOtter), aby zgadzał się z właścicielem w obrazie.
- **`chown` dataset hosta** na UID, jako którego działa kontener, z powłoki TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Błąd startowy wskazuje dokładny UID do użycia, więc najszybciej jest uruchomić aplikację raz, przeczytać komunikat, a następnie `chown` (lub dostosować użytkownika) odpowiednio.

## Zmienne środowiskowe {#environment-variables}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `AUTH_ENABLED` | `true` | Włączenie/wyłączenie wymogu logowania |
| `DEFAULT_USERNAME` | `admin` | Początkowa nazwa użytkownika administratora |
| `DEFAULT_PASSWORD` | `admin` | Początkowe hasło administratora (wymuszona zmiana przy pierwszym logowaniu) |
| `MAX_UPLOAD_SIZE_MB` | `0` (bez limitu) | Limit rozmiaru pojedynczego przesyłanego pliku w MB. Obraz dostarczany jest z `0`; kompilacja ze źródeł zaczyna od 100 |
| `MAX_BATCH_SIZE` | `0` (bez limitu) | Maksymalna liczba plików w żądaniu wsadowym. Obraz dostarczany jest z `0`; kompilacja ze źródeł zaczyna od 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Żądania API na minutę na adres IP (ustaw 0, aby wyłączyć) |
| `MAX_USERS` | `0` (bez limitu) | Maksymalna liczba kont użytkowników |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Które peery mogą ustawiać IP klienta przez `X-Forwarded-For`. Domyślnie tylko sieci prywatne |
| `PUID` | `999` | Uruchomienie jako ten UID (dla uprawnień bind mountów) |
| `PGID` | `999` | Uruchomienie jako ten GID (dla uprawnień bind mountów) |
| `LOG_LEVEL` | `info` | Szczegółowość logów: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Maksymalna liczba równoległych zadań przetwarzania AI |
| `SESSION_DURATION_HOURS` | `168` | Czas życia sesji logowania (7 dni) |
| `CORS_ORIGIN` | (puste) | Dozwolone originy rozdzielone przecinkami lub puste dla same-origin |

### Wychodzące proxy i prywatny CA {#outbound-proxy-and-private-ca}

Oficjalny kontener włącza obsługę proxy ze środowiska w Node. Jeśli SnapOtter musi łączyć się z repozytorium środowiska OCR lub innymi usługami HTTPS przez firmowe proxy, należy ustawić `HTTPS_PROXY` (oraz `HTTP_PROXY`, gdy potrzeba). Ustaw `NO_PROXY` na listę hostów rozdzielonych przecinkami, z którymi trzeba łączyć się bezpośrednio, takich jak Postgres, Redis i wewnętrzne magazyny obiektów.

Jeśli proxy lub usługa wewnętrzna jest podpisana przez prywatny urząd certyfikacji, należy zamontować certyfikat CA tylko do odczytu i wskazać go w `NODE_EXTRA_CA_CERTS`. Plik musi istnieć w chwili startu procesu Node:

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

Poświadczenia proxy należy trzymać poza plikiem Compose (na przykład w chronionym pliku `.env` lub sekrecie). Nie wolno wyłączać weryfikacji TLS: podpisany indeks OCR uwierzytelnia metadane wydania, a zwykła walidacja TLS nadal chroni transport i każde inne żądanie wychodzące.

## Kontrola stanu {#health-check}

Kontener zawiera wbudowaną kontrolę stanu:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse proxy {#reverse-proxy}

`TRUST_PROXY` domyślnie ma wartość `loopback,linklocal,uniquelocal`, więc SnapOtter ufa `X-Forwarded-For` tylko od peera w sieci prywatnej. Reverse proxy na tym samym hoście, w sieci Docker lub w sieci LAN jest domyślnie zaufane, co oznacza, że ograniczanie liczby żądań, limiter brute-force logowania, log audytu i lista dozwolonych IP w wersji enterprise widzą prawdziwe IP klienta bez żadnej konfiguracji.

Ustaw `TRUST_PROXY=true` tylko wtedy, gdy proxy przed aplikacją łączy się z SnapOtter z adresu **publicznego**, na przykład z load balancera w chmurze w innej sieci. W instancji wystawionej bezpośrednio ta wartość sprawia, że `request.ip` jest kontrolowany przez atakującego, ponieważ wywołujący zmieniający nagłówek dostaje nowy kosz limitu na każde żądanie.

Dwie rzeczy, które warto wiedzieć, zanim zaczniesz mierzyć IP klientów. Docker Desktop na macOS i Windows obsługuje opublikowany port przez proxy w przestrzeni użytkownika, które przepisuje każdy adres źródłowy na bramę maszyny wirtualnej `192.168.65.1`, więc żadna wartość `TRUST_PROXY` nie odzyska tam prawdziwego klienta; w przypadku wszystkiego wystawionego do internetu należy wdrażać na Linuksie. Ponadto na każdej platformie dostęp do opublikowanego portu przez `localhost` jest widoczny jako brama mostu, a nie jako klient, więc test przez localhost nic nie mówi o tym, jak przypisywany jest prawdziwy klient. Pełna tabela wartości `TRUST_PROXY` i zastrzeżenie dotyczące Docker Desktop znajdują się w [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Dwie rzeczy są ważne w każdym poniższym proxy: zezwolić na duże treści żądań (przesyłanie plików) i nie buforować odpowiedzi. Proxy buforujące odpowiedzi psuje postęp SSE i, co bardziej widoczne, sprawia, że pobieranie dużego pliku „startuje, ale nigdy się nie kończy”, ponieważ proxy przetrzymuje cały plik, zanim go przekaże. SnapOtter wysyła `X-Accel-Buffering: no` przy pobieraniach, aby nginx przesyłał je strumieniowo, nawet jeśli buforowanie zostało włączone gdzie indziej, ale proxy inne niż nginx wymagają jawnego wyłączenia buforowania odpowiedzi (pokazano w każdej konfiguracji poniżej). Jeśli pobieranie zatrzymuje się w połowie, pierwszą rzeczą do sprawdzenia jest buforujące proxy przed aplikacją.

Uwaga o HSTS: API samo wysyła `Strict-Transport-Security` w każdej odpowiedzi, więc proxy przekazujące nagłówki odpowiedzi (wszystkie poniższe konfiguracje tak robią) nie wymaga własnej konfiguracji HSTS. Tylko jeśli proxy jest skonfigurowane tak, by usuwać lub nadpisywać nagłówki odpowiedzi z upstreamu, trzeba zachować ten nagłówek lub dodać go ponownie na brzegu.

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Wdrożenie pod podścieżką {#subpath}

Aby serwować pod `https://example.com/snapotter`, należy ustawić `BASE_PATH=/snapotter` w środowisku
kontenera SnapOtter i go zrestartować. Oficjalne pliki Compose dla CPU i GPU
akceptują też `BASE_PATH` z powłoki lub z pliku `.env` Compose. Ten sam
obraz działa pod dowolną ścieżką; przebudowa frontendu nie jest potrzebna.

`BASE_PATH` akceptuje segmenty rozdzielone ukośnikami, zawierające litery, cyfry, `_` lub
`-`, w tym zagnieżdżone ścieżki, takie jak `/apps/snapotter`. Końcowy ukośnik jest
opcjonalny. Dla wdrożenia w katalogu głównym należy pozostawić wartość pustą (domyślnie) lub ustawić `/`.

W istniejącym bloku serwera Nginx HTTPS należy użyć:

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

Ten przykład zachowuje prefiks. Obsługiwane są też proxy, które usuwają `/snapotter` przed
przekazaniem dalej. Wewnętrzne kontrole stanu mogą nadal używać
`/api/v1/health`. Dla OIDC lub SAML należy też ustawić
`EXTERNAL_URL=https://example.com/snapotter` i zaktualizować adresy zwrotne dostawcy tożsamości tak, aby zawierały `/snapotter/api/auth/oidc/callback` lub
`/snapotter/api/auth/saml/callback` odpowiednio.

Skrypty API działają bez zmian: adresy URL w odpowiedziach API, takie jak `downloadUrl`
narzędzia, zaczynają się od `/api/` niezależnie od `BASE_PATH`. Należy dołączać je do
podstawowego adresu URL instancji (`https://example.com/snapotter` + `/api/v1/download/...`),
zamiast rozwiązywać je względem katalogu głównego domeny.

Interfejs należy otwierać przez adres z prefiksem (`https://example.com/snapotter`). Przeglądarka,
która dotrze bez prefiksu, jest tam automatycznie przekierowywana; tylko żądania API
mają docierać do aplikacji bez prefiksu. Jeśli logi zawierają
`Requests arrive under /snapotter/ but BASE_PATH is empty`, proxy
przekazuje prefiks, którego `BASE_PATH` nie deklaruje: należy ustawić `BASE_PATH` na ten prefiks
lub usuwać prefiks na proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Dodać nowy Proxy Host
2. Ustawić Domain Name na swoją domenę
3. Ustawić Scheme na `http`, Forward Hostname na `SnapOtter` (lub IP kontenera), Forward Port na `1349`
4. Włączyć obsługę WebSocket
5. W sekcji Advanced dodać: `client_max_body_size 500M;` i `proxy_buffering off;`

Nagłówek `Strict-Transport-Security` API przechodzi przez NPM bez zmian; przełącznik HSTS na karcie SSL jest opcjonalny.

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

Traefik przekazuje nagłówki odpowiedzi z upstreamu bez zmian, więc nagłówek `Strict-Transport-Security` API dociera do przeglądarek bez middleware `headers`. Jeśli już działa middleware przepisujące nagłówki odpowiedzi, należy upewnić się, że pozostawia ten nagłówek nietknięty.

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1` wyłącza buforowanie odpowiedzi, co jest wymagane dla zdarzeń postępu SSE (przetwarzanie wsadowe, narzędzia AI, instalacje funkcji) oraz po to, by pobrania dużych plików były przesyłane strumieniowo, zamiast się zatrzymywać. Wydłużone limity czasu pozwalają ukończyć przesyłanie dużych plików bez przedwczesnego zamknięcia połączenia przez Caddy. Caddy przekazuje też nagłówek `Strict-Transport-Security` API bez zmian, więc do HSTS nie jest potrzebna dyrektywa `header`.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Uwaga: Cloudflare ma limit przesyłania 100 MB w planach darmowych. Należy ustawić `MAX_UPLOAD_SIZE_MB=100` odpowiednio.

Tunel przekazuje nagłówki odpowiedzi API, w tym `Strict-Transport-Security`, więc konfiguracja HSTS w panelu nie jest wymagana (własne ustawienie HSTS na brzegu Cloudflare jest opcjonalne).

## Rozwiązywanie problemów {#troubleshooting}

### „Postgres not reachable: EAI_AGAIN” zaraz po nieudanym pierwszym starcie {#eai-again-after-failed-first-start}

Jeśli sam pierwszy `docker compose up -d` zawiedzie w połowie (zwykle z powodu zajętego portu), zwykłe ponowienie `up -d` może uruchomić kontener aplikacji bez podłączenia go do sieci compose. Aplikacja wpada wtedy w pętlę awarii z komunikatem:

```
Postgres not reachable: EAI_AGAIN
```

podczas gdy `docker ps` pokazuje zdrowy postgres. Błąd jest prawdziwy, ale wskazuje zły kontener: bez sieci DNS dla nazwy hosta `postgres` w ogóle nie może się rozwiązać, a polityka restartu odtwarza ten sam błąd w nieskończoność.

Należy naprawić to, co zepsuło pierwszy start (zwykle: zwolnić port), a następnie wymusić ponowne utworzenie kontenera aplikacji, aby ponownie podłączył się do sieci:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: dostępne z innych urządzeń, ale nie z samego komputera {#windows-wsl2-loopback}

Gdy Docker działa wewnątrz WSL2 (typowa konfiguracja Windows), stos może być osiągalny z każdej innej maszyny w sieci, podczas gdy `http://localhost:1349` przekracza limit czasu na samym hoście Windows, nawet przy włączonym trybie sieci mirrored w WSL. Port nigdy nie pojawia się w `netstat` systemu Windows, a z kontenerami nic nie jest nie tak.

Aplikację należy otworzyć z innego urządzenia lub z wnętrza dystrybucji, używając jej własnego adresu (`hostname -I` w powłoce WSL). Jeśli przekazywanie localhost akurat działa w danej wersji WSL, należy traktować to jako bonus, a nie coś, na czym można polegać.

## CI/CD {#ci-cd}

Repozytorium GitHub ma trzy workflow:

- **ci.yml** - Uruchamiany automatycznie przy każdym push i PR. Wykonuje lint, sprawdzanie typów, testy, budowanie i walidację obrazu Docker (bez wypychania).
- **release.yml** - Uruchamiany ręcznie przez `workflow_dispatch`. Uruchamia semantic-release, aby utworzyć tag wersji i wydanie GitHub, a następnie buduje wieloarchitekturowy obraz Docker (amd64 + arm64) i wypycha go do Docker Hub (`snapotter/snapotter`) oraz GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Buduje tę witrynę dokumentacji i wdraża ją na Cloudflare Pages przy push do `main`.

Aby utworzyć wydanie, należy przejść do **Actions > Release > Run workflow** w interfejsie GitHub lub uruchomić:

```bash
gh workflow run release.yml
```

Semantic-release ustala wersję na podstawie historii commitów. Tag Docker `latest` zawsze wskazuje najnowsze wydanie.

## Analityka {#analytics}

SnapOtter zawiera anonimową analitykę produktu (wzorce użycia narzędzi, raporty błędów), która pomaga wychwytywać błędy i ulepszać funkcje. Jest domyślnie włączona. Twoje pliki, nazwy plików i dane osobowe nigdy nie są jej częścią. SnapOtter działa normalnie przy wyłączonej analityce.

### Wyłączanie analityki {#disabling-analytics}

Wyłączenie w czasie działania to jednokliknięciowy przełącznik administratora. Należy otworzyć Settings > System > Privacy i wyłączyć Anonymous Product Analytics. Działa to natychmiast dla całej instancji, bez przebudowy.

Aby uzyskać obraz, który nigdy nie może emitować analityki, należy ustawić sztywne wyłączenie w czasie budowania, klonując repozytorium i budując od nowa:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Lub dodać argument budowania do istniejącego `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
---
description: "Wdrażanie SnapOtter na produkcji z użyciem Dockera. Wymagania sprzętowe, konfiguracja GPU oraz reverse proxy dla Nginx, Traefik i Cloudflare."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: cc823633bceb
---

# Wdrażanie {#deployment}

SnapOtter wdraża się jako 3-kontenerowy stos Docker Compose: obraz aplikacji SnapOtter, PostgreSQL 17 i Redis 8. Obraz aplikacji obsługuje **linux/amd64** (z NVIDIA CUDA do przyspieszania AI) oraz **linux/arm64** (CPU), dzięki czemu działa natywnie na serwerach Intel/AMD, komputerach Mac z Apple Silicon oraz urządzeniach ARM, takich jak Raspberry Pi 4/5. Przyspieszanie z użyciem iGPU Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest dziś obsługiwane dla inferencji AI.

Konfigurację GPU, przykłady Docker Compose i przypinanie wersji znajdziesz w [Obrazie Docker](./docker-tags).

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

> **Limity szybkości Docker Hub?** Zastąp `snapotter/snapotter:latest` przez `ghcr.io/snapotter-hq/snapotter:latest`, aby pobierać z GitHub Container Registry. Oba rejestry otrzymują ten sam obraz przy każdym wydaniu.

## Szybki start (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Dla przyspieszania NVIDIA CUDA w narzędziach AI (usuwanie tła, skalowanie w górę, poprawa twarzy, OCR):

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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

Sprawdź wykrycie CUDA w logach:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Wymagania sprzętowe {#hardware-requirements}

Te liczby pochodzą z testów wydajnościowych na całej gamie systemów, od nowoczesnej stacji roboczej amd64 z NVIDIA RTX 4070 po Raspberry Pi, na których uruchomiono cały katalog narzędzi i przetestowano różne limity zasobów Dockera, aby znaleźć realne minimum.

### Szybkie zestawienie {#quick-reference}

| Poziom | Zastosowanie | CPU | RAM | GPU | Pamięć masowa |
|------|----------|-----|-----|-----|---------|
| Minimalny | Narzędzia do obrazów, plików i lekkie narzędzia PDF; jeden użytkownik; małe wsady | 2 rdzenie | 2 GB | Brak | ~7 GB |
| Zalecany | Wszystkie pięć modalności, w tym wideo, PDF i AI na CPU; wsady; kilku użytkowników | 4 rdzenie | 4 GB | Brak | ~25 GB |
| Pełny | Wszystko z pełną szybkością, w tym AI na GPU; duże wsady; wielu użytkowników | 6-8 rdzeni | 8 GB | NVIDIA 8 GB+ VRAM (12 GB komfortowo) | ~35 GB |

**Architektura: tylko 64-bitowa** (`linux/amd64` lub `linux/arm64`). SnapOtter działa natywnie na serwerach Intel/AMD, komputerach Mac z Apple Silicon oraz 64-bitowych płytkach ARM, w tym **Raspberry Pi 4 i 5** (4-8 GB). **Nie** działa na 32-bitowym ARM (`armv7`/`armhf`) — nie budujemy dla niego obrazu — ani na płytkach klasy 512 MB, takich jak Pi Zero, które są poniżej minimum pamięci (patrz niżej).

### Minimalny (narzędzia do obrazów, plików i lekkie narzędzia PDF; bez AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Zasób | Wymaganie |
|---|---|
| CPU | 2 rdzenie |
| RAM | 2 GB |
| Dysk | ~5.5 GB (obraz) + wolumen danych |
| GPU | Niewymagane |

Wszystkie 222 narzędzia z katalogu niezwiązane z AI - obraz (zmiana rozmiaru, przycinanie, konwersja, kompresja, korekta, znak wodny), wideo (przycinanie, wyciszanie, remux), audio (konwersja, normalizacja, przycinanie), PDF (scalanie, dzielenie, kompresja, obracanie, zabezpieczanie), konwersje plików oraz dedykowane szablony konwersji - działają na skromnym sprzęcie. Większość operacji kończy się w czasie znacznie poniżej sekundy nawet na dużym pliku: obraz 2,7 MB zmienia rozmiar w ~0,05 s i ponownie koduje do WebP w ~2 s.

Minimum pamięci jest realne, wynika ze zmiany limitów zasobów Dockera: **512 MB nie jest w stanie uruchomić stosu** (nawet pojedyncza zmiana rozmiaru obrazu zostaje zabita), **1 GB** obsługuje operacje na pojedynczych plikach, ale wsad wieloplikowy wyczerpuje pamięć, a **2 GB / 2 rdzenie** to najmniejsza konfiguracja, która komfortowo obsługuje wsady.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Jedynym wyjątkiem obciążającym CPU jest ponowne kodowanie wideo.** Operacje kopiowania strumienia (przycinanie, wyciszanie, remux kontenera) są natychmiastowe, ale transkodowanie do innego kodeka obciąża CPU. Klip 1080p / 45-sekundowy ponownie zakodowany do VP9 (WebM) trwa około **~40 s** na szybkim nowoczesnym CPU, ~45 s na Apple Silicon, ~80 s na starszym mobilnym 4-rdzeniowym i **~130 s** na starszym 4-rdzeniowym serwerze. Jeśli Twoje obciążenie jest intensywne pod względem wideo, postaw na liczbę rdzeni CPU i częstotliwość taktowania lub podnieś limit `cpus:` kontenera — dostarczony compose domyślnie ogranicza aplikację do 4 rdzeni (8 na compose z GPU).

### Zalecany (narzędzia AI na CPU) {#recommended-ai-tools-on-cpu}

| Zasób | Wymaganie |
|---|---|
| CPU | 4 rdzenie |
| RAM | 4 GB |
| Dysk | 3 GB (obraz) + 24 GB (modele AI) + przestrzeń robocza |
| GPU | Niewymagane (fallback na CPU) |

**To instalacja pakietów AI podnosi RAM do 4 GB.** Bez zainstalowanego AI aplikacja w bezczynności zajmuje około 360 MB; ze wszystkimi siedmioma zainstalowanymi pakietami utrzymuje ~2,6 GB w pamięci rezydentnej, ponieważ pythonowy sidecar AI wstępnie ładuje swoje modele (usuwanie tła, skalowanie w górę, OCR, transkrypcja, wykrywanie twarzy, restauracja) przy uruchomieniu. Instalacje bez AI pozostają lekkie; instalacje AI potrzebują ≥4 GB.

Większość narzędzi AI jest w pełni użyteczna na CPU; kilka naprawdę wymaga GPU. Zmierzone na nowoczesnym 4-rdzeniowym CPU:

| Narzędzie AI | Czas na CPU | Użyteczne na CPU? |
|---|---|---|
| Wykrywanie twarzy (rozmycie twarzy, inteligentne przycinanie, czerwone oczy), usuwanie szumów | poniżej 1 s | Tak |
| OCR, transkrypcja, napisy | 1-3 s | Tak |
| Kolorowanie, poprawa twarzy | ~10 s | Tak |
| Usuwanie / zastępowanie / rozmywanie tła | ~29 s | Tak (trzeba poczekać) |
| Skalowanie AI w górę (RealESRGAN) | ~33 s dla małych; minuty dla dużych obrazów | Na granicy — GPU zdecydowanie zalecane |
| Restauracja zdjęć (pełny potok) | kilka minut | Nie — potrzebne GPU lub szybki wielordzeniowy CPU |

Rozmiary pobieranych modeli AI:

| Pakiet | Rozmiar na dysku |
|---|---|
| Usuwanie tła | 4-5 GB |
| Skalowanie w górę + Poprawa twarzy + Usuwanie szumów | 5-6 GB |
| Wykrywanie twarzy | 200-300 MB |
| Wymazywacz obiektów + Kolorowanie | 1-2 GB |
| OCR | 5-6 GB |
| Restauracja zdjęć | 4-5 GB |
| **Wszystkie pakiety** | **~24 GB** |

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
| CPU | 6-8 rdzeni (przygotowanie wideo + współbieżność działają na CPU nawet przy AI na GPU) |
| RAM | 8 GB |
| GPU | NVIDIA z 8+ GB VRAM (12 GB zalecane) |
| Dysk | ~35 GB łącznie |

GPU NVIDIA (CUDA) dramatycznie przyspiesza ciężkie modele AI. Zmierzone na RTX 4070 w porównaniu z nowoczesnym CPU:

| Narzędzie AI | Przyspieszenie z GPU | Uwagi |
|---|---|---|
| Skalowanie AI w górę (RealESRGAN 2×) | **~47×** | Największy zysk — poniżej sekundy vs ~33 s (minuty dla dużych obrazów) |
| Poprawa twarzy (CodeFormer) | **~12×** | ~0,9 s vs ~11 s |
| Transkrypcja (Whisper) | ~4,5× | |
| Usuwanie / zastępowanie / rozmywanie tła | ~4× | ~7 s na GPU vs ~29 s na CPU |
| Kolorowanie | ~1,8× | |
| OCR, wykrywanie twarzy, czerwone oczy, usuwanie szumów | ~1× | Już szybkie na CPU — GPU nie pomaga |
| Restauracja zdjęć | brak | Ograniczone przez CPU nawet na GPU (0% wykorzystania GPU); szybki CPU liczy się tu bardziej niż GPU |

Narzędzia warte GPU to **skalowanie w górę, poprawa twarzy, transkrypcja i usuwanie tła**. Wykrywanie twarzy, OCR i czerwone oczy są ograniczone przez CPU i już szybkie, więc GPU nic nie wnosi.

Szczytowe zużycie VRAM sięga 7,5 GB podczas skalowania w górę z poprawą twarzy. GPU NVIDIA 6 GB działa dla większości narzędzi AI z osobna, ale zawiedzie przy skalowaniu w górę. 8-12 GB VRAM obsługuje wszystko.

Przyspieszanie z użyciem iGPU Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest dziś obsługiwane dla inferencji AI. Zmapowanie `/dev/dri` do kontenera nie włącza przyspieszania AI na GPU; SnapOtter będzie uruchamiał narzędzia AI na CPU, chyba że dostępne jest NVIDIA CUDA.

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

### Jednoczesni użytkownicy {#concurrent-users}

Równoległe żądania zmiany rozmiaru obrazu wobec domyślnego kontenera aplikacji ograniczonego do 4 rdzeni:

| Jednoczesne żądania | Śr. czas odpowiedzi | Błędy |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Czas odpowiedzi pogarsza się podliniowo, bez błędów, w miarę nasycania puli wątków roboczych. Podniesienie limitu `cpus:` kontenera aplikacji (lub użycie hosta z większą liczbą rdzeni) podnosi pułap. Zwróć uwagę, że ciężkie zadania (transkodowanie wideo, AI na CPU) utrzymują wątek roboczy przez cały czas trwania, więc dobierz liczbę rdzeni CPU do oczekiwanej liczby jednoczesnych ciężkich zadań, a nie tylko do liczby żądań.

### Obsługiwane formaty obrazów {#supported-image-formats}

SnapOtter obsługuje **ponad 55 formatów wejściowych** i **14 formatów wyjściowych**, w tym pliki RAW z ponad 20 marek aparatów, formaty profesjonalne (PSD, EPS, OpenEXR, HDR), nowoczesne kodeki (JPEG XL, AVIF, HEIC, QOI) oraz formaty naukowe/gamingowe (FITS, DDS).

Szczegóły dotyczące każdego obsługiwanego formatu, używanego dekodera i dostępnych kontrolek jakości znajdziesz w [pełnej liście formatów](/pl/guide/supported-formats).

### Znane ograniczenia {#known-limitations}

- **Zmiana rozmiaru z uwzględnieniem treści** ulega awarii na dużych obrazach (>5 MP) z powodu ograniczenia w binarium caire. Działa dobrze przy mniejszych obrazach.
- **Dekodowanie HEIF** trwa 13-23 sekundy. HEIC (wariant Apple) jest znacznie szybszy: 0,3-0,9 sekundy.
- **OCR dla japońskiego** zawodzi na CPU z powodu błędu MKLDNN w PaddlePaddle. Działa na GPU.
- **Skalowanie w górę** przekracza limit czasu na CPU dla wszystkiego poza małymi obrazami. Do praktycznego użytku wymagane jest GPU.
- **Poprawa twarzy CodeFormer** jest znacznie wolniejsza niż GFPGAN (53 s vs 2 s na GPU). GFPGAN jest zalecany w większości przypadków.

## Wolumeny {#volumes}

| Punkt montowania / Wolumen | Przeznaczenie | Wymagany? |
|---|---|---|
| `/data` (aplikacja) | Modele AI, środowisko wirtualne Python, pliki użytkowników | **Tak** - bez niego utrata plików |
| `/tmp/workspace` (aplikacja) | Tymczasowe pliki przetwarzania (automatycznie czyszczone) | Zalecany |
| `SnapOtter-pgdata` (postgres) | Katalog danych PostgreSQL (użytkownicy, ustawienia, potoki, zadania) | **Tak** - bez niego utrata danych |
| `SnapOtter-redisdata` (redis) | Plik append-only Redis dla trwałych kolejek zadań | Zalecany |

### Bind mounty vs. wolumeny nazwane {#bind-mounts-vs-named-volumes}

**Wolumeny nazwane** (zalecane) — Docker zarządza uprawnieniami automatycznie:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounty** — Uprawnieniami zarządzasz Ty. Ustaw `PUID`/`PGID` tak, aby pasowały do Twojego użytkownika hosta:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Uprawnienia pamięci masowej {#storage-permissions}

SnapOtter zapisuje w czasie działania do dwóch lokalizacji: `/data` (pliki użytkowników, logi, modele AI i środowisko wirtualne Python) oraz `/tmp/workspace` (tymczasowa przestrzeń robocza przetwarzania). Obie muszą być zapisywalne dla użytkownika, jako który działa kontener. Jeśli któraś nie jest, kontener **kończy się natychmiast przy uruchomieniu** z komunikatem podającym katalog, działające UID/GID oraz sposób naprawy — zamiast wystartować jako "zdrowy", a potem zawieść przy pierwszym przesłaniu pliku z niejasnym błędem.

To, jak obsługiwane są uprawnienia, zależy od sposobu uruchomienia kontenera:

**Domyślnie (startuje jako root, obniża do `snapotter`)** — punkt wejścia startuje jako root, naprawia własność zamontowanych wolumenów, a następnie obniża się do nieuprzywilejowanego użytkownika `snapotter` przez `gosu`. Wolumeny nazwane działają bez żadnej konfiguracji. W przypadku bind mountów ustaw `PUID`/`PGID` na swojego użytkownika hosta (powyżej), aby pliki, które zapisuje, były Twoją własnością.

**Kubernetes / OpenShift (bez roota przez `runAsUser`)** — uruchomiony bezpośrednio jako użytkownik bez roota, kontener nie może sam wykonać chown na wolumenach, więc orkiestrator musi uczynić je zapisywalnymi. Ustaw `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Zapisywalne katalogi obrazu należą do grupy GID 0 i są zapisywalne dla grupy, więc pod działający z **dowolnym UID** plus grupą uzupełniającą root (domyślnie w OpenShift) może zapisywać bez `chown`.

**TrueNAS Scale (i inne konfiguracje z "obcym UID")** — TrueNAS uruchamia aplikacje jako użytkownik bez roota (często `568:568`) i montuje zbiory danych hosta należące do innego użytkownika, więc ani punkt wejścia, ani `fsGroup` nie uczyni ich samodzielnie zapisywalnymi. Wybierz jedno:

- **Uruchom aplikację jako root** (zalecane) — pozostaw użytkownika aplikacji nieustawionego lub ustaw go na `0` i pozwól domyślnemu punktowi wejścia naprawić uprawnienia i obniżyć się do `snapotter`.
- **Uruchom jako UID `999`** — ustaw użytkownika/grupę aplikacji na `999:999` (wbudowany użytkownik `snapotter` SnapOtter), aby pasował do własności obrazu.
- **`chown` zbiór danych hosta** na UID, jako który działa kontener, z powłoki TrueNAS:

  ```bash
  # Użyj UID z błędu uruchomienia (lub uruchom `id` wewnątrz kontenera)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Błąd uruchomienia podaje dokładny UID do użycia, więc najszybsza droga to uruchomienie aplikacji raz, przeczytanie komunikatu, a następnie `chown` (lub dostosowanie użytkownika).

## Zmienne środowiskowe {#environment-variables}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `AUTH_ENABLED` | `true` | Włączenie/wyłączenie wymogu logowania |
| `DEFAULT_USERNAME` | `admin` | Początkowa nazwa użytkownika administratora |
| `DEFAULT_PASSWORD` | `admin` | Początkowe hasło administratora (wymuszona zmiana przy pierwszym logowaniu) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Limit przesyłania na plik |
| `MAX_BATCH_SIZE` | `100` | Maks. liczba plików na żądanie wsadowe |
| `RATE_LIMIT_PER_MIN` | `1000` | Żądania API na minutę na IP (ustaw 0, aby wyłączyć) |
| `MAX_USERS` | `0` (bez ograniczeń) | Maksymalna liczba kont użytkowników |
| `TRUST_PROXY` | `true` | Ufaj nagłówkom X-Forwarded-For z reverse proxy |
| `PUID` | `999` | Uruchom jako ten UID (dla uprawnień bind mount) |
| `PGID` | `999` | Uruchom jako ten GID (dla uprawnień bind mount) |
| `LOG_LEVEL` | `info` | Szczegółowość logów: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Maks. równoległych zadań przetwarzania AI |
| `SESSION_DURATION_HOURS` | `168` | Czas życia sesji logowania (7 dni) |
| `CORS_ORIGIN` | (puste) | Rozdzielona przecinkami lista dozwolonych origin lub puste dla tego samego origin |

## Sprawdzenie stanu zdrowia {#health-check}

Kontener zawiera wbudowane sprawdzenie stanu zdrowia:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

SnapOtter domyślnie ustawia `TRUST_PROXY=true`, więc ograniczanie szybkości i logowanie używają prawdziwego IP klienta z nagłówków `X-Forwarded-For`.

### Nginx {#nginx}

```nginx
server {
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

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Dodaj nowy Proxy Host
2. Ustaw Domain Name na swoją domenę
3. Ustaw Scheme na `http`, Forward Hostname na `SnapOtter` (lub IP Twojego kontenera), Forward Port na `1349`
4. Włącz obsługę WebSocket
5. W sekcji Advanced dodaj: `client_max_body_size 500M;` oraz `proxy_buffering off;`

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

`flush_interval -1` wyłącza buforowanie odpowiedzi, co jest wymagane dla zdarzeń postępu SSE (przetwarzanie wsadowe, narzędzia AI, instalacje funkcji). Wydłużone limity czasu pozwalają na ukończenie przesyłania dużych plików bez wczesnego zamknięcia połączenia przez Caddy.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Uwaga: Cloudflare ma limit przesyłania 100 MB w planach darmowych. Ustaw `MAX_UPLOAD_SIZE_MB=100` tak, aby pasował.

## CI/CD {#ci-cd}

Repozytorium GitHub ma trzy przepływy pracy:

- **ci.yml** - Uruchamia się automatycznie przy każdym pushu i PR. Lintuje, sprawdza typy, testuje, buduje i waliduje obraz Docker (bez pushowania).
- **release.yml** - Wyzwalany ręcznie przez `workflow_dispatch`. Uruchamia semantic-release, aby utworzyć tag wersji i wydanie GitHub, następnie buduje wieloarchitekturowy obraz Docker (amd64 + arm64) i pushuje do Docker Hub (`snapotter/snapotter`) oraz GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Buduje tę witrynę dokumentacji i wdraża ją na Cloudflare Pages przy pushu do `main`.

Aby utworzyć wydanie, przejdź do **Actions > Release > Run workflow** w interfejsie GitHub lub uruchom:

```bash
gh workflow run release.yml
```

Semantic-release określa wersję na podstawie historii commitów. Tag Docker `latest` zawsze wskazuje najnowsze wydanie.

## Analityka {#analytics}

SnapOtter zawiera anonimową analitykę produktu (wzorce użycia narzędzi, raporty błędów), aby pomóc wychwycić błędy i ulepszać funkcje. Jest włączona domyślnie. Twoje pliki, nazwy plików i dane osobowe nigdy nie są jej częścią. SnapOtter działa normalnie z wyłączoną analityką.

### Wyłączanie analityki {#disabling-analytics}

Rezygnacja w czasie działania to przełącznik administratora dostępny jednym kliknięciem. Otwórz Settings > System > Privacy i wyłącz Anonymous Product Analytics. Zatrzymuje się natychmiast dla całej instancji, bez konieczności przebudowy.

Dla obrazu, który nigdy nie może emitować analityki, ustaw twarde wyłączenie w czasie budowy, klonując repozytorium i przebudowując:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Lub dodaj argument budowy do istniejącego `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```

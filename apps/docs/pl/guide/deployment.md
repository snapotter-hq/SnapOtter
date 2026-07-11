---
description: "Wdroż SnapOtter na produkcję za pomocą Dockera. Wymagania sprzętowe, konfiguracja GPU i konfiguracje reverse proxy dla Nginx, Traefik i Cloudflare."
i18n_source_hash: 6b6957060fa6
i18n_provenance: machine
i18n_output_hash: 66fcd709fc00
---

# Wdrożenie {#deployment}

SnapOtter wdraża się jako 3-kontenerowy stos Docker Compose: obraz aplikacji SnapOtter, PostgreSQL 17 i Redis 8. Obraz aplikacji obsługuje **linux/amd64** (z NVIDIA CUDA do przyspieszania AI) oraz **linux/arm64** (CPU), więc działa natywnie na serwerach Intel/AMD, komputerach Mac z Apple Silicon i urządzeniach ARM, takich jak Raspberry Pi 4/5. Przyspieszanie iGPU Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwane dla wnioskowania AI.

Zobacz [Obraz Docker](./docker-tags) po konfigurację GPU, przykłady Docker Compose i przypinanie wersji.

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

> **Limity szybkości Docker Hub?** Zamień `snapotter/snapotter:latest` na `ghcr.io/snapotter-hq/snapotter:latest`, aby pobierać z GitHub Container Registry. Oba rejestry otrzymują ten sam obraz przy każdym wydaniu.

## Szybki start (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Dla przyspieszania NVIDIA CUDA w narzędziach AI (usuwanie tła, skalowanie w górę, poprawianie twarzy, OCR):

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

Sprawdź wykrywanie CUDA w logach:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Wymagania sprzętowe {#hardware-requirements}

Te liczby pochodzą z testów wydajności na różnych systemach, od nowoczesnej stacji roboczej amd64 z NVIDIA RTX 4070 aż po Raspberry Pi, na których uruchomiono cały katalog narzędzi i przeprowadzono zmiany limitów zasobów Dockera, aby znaleźć rzeczywisty próg minimalny.

### Szybki przegląd {#quick-reference}

| Poziom | Zastosowanie | CPU | RAM | GPU | Pamięć masowa |
|------|----------|-----|-----|-----|---------|
| Minimalny | Narzędzia do obrazów, plików i lekkie narzędzia PDF; pojedynczy użytkownik; małe partie | 2 rdzenie | 2 GB | Brak | ~7 GB |
| Zalecany | Wszystkie pięć modalności, w tym wideo, PDF i AI na CPU; partie; kilku użytkowników | 4 rdzenie | 4 GB | Brak | ~25 GB |
| Pełny | Wszystko z pełną szybkością, w tym AI na GPU; duże partie; wielu użytkowników | 6-8 rdzeni | 8 GB | NVIDIA 8 GB+ VRAM (12 GB komfortowo) | ~35 GB |

**Architektura: tylko 64-bitowa** (`linux/amd64` lub `linux/arm64`). SnapOtter działa natywnie na serwerach Intel/AMD, komputerach Mac z Apple Silicon oraz 64-bitowych płytkach ARM, w tym **Raspberry Pi 4 i 5** (4-8 GB). **Nie** działa na 32-bitowym ARM (`armv7`/`armhf`), bo nie jest dla niego budowany żaden obraz, ani na płytkach klasy 512 MB, takich jak Pi Zero, które są poniżej progu pamięci (patrz niżej).

### Minimalny (narzędzia do obrazów, plików i lekkie narzędzia PDF; bez AI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Zasób | Wymaganie |
|---|---|
| CPU | 2 rdzenie |
| RAM | 2 GB |
| Dysk | ~5,5 GB (obraz) + wolumen danych |
| GPU | Niewymagane |

Wszystkie 222 narzędzia katalogu niezwiązane z AI, czyli obrazy (zmiana rozmiaru, kadrowanie, konwersja, kompresja, korekta, znak wodny), wideo (przycinanie, wyciszanie, remux), audio (konwersja, normalizacja, przycinanie), PDF (łączenie, dzielenie, kompresja, obracanie, zabezpieczanie), konwersje plików i dedykowane szablony konwersji, działają na skromnym sprzęcie. Większość operacji kończy się w znacznie mniej niż sekundę nawet na dużym pliku: obraz o rozmiarze 2,7 MB zmienia rozmiar w ~0,05 s i przekodowuje do WebP w ~2 s.

Próg pamięci jest realny, wynika z badania limitów zasobów Dockera: **512 MB nie jest w stanie uruchomić stosu** (nawet pojedyncza zmiana rozmiaru obrazu jest zabijana), **1 GB** obsługuje operacje na pojedynczych plikach, ale partia wielu plików wyczerpuje pamięć, a **2 GB / 2 rdzenie** to najmniejsza konfiguracja, która komfortowo obsługuje partie.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Jedynym wyjątkiem obciążającym CPU jest przekodowywanie wideo.** Operacje kopiowania strumienia (przycinanie, wyciszanie, remux kontenera) są natychmiastowe, ale transkodowanie do innego kodeka obciąża CPU. Klip 1080p / 45-sekundowy przekodowany do VP9 (WebM) zajmuje około **~40 s** na szybkim nowoczesnym CPU, ~45 s na Apple Silicon, ~80 s na starszym mobilnym 4-rdzeniowym i **~130 s** na starszym 4-rdzeniowym serwerze. Jeśli twoje obciążenie jest intensywne pod względem wideo, priorytetyzuj rdzenie CPU i częstotliwość taktowania lub podnieś limit `cpus:` kontenera. Dostarczany compose domyślnie ogranicza aplikację do 4 rdzeni (8 w compose z GPU).

### Zalecany (narzędzia AI na CPU) {#recommended-ai-tools-on-cpu}

| Zasób | Wymaganie |
|---|---|
| CPU | 4 rdzenie |
| RAM | 4 GB |
| Dysk | 3 GB (obraz) + 24 GB (modele AI) + przestrzeń robocza |
| GPU | Niewymagane (rezerwowo CPU) |

**Instalacja pakietów AI jest tym, co podnosi RAM do 4 GB.** Bez zainstalowanego AI aplikacja w spoczynku zajmuje około 360 MB; ze wszystkimi siedmioma zainstalowanymi pakietami utrzymuje ~2,6 GB rezydentnie, ponieważ pomocniczy proces AI w Pythonie wczytuje swoje modele (usuwanie tła, skalowanie w górę, OCR, transkrypcja, wykrywanie twarzy, restauracja) przy uruchamianiu. Instalacje bez AI pozostają lekkie; instalacje AI potrzebują ≥4 GB.

Większość narzędzi AI jest doskonale użyteczna na CPU; kilka naprawdę wymaga GPU. Zmierzone na nowoczesnym 4-rdzeniowym CPU:

| Narzędzie AI | Czas CPU | Użyteczne na CPU? |
|---|---|---|
| Wykrywanie twarzy (rozmycie twarzy, inteligentne kadrowanie, czerwone oczy), usuwanie szumów | poniżej 1 s | Tak |
| OCR, transkrypcja, napisy | 1-3 s | Tak |
| Koloryzacja, poprawianie twarzy | ~10 s | Tak |
| Usuwanie / zamiana / rozmycie tła | ~29 s | Tak (poczekasz) |
| Skalowanie AI w górę (RealESRGAN) | ~33 s dla małych; minuty dla dużych obrazów | Na granicy, GPU zdecydowanie zalecane |
| Restauracja zdjęć (pełny potok) | kilka minut | Nie, wymaga GPU lub szybkiego wielordzeniowego CPU |

SnapOtter celowo nie wpieka tych pobrań modeli do obrazu Docker. Pakiety AI są pobierane tylko wtedy, gdy administrator włączy powiązane narzędzie, przechowywane w trwałym wolumenie `/data/ai` i współdzielone przez każde narzędzie zależne od tego samego stosu modeli. Utrzymuje to końcowy obraz kontenera mały, jednocześnie pozwalając pełnej instalacji AI osiągnąć większe wartości pamięci masowej podane poniżej.

Niektóre narzędzia zależą od więcej niż jednego współdzielonego pakietu. Na przykład Zdjęcie paszportowe potrzebuje zarówno `background-removal`, jak i `face-detection`; jeśli `background-removal` jest już zainstalowany, włączenie Zdjęcia paszportowego pobiera tylko brakujący pakiet `face-detection`. To samo ponowne wykorzystanie dotyczy wszystkich narzędzi AI.

Rozmiary pobrań modeli AI:

| Pakiet | Rozmiar na dysku |
|---|---|
| Usuwanie tła | 4-5 GB |
| Skalowanie w górę + Poprawianie twarzy + Usuwanie szumów | 5-6 GB |
| Wykrywanie twarzy | 200-300 MB |
| Wymazywanie obiektów + Koloryzacja | 1-2 GB |
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
| GPU | NVIDIA z 8+ GB VRAM (zalecane 12 GB) |
| Dysk | ~35 GB łącznie |

GPU NVIDIA (CUDA) dramatycznie przyspiesza ciężkie modele AI. Zmierzone na RTX 4070 w porównaniu z nowoczesnym CPU:

| Narzędzie AI | Przyspieszenie z GPU | Uwagi |
|---|---|---|
| Skalowanie AI w górę (RealESRGAN 2×) | **~47×** | Największy zysk, poniżej sekundy zamiast ~33 s (minuty dla dużych obrazów) |
| Poprawianie twarzy (CodeFormer) | **~12×** | ~0,9 s zamiast ~11 s |
| Transkrypcja (Whisper) | ~4,5× | |
| Usuwanie / zamiana / rozmycie tła | ~4× | ~7 s na GPU zamiast ~29 s na CPU |
| Koloryzacja | ~1,8× | |
| OCR, wykrywanie twarzy, czerwone oczy, usuwanie szumów | ~1× | Już szybkie na CPU, GPU nie pomaga |
| Restauracja zdjęć | brak | Obciąża CPU nawet na GPU (0% wykorzystania GPU); szybki CPU liczy się tu bardziej niż GPU |

Narzędzia warte GPU to **skalowanie w górę, poprawianie twarzy, transkrypcja i usuwanie tła**. Wykrywanie twarzy, OCR i czerwone oczy obciążają CPU i są już szybkie, więc GPU nic nie wnosi.

Szczytowe zużycie VRAM sięga 7,5 GB podczas skalowania w górę z poprawianiem twarzy. GPU NVIDIA 6 GB działa dla większości narzędzi AI z osobna, ale zawiedzie przy skalowaniu w górę. 8-12 GB VRAM obsługuje wszystko.

Przyspieszanie iGPU Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwane dla wnioskowania AI. Zmapowanie `/dev/dri` do kontenera nie włącza przyspieszania AI na GPU; SnapOtter uruchomi narzędzia AI na CPU, chyba że dostępne jest NVIDIA CUDA.

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

| Jednoczesne żądania | Średni czas odpowiedzi | Błędy |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Czas odpowiedzi pogarsza się podliniowo bez błędów, gdy pula procesów roboczych się nasyca. Podniesienie limitu `cpus:` kontenera aplikacji (lub użycie hosta z większą liczbą rdzeni) podnosi pułap. Zwróć uwagę, że ciężkie zadania (transkodowanie wideo, AI na CPU) zajmują proces roboczy na cały czas ich trwania, więc dobierz CPU do oczekiwanej liczby jednoczesnych ciężkich zadań, a nie tylko do liczby żądań.

### Obsługiwane formaty obrazów {#supported-image-formats}

SnapOtter obsługuje **55+ formatów wejściowych** i **14 formatów wyjściowych**, w tym pliki RAW z 20+ marek aparatów, formaty profesjonalne (PSD, EPS, OpenEXR, HDR), nowoczesne kodeki (JPEG XL, AVIF, HEIC, QOI) oraz formaty naukowe/growe (FITS, DDS).

Zobacz [pełną listę formatów](/pl/guide/supported-formats) po szczegóły dotyczące każdego obsługiwanego formatu, użytego dekodera i dostępnych kontroli jakości.

### Znane ograniczenia {#known-limitations}

- **Zmiana rozmiaru z uwzględnieniem treści** ulega awarii na dużych obrazach (>5 MP) z powodu ograniczenia w pliku binarnym caire. Działa dobrze z mniejszymi obrazami.
- **Dekodowanie HEIF** zajmuje 13-23 sekundy. HEIC (wariant Apple) jest znacznie szybszy, 0,3-0,9 sekundy.
- **OCR japoński** zawodzi na CPU z powodu błędu MKLDNN w PaddlePaddle. Działa na GPU.
- **Skalowanie w górę** przekracza limit czasu na CPU dla czegokolwiek poza małymi obrazami. GPU wymagane do praktycznego użytku.
- Poprawianie twarzy **CodeFormer** jest znacznie wolniejsze niż GFPGAN (53 s zamiast 2 s na GPU). GFPGAN jest zalecany dla większości zastosowań.

## Wolumeny {#volumes}

| Montowanie / Wolumen | Cel | Wymagane? |
|---|---|---|
| `/data` (aplikacja) | Modele AI, venv Pythona, pliki użytkownika | **Tak**, utrata plików bez niego |
| `/tmp/workspace` (aplikacja) | Tymczasowe pliki przetwarzania (automatycznie czyszczone) | Zalecane |
| `SnapOtter-pgdata` (postgres) | Katalog danych PostgreSQL (użytkownicy, ustawienia, potoki, zadania) | **Tak**, utrata danych bez niego |
| `SnapOtter-redisdata` (redis) | Plik append-only Redis dla trwałych kolejek zadań | Zalecane |

### Montowania bind vs. wolumeny nazwane {#bind-mounts-vs-named-volumes}

**Wolumeny nazwane** (zalecane): Docker automatycznie zarządza uprawnieniami:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Montowania bind**: uprawnieniami zarządzasz ty. Ustaw `PUID`/`PGID` tak, aby pasowały do użytkownika hosta:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Uprawnienia pamięci masowej {#storage-permissions}

SnapOtter zapisuje w dwóch lokalizacjach w czasie działania: `/data` (pliki użytkownika, logi, modele AI i venv Pythona) oraz `/tmp/workspace` (tymczasowa przestrzeń robocza przetwarzania). Obie muszą być zapisywalne przez użytkownika, jako który działa kontener. Jeśli któraś nie jest, kontener **szybko zawodzi przy uruchamianiu** z komunikatem nazywającym katalog, działający UID/GID oraz sposób naprawy, zamiast uruchamiać się jako "zdrowy", a potem zawieść przy pierwszym przesłaniu z tajemniczym błędem.

Sposób obsługi uprawnień zależy od tego, jak kontener jest uruchamiany:

**Domyślnie (startuje jako root, schodzi do `snapotter`)**: punkt wejścia startuje jako root, naprawia własność zamontowanych wolumenów, a następnie schodzi do nieuprzywilejowanego użytkownika `snapotter` przez `gosu`. Wolumeny nazwane działają bez konfiguracji. Dla montowań bind ustaw `PUID`/`PGID` na swojego użytkownika hosta (powyżej), aby zapisywane przez niego pliki należały do ciebie.

**Kubernetes / OpenShift (nie-root przez `runAsUser`)**: uruchomiony bezpośrednio jako użytkownik nie-root, kontener nie może sam zmienić własności wolumenów przez chown, więc orkiestrator musi je uczynić zapisywalnymi. Ustaw `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Zapisywalne katalogi obrazu należą do grupy GID 0 i są zapisywalne dla grupy, więc pod działający z **dowolnym UID** plus dodatkową grupą root (domyślną w OpenShift) może zapisywać bez `chown`.

**TrueNAS Scale (i inne konfiguracje z "obcym UID")**: TrueNAS uruchamia aplikacje jako użytkownik nie-root (często `568:568`) i montuje zbiory danych hosta należące do innego użytkownika, więc ani punkt wejścia, ani `fsGroup` nie uczyni ich zapisywalnymi samodzielnie. Wybierz jedno:

- **Uruchom aplikację jako root** (zalecane): pozostaw użytkownika aplikacji nieustawionego lub ustaw go na `0` i pozwól domyślnemu punktowi wejścia naprawić uprawnienia i zejść do `snapotter`.
- **Uruchom jako UID `999`**: ustaw użytkownika/grupę aplikacji na `999:999` (wbudowany użytkownik `snapotter` SnapOttera), aby pasował do własności obrazu.
- **`chown` zbiór danych hosta** na UID, jako który działa kontener, z powłoki TrueNAS:

  ```bash
  # Użyj UID z błędu przy uruchamianiu (lub uruchom `id` wewnątrz kontenera)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Błąd przy uruchamianiu nazywa dokładny UID do użycia, więc najszybszą drogą jest uruchomienie aplikacji raz, odczytanie komunikatu, a następnie `chown` (lub dostosowanie użytkownika) odpowiednio.

## Zmienne środowiskowe {#environment-variables}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `AUTH_ENABLED` | `true` | Włącz/wyłącz wymóg logowania |
| `DEFAULT_USERNAME` | `admin` | Początkowa nazwa użytkownika administratora |
| `DEFAULT_PASSWORD` | `admin` | Początkowe hasło administratora (wymuszona zmiana przy pierwszym logowaniu) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Limit przesyłania na plik |
| `MAX_BATCH_SIZE` | `100` | Maksymalna liczba plików na żądanie wsadowe |
| `RATE_LIMIT_PER_MIN` | `1000` | Żądania API na minutę na IP (ustaw 0, aby wyłączyć) |
| `MAX_USERS` | `0` (bez limitu) | Maksymalna liczba kont użytkowników |
| `TRUST_PROXY` | `true` | Ufaj nagłówkom X-Forwarded-For z reverse proxy |
| `PUID` | `999` | Uruchom jako ten UID (dla uprawnień montowań bind) |
| `PGID` | `999` | Uruchom jako ten GID (dla uprawnień montowań bind) |
| `LOG_LEVEL` | `info` | Szczegółowość logów: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Maksymalna liczba równoległych zadań przetwarzania AI |
| `SESSION_DURATION_HOURS` | `168` | Czas życia sesji logowania (7 dni) |
| `CORS_ORIGIN` | (puste) | Dozwolone źródła oddzielone przecinkami lub puste dla tego samego źródła |

## Kontrola stanu {#health-check}

Kontener zawiera wbudowaną kontrolę stanu:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse Proxy {#reverse-proxy}

SnapOtter domyślnie ustawia `TRUST_PROXY=true`, aby ograniczanie szybkości i logowanie używały rzeczywistego adresu IP klienta z nagłówków `X-Forwarded-For`.

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
3. Ustaw Scheme na `http`, Forward Hostname na `SnapOtter` (lub IP twojego kontenera), Forward Port na `1349`
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

`flush_interval -1` wyłącza buforowanie odpowiedzi, które jest wymagane dla zdarzeń postępu SSE (przetwarzanie wsadowe, narzędzia AI, instalacje funkcji). Wydłużone limity czasu pozwalają dużym przesłaniom plików ukończyć się bez wcześniejszego zamknięcia połączenia przez Caddy.

### Tunele Cloudflare {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Uwaga: Cloudflare ma limit przesyłania 100 MB w planach darmowych. Ustaw `MAX_UPLOAD_SIZE_MB=100` tak, aby pasował.

## CI/CD {#ci-cd}

Repozytorium GitHub ma trzy przepływy pracy:

- **ci.yml**: uruchamia się automatycznie przy każdym push i PR. Lintuje, sprawdza typy, testuje, buduje i waliduje obraz Docker (bez wypychania).
- **release.yml**: uruchamiany ręcznie przez `workflow_dispatch`. Uruchamia semantic-release, aby utworzyć tag wersji i wydanie GitHub, następnie buduje wieloarchitekturowy obraz Docker (amd64 + arm64) i wypycha do Docker Hub (`snapotter/snapotter`) oraz GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml**: buduje tę stronę dokumentacji i wdraża ją do Cloudflare Pages przy push do `main`.

Aby utworzyć wydanie, przejdź do **Actions > Release > Run workflow** w interfejsie GitHub lub uruchom:

```bash
gh workflow run release.yml
```

Semantic-release ustala wersję na podstawie historii commitów. Tag Docker `latest` zawsze wskazuje najnowsze wydanie.

## Analityka {#analytics}

SnapOtter zawiera anonimową analitykę produktu (wzorce użycia narzędzi, raporty błędów), aby pomóc wychwytywać błędy i ulepszać funkcje. Jest włączona domyślnie. Twoje pliki, nazwy plików i dane osobowe nigdy nie są jej częścią. SnapOtter działa normalnie z wyłączoną analityką.

### Wyłączanie analityki {#disabling-analytics}

Rezygnacja w czasie działania to przełącznik administratora dostępny jednym kliknięciem. Otwórz Ustawienia > System > Prywatność i wyłącz Anonimową Analitykę Produktu. Zatrzymuje się natychmiast dla całej instancji, bez konieczności przebudowy.

Dla obrazu, który nigdy nie może emitować analityki, ustaw twarde wyłączenie w czasie budowania, klonując repozytorium i przebudowując:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Lub dodaj argument budowania do istniejącego `docker-compose.yml`:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```

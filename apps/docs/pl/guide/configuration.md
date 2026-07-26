---
description: "Wszystkie zmienne środowiskowe SnapOtter z wartościami domyślnymi. Skonfiguruj uwierzytelnianie, magazyn, modele AI, analitykę i nie tylko."
i18n_source_hash: 25970c776f7c
i18n_provenance: human
i18n_output_hash: 203099343d0d
i18n_hash_version: 2
---

# Konfiguracja {#configuration}

Cała konfiguracja odbywa się za pomocą zmiennych środowiskowych. Każda zmienna ma rozsądną wartość domyślną, więc SnapOtter działa od razu po zainstalowaniu bez ustawiania którejkolwiek z nich.

## Zmienne środowiskowe {#environment-variables}

### Serwer {#server}

| Zmienna | Wartość domyślna | Opis |
|---|---|---|
| `PORT` | `1349` | Port, na którym nasłuchuje serwer. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maksymalna liczba żądań na minutę na adres IP. Ustaw na 0, aby wyłączyć ograniczanie liczby żądań. |
| `CORS_ORIGIN` | (puste) | Rozdzielona przecinkami lista dozwolonych źródeł dla CORS albo puste dla wyłącznie tego samego źródła. |
| `LOG_LEVEL` | `info` | Szczegółowość logów. Jedno z: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Które węzły mogą ustawiać IP klienta przez nagłówek `X-Forwarded-For`. Wartość domyślna wierzy tylko węzłowi z sieci prywatnej, więc zwrotne proxy w sieci Dockera albo w sieci LAN jest zaufane, a podrobiony nagłówek klienta z publicznego adresu już nie. Ustaw `true` tylko wtedy, gdy z przodu stoi kontrolowane przez ciebie proxy pod publicznym adresem. |

### Uwierzytelnianie {#authentication}

Poniższe dwie wartości logiczne przyjmują tylko `true` i `false`. Cokolwiek innego, `1`, `yes` czy `on`, nie przechodzi walidacji, a serwer kończy działanie, zanim zacznie nasłuchiwać.

| Zmienna | Wartość domyślna | Opis |
|---|---|---|
| `AUTH_ENABLED` | `true` | Wymaga logowania. Ustaw na `false`, aby działać zupełnie bez kont, co przyznaje każdemu żądaniu uprawnienia administratora, więc rób tak wyłącznie w zaufanej sieci. |
| `DEFAULT_USERNAME` | `admin` | Nazwa użytkownika początkowego konta administratora. Używana tylko przy pierwszym uruchomieniu. |
| `DEFAULT_PASSWORD` | `admin` | Hasło do początkowego konta administratora. Zmień je po pierwszym zalogowaniu. |
| `MAX_USERS` | `0` (bez ograniczeń) | Maksymalna liczba zarejestrowanych kont użytkowników. Ustaw na 0 dla braku ograniczeń. |
| `SESSION_DURATION_HOURS` | `168` | Czas życia sesji logowania w godzinach (domyślnie 7 dni). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Ustaw na `true`, aby pominąć wymuszony monit o zmianę hasła przy pierwszym zalogowaniu. |

### Magazyn {#storage}

| Zmienna | Wartość domyślna | Opis |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` lub `s3`. S3 i MinIO wymagają licencji z funkcją s3_storage oraz zmiennych `S3_*` opisanych niżej. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Ciąg połączenia PostgreSQL. Stos Compose kieruje go na swoją usługę `postgres`; pozostaw nieustawiony (razem z `REDIS_URL`), aby uzyskać tryb wbudowany. |
| `REDIS_URL` | `redis://localhost:6379` | Ciąg połączenia Redis (używany dla kolejek zadań BullMQ). Compose kieruje go na swoją usługę `redis`. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Katalog na pliki tymczasowe podczas przetwarzania. Czyszczony automatycznie. Obraz ustawia `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Katalog na trwałe pliki użytkownika (przesłane obrazy, zapisane wyniki). Obraz ustawia `/data/files`. |

### Magazyn obiektów S3 {#s3-object-storage}

Odczytywane tylko wtedy, gdy `STORAGE_MODE=s3`. Jeśli pominiesz którąkolwiek z trzech wymaganych zmiennych, uruchomienie zakończy się niepowodzeniem z nazwą brakującej zmiennej.

| Zmienna | Wartość domyślna | Opis |
|---|---|---|
| `S3_BUCKET` | (puste) | Bucket przechowujący przesłane pliki i wyniki. Wymagane. |
| `S3_ACCESS_KEY_ID` | (puste) | Klucz dostępu. Wymagane. W kontenerze możesz zamiast tego zamontować go przez `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (puste) | Klucz tajny. Wymagane. Ta sama konwencja plikowa: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Region bucketa. |
| `S3_ENDPOINT` | (puste) | Własny endpoint dla MinIO, R2, Backblaze i innych magazynów zgodnych z S3. Puste oznacza AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Ustaw na `true` dla MinIO i wszystkiego innego, co oczekuje `endpoint/bucket/key` zamiast adresowania w stylu wirtualnego hosta. |
| `S3_PREFIX` | (puste) | Prefiks kluczy, dzięki czemu jeden bucket może obsługiwać kilka instancji. |

### Szyfrowanie danych w spoczynku {#encryption-at-rest}

| Zmienna | Wartość domyślna | Opis |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (puste) | 64 znaki szesnastkowe (32 bajty). Szyfruje wrażliwe ustawienia przechowywane w bazie danych. Wszystko, co nie ma 64 znaków szesnastkowych, jest odrzucane przy uruchamianiu. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (puste) | Klucz, z którego przechodzisz podczas rotacji, w tym samym formacie. Ustaw oba na czas rotacji, aby istniejące wiersze nadal dawały się odszyfrować, a potem usuń ten. |

### Tryb wbudowany {#embedded-mode}

Uruchom obraz bez `DATABASE_URL` i bez `REDIS_URL`, a wystartuje on własny PostgreSQL 17 i Redis wewnątrz kontenera, powiązane z pętlą zwrotną (loopback), ze wszystkimi danymi na woluminie `/data`. Przywraca to jednopoleceniowe doświadczenie `docker run` na potrzeby szybkiego startu, homelaba i aktualizacji z wersji 1.x. To ścieżka dla wygody, a nie wdrożenie produkcyjne: w środowisku produkcyjnym uruchom 3-kontenerowy stos Compose z osobnymi PostgreSQL i Redis. Tryb wbudowany wymaga uruchomienia kontenera jako root i jest niezgodny ze środowiskami uruchomieniowymi o dowolnym UID (OpenShift, Kubernetes `runAsNonRoot`); tam użyj Compose.

| Zmienna | Wartość domyślna | Opis |
|---|---|---|
| `EMBEDDED` | `auto` | Włączane automatycznie, gdy zarówno `DATABASE_URL`, jak i `REDIS_URL` są nieustawione. Ustaw na `0`, aby to wyłączyć (aplikacja wtedy szybko zakończy działanie, jeśli nie ustawiono zewnętrznego `DATABASE_URL`/`REDIS_URL`, zamiast po cichu uruchamiać bazę danych wewnątrz kontenera). |
| `REDIS_MAXMEMORY` | `512mb` | Limit pamięci dla wbudowanego Redis (tylko tryb wbudowany). Obniż go na hostach z ograniczoną pamięcią, takich jak Raspberry Pi. |

Aktualizacja z wersji 1.x: umieść swój stary plik `snapotter.db` pod `/data/snapotter.db` w woluminie, a tryb wbudowany zaimportuje go do wbudowanego PostgreSQL przy pierwszym uruchomieniu. Import przebiega raz; późniejsze uruchomienia go pomijają.

Uwaga o telemetrii: tryb wbudowany dziedziczy domyślne ustawienie analityki obrazu jak każda inna konfiguracja. Publikowany obraz jest dostarczany z włączoną analityką; zbuduj z `--build-arg SNAPOTTER_ANALYTICS=off` albo użyj wewnątrzaplikacyjnej rezygnacji dla administratora, aby ją wyłączyć.

### Limity przetwarzania {#processing-limits}

| Zmienna | Wartość domyślna | Opis |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (bez ograniczeń) | Maksymalny rozmiar pliku na jedno przesłanie w megabajtach. Ustaw na 0 dla braku ograniczeń. Publikowany obraz jest dostarczany z `0`; kompilacja ze źródeł zaczyna od 100. |
| `MAX_BATCH_SIZE` | `0` (bez ograniczeń) | Maksymalna liczba plików w pojedynczym żądaniu wsadowym. Ustaw na 0 dla braku ograniczeń. Publikowany obraz jest dostarczany z `0`; kompilacja ze źródeł zaczyna od 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Liczba zadań wsadowych uruchamianych równolegle. Ustaw na 0, aby automatycznie wykryć na podstawie dostępnych rdzeni CPU. |
| `MAX_MEGAPIXELS` | `0` (bez ograniczeń) | Maksymalna dozwolona rozdzielczość obrazu w megapikselach. Ustaw na 0 dla braku ograniczeń. |
| `MAX_WORKER_THREADS` | `0` (auto) | Maksymalna liczba wątków roboczych do przetwarzania obrazów. Ustaw na 0, aby automatycznie wykryć na podstawie dostępnych rdzeni CPU. |
| `PROCESSING_TIMEOUT_S` | `0` (bez limitu) | Maksymalny czas przetwarzania na żądanie w sekundach. Ustaw na 0 dla braku limitu czasu. |
| `MAX_PIPELINE_STEPS` | `20` | Maksymalna liczba kroków w potoku. Ustaw na 0 dla braku limitu. |
| `MAX_CANVAS_PIXELS` | `0` (bez limitu) | Maksymalny rozmiar płótna w pikselach dla obrazów wyjściowych. Ustaw na 0 dla braku limitu. |
| `MAX_SVG_SIZE_MB` | `50` | Największy plik SVG akceptowany przed oczyszczaniem, w megabajtach. `0` działa tutaj inaczej niż w sąsiednich wierszach. Całkowicie usuwa limit rozmiaru sprawdzany przed parsowaniem, zamiast go podnosić, więc zostaw tę zmienną ustawioną. |
| `MAX_PDF_PAGES` | `0` (bez ograniczeń) | Maksymalna liczba stron PDF dla konwersji PDF na obraz. Ustaw na 0 dla braku ograniczeń. |

### Czyszczenie {#cleanup}

| Zmienna | Wartość domyślna | Opis |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Jak długo niezapisane wyniki przetwarzania (surowe przesłania i wyjścia narzędzi) są przechowywane przed automatycznym usunięciem. Pliki, które jawnie zapiszesz w bibliotece Files, nie są objęte tym mechanizmem i pozostają, dopóki ich nie usuniesz. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Jak często uruchamiane jest zadanie czyszczenia. |

### Wygląd {#appearance}

| Zmienna | Wartość domyślna | Opis |
|---|---|---|
| `DEFAULT_THEME` | `light` | Domyślny motyw dla nowych sesji. `light`, `dark` lub `system`. |
| `DEFAULT_LOCALE` | `en` | Domyślny język interfejsu. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Domyślny układ narzędzi. `sidebar` lub `fullscreen`. |

### Uprawnienia Docker {#docker-permissions}

| Zmienna | Wartość domyślna | Opis |
|---|---|---|
| `PUID` | `999` | Uruchom proces kontenera jako ten UID. Ustaw tak, aby pasował do Twojego użytkownika hosta dla montowań bind (`id -u`). |
| `PGID` | `999` | Uruchom proces kontenera jako ten GID. Ustaw tak, aby pasował do Twojej grupy hosta dla montowań bind (`id -g`). |

## Przykład Docker {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
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
      POSTGRES_PASSWORD: snapotter     # Zmień to w przypadku wdrożeń nielokalnych
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
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
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Woluminy {#volumes}

Stos Docker Compose używa czterech woluminów:

- `/data` (app) - modele AI, środowisko venv Pythona i pliki użytkownika. Zamontuj to, aby zachować przesłane pliki i zainstalowane pakiety AI między ponownymi uruchomieniami.
- `/tmp/workspace` (app) - tymczasowy magazyn na pliki będące w trakcie przetwarzania. Może być efemeryczny, ale zamontowanie go pozwala uniknąć zapełnienia zapisywalnej warstwy kontenera.
- `SnapOtter-pgdata` (postgres) - katalog danych PostgreSQL. Przechowuje wszystkie dane relacyjne (użytkownicy, ustawienia, potoki, zadania, dziennik audytu). Wykonaj kopię zapasową przez `pg_dump` lub migawkę woluminu.
- `SnapOtter-redisdata` (redis) - plik append-only Redis dla trwałych kolejek zadań.

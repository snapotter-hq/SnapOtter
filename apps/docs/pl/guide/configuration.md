---
description: "Wszystkie zmienne środowiskowe SnapOtter wraz z wartościami domyślnymi. Konfiguracja uwierzytelniania, przechowywania danych, modeli AI, analityki i nie tylko."
i18n_source_hash: 02edb8bd70e5
i18n_provenance: machine
i18n_output_hash: 021bfc67c76b
i18n_hash_version: 2
---

# Konfiguracja {#configuration}

Cała konfiguracja odbywa się za pomocą zmiennych środowiskowych. Każda zmienna ma rozsądną wartość domyślną, więc SnapOtter działa od razu, bez ustawiania którejkolwiek z nich.

## Zmienne środowiskowe {#environment-variables}

### Serwer {#server}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PORT` | `1349` | Port, na którym nasłuchuje serwer. |
| `HOST` | `0.0.0.0` | Adres IP, na którym nasłuchuje serwer. W sieci typu bridge (domyślnej dla `docker run` i Compose) należy pozostawić `0.0.0.0` (lub `::`), w przeciwnym razie opublikowane porty przestaną działać. W instalacji natywnej lub w kontenerze w sieci hosta `127.0.0.1` odcina API od sieci; do zdalnego dostępu należy umieścić przed nim reverse proxy. [Tryb wbudowany](#embedded-mode) działa tylko z `0.0.0.0`, `::` lub `127.0.0.1`, ponieważ jego kontrola uruchomienia odwołuje się do `127.0.0.1`. Przy każdym innym adresie, łącznie z `::1`, kontener nigdy nie zostaje uznany za uruchomiony, a późniejsza awaria zatrzymuje go zamiast ponownie uruchomić serwer. Wszystko, co nie jest adresem IP, łącznie z `localhost`, zatrzymuje serwer przy uruchomieniu. |
| `BASE_PATH` | (puste) | Publiczna ścieżka wdrożenia, np. `/snapotter`. Puste lub `/` oznacza obsługę w katalogu głównym domeny. Stosowana w czasie działania; przebudowa obrazu nie jest wymagana. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maksymalna liczba żądań na minutę z jednego adresu IP. Ustawienie 0 wyłącza ograniczanie liczby żądań. |
| `CORS_ORIGIN` | (puste) | Dozwolone źródła (origin) dla CORS, oddzielone przecinkami, lub puste, aby dopuścić tylko to samo źródło. |
| `LOG_LEVEL` | `info` | Szczegółowość logów. Jedna z wartości: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Określa, które węzły mogą ustawiać adres IP klienta przez `X-Forwarded-For`. Wartość domyślna ufa wyłącznie węzłowi z sieci prywatnej, więc zaufany jest reverse proxy w sieci Docker lub w sieci LAN, a sfałszowany nagłówek publicznego klienta nie. Ustawiać `true` tylko wtedy, gdy przed aplikacją stoi kontrolowany przez użytkownika proxy z publicznym adresem. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | (nieustawiona) | Odpowiada z góry na pytanie o analitykę zadawane przy pierwszym uruchomieniu, więc nikt nie jest pytany. Gdy nie jest ustawiona, nowa instancja pyta swojego administratora i nie wysyła niczego, dopóki nie dostanie odpowiedzi. `off` uruchamia ją z wyłączonym ustawieniem „Anonymous Product Analytics”, a `on` z włączonym. Zmienna jedynie wypełnia to ustawienie, dopóki nikt go nie wybrał. Gdy ustawienie zostanie zapisane, przez administratora lub przez tę zmienną, zmiana zmiennej nie daje żadnego efektu; administrator nadal może je zmienić w Settings > System > Privacy. |

### Uwierzytelnianie {#authentication}

Dwie poniższe zmienne logiczne przyjmują wyłącznie `true` i `false`. Każda inna wartość, `1`, `yes` lub `on`, nie przechodzi walidacji, a serwer kończy działanie, zanim zacznie nasłuchiwać.

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `AUTH_ENABLED` | `true` | Wymaga logowania. Ustawienie `false` uruchamia aplikację bez żadnych kont, co przyznaje każdemu żądaniu uprawnienia administratora, dlatego należy ograniczyć to do zaufanej sieci. |
| `DEFAULT_USERNAME` | `admin` | Nazwa użytkownika początkowego konta administratora. Używana tylko przy pierwszym uruchomieniu. |
| `DEFAULT_PASSWORD` | `admin` | Hasło początkowego konta administratora. Zmienić po pierwszym zalogowaniu. |
| `MAX_USERS` | `0` (bez limitu) | Maksymalna liczba zarejestrowanych kont użytkowników. Ustawienie 0 oznacza brak limitu. |
| `SESSION_DURATION_HOURS` | `168` | Czas trwania sesji logowania w godzinach (domyślnie 7 dni). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Ustawienie `true` pomija wymuszony monit o zmianę hasła przy pierwszym logowaniu. |

### Przechowywanie danych {#storage}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` lub `s3`. S3 i MinIO wymagają licencji z funkcją s3_storage oraz zmiennych `S3_*` opisanych poniżej. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Ciąg połączenia z PostgreSQL oraz połączenie, przez które obsługiwane jest każde żądanie. W wersji 2.3.0 i nowszych, po ustawieniu także `DATABASE_MIGRATION_URL`, staje się ono rolą uruchomieniową o najmniejszych uprawnieniach, z uprawnieniami DML do tabel aplikacji i niczym więcej. Stos Compose kieruje je na swoją usługę `postgres`; pozostawić bez ustawienia (razem z `REDIS_URL`), aby uzyskać tryb wbudowany. |
| `DATABASE_MIGRATION_URL` | (puste) | Połączenie uprzywilejowane, używane wyłącznie podczas rozruchu do uruchamiania migracji i nadawania uprawnień roli uruchomieniowej, a następnie zamykane przed pierwszym żądaniem. Pozostawienie pustego powoduje, że SnapOtter działa z jedną rolą, a `DATABASE_URL` pełni obie funkcje. Zobacz [Role o najmniejszych uprawnieniach](/pl/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Ciąg połączenia z Redis (używany do kolejek zadań BullMQ). Compose kieruje go na swoją usługę `redis`. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Katalog na pliki tymczasowe podczas przetwarzania. Czyszczony automatycznie. Obraz ustawia `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Katalog na trwałe pliki użytkowników (przesłane obrazy, zapisane wyniki). Obraz ustawia `/data/files`. |

### Magazyn obiektów S3 {#s3-object-storage}

Odczytywane tylko wtedy, gdy `STORAGE_MODE=s3`. Brak którejkolwiek z trzech wymaganych zmiennych powoduje błąd uruchomienia z nazwą pominiętej zmiennej.

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `S3_BUCKET` | (puste) | Bucket przechowujący przesłane pliki i wyniki. Wymagane. |
| `S3_ACCESS_KEY_ID` | (puste) | Klucz dostępu. Wymagane. W kontenerze można go zamontować jako plik, za pomocą `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (puste) | Klucz tajny. Wymagane. Ta sama konwencja plików: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Region bucketu. |
| `S3_ENDPOINT` | (puste) | Niestandardowy endpoint dla MinIO, R2, Backblaze i innych magazynów zgodnych z S3. Puste oznacza AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Ustawić `true` dla MinIO i wszystkiego, co wymaga `endpoint/bucket/key` zamiast adresowania w stylu virtual-host. |
| `S3_PREFIX` | (puste) | Prefiks klucza, dzięki któremu jeden bucket może przechowywać kilka instancji. |

### Szyfrowanie danych w spoczynku {#encryption-at-rest}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (puste) | 64 znaki szesnastkowe (32 bajty). Szyfruje wrażliwe ustawienia przechowywane w bazie danych. Wszystko, co nie jest 64 znakami szesnastkowymi, jest odrzucane przy uruchomieniu. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (puste) | Klucz, który jest wymieniany, w tym samym formacie. Ustawić oba podczas rotacji, aby istniejące wiersze nadal się odszyfrowywały, a następnie usunąć ten. |

### Tryb wbudowany {#embedded-mode}

Uruchomienie obrazu bez `DATABASE_URL` i bez `REDIS_URL` powoduje, że wewnątrz kontenera startują własne PostgreSQL 17 i Redis, powiązane z interfejsem loopback, a wszystkie dane trafiają na wolumen `/data`. Przywraca to wygodę uruchomienia jednym poleceniem `docker run` przy szybkim starcie, w homelabie i przy aktualizacji z wersji 1.x. Jest to ścieżka dla wygody, a nie wdrożenie produkcyjne: w produkcji należy uruchomić stos Compose z 3 kontenerami i osobnymi PostgreSQL i Redis. Tryb wbudowany wymaga uruchomienia kontenera jako root i jest niezgodny ze środowiskami z dowolnym UID (OpenShift, Kubernetes `runAsNonRoot`); tam należy użyć Compose.

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `EMBEDDED` | `auto` | Włączana automatycznie, gdy `DATABASE_URL` i `REDIS_URL` nie są ustawione. Ustawienie `0` wyłącza ją (aplikacja kończy wtedy działanie od razu, jeśli nie ustawiono zewnętrznego `DATABASE_URL`/`REDIS_URL`, zamiast po cichu uruchamiać bazę danych w kontenerze). |
| `REDIS_MAXMEMORY` | `512mb` | Limit pamięci wbudowanego Redis (tylko w trybie wbudowanym). Obniżyć na hostach o ograniczonej pamięci, takich jak Raspberry Pi. |
| `EMBEDDED_PG_PORT` | `5432` | Port loopback dla wbudowanego PostgreSQL (tylko w trybie wbudowanym). Zmieniać go tylko wtedy, gdy kontener współdzieli sieć, w której port 5432 jest zajęty, np. przy `--network host`. Musi różnić się od `EMBEDDED_REDIS_PORT` i być większy niż 1023, ponieważ PostgreSQL działa jako nieuprzywilejowany użytkownik, który nie może powiązać się z portem uprzywilejowanym w sieci hosta. |
| `EMBEDDED_REDIS_PORT` | `6379` | To samo dla wbudowanego Redis, który również działa jako nieuprzywilejowany użytkownik. |
| `EMBEDDED_DB_PASSWORDS` | (puste) | Ustawić `1`, aby przy następnym rozruchu wygenerować losowe hasła dla ról wbudowanego PostgreSQL i dla Redis, przechowywane w `/data/.embedded-db-secrets`. Logowanie przez TCP wymaga wtedy tych haseł. Na wolumenie utworzonym po raz pierwszy przez wersję 2.3.0 lub nowszą superużytkownik PostgreSQL w ogóle nie może logować się przez TCP; na starszym wolumenie właściciel bazy danych jest superużytkownikiem, a chroni go właśnie jego hasło. Należy używać tej opcji zawsze, gdy inne programy współdzielą sieć kontenera, np. przy `--network host`. Dla danego wolumenu pozostaje ona włączona: hasła są używane przy każdym rozruchu, nawet po usunięciu tej zmiennej, a usunięcie `/data/.embedded-db-secrets` daje jedynie nowe hasła albo, jeśli zmienna nie jest ustawiona, rozruch kończący się błędem. Jeśli kontener nie uruchamia się, ponieważ jeden z tych plików jest uszkodzony, należy usunąć ten plik poleceniem `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` i ponownie uruchomić kontener; następny rozruch utworzy nowy. Zmienna przyjmuje `1`, `0` lub wartość pustą, a każda inna wartość przerywa rozruch. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Liczba sekund, przez które rozruch czeka, aż wbudowany Redis odpowie na `PING`, zanim się podda. Po przekroczeniu limitu kontener zatrzymuje się i zapisuje w logu przyczynę, zamiast się zawiesić. Pełne sekundy od 1 do 999999; nie ma wartości nieograniczonej, ponieważ nieskończone oczekiwanie to właśnie awaria, której ten limit ma zapobiegać. Zwiększać tylko wtedy, gdy wolny host go przekracza. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | To samo dla wbudowanego PostgreSQL. Odliczanie zaczyna się po zakończeniu `initdb` przy pierwszym rozruchu, więc obejmuje start serwera i odzyskiwanie po awarii, a nie początkowe tworzenie bazy danych. |

Aktualizacja z wersji 1.x: umieścić dawny `snapotter.db` w `/data/snapotter.db` na wolumenie, a tryb wbudowany zaimportuje go do wbudowanego PostgreSQL przy pierwszym rozruchu. Import odbywa się jednorazowo; kolejne rozruchy go pomijają.

Uwaga dotycząca telemetrii: tryb wbudowany dziedziczy domyślne ustawienie analityki obrazu, jak każda inna konfiguracja. Opublikowany obraz może wysyłać dane analityczne, ale nowa instancja najpierw pyta swojego administratora i nie wysyła niczego, dopóki nie dostanie odpowiedzi. Aby ją wyłączyć, należy odpowiedzieć przecząco, zbudować obraz z `--build-arg SNAPOTTER_ANALYTICS=off`, ustawić `SNAPOTTER_ANALYTICS_DEFAULT=off` przed pierwszym rozruchem lub użyć wyłączenia w aplikacji przez administratora.

### Limity przetwarzania {#processing-limits}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (bez limitu) | Maksymalny rozmiar pliku na jedno przesłanie w megabajtach. Ustawienie 0 oznacza brak limitu. Opublikowany obraz ma `0`; kompilacja ze źródeł zaczyna od 100. |
| `MAX_BATCH_SIZE` | `0` (bez limitu) | Maksymalna liczba plików w jednym żądaniu wsadowym. Ustawienie 0 oznacza brak limitu. Opublikowany obraz ma `0`; kompilacja ze źródeł zaczyna od 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Liczba zadań wsadowych uruchamianych równolegle. Ustawienie 0 włącza automatyczne wykrywanie na podstawie dostępnych rdzeni CPU. |
| `MAX_MEGAPIXELS` | `0` (bez limitu) | Maksymalna dozwolona rozdzielczość obrazu w megapikselach. Ustawienie 0 oznacza brak limitu. |
| `MAX_WORKER_THREADS` | `0` (auto) | Maksymalna liczba wątków roboczych do przetwarzania obrazów. Ustawienie 0 włącza automatyczne wykrywanie na podstawie dostępnych rdzeni CPU. |
| `PROCESSING_TIMEOUT_S` | `0` (bez limitu) | Limit czasu każdego wywołania sidecara Python, który uruchamia narzędzia AI, w sekundach. Ustawienie 0 oznacza brak limitu czasu. Nie ogranicza zadań dotyczących obrazów, PDF ani multimediów; robią to `JOB_TIMEOUT_FAST_S` i `JOB_TIMEOUT_LONG_S`. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Liczba sekund bezczynności sidecara Python AI i środowiska dokładnego OCR, po których kończą one działanie i zwalniają pamięć (po rozgrzaniu około 1,3 GB i 0,7 GB). Oba uruchamiają się ponownie przy następnym żądaniu, więc pierwsze wywołanie AI po zakończeniu z powodu bezczynności ponosi koszt uruchomienia bibliotek, kilka sekund. Ustawienie 0 utrzymuje je w działaniu. Wartość domyślna odpowiada `AI_SESSION_IDLE_TIMEOUT`, więc załadowane modele nie są zwalniane wcześniej, niż przewiduje to ustawienie. Po zwiększeniu `AI_SESSION_IDLE_TIMEOUT` należy odpowiednio zwiększyć także tę wartość. |
| `JOB_TIMEOUT_FAST_S` | `120` | Limit czasu jednego zadania w szybkich pulach (narzędzia do obrazów i dokumentów), w sekundach. Zadanie, które trwa dłużej, kończy się błędem przekroczenia limitu czasu. Ustawienie 0 oznacza brak limitu. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Limit czasu jednego zadania w długich pulach (narzędzia AI i multimedialne oraz każde narzędzie oznaczone jako długotrwałe), w sekundach. Ustawienie 0 oznacza brak limitu. OCR PDF w trybach Balanced i Best sam wydłuża swój limit czasu zależnie od liczby stron (2 i 5 minut na stronę), maksymalnie do 6 godzin, więc duży PDF nie wymaga zwiększania tej wartości. |
| `SYNC_WAIT_MS` | `8000` | Jak długo żądanie narzędzia czeka na swoje zadanie, zanim API przestanie czekać i zwróci `202` z identyfikatorem zadania do śledzenia przez SSE, w milisekundach. Nie zatrzymuje to zadania. Ustawienie 0 oznacza czekanie na zadanie bez względu na to, jak długo trwa. |
| `MAX_PIPELINE_STEPS` | `20` | Maksymalna liczba kroków w potoku. Ustawienie 0 oznacza brak limitu. |
| `MAX_CANVAS_PIXELS` | `0` (bez limitu) | Maksymalny rozmiar płótna w pikselach dla obrazów wyjściowych. Ustawienie 0 oznacza brak limitu. |
| `MAX_SVG_SIZE_MB` | `50` | Największy SVG akceptowany przed sanityzacją, w megabajtach. `0` zachowuje się tu inaczej niż w sąsiednich wierszach. Całkowicie usuwa limit rozmiaru przed parsowaniem, zamiast go podnosić, dlatego tę zmienną należy pozostawić ustawioną. |
| `MAX_PDF_PAGES` | `0` (bez limitu) | Maksymalna liczba stron PDF przy konwersji PDF na obraz. Ustawienie 0 oznacza brak limitu. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Największe pole `settings`, jakie może zawierać żądanie narzędzia, w kilobajtach, liczone w bajtach UTF-8. Żądania przekraczające limit otrzymują `400`. Ustawienie 0 oznacza brak limitu. Rzeczywiste ustawienia narzędzi są znacznie mniejsze niż 64 KB, więc tę wartość należy zwiększać tylko wtedy, gdy klient wysyła nietypowo duże ustawienia. |

### Silniki {#engines}

SnapOtter wyszukuje każdy plik wykonywalny przetwarzania w `$PATH` wewnątrz kontenera, więc te zmienne pozostają puste, chyba że zamontowano własną kompilację.

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `FFMPEG_PATH` | (puste) | Ścieżka do pliku wykonywalnego `ffmpeg` obsługującego narzędzia wideo i audio. |
| `FFPROBE_PATH` | (puste) | Ścieżka do `ffprobe`, który odczytuje pliki multimedialne przed ich przetworzeniem. Wskazać tę samą kompilację co `FFMPEG_PATH`. |
| `QPDF_PATH` | (puste) | Ścieżka do `qpdf`, używanego przez narzędzia PDF i do sprawdzania przesłanych plików PDF. |
| `SOFFICE_PATH` | (puste) | Ścieżka do `soffice` z LibreOffice, używanego do konwersji dokumentów biurowych. |
| `PDFCPU_PATH` | (puste) | Ścieżka do `pdfcpu`, używanego przez niektóre narzędzia PDF. |
| `GS_PATH` | (puste) | Ścieżka do `gs` z Ghostscript, używanego przez narzędzia PDF i OCR PDF. |
| `PANDOC_PATH` | (puste) | Ścieżka do `pandoc`, używanego przy konwersjach dokumentów. |
| `SNAPOTTER_FONT_FILE` | (puste) | Plik czcionki dla tekstu nanoszonego na wideo (wypalanie napisów, znak wodny na wideo). Puste oznacza użycie pierwszej czcionki, którą znajdzie obraz. |
| `SNAPOTTER_FONT_FAMILY` | (puste) | Nazwa rodziny czcionki `SNAPOTTER_FONT_FILE`. Puste oznacza `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (puste) | Rodzina sprzętowych koderów wideo, `nvenc` lub `vaapi`. Puste oznacza kodowanie programowe. |

`SNAPOTTER_HW_ACCEL` wymaga ffmpeg zbudowanego z tą rodziną koderów, a ffmpeg w obrazie nie ma żadnej z nich. Przy własnym pliku wykonywalnym obrazu ustawienie wraca do kodowania programowego i informuje o tym w logu uruchomienia. Aby z niego skorzystać, należy zamontować własną kompilację ffmpeg, wskazać ją w `FFMPEG_PATH` i `FFPROBE_PATH` oraz udostępnić kontenerowi urządzenie GPU. Dla `nvenc` ustawić także `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: obraz prosi tylko o `compute,utility`, a bez `video` środowisko NVIDIA nie montuje biblioteki kodowania, więc koder jest widoczny na liście, ale każde kodowanie kończy się błędem. Nadpisanie ścieżki, która nie istnieje lub nie jest wykonywalna, również jest zapisywane w logu uruchomienia, a każde zadanie wymagające tego pliku kończy się błędem, dopóki ścieżka nie zostanie poprawiona lub zmienna usunięta.

Opublikowane pliki Compose przekazują wszystkie te zmienne z `.env`, więc wystarczy ustawić je tam.

### Czyszczenie {#cleanup}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Jak długo niezapisane wyniki przetwarzania (surowe przesłane pliki i wyniki narzędzi) są przechowywane przed automatycznym usunięciem. Pliki jawnie zapisane w bibliotece plików nie są objęte tym ustawieniem i pozostają do czasu ich usunięcia. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Jak często uruchamiane jest zadanie czyszczenia. |

### Wygląd {#appearance}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `DEFAULT_THEME` | `light` | Domyślny motyw dla nowych sesji. `light`, `dark` lub `system`. |
| `DEFAULT_LOCALE` | `en` | Domyślny język interfejsu. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Domyślny układ narzędzi. `sidebar` lub `fullscreen`. |

### Uprawnienia Docker {#docker-permissions}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PUID` | `999` | Uruchamia proces kontenera z tym UID. Ustawić zgodnie z użytkownikiem hosta dla bind mountów (`id -u`). |
| `PGID` | `999` | Uruchamia proces kontenera z tym GID. Ustawić zgodnie z grupą hosta dla bind mountów (`id -g`). |

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
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
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

## Wolumeny {#volumes}

Stos Docker Compose używa czterech wolumenów:

- `/data` (aplikacja) - modele AI, środowisko Python venv i pliki użytkowników. Zamontować, aby zachować przesłane pliki i zainstalowane pakiety AI po restartach.
- `/tmp/workspace` (aplikacja) - tymczasowe miejsce na pliki w trakcie przetwarzania. Może być ulotne, ale zamontowanie go zapobiega zapełnieniu zapisywalnej warstwy kontenera.
- `SnapOtter-pgdata` (postgres) - katalog danych PostgreSQL. Zawiera wszystkie dane relacyjne (użytkownicy, ustawienia, potoki, zadania, dziennik audytu). Kopię zapasową wykonuje się przez `pg_dump` lub migawkę wolumenu.
- `SnapOtter-redisdata` (redis) - plik append-only Redis dla trwałych kolejek zadań.

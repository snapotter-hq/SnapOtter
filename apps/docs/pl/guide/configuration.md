---
description: "Wszystkie zmienne środowiskowe SnapOtter wraz z wartościami domyślnymi. Konfiguracja uwierzytelniania, przechowywania danych, modeli AI, analityki i nie tylko."
i18n_source_hash: 0a7a78fd254c
i18n_provenance: machine
i18n_output_hash: b1344eeb55ea
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
| `API_KEYS_RATE_LIMIT_PER_MIN` | `30` | Maksymalna liczba żądań na minutę z jednego adresu IP do endpointów zarządzania kluczami API (lista, tworzenie, unieważnianie). Nie dotyczy kluczy używanych w wywołaniach narzędzi. Ustawienie `0` oznacza brak limitu. |
| `CORS_ORIGIN` | (puste) | Dozwolone źródła (origin) dla CORS, oddzielone przecinkami, lub puste, aby dopuścić tylko to samo źródło. |
| `LOG_LEVEL` | `info` | Szczegółowość logów. Jedna z wartości: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Określa, które węzły mogą ustawiać adres IP klienta przez `X-Forwarded-For`. Wartość domyślna ufa wyłącznie węzłowi z sieci prywatnej, więc zaufany jest reverse proxy w sieci Docker lub w sieci LAN, a sfałszowany nagłówek publicznego klienta nie. Ustawiać `true` tylko wtedy, gdy przed aplikacją stoi kontrolowany przez użytkownika proxy z publicznym adresem. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | `on` | Ustaw `off`, aby nowa instancja startowała z wyłączonym ustawieniem „Anonymous Product Analytics”, dzięki czemu nie wysyła niczego od pierwszego uruchomienia. Zmienna jedynie wypełnia to ustawienie, dopóki nikt go nie wybrał. Gdy ustawienie zostanie zapisane, przez administratora lub przez tę zmienną, zmiana zmiennej nie daje żadnego efektu; administrator nadal może włączyć analitykę w Settings > System > Privacy. |

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
| `LOGIN_ATTEMPT_LIMIT` | `30` | Maksymalna liczba żądań logowania na minutę z jednego adresu IP. Kolejne próby otrzymują `429` do końca minuty. Powtarzające się niepowodzenia dla jednej nazwy użytkownika zwykle osiągają wcześniej limit `LOGIN_THROTTLE_MAX_FAILURES`. Administrator może to zastąpić w Ustawienia > System. Ustawienie `0` oznacza brak limitu. Kompilacja ze źródeł zaczyna od 10. |
| `LOGIN_THROTTLE_MAX_FAILURES` | `10` | Liczba nieudanych logowań hasłem, jaką może mieć jedna nazwa użytkownika w ramach `LOGIN_THROTTLE_WINDOW_S`, zanim kolejne próby dla niej otrzymają `429`, niezależnie od adresu IP. Są ponownie dopuszczane, gdy najstarsze niepowodzenia wychodzą poza okno. Ustawienie 0 wyłącza ograniczanie. |
| `LOGIN_THROTTLE_WINDOW_S` | `900` | Długość tego okna w sekundach. Musi wynosić co najmniej 1; serwer odmawia uruchomienia przy 0. |

### Przechowywanie danych {#storage}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` lub `s3`. S3 i MinIO wymagają licencji z funkcją s3_storage oraz zmiennych `S3_*` opisanych poniżej. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | Ciąg połączenia z PostgreSQL oraz połączenie, przez które obsługiwane jest każde żądanie. W wersji 2.3.0 i nowszych, po ustawieniu także `DATABASE_MIGRATION_URL`, staje się ono rolą uruchomieniową o najmniejszych uprawnieniach, z uprawnieniami DML do tabel aplikacji i niczym więcej. Stos Compose kieruje je na swoją usługę `postgres`; pozostawić bez ustawienia (razem z `REDIS_URL`), aby uzyskać tryb wbudowany. Aby połączyć się przez gniazdo unix, należy podać katalog gniazda w `host`, jak w `postgres://user:pass@localhost/snapotter?host=/var/run/postgresql`, i zamontować ten katalog w kontenerze. |
| `DATABASE_MIGRATION_URL` | (puste) | Połączenie uprzywilejowane, używane wyłącznie podczas rozruchu do uruchamiania migracji i nadawania uprawnień roli uruchomieniowej, a następnie zamykane przed pierwszym żądaniem. Pozostawienie pustego powoduje, że SnapOtter działa z jedną rolą, a `DATABASE_URL` pełni obie funkcje. Zobacz [Role o najmniejszych uprawnieniach](/pl/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Ciąg połączenia z Redis (używany do kolejek zadań BullMQ). Compose kieruje go na swoją usługę `redis`. Dla gniazda unix należy użyć `unix:///run/redis/redis.sock?db=5` (dodać `&password=...`, jeśli Redis go wymaga) i zamontować gniazdo w kontenerze. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Katalog na pliki tymczasowe podczas przetwarzania. Czyszczony automatycznie. Obraz ustawia `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Katalog na trwałe pliki użytkowników (przesłane obrazy, zapisane wyniki). Obraz ustawia `/data/files`. |
| `MAX_STORAGE_PER_USER_MB` | `5000` | Limit w megabajtach tego, co każdy użytkownik przechowuje w bibliotece plików. Zapis, który by go przekroczył, jest odrzucany z informacją o wykorzystanej ilości i limicie. Kwota ustawiona dla użytkownika ma pierwszeństwo. Ustawienie 0 oznacza brak limitu. |

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

Uwaga dotycząca telemetrii: tryb wbudowany dziedziczy domyślne ustawienie analityki obrazu, jak każda inna konfiguracja. Opublikowany obraz jest dostarczany z włączoną analityką; aby ją wyłączyć, należy zbudować obraz z `--build-arg SNAPOTTER_ANALYTICS=off`, ustawić `SNAPOTTER_ANALYTICS_DEFAULT=off` przed pierwszym rozruchem lub użyć wyłączenia w aplikacji przez administratora.

### Limity przetwarzania {#processing-limits}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (bez limitu) | Maksymalny rozmiar pliku na jedno przesłanie w megabajtach. Ustawienie 0 oznacza brak limitu. Opublikowany obraz ma `0`; kompilacja ze źródeł zaczyna od 100. |
| `MAX_BATCH_SIZE` | `0` (bez limitu) | Maksymalna liczba plików w jednym żądaniu wsadowym. Ustawienie 0 oznacza brak limitu. Opublikowany obraz ma `0`; kompilacja ze źródeł zaczyna od 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Liczba zadań wsadowych uruchamianych równolegle. Ustawienie 0 włącza automatyczne wykrywanie na podstawie dostępnych rdzeni CPU. |
| `MAX_MEGAPIXELS` | `0` (bez limitu aplikacji) | Maksymalna dozwolona rozdzielczość obrazu w megapikselach. Ustawienie 0 usuwa własny limit SnapOtter. Dekoder obrazów nadal odrzuca wszystko powyżej około 268 MP (16383 x 16383 pikseli), więc wartość powyżej 268 nie daje dodatkowego efektu. |
| `MAX_CPU_UPSCALE_MP` | `4` | Największe wejście w megapikselach, jakie skalowanie AI przyjmuje na hoście bez GPU. Skalowany wynik jest też ograniczony do 16-krotności tej wartości (domyślnie 64 MP), więc duży współczynnik skali dodatkowo obniża limit wejścia. Większy obraz jest zmniejszany przed skalowaniem; jeśli wynik nie byłby większy od oryginału, żądanie jest odrzucane. Lanczos pomija limit wejścia, ale nie limit wyniku. Ustawienie 0 oznacza brak limitu, co wymaga dużo pamięci RAM: RealESRGAN zawsze buduje wewnętrznie bufor 4x. |
| `MAX_WORKSPACE_SIZE_GB` | `0` (bez limitu) | Limit w GB łącznego rozmiaru przesłanych plików i zapisanych wyników w przestrzeni roboczej. Po jego przekroczeniu przesyłanie i żądania narzędzi otrzymują 503, dopóki pliki nie wygasną po `FILE_MAX_AGE_HOURS`. Ustawienie 0 oznacza brak limitu; lokalny magazyn nadal odrzuca zapisy z kodem 503, gdy na dysku zostaje mniej niż 0,5 GB. Opublikowany obraz ma `0`; kompilacja ze źródeł zaczyna od 10. |
| `MAX_WORKER_THREADS` | `0` (auto) | Maksymalna liczba wątków roboczych do przetwarzania obrazów. Ustawienie 0 włącza automatyczne wykrywanie na podstawie dostępnych rdzeni CPU. |
| `PROCESSING_TIMEOUT_S` | `0` (bez limitu) | Limit czasu każdego wywołania sidecara Python, który uruchamia narzędzia AI, w sekundach. Ustawienie 0 oznacza brak limitu czasu. Nie ogranicza zadań dotyczących obrazów, PDF ani multimediów; robią to `JOB_TIMEOUT_FAST_S` i `JOB_TIMEOUT_LONG_S`. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Liczba sekund bezczynności sidecara Python AI i środowiska dokładnego OCR, po których kończą one działanie i zwalniają pamięć (po rozgrzaniu około 1,3 GB i 0,7 GB). Oba uruchamiają się ponownie przy następnym żądaniu, więc pierwsze wywołanie AI po zakończeniu z powodu bezczynności ponosi koszt uruchomienia bibliotek, kilka sekund. Ustawienie 0 utrzymuje je w działaniu. Wartość domyślna odpowiada `AI_SESSION_IDLE_TIMEOUT`, więc załadowane modele nie są zwalniane wcześniej, niż przewiduje to ustawienie. Po zwiększeniu `AI_SESSION_IDLE_TIMEOUT` należy odpowiednio zwiększyć także tę wartość. |
| `AI_SESSION_IDLE_TIMEOUT` | `0` (auto) | Liczba sekund, przez jaką załadowany model AI pozostaje w pamięci podręcznej sidecara po ostatnim użyciu. Wartość automatyczna to 600. Odczytywana przez sidecar Python, który usuwa też wszystkie modele z pamięci podręcznej, gdy kończy działanie po `AI_SIDECAR_IDLE_TIMEOUT`. |
| `AI_SESSION_CACHE_BYTES` | `0` (auto) | Budżet pamięci dla modeli AI w pamięci podręcznej, w bajtach. Wartość automatyczna to 40% pamięci GPU i brak buforowania na hoście tylko z CPU. Ustaw ją na hoście z CPU, aby buforować modele w RAM; ustaw 1, aby wyłączyć buforowanie na hoście z GPU. Odczytywana przez sidecar Python. |
| `MAX_AI_JOBS_PER_USER` | `5` | Liczba zadań AI dla pojedynczego pliku, które jeden użytkownik może mieć jednocześnie w kolejce lub w trakcie wykonywania. Kolejne otrzymują `429`, dopóki jedno się nie zakończy. Pula AI wykonuje jedno zadanie naraz, więc to ustawienie nie pozwala jednemu użytkownikowi jej zająć. Uruchomienia AI w trybie wsadowym i w potokach nie są liczone. Ustawienie 0 oznacza brak limitu. |
| `JOB_TIMEOUT_FAST_S` | `120` | Limit czasu jednego zadania w szybkich pulach (narzędzia do obrazów i dokumentów), w sekundach. Zadanie, które trwa dłużej, kończy się błędem przekroczenia limitu czasu. Ustawienie 0 oznacza brak limitu. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Limit czasu jednego zadania w długich pulach (narzędzia AI i multimedialne oraz każde narzędzie oznaczone jako długotrwałe), w sekundach. Ustawienie 0 oznacza brak limitu. OCR PDF w trybach Balanced i Best sam wydłuża swój limit czasu zależnie od liczby stron (2 i 5 minut na stronę), maksymalnie do 6 godzin, więc duży PDF nie wymaga zwiększania tej wartości. |
| `SYNC_WAIT_MS` | `8000` | Jak długo żądanie narzędzia czeka na swoje zadanie, zanim API przestanie czekać i zwróci `202` z identyfikatorem zadania do śledzenia przez SSE, w milisekundach. Nie zatrzymuje to zadania. Ustawienie 0 oznacza czekanie na zadanie bez względu na to, jak długo trwa. |
| `MAX_PIPELINE_STEPS` | `20` | Maksymalna liczba kroków w potoku. Ustawienie 0 oznacza brak limitu. |
| `MAX_PIPELINE_STEP_PIXELS` | `67108864` | Największy wynik, jakiego może zażądać krok potoku, jako szerokość razy wysokość w pikselach (domyślnie 8192 x 8192). Krok, którego ustawienia żądają więcej, jest odrzucany przed uruchomieniem potoku. Ustawienie 0 oznacza brak limitu. |
| `MAX_CANVAS_PIXELS` | `0` (bez limitu) | Maksymalny rozmiar płótna w pikselach dla obrazów wyjściowych. Ustawienie 0 oznacza brak limitu. |
| `MAX_SVG_SIZE_MB` | `50` | Największy SVG akceptowany przed sanityzacją, w megabajtach. `0` zachowuje się tu inaczej niż w sąsiednich wierszach. Całkowicie usuwa limit rozmiaru przed parsowaniem, zamiast go podnosić, dlatego tę zmienną należy pozostawić ustawioną. |
| `MAX_PDF_PAGES` | `0` (bez limitu) | Maksymalna liczba stron PDF przy konwersji PDF na obraz. Ustawienie 0 oznacza brak limitu. |
| `MAX_VIDEO_DURATION_S` | `0` (bez limitu) | Najdłuższy film, jaki przyjmują narzędzia wideo, w sekundach. Dłuższe pliki są odrzucane przed przetwarzaniem, a błąd zawiera czas trwania i limit. Ustawienie 0 oznacza brak limitu. |
| `MAX_AUDIO_DURATION_S` | `0` (bez limitu) | To samo, dla narzędzi audio. |
| `MAX_VIDEO_BITRATE_KBPS` | `0` (bez limitu) | Najwyższa łączna przepływność, jaką przyjmują narzędzia wideo, w kilobitach na sekundę. Ustawienie 0 oznacza brak limitu. |
| `PREVIEW_TIMEOUT_S` | `300` | Limit czasu kodowania jednego klipu podglądu pliku wideo lub audio w przeglądarce, w sekundach. Podglądy dokumentów używają zamiast tego `LIBREOFFICE_TIMEOUT_S`. Ustawienie 0 oznacza brak limitu. |
| `LIBREOFFICE_TIMEOUT_S` | `120` | Limit czasu jednej konwersji LibreOffice (Word, Excel i PowerPoint do PDF, konwertery dokumentów i podglądy dokumentów), w sekundach. Ustawienie `0` oznacza brak limitu. |
| `GIF_BG_MAX_FRAMES` | `150` | Największa liczba klatek jednej animacji, jaką przyjmuje narzędzie Usuń tło z GIF. Dłuższe animacje otrzymują `400` z podaną liczbą klatek. Ustawienie 0 oznacza brak limitu klatek; nadal obowiązuje osobny budżet pikseli. |
| `SUBPROCESS_MEMORY_LIMIT_MB` | `0` (wyłączone) | Limit przestrzeni adresowej w megabajtach dla każdego z tych procesów pomocniczych: ffmpeg, ffprobe, Ghostscript, qpdf, LibreOffice, pandoc i pdfcpu w silnikach multimediów i dokumentów, a dla obrazów także exiftool, dekodery i kodery HEIF, JPEG XL i JPEG 2000, dekoder RAW oraz zapasowy dekoder ffmpeg. ImageMagick nie jest ograniczany, ponieważ ma własne limity pamięci, podobnie jak sidecar AI. Proces, który przekroczy limit, jest zabijany, zamiast doprowadzić cały kontener do mechanizmu out-of-memory. Limit dotyczy pamięci wirtualnej, nie rezydentnej, więc należy ustawić go wyraźnie powyżej tego, czego proces naprawdę używa. Koder JPEG XL potrzebuje najwięcej: obraz 24 MP wymagał około 1,8 GB i zawiódł przy 1 GB, a więcej wątków lub procesorów niewiele to zmienia. Gdy limit jest ustawiony, koder HEIF jest ograniczony do dwóch wątków roboczych, co zmniejsza zapotrzebowanie przy kodowaniu 24 MP do około 0,8 GB kosztem wolniejszego kodowania. Zacząć od `2048` i obniżać go dopiero po przetestowaniu największych plików. Ustawienie 0 wyłącza limit i polega na limicie pamięci kontenera. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Największe pole `settings`, jakie może zawierać żądanie narzędzia, w kilobajtach, liczone w bajtach UTF-8. Żądania przekraczające limit otrzymują `400`. Ustawienie 0 oznacza brak limitu. Rzeczywiste ustawienia narzędzi są znacznie mniejsze niż 64 KB, więc tę wartość należy zwiększać tylko wtedy, gdy klient wysyła nietypowo duże ustawienia. |
| `MAX_SUBTITLE_SIZE_MB` | `1` | Największy plik napisów (`.srt`, `.vtt`, `.ass`), jaki przyjmują narzędzia Wypal napisy i Osadź napisy, w megabajtach. Większe pliki otrzymują `400` z podanym rozmiarem pliku i limitem. Ustawienie 0 oznacza brak limitu. Plik napisów do pełnometrażowego filmu zwykle ma znacznie mniej niż 1 MB. |
| `MAX_METADATA_TAG_LENGTH` | `10000` | Najdłuższa wartość, jaką Edytuj metadane zapisuje w pojedynczym tagu (wykonawca, opis, słowa kluczowe itd.), w znakach. Dłuższe wartości otrzymują `400` z nazwą tagu i limitem. Ustawienie 0 oznacza brak limitu. Zwiększ ją, jeśli przechowujesz długie podpisy lub opisy. Wartość tagu musi się też zmieścić w `MAX_SETTINGS_PAYLOAD_KB` i w limicie systemu operacyjnego na pojedynczy argument (128 KB w Linuksie). |

### Narzędzia AI {#ai-tools}

Te zmienne odczytuje sidecar Pythona. Ustaw je w środowisku kontenera (albo w `.env` dla opublikowanych plików Compose) i uruchom ponownie.

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `SNAPOTTER_GPU` | (puste) | Ustaw na `0`, `false` lub `no`, aby wszystkie narzędzia AI działały na CPU, nawet gdy dostępny jest GPU. Każda inna wartość lub puste pole pozwala SnapOtter używać wykrytego GPU. Użyj tego, gdy mały GPU wyczerpuje pamięć w trakcie zadania albo gdy problem ze sterownikiem powoduje błędy uruchomień na GPU. Najczęściej ma to znaczenie przy instalacjach natywnych i LXC, które teraz używają GPU, gdy obecny jest pakiet pip cuDNN. Uruchomienia na CPU są wolniejsze, a `MAX_CPU_UPSCALE_MP` dotyczy skalowania w górę. |
| `SD15_INPAINT_DIR` | `$MODELS_PATH/sd15-inpainting` | Folder z modelem inpaintingu Stable Diffusion 1.5 (układ diffusers), którego Usuwanie obiektów używa w trybie wysokiej jakości. Pakiet funkcji `inpaint-hq` umieszcza go tutaj, więc zmieniaj to tylko wtedy, gdy model leży gdzie indziej. `MODELS_PATH` SnapOtter ustawia na `ai/models` w katalogu danych. |
| `SD15_INPAINT_STEPS` | `28` | Liczba kroków odszumiania na jedno usunięcie. Więcej kroków może dodać szczegółów i trwa proporcjonalnie dłużej. |
| `SD15_INPAINT_STRENGTH` | `0.95` | Jak daleko model może domalować zamaskowany obszar, od 0 do 1. Niższe wartości zachowują więcej oryginalnych pikseli (obszar jest najpierw wypełniany z otoczenia, a potem lekko dopracowywany). Wyższe wartości pozwalają modelowi malować swobodniej, a `1` ignoruje otoczenie i maluje z szumu, co częściej wymyśla nowy obiekt. |
| `SD15_INPAINT_GUIDANCE` | `7.0` | Jak ściśle model trzyma się promptów. Wyższe wartości trzymają się ich dosłowniej; bardzo wysokie mogą wyglądać ostro. |
| `SD15_INPAINT_PROMPT` | (puste) | Tekst opisujący, co domalować w usuniętym obszarze. Puste działa najlepiej przy usuwaniu, bo model wtedy kontynuuje otoczenie. |
| `SD15_INPAINT_NEGATIVE` | `object, person, text, watermark, artifact, blurry, distorted, extra limbs` | Tekst opisujący, czego unikać w usuniętym obszarze. Wartość domyślna odwodzi model od malowania nowego obiektu w luce. |
| `SD15_INPAINT_SEED` | `0` | Ziarno losowe. Stałe ziarno sprawia, że ten sam obraz i ta sama maska są usuwane za każdym razem tak samo. Zmień je, aby uzyskać inny wynik. |

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
| `JOBS_RETENTION_DAYS` | `30` | Liczba dni, przez jaką zapis zakończonego zadania (ukończonego, nieudanego lub anulowanego) jest przechowywany, zanim usunie go proces retencji, uruchamiany co 6 godzin. Administrator może to zastąpić w Ustawienia > System. Użytkownicy i zespoły objęci blokadą prawną zachowują swoje. Ustawienie 0 oznacza przechowywanie bez końca. |
| `AUDIT_RETENTION_DAYS` | `0` (bez końca) | Liczba dni przechowywania wpisów dziennika audytu. Te same zasady zastępowania i blokady prawnej. Nic nie jest usuwane, gdy włączone jest odporne na manipulacje rejestrowanie audytu. Ustawienie 0 oznacza przechowywanie bez końca. |

### Licencja enterprise {#enterprise-license}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `SNAPOTTER_LICENSE_KEY` | (puste) | Klucz licencyjny odblokowujący funkcje enterprise, takie jak SAML, SCIM i magazyn S3. Odczytywany przy uruchomieniu, więc po zmianie należy uruchomić ponownie. Nieprawidłowy lub wygasły klucz zapisuje ostrzeżenie w logu, a serwer działa bez tych funkcji. W kontenerze można go zamiast tego zamontować przez `SNAPOTTER_LICENSE_KEY_FILE` (zobacz [Sekrety Docker](/pl/guide/security#docker-secrets)). |

### Wygląd {#appearance}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `DEFAULT_THEME` | `light` | Domyślny motyw dla nowych sesji. `light`, `dark` lub `system`. |
| `DEFAULT_LOCALE` | `en` | Domyślny język interfejsu. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Domyślny układ narzędzi. `sidebar` lub `fullscreen`. |

### Uprawnienia Docker {#docker-permissions}

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PUID` | `999` | Uruchamia proces kontenera z tym UID. Ustawić zgodnie z użytkownikiem hosta dla bind mountów (`id -u`). Wymaga zapisywalnego głównego systemu plików; zobacz [przewodnik bezpieczeństwa](/pl/guide/security#why-read-only-is-not-set). |
| `PGID` | `999` | Uruchamia proces kontenera z tym GID. Ustawić zgodnie z grupą hosta dla bind mountów (`id -g`). Wymaga zapisywalnego głównego systemu plików; zobacz [przewodnik bezpieczeństwa](/pl/guide/security#why-read-only-is-not-set). |

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

---
description: "Instalacja SnapOtter z Docker jednym poleceniem, logowanie i otwarcie pierwszego narzędzia. Obejmuje akcelerację GPU, małe maszyny, Docker Compose i budowanie ze źródeł."
i18n_source_hash: b40014f9f1a3
i18n_provenance: machine
i18n_output_hash: 28c40f46e6ef
i18n_hash_version: 2
---

# Pierwsze kroki {#getting-started}

::: tip Wypróbuj przed instalacją
Pełny interfejs można obejrzeć na [demo.snapotter.com](https://demo.snapotter.com), bez rejestracji i instalacji.
:::

## Szybki start {#quick-start}

Wystarczy jedno polecenie:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Następnie należy otworzyć [http://localhost:1349](http://localhost:1349) i zalogować się jako `admin` / `admin`. Przy pierwszym logowaniu pojawi się prośba o zmianę hasła.

Teraz można otworzyć narzędzie. Wystarczy wybrać jedno z paska bocznego albo przejść od razu do [Zmiany rozmiaru](http://localhost:1349/image/resize), upuścić obraz i pobrać wynik.

To cała instalacja. Ten pojedynczy kontener uruchamia wszystko, czego potrzebuje: bez ustawionego [`DATABASE_URL`](/pl/guide/configuration#env-database-url) startuje własne PostgreSQL i Redis na interfejsie loopback (tryb wbudowany) i przechowuje wszystkie dane w woluminie `SnapOtter-data`. To najszybszy sposób na wypróbowanie SnapOtter lub samodzielne hostowanie w domowym laboratorium. Tryb wbudowany działa jako root (domyślnie) i wyłącza się automatycznie, gdy tylko zostanie ustawione `DATABASE_URL`. W środowisku produkcyjnym należy użyć [stosu Docker Compose](#docker-compose), który trzyma PostgreSQL i Redis w osobnych kontenerach.

Wyniki zadań nie są przechowywane w wolumenie danych, więc znikają po wymianie kontenera (na przykład przy aktualizacji obrazu), a ich linki do pobrania przestają działać. [Zachowywanie wyników zadań](/pl/guide/deployment#keeping-job-output) w przewodniku wdrożenia wyjaśnia, jak je zachować.

::: tip Działanie na 4 GB RAM lub mniej
Na Raspberry Pi, starym laptopie lub małym VPS należy uruchamiać jedno zadanie naraz i ograniczyć pulę wątków obrazu, dodając `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` do powyższego polecenia, oraz pominąć ciężkie pakiety AI. [Konfiguracje o ograniczonych zasobach](/pl/guide/low-resource#tuning-knobs) wymieniają pozostałe limity warte ustawienia i to, czego można oczekiwać od ograniczonego sprzętu.
:::

::: tip Anonimowa analityka produktu
SnapOtter domyślnie zawiera anonimową analitykę produktu. Aby ją wyłączyć, należy otworzyć **Settings → System → Privacy** i wyłączyć **Anonymous Product Analytics**. Wyłączenie działa natychmiast dla całej instancji.

Można też ustawić zmienną środowiskową `SNAPOTTER_TELEMETRY=0` (działają również `false` i `off`), aby wyłączyć całą telemetrię instancji bez przebudowy.

Monitorowanie błędów działa dzięki [Sentry](https://sentry.io), które sponsoruje SnapOtter w ramach programu dla projektów open source.

Szczegóły dotyczące zbieranych danych znajdują się w [Co zbiera SnapOtter](/pl/guide/telemetry).
:::

## Akceleracja GPU {#gpu-acceleration}

Karta graficzna NVIDIA znacznie przyspiesza ciężkie narzędzia AI: powiększanie (około 47 razy), poprawianie twarzy (około 12 razy), transkrypcję i usuwanie tła (około 4 razy każde). OCR, wykrywanie twarzy i renowacja zdjęć nadal są ograniczone przez CPU, więc GPU im nie pomaga. Ten sam obraz obsługuje oba przypadki; wystarczy dodać `--gpus all`:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Wymaga to [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) na hoście. Bez CUDA SnapOtter automatycznie przełącza się na CPU. Akceleracja zintegrowanych procesorów graficznych Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwana dla wnioskowania AI.

- [Wymagania sprzętowe](/pl/guide/deployment#full-ai-tools-on-nvidia-cuda) zawierają pełne czasy dla GPU i CPU, a [testy wydajności obrazu Docker](/pl/guide/docker-tags#benchmarks) wyniki przy ciepłym i zimnym starcie.
- Jeśli narzędzia AI nadal działają na CPU, zobacz [Weryfikacja akceleracji GPU](/pl/guide/deployment#verify-gpu-acceleration).
- Dla Compose należy użyć [Szybkiego startu z NVIDIA CUDA](/pl/guide/deployment#quick-start-nvidia-cuda) w przewodniku wdrożenia.

## Inne sposoby instalacji {#other-ways-to-install}

### Pojedynczy kontener z Compose {#single-container-compose}

Ten sam kontener w trybie wbudowanym co w Szybkim starcie, zapisany jako plik Compose, aby łatwiej go śledzić i zmieniać. Należy zapisać go jako `docker-compose.yml` i uruchomić `docker compose up -d`:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

Podobnie jak polecenie `docker run`, służy do wypróbowania SnapOtter i małych instalacji. Wszystkie ustawienia z [Konfiguracji](/pl/guide/configuration) trafiają do `environment`.

### Docker Compose (produkcja) {#docker-compose}

Należy użyć pliku produkcyjnego utrzymywanego i testowanego z każdym wydaniem, zamiast kopiować skrócony przykład Compose z tej strony:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Otwórz [http://localhost:1349](http://localhost:1349) i zaloguj się jako `admin` / `admin`.

Kanoniczny [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) zawiera wszystkie cztery woluminy uruchomieniowe, kontrole stanu, limity zasobów, trwałą konfigurację Redis, przypięte obrazy bazy danych i pamięci podręcznej oraz aktualne utwardzenie kontenerów. Hasło domyślnego administratora należy zmienić zaraz po pierwszym logowaniu. Aby wdrożenie było powtarzalne, obraz aplikacji SnapOtter należy przypiąć do zweryfikowanego tagu wydania lub skrótu (digest), zamiast śledzić `latest`.

Wszystkie zmienne środowiskowe opisano w [Konfiguracja](/pl/guide/configuration), a wskazówki dotyczące sekretów, zasad sieciowych i kopii zapasowych w [Bezpieczeństwo i utwardzanie](/pl/guide/security).

### GitHub Container Registry {#ghcr}

Zarówno Docker Hub, jak i GHCR publikują ten sam obraz przy każdym wydaniu. Aby pobrać z GHCR, wystarczy zmienić nazwę obrazu:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### Budowanie ze źródeł {#build-from-source}

**Wymagania wstępne:** Node.js 22.22+, pnpm 9+, Docker (dla Postgres + Redis), Python 3.11+ (dla funkcji AI), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## Co można robić {#what-you-can-do}

### Przetwarzanie plików (ponad 200 narzędzi) {#file-processing-200-tools}

| Modalność | Liczba | Przykładowe narzędzia |
|----------|-------|---------------|
| **Obraz** | 114 | Zmiana rozmiaru, Kadrowanie, Kompresja, Konwersja, Usuwanie tła, Powiększanie, OCR, Znak wodny, Kolaż, Koloryzacja, Narzędzia GIF, presety formatów |
| **Wideo** | 63 | Przycinanie, Kadrowanie, Kompresja, Konwersja, Łączenie, Wyodrębnianie dźwięku, Automatyczne napisy, Wideo do GIF, Zmiana rozmiaru, Stabilizacja, presety formatów |
| **Audio** | 57 | Przycinanie, Łączenie, Konwersja, Normalizacja, Redukcja szumów, Transkrypcja, Zmiana wysokości dźwięku, Wyciszanie, Kreator dzwonków, presety formatów |
| **PDF / Dokument** | 37 | Łączenie, Dzielenie, Kompresja, OCR, Znak wodny, Redakcja, Word do PDF, Excel do PDF, Obracanie, Zabezpieczanie, Naprawa |
| **Pliki** | 32 | CSV do JSON, JSON do XML, Łączenie CSV, Dzielenie CSV, Tworzenie ZIP, Wyodrębnianie ZIP, Kreator wykresów, YAML/JSON, Konwersja czcionek, Kalkulator proporcji, Base64, presety formatów |

### Potoki {#pipelines}

Narzędzia można łączyć w wieloetapowe przepływy pracy i stosować je do jednego obrazu lub całej partii:

1. Otworzyć **Pipelines** na pasku bocznym.
2. Dodać kroki (dowolne narzędzie, dowolne ustawienia).
3. Uruchomić dla pojedynczego pliku albo całej partii naraz.
4. Zapisać potok do ponownego użycia.

Potoki domyślnie dopuszczają 20 kroków. Ustawienie [`MAX_PIPELINE_STEPS=0`](/pl/guide/configuration#env-max-pipeline-steps) znosi to ograniczenie.

### Biblioteka plików {#file-library}

Każdy przetworzony plik można zapisać w bibliotece **Files**. SnapOtter śledzi pełną historię wersji, dzięki czemu można prześledzić każdy etap przetwarzania od oryginalnego przesłania do wyniku końcowego.

Zapis jest jawny: wyniki zapisane w bibliotece są przechowywane do momentu ich usunięcia, a wyniki przetworzone i niezapisane są automatycznie usuwane po 72 godzinach (konfigurowalne przez [`FILE_MAX_AGE_HOURS`](/pl/guide/configuration#env-file-max-age-hours)).

### REST API i klucze API {#rest-api-api-keys}

Każde narzędzie jest dostępne przez HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Klucze API generuje się w **Settings → API Keys**. Wszystkie punkty końcowe opisano w [dokumentacji REST API](/pl/api/rest), a interaktywną dokumentację można otworzyć pod adresem [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

### Wielu użytkowników i zespoły {#multi-user-teams}

Wielu użytkowników można włączyć z kontrolą dostępu opartą na rolach:

- **Admin**: pełny dostęp, zarządzanie użytkownikami, zespołami, ustawieniami oraz wszystkimi plikami, potokami i kluczami API
- **User**: korzystanie z narzędzi, zarządzanie własnymi plikami, potokami i kluczami API

Zespoły tworzy się w **Settings → Teams**, aby grupować użytkowników.

Należy ustawić [`AUTH_ENABLED=true`](/pl/guide/configuration#env-auth-enabled) (lub `false` dla użytku jednoosobowego bez logowania).

## Użycie na telefonie {#use-it-from-your-phone}

SnapOtter działa w przeglądarkach mobilnych i można go zainstalować jako aplikację. Należy otworzyć instancję na telefonie, a następnie:

- **iPhone / iPad (Safari):** stuknąć Udostępnij, a potem **Dodaj do ekranu początkowego**.
- **Android (Chrome):** otworzyć menu przeglądarki i stuknąć **Zainstaluj aplikację**.

Zainstalowana aplikacja otwiera się we własnym oknie, od razu na instancji.

Jest jedno zastrzeżenie: przeglądarki oferują instalację tylko przez HTTPS. Zwykły adres HTTP w sieci LAN nadal działa w karcie przeglądarki, ale do właściwej instalacji należy umieścić instancję za zwrotnym serwerem proxy z certyfikatem (zobacz [przewodnik wdrażania](/pl/guide/deployment)).

Na telefonach i tabletach narzędzia obrazów pokazują przycisk **Zrób zdjęcie** obok przycisku przesyłania. Zdjęcie paragonu lub tablicy trafia bezpośrednio do narzędzia.

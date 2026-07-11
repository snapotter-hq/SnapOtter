---
description: "Zainstaluj SnapOtter za pomocą Dockera jednym poleceniem. Zawiera konfigurację Docker Compose, budowanie ze źródeł i pełny przegląd funkcji."
i18n_source_hash: 4536d4558b8e
i18n_provenance: machine
i18n_output_hash: 3d17e456c824
---

# Pierwsze kroki {#getting-started}

::: tip Wypróbuj przed instalacją
Poznaj pełny interfejs pod adresem [demo.snapotter.com](https://demo.snapotter.com), bez rejestracji ani instalacji.
:::

## Szybki start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ten pojedynczy kontener uruchamia wszystko, czego potrzebuje: bez ustawionego `DATABASE_URL` uruchamia własne PostgreSQL i Redis na interfejsie pętli zwrotnej (tryb wbudowany) i przechowuje wszystkie dane w wolumenie `SnapOtter-data`. To najszybszy sposób, aby wypróbować SnapOtter lub hostować samodzielnie w domowym laboratorium. Na produkcję uruchom stos [Docker Compose](#docker-compose) poniżej, który utrzymuje PostgreSQL i Redis w ich własnych kontenerach. Tryb wbudowany działa jako root (domyślnie) i wyłącza się automatycznie, gdy tylko ustawisz `DATABASE_URL`.

Przy pierwszym logowaniu zostaniesz poproszony o zmianę hasła.

::: tip Anonimowa analityka produktu
SnapOtter zawiera domyślnie anonimową analitykę produktu. Aby ją wyłączyć, otwórz **Ustawienia → System → Prywatność** i wyłącz **Anonimową Analitykę Produktu**. Zatrzymuje się natychmiast dla całej instancji.

Możesz też ustawić zmienną środowiskową `SNAPOTTER_TELEMETRY=0` (`false` i `off` też działają), aby wyłączyć całą telemetrię dla instancji bez przebudowy.

Monitorowanie błędów jest zasilane przez [Sentry](https://sentry.io), które sponsoruje SnapOtter poprzez swój program open-source.

Po szczegóły dotyczące tego, co jest zbierane, zobacz [Co zbiera SnapOtter](/pl/guide/telemetry).
:::

::: tip Przyspieszanie NVIDIA CUDA
Dodaj `--gpus all` dla przyspieszanego przez NVIDIA CUDA usuwania tła, skalowania w górę, OCR, poprawiania twarzy i restauracji:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Wymaga [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Automatycznie przełącza się na CPU, gdy CUDA jest niedostępne. Przyspieszanie iGPU Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwane dla wnioskowania AI. Zobacz [Tagi Docker](/pl/guide/docker-tags) po testy wydajności.
:::

::: details Także na GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Oba rejestry publikują ten sam obraz przy każdym wydaniu.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
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

  postgres:
    image: postgres:17-alpine
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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Zobacz [Konfigurację](/pl/guide/configuration) po wszystkie zmienne środowiskowe.

## Budowanie ze źródeł {#build-from-source}

**Wymagania wstępne:** Node.js 22+, pnpm 9+, Docker (dla Postgres + Redis), Python 3.10+ (dla funkcji AI), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## Co możesz zrobić {#what-you-can-do}

### Przetwarzanie plików (200+ narzędzi) {#file-processing-200-tools}

| Modalność | Liczba | Przykładowe narzędzia |
|----------|-------|---------------|
| **Obraz** | 105 | Zmiana rozmiaru, Kadrowanie, Kompresja, Konwersja, Usuwanie tła, Skalowanie w górę, OCR, Znak wodny, Kolaż, Koloryzacja, Narzędzia GIF, szablony formatów |
| **Wideo** | 57 | Przycinanie, Kadrowanie, Kompresja, Konwersja, Łączenie, Wyodrębnianie audio, Automatyczne napisy, Wideo do GIF, Zmiana rozmiaru, Stabilizacja, szablony formatów |
| **Audio** | 27 | Przycinanie, Łączenie, Konwersja, Normalizacja, Redukcja szumów, Transkrypcja, Zmiana wysokości dźwięku, Wyciszanie, Kreator dzwonków, szablony formatów |
| **PDF / Dokument** | 42 | Łączenie, Dzielenie, Kompresja, OCR, Znak wodny, Redagowanie, Word do PDF, Excel do PDF, Obracanie, Zabezpieczanie, Naprawa |
| **Pliki** | 10 | CSV do JSON, JSON do XML, Łączenie CSV, Dzielenie CSV, Tworzenie ZIP, Wyodrębnianie ZIP, Kreator wykresów, YAML/JSON |

### Potoki {#pipelines}

Łącz narzędzia w wieloetapowe przepływy pracy i stosuj je do jednego obrazu lub całej partii:

1. Otwórz **Potoki** na pasku bocznym.
2. Dodaj kroki (dowolne narzędzie, dowolne ustawienia).
3. Uruchom na pojedynczym pliku lub całej partii naraz.
4. Zapisz potok do późniejszego ponownego użycia.

Potoki domyślnie pozwalają na 20 kroków. Ustaw `MAX_PIPELINE_STEPS=0`, aby uczynić limit nieograniczonym.

### Biblioteka plików {#file-library}

Każdy przetwarzany plik może zostać zapisany w twojej bibliotece **Pliki**. SnapOtter śledzi pełną historię wersji, dzięki czemu możesz prześledzić każdy krok przetwarzania od oryginalnego przesłania do końcowego wyniku.

Zapisywanie jest jawne: wyniki, które zapiszesz w bibliotece, są przechowywane do momentu ich usunięcia, natomiast wyniki, które przetworzysz i pozostawisz niezapisane, są automatycznie usuwane po 72 godzinach (konfigurowalne przez `FILE_MAX_AGE_HOURS`).

### REST API i klucze API {#rest-api-api-keys}

Każde narzędzie jest dostępne przez HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Generuj klucze API w **Ustawienia → Klucze API**. Zobacz [dokumentację REST API](/pl/api/rest) po wszystkie punkty końcowe lub odwiedź [http://localhost:1349/api/docs](http://localhost:1349/api/docs) po interaktywną dokumentację.

### Wielu użytkowników i zespoły {#multi-user-teams}

Włącz wielu użytkowników z kontrolą dostępu opartą na rolach:

- **Administrator**: pełny dostęp, zarządzanie użytkownikami, zespołami, ustawieniami, wszystkimi plikami/potokami/kluczami API
- **Użytkownik**: używanie narzędzi, zarządzanie własnymi plikami/potokami/kluczami API

Twórz zespoły w **Ustawienia → Zespoły**, aby grupować użytkowników.

Ustaw `AUTH_ENABLED=true` (lub `false` dla pojedynczego użytkownika/użytku własnego bez logowania).

---
description: "Zainstaluj SnapOtter za pomocą Dockera jednym poleceniem. Zawiera konfigurację Docker Compose, budowanie ze źródeł oraz pełny przegląd funkcji."
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 2dc03701e06a
---

# Pierwsze kroki {#getting-started}

::: tip Wypróbuj przed instalacją
Poznaj pełny interfejs pod adresem [demo.snapotter.com](https://demo.snapotter.com) - bez rejestracji i instalacji.
:::

## Szybki start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ten pojedynczy kontener uruchamia wszystko, czego potrzebuje: bez ustawionego `DATABASE_URL` startuje własny PostgreSQL i Redis na interfejsie pętli zwrotnej (tryb wbudowany) i przechowuje wszystkie dane w woluminie `SnapOtter-data`. To najszybszy sposób, aby wypróbować SnapOtter lub hostować go samodzielnie w homelabie. Na produkcji uruchom poniższy stos [Docker Compose](#docker-compose), który utrzymuje PostgreSQL i Redis w osobnych kontenerach. Tryb wbudowany działa jako root (domyślnie) i wyłącza się automatycznie, gdy tylko ustawisz `DATABASE_URL`.

Przy pierwszym logowaniu zostaniesz poproszony o zmianę hasła.

::: tip Anonimowa analityka produktu
SnapOtter domyślnie zawiera anonimową analitykę produktu. Aby ją wyłączyć, otwórz **Ustawienia → System → Prywatność** i wyłącz **Anonimową analitykę produktu**. Zatrzymuje się natychmiast dla całej instancji.

Szczegóły dotyczące tego, co jest zbierane, znajdziesz w [Co zbiera SnapOtter](/pl/guide/telemetry).
:::

::: tip Akceleracja NVIDIA CUDA
Dodaj `--gpus all` dla przyspieszanego przez NVIDIA CUDA usuwania tła, powiększania, OCR, ulepszania twarzy oraz odnawiania:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Wymaga [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Automatycznie przełącza się na CPU, gdy CUDA jest niedostępne. Akceleracja iGPU Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwana dla wnioskowania AI. Zobacz [Tagi Docker](/pl/guide/docker-tags), aby poznać testy wydajności.
:::

::: details Dostępne również na GHCR
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

Zobacz [Konfiguracja](/pl/guide/configuration), aby poznać wszystkie zmienne środowiskowe.

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

## Co możesz robić {#what-you-can-do}

### Przetwarzanie plików (241 narzędzi) {#file-processing-241-tools}

| Modalność | Liczba | Przykładowe narzędzia |
|----------|-------|---------------|
| **Obraz** | 105 | Zmiana rozmiaru, Kadrowanie, Kompresja, Konwersja, Usuwanie tła, Powiększanie, OCR, Znak wodny, Kolaż, Koloryzacja, Narzędzia GIF, ustawienia wstępne formatów |
| **Wideo** | 57 | Przycinanie, Kadrowanie, Kompresja, Konwersja, Scalanie, Wyodrębnianie dźwięku, Automatyczne napisy, Wideo do GIF, Zmiana rozmiaru, Stabilizacja, ustawienia wstępne formatów |
| **Dźwięk** | 27 | Przycinanie, Scalanie, Konwersja, Normalizacja, Redukcja szumów, Transkrypcja, Zmiana wysokości dźwięku, Wyciszanie, Kreator dzwonków, ustawienia wstępne formatów |
| **PDF / Dokument** | 42 | Scalanie, Podział, Kompresja, OCR, Znak wodny, Redagowanie, Word do PDF, Excel do PDF, Obracanie, Ochrona, Naprawa |
| **Pliki** | 10 | CSV do JSON, JSON do XML, Scalanie plików CSV, Podział CSV, Tworzenie ZIP, Wyodrębnianie ZIP, Kreator wykresów, YAML/JSON |

### Potoki {#pipelines}

Łącz narzędzia w wieloetapowe procesy i stosuj je do jednego obrazu lub całej partii:

1. Otwórz **Potoki** na pasku bocznym.
2. Dodaj kroki (dowolne narzędzie, dowolne ustawienia).
3. Uruchom na pojedynczym pliku albo na całej partii naraz.
4. Zapisz potok do późniejszego ponownego użycia.

Potoki domyślnie dopuszczają 20 kroków. Ustaw `MAX_PIPELINE_STEPS=0`, aby uczynić limit nieograniczonym.

### Biblioteka plików {#file-library}

Każdy przetworzony plik można zapisać w bibliotece **Pliki**. SnapOtter śledzi pełną historię wersji, dzięki czemu możesz prześledzić każdy krok przetwarzania od oryginalnego przesłania po finalny wynik.

Zapisywanie jest jawne: wyniki zapisane w bibliotece są przechowywane, dopóki ich nie usuniesz, natomiast wyniki, które przetworzysz i pozostawisz niezapisane, są automatycznie usuwane po 72 godzinach (konfigurowalne przez `FILE_MAX_AGE_HOURS`).

### REST API i klucze API {#rest-api-api-keys}

Każde narzędzie jest dostępne przez HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Generuj klucze API w **Ustawienia → Klucze API**. Zobacz [dokumentację REST API](/pl/api/rest), aby poznać wszystkie punkty końcowe, lub odwiedź [http://localhost:1349/api/docs](http://localhost:1349/api/docs), aby skorzystać z interaktywnej dokumentacji.

### Wielu użytkowników i zespoły {#multi-user-teams}

Włącz wielu użytkowników z kontrolą dostępu opartą na rolach:

- **Administrator**: pełny dostęp - zarządzanie użytkownikami, zespołami, ustawieniami, wszystkimi plikami/potokami/kluczami API
- **Użytkownik**: korzystanie z narzędzi, zarządzanie własnymi plikami/potokami/kluczami API

Twórz zespoły w **Ustawienia → Zespoły**, aby grupować użytkowników.

Ustaw `AUTH_ENABLED=true` (lub `false` dla trybu jednoużytkownikowego/własnego użytku bez logowania).

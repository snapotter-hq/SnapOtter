---
description: "Zainstaluj SnapOtter za pomocą Dockera jednym poleceniem. Zawiera konfigurację Docker Compose, budowanie ze źródeł i pełny przegląd funkcji."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: b210f3fec848
i18n_hash_version: 2
---

# Pierwsze kroki {#getting-started}

::: tip Wypróbuj przed instalacją
Poznaj pełny interfejs pod adresem [demo.snapotter.com](https://demo.snapotter.com), bez rejestracji ani instalacji.
:::

## Szybki start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ten pojedynczy kontener obsługuje wszystko, czego potrzebuje: bez zestawu `DATABASE_URL` uruchamia własne PostgreSQL i Redis w interfejsie pętli zwrotnej (tryb osadzony) i przechowuje wszystkie dane w wolumenie `SnapOtter-data`. Jest to najszybszy sposób na wypróbowanie SnapOtter lub samodzielnego hostowania w laboratorium domowym. Do celów produkcyjnych użyj [kanonicznego stosu Docker Compose](#docker-compose), który przechowuje PostgreSQL i Redis w ich własnych kontenerach. Tryb osadzony działa jako root (domyślnie) i wyłącza się automatycznie po ustawieniu `DATABASE_URL`.

Instalujesz na Raspberry Pi, starym laptopie albo małym VPS-ie? Zobacz [Konfiguracje o ograniczonych zasobach](/pl/guide/low-resource) po dostrojony przewodnik krok po kroku i to, czego można oczekiwać od ograniczonego sprzętu.

Przy pierwszym logowaniu zostaniesz poproszony o zmianę hasła.

::: tip Anonimowa analityka produktu
SnapOtter zawiera domyślnie anonimową analitykę produktu. Aby ją wyłączyć, otwórz **Ustawienia → System → Prywatność** i wyłącz **Anonimową Analitykę Produktu**. Zatrzymuje się natychmiast dla całej instancji.

Możesz też ustawić zmienną środowiskową `SNAPOTTER_TELEMETRY=0` (`false` i `off` też działają), aby wyłączyć całą telemetrię dla instancji bez przebudowy.

Monitorowanie błędów jest zasilane przez [Sentry](https://sentry.io), które sponsoruje SnapOtter poprzez swój program open-source.

Po szczegóły dotyczące tego, co jest zbierane, zobacz [Co zbiera SnapOtter](/pl/guide/telemetry).
:::

::: tip Przyspieszanie NVIDIA CUDA
Dodaj `--gpus all`, aby uzyskać NVIDIA przyspieszane przez CUDA usuwanie tła, skalowanie, ulepszanie twarzy i przywracanie. OCR pozostaje oparty na procesorze i działa na tym samym obrazie z dostępem lub bez dostępu GPU:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Wymaga [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Automatycznie powraca do procesora, gdy CUDA jest niedostępna. Akceleracja Intel/AMD iGPU poprzez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwana w przypadku wnioskowania AI. Zobacz [Tagi Dockera](/pl/guide/docker-tags), aby zapoznać się z testami porównawczymi. Jeśli narzędzia AI działają na procesorze pomimo `--gpus all`, zobacz [Sprawdź przyspieszenie GPU](/pl/guide/deployment#verify-gpu-acceleration).
:::

::: details Także na GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Oba rejestry publikują ten sam obraz przy każdym wydaniu.
:::

## Docker Compose {#docker-compose}

Użyj pliku produkcyjnego utrzymywanego i testowanego w każdym wydaniu, zamiast kopiować skrócony przykład tworzenia z tej strony:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Kanoniczny [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) obejmuje wszystkie cztery woluminy wykonawcze, kontrole stanu, limity zasobów, trwałą konfigurację Redis, przypięte obrazy bazy danych/pamięci podręcznej oraz bieżące zabezpieczenie kontenera. Zmień domyślne hasło administratora natychmiast po pierwszym logowaniu. Aby zapewnić powtarzalne wdrożenie, przypnij obraz aplikacji SnapOtter do zweryfikowanego znacznika wydania lub podsumowania, zamiast podążać za `latest`.

Zobacz [Konfiguracja](/pl/guide/configuration) w celu uzyskania wszystkich zmiennych środowiskowych oraz [Zabezpieczenia i wzmacnianie](/pl/guide/security), aby uzyskać informacje tajne, zasady sieciowe i wskazówki dotyczące tworzenia kopii zapasowych.

## Budowanie ze źródeł {#build-from-source}

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

## Co możesz zrobić {#what-you-can-do}

### Przetwarzanie plików (200+ narzędzi) {#file-processing-200-tools}

| Modalność | Liczba | Przykładowe narzędzia |
|----------|-------|---------------|
| **Obraz** | 107 | Zmiana rozmiaru, Kadrowanie, Kompresja, Konwersja, Usuwanie tła, Skalowanie w górę, OCR, Znak wodny, Kolaż, Koloryzacja, Narzędzia GIF, szablony formatów |
| **Wideo** | 57 | Przycinanie, Kadrowanie, Kompresja, Konwersja, Łączenie, Wyodrębnianie audio, Automatyczne napisy, Wideo do GIF, Zmiana rozmiaru, Stabilizacja, szablony formatów |
| **Audio** | 27 | Przycinanie, Łączenie, Konwersja, Normalizacja, Redukcja szumów, Transkrypcja, Zmiana wysokości dźwięku, Wyciszanie, Kreator dzwonków, szablony formatów |
| **PDF / Dokument** | 29 | Łączenie, Dzielenie, Kompresja, OCR, Znak wodny, Redagowanie, Word do PDF, Excel do PDF, Obracanie, Zabezpieczanie, Naprawa |
| **Pliki** | 23 | CSV do JSON, JSON do XML, Łączenie CSV, Dzielenie CSV, Tworzenie ZIP, Wyodrębnianie ZIP, Kreator wykresów, YAML/JSON |

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

## Używanie na telefonie {#use-it-from-your-phone}

SnapOtter działa w przeglądarkach mobilnych i można go zainstalować jako aplikację. Otwórz swoją instancję na telefonie, a następnie:

- **iPhone / iPad (Safari):** stuknij w Udostępnij, a potem w **Do ekranu początkowego**.
- **Android (Chrome):** otwórz menu przeglądarki i stuknij w **Zainstaluj aplikację**.

Zainstalowana aplikacja otwiera się we własnym oknie, od razu z Twoją instancją.

Jest jeden haczyk: przeglądarki proponują instalację tylko przez HTTPS. Zwykły adres HTTP w sieci lokalnej nadal działa w karcie przeglądarki; żeby naprawdę zainstalować aplikację, umieść instancję za reverse proxy z certyfikatem (zobacz [przewodnik wdrażania](/pl/guide/deployment)).

Na telefonach i tabletach narzędzia do obrazów pokazują przycisk **Zrób zdjęcie** obok przycisku przesyłania. Sfotografuj paragon albo tablicę, a zdjęcie trafi prosto do narzędzia.

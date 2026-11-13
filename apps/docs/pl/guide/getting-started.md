---
description: "Instalacja SnapOtter z Docker jednym poleceniem. Obejmuje konfigurację Docker Compose, budowanie ze źródeł i pełny przegląd funkcji."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: ad957c0616c4
i18n_hash_version: 2
---

# Pierwsze kroki {#getting-started}

::: tip Wypróbuj przed instalacją
Pełny interfejs można obejrzeć na [demo.snapotter.com](https://demo.snapotter.com), bez rejestracji i instalacji.
:::

## Szybki start {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ten pojedynczy kontener uruchamia wszystko, czego potrzebuje: bez ustawionego `DATABASE_URL` startuje własne PostgreSQL i Redis na interfejsie loopback (tryb wbudowany) i przechowuje wszystkie dane w woluminie `SnapOtter-data`. To najszybszy sposób na wypróbowanie SnapOtter lub samodzielne hostowanie w domowym laboratorium. W środowisku produkcyjnym należy użyć [kanonicznego stosu Docker Compose](#docker-compose), który trzyma PostgreSQL i Redis w osobnych kontenerach. Tryb wbudowany działa jako root (domyślnie) i wyłącza się automatycznie, gdy tylko zostanie ustawione `DATABASE_URL`.

Instalacja na Raspberry Pi, starym laptopie lub małym VPS? Zobacz [Konfiguracje o ograniczonych zasobach](/pl/guide/low-resource), gdzie opisano dostrojoną instalację i czego można oczekiwać od ograniczonego sprzętu.

Przy pierwszym logowaniu pojawi się prośba o zmianę hasła.

::: tip Anonimowa analityka produktu
SnapOtter domyślnie zawiera anonimową analitykę produktu. Aby ją wyłączyć, należy otworzyć **Settings → System → Privacy** i wyłączyć **Anonymous Product Analytics**. Wyłączenie działa natychmiast dla całej instancji.

Można też ustawić zmienną środowiskową `SNAPOTTER_TELEMETRY=0` (działają również `false` i `off`), aby wyłączyć całą telemetrię instancji bez przebudowy.

Monitorowanie błędów działa dzięki [Sentry](https://sentry.io), które sponsoruje SnapOtter w ramach programu dla projektów open source.

Szczegóły dotyczące zbieranych danych znajdują się w [Co zbiera SnapOtter](/pl/guide/telemetry).
:::

::: tip Akceleracja NVIDIA CUDA
Należy dodać `--gpus all`, aby włączyć przyspieszane przez NVIDIA CUDA usuwanie tła, powiększanie, poprawianie twarzy i renowację. OCR nadal działa na CPU i w tym samym obrazie działa z dostępem do GPU lub bez niego:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Wymaga [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Gdy CUDA jest niedostępne, automatycznie przełącza się na CPU. Akceleracja zintegrowanych procesorów graficznych Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwana dla wnioskowania AI. Testy wydajności znajdują się w [Tagi Docker](/pl/guide/docker-tags). Jeśli narzędzia AI działają na CPU mimo `--gpus all`, zobacz [Weryfikacja akceleracji GPU](/pl/guide/deployment#verify-gpu-acceleration).
:::

::: details Dostępne także w GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Oba rejestry publikują ten sam obraz przy każdym wydaniu.
:::

## Docker Compose {#docker-compose}

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

Kanoniczny [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) zawiera wszystkie cztery woluminy uruchomieniowe, kontrole stanu, limity zasobów, trwałą konfigurację Redis, przypięte obrazy bazy danych i pamięci podręcznej oraz aktualne utwardzenie kontenerów. Hasło domyślnego administratora należy zmienić zaraz po pierwszym logowaniu. Aby wdrożenie było powtarzalne, obraz aplikacji SnapOtter należy przypiąć do zweryfikowanego tagu wydania lub skrótu (digest), zamiast śledzić `latest`.

Wszystkie zmienne środowiskowe opisano w [Konfiguracja](/pl/guide/configuration), a wskazówki dotyczące sekretów, zasad sieciowych i kopii zapasowych w [Bezpieczeństwo i utwardzanie](/pl/guide/security).

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

## Co można robić {#what-you-can-do}

### Przetwarzanie plików (ponad 200 narzędzi) {#file-processing-200-tools}

| Modalność | Liczba | Przykładowe narzędzia |
|----------|-------|---------------|
| **Obraz** | 112 | Zmiana rozmiaru, Kadrowanie, Kompresja, Konwersja, Usuwanie tła, Powiększanie, OCR, Znak wodny, Kolaż, Koloryzacja, Narzędzia GIF, presety formatów |
| **Wideo** | 57 | Przycinanie, Kadrowanie, Kompresja, Konwersja, Łączenie, Wyodrębnianie dźwięku, Automatyczne napisy, Wideo do GIF, Zmiana rozmiaru, Stabilizacja, presety formatów |
| **Audio** | 27 | Przycinanie, Łączenie, Konwersja, Normalizacja, Redukcja szumów, Transkrypcja, Zmiana wysokości dźwięku, Wyciszanie, Kreator dzwonków, presety formatów |
| **PDF / Dokument** | 35 | Łączenie, Dzielenie, Kompresja, OCR, Znak wodny, Redakcja, Word do PDF, Excel do PDF, Obracanie, Zabezpieczanie, Naprawa |
| **Pliki** | 23 | CSV do JSON, JSON do XML, Łączenie CSV, Dzielenie CSV, Tworzenie ZIP, Wyodrębnianie ZIP, Kreator wykresów, YAML/JSON |

### Potoki {#pipelines}

Narzędzia można łączyć w wieloetapowe przepływy pracy i stosować je do jednego obrazu lub całej partii:

1. Otworzyć **Pipelines** na pasku bocznym.
2. Dodać kroki (dowolne narzędzie, dowolne ustawienia).
3. Uruchomić dla pojedynczego pliku albo całej partii naraz.
4. Zapisać potok do ponownego użycia.

Potoki domyślnie dopuszczają 20 kroków. Ustawienie `MAX_PIPELINE_STEPS=0` znosi to ograniczenie.

### Biblioteka plików {#file-library}

Każdy przetworzony plik można zapisać w bibliotece **Files**. SnapOtter śledzi pełną historię wersji, dzięki czemu można prześledzić każdy etap przetwarzania od oryginalnego przesłania do wyniku końcowego.

Zapis jest jawny: wyniki zapisane w bibliotece są przechowywane do momentu ich usunięcia, a wyniki przetworzone i niezapisane są automatycznie usuwane po 72 godzinach (konfigurowalne przez `FILE_MAX_AGE_HOURS`).

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

Należy ustawić `AUTH_ENABLED=true` (lub `false` dla użytku jednoosobowego bez logowania).

## Użycie na telefonie {#use-it-from-your-phone}

SnapOtter działa w przeglądarkach mobilnych i można go zainstalować jako aplikację. Należy otworzyć instancję na telefonie, a następnie:

- **iPhone / iPad (Safari):** stuknąć Udostępnij, a potem **Dodaj do ekranu początkowego**.
- **Android (Chrome):** otworzyć menu przeglądarki i stuknąć **Zainstaluj aplikację**.

Zainstalowana aplikacja otwiera się we własnym oknie, od razu na instancji.

Jest jedno zastrzeżenie: przeglądarki oferują instalację tylko przez HTTPS. Zwykły adres HTTP w sieci LAN nadal działa w karcie przeglądarki, ale do właściwej instalacji należy umieścić instancję za zwrotnym serwerem proxy z certyfikatem (zobacz [przewodnik wdrażania](/pl/guide/deployment)).

Na telefonach i tabletach narzędzia obrazów pokazują przycisk **Zrób zdjęcie** obok przycisku przesyłania. Zdjęcie paragonu lub tablicy trafia bezpośrednio do narzędzia.

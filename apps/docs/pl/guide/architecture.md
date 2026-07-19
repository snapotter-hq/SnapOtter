---
description: "Struktura monorepozytorium, architektura aplikacji i pakietów, cykl życia żądania oraz zapotrzebowanie na zasoby w SnapOtter."
i18n_output_hash: 571d8852f6c2
i18n_source_hash: a53946e760b0
i18n_provenance: human
---

# Architektura {#architecture}

SnapOtter jest monorepozytorium zarządzanym za pomocą przestrzeni roboczych pnpm i Turborepo. Wdraża się jako 3-kontenerowy stos Docker Compose: obraz aplikacji SnapOtter, PostgreSQL 17 i Redis 8.

## Struktura projektu {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Pakiety {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

Podstawowa biblioteka przetwarzania obrazów zbudowana na [Sharp](https://sharp.pixelplumbing.com/). Obsługuje wszystkie operacje niezwiązane z AI: zmianę rozmiaru, kadrowanie, obrót, odbicie, konwersję, kompresję, usuwanie metadanych oraz korekty kolorów (jasność, kontrast, nasycenie, skala szarości, sepia, inwersja, kanały kolorów).

Ten pakiet nie ma zależności sieciowych i działa w całości w procesie.

### `@snapotter/ai` {#snapotter-ai}

Warstwa pomostowa wywołująca środowiska wykonawcze natywne i Python ML. Większość narzędzi Python używa trwałego dispatcher, który wstępnie importuje duże biblioteki (PIL, NumPy, MediaPipe, rembg), więc kolejne wywołania pomijają obciążenie związane z importem. OCR jest izolowany od tego zmiennego środowiska współdzielonego: `fast` wywołuje natywny Tesseract, podczas gdy `balanced` i `best` używają dedykowanego, trwałego JSONL dispatcher przypiętego do aktywnej, niezmiennej generacji RapidOCR/ONNX. Każde żądanie zawiera generation lease. Aktywacja najpierw uruchamia smoke test na kandydacie, a następnie atomowo przełącza się na jego dispatcher. Poprzednie dispatcher drenuje, zanim zostanie wygenerowane, i zostanie usunięte.

**Modele nie są wstępnie ładowane.** Każdy skrypt narzędzia ładuje swoje wagi modelu z dysku w momencie żądania i odrzuca je po zakończeniu żądania. Zobacz [Zapotrzebowanie na zasoby](#resource-footprint), aby poznać pełny profil pamięci.

Obsługiwane operacje: usuwanie tła (rembg/BiRefNet), skalowanie (RealESRGAN), rozmycie twarzy (MediaPipe), ulepszanie twarzy (GFPGAN/CodeFormer), usuwanie obiektów (LaMa ONNX), OCR (Tesseract i RapidOCR z modelami PP-OCR ONNX), kolorowanie (DDColor), usuwanie szumu, efekt czerwonych oczu usuwanie, przywracanie zdjęć, generowanie zdjęć paszportowych, utrwalanie przezroczystości (matowanie BiRefNet HR) i zmiana rozmiaru z uwzględnieniem zawartości (Go Caire binary).

Skrypty Python są dostępne w `packages/ai/python/`. Duże opcjonalne pakiety modeli są instalowane na żądanie w trwałym woluminie `/data/ai`. Dokładny OCR wykorzystuje podpisane artefakty specyficzne dla platformy; wbudowana warstwa Tesseract nie wymaga pobierania pakietu modeli.

### `@snapotter/shared` {#snapotter-shared}

Współdzielone typy TypeScript, stałe (takie jak `APP_VERSION` i definicje narzędzi) oraz ciągi tłumaczeń i18n używane zarówno przez frontend, jak i backend.

## Aplikacje {#applications}

### API (`apps/api`) {#api-apps-api}

Serwer Fastify v5 udostępniający 241 tras narzędzi w pięciu modalnościach (image, video, audio, PDF, file), który obsługuje:
- Przesyłanie plików, zarządzanie tymczasową przestrzenią roboczą oraz trwałe przechowywanie plików
- Bibliotekę plików użytkownika (tabela `user_files`): zapisana edycja jest domyślnie przechowywana jako niezależny nowy plik albo jako wersja powiązana z rodzicem, gdy nadpisujesz oryginał. Zapisuje, które narzędzia zostały zastosowane (`toolChain`), i otrzymuje automatycznie generowaną miniaturę dla strony Files
- Wykonywanie narzędzi (kieruje każde żądanie narzędzia do silnika obrazów lub mostu AI)
- Orkiestrację potoków (sekwencyjne łączenie wielu narzędzi w łańcuch)
- Przetwarzanie wsadowe z kontrolą współbieżności za pomocą kolejek zadań BullMQ (pule: image, media, ai, docs, system)
- Uwierzytelnianie użytkowników, RBAC (role admin/user z pełnym zestawem uprawnień), zarządzanie kluczami API oraz ograniczanie liczby żądań
- Zarządzanie zespołami - CRUD tylko dla administratorów; użytkownicy są przypisywani do zespołu za pomocą pola `team` w swoim profilu
- Ustawienia w czasie działania - magazyn klucz-wartość w tabeli `settings`, który steruje `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit` i innymi operacyjnymi pokrętłami bez ponownego wdrażania
- Niestandardowy branding i preferencje w czasie działania poprzez ustawienia oparte na bazie danych
- Dokumentację Scalar/OpenAPI pod adresem `/api/docs`
- Serwowanie zbudowanego frontendu jako SPA w środowisku produkcyjnym

Kluczowe zależności: Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, Zod do walidacji.

Serwer obsługuje płynne zamykanie na sygnał SIGTERM/SIGINT: opróżnia połączenia HTTP, zatrzymuje procesy robocze BullMQ, wyłącza dyspozytora Pythona i zamyka połączenie z bazą danych.

### Web (`apps/web`) {#web-apps-web}

Jednostronicowa aplikacja React 19 zbudowana za pomocą Vite. Używa Zustand do zarządzania stanem, Tailwind CSS v4 do stylizacji oraz Lucide do ikon. Komunikuje się z API przez REST i SSE (do śledzenia postępu).

Strony obejmują przestrzeń roboczą narzędzia, stronę Files do zarządzania trwałymi przesłaniami i wynikami, kreator automatyzacji/potoków oraz panel ustawień administratora.

Zbudowany frontend jest serwowany przez backend Fastify w środowisku produkcyjnym, więc w kontenerze Docker nie ma osobnego serwera WWW.

### Docs (`apps/docs`) {#docs-apps-docs}

Ta witryna VitePress. Wdrażana automatycznie do Cloudflare Pages przy wypchnięciu do `main`.

## Jak przebiega żądanie {#how-a-request-flows}

1. Użytkownik wybiera narzędzie w interfejsie WWW i przesyła plik.
2. Frontend wysyła wieloczęściowe żądanie POST do `/api/v1/tools/:section/:toolId` z plikiem i ustawieniami.
3. Trasa API waliduje dane wejściowe za pomocą Zod, a następnie rozdziela przetwarzanie.
4. W przypadku standardowych narzędzi zadanie jest kolejkowane do odpowiedniej puli BullMQ (image, media lub docs w zależności od modalności). Proces roboczy BullMQ działający w procesie automatycznie orientuje obraz na podstawie metadanych EXIF, uruchamia funkcję przetwarzającą narzędzia i zwraca wynik.
5. W przypadku większości narzędzi AI most TypeScript wysyła żądanie do trwałego Python dispatcher. Zamiast tego szybki OCR wywołuje Tesseract, a dokładny OCR uruchamia przypięty plik wykonywalny z aktywnej, niezmiennej generacji OCR. Żądany poziom OCR jest ustalany na wejściu i nigdy nie jest zmieniany w trybie cichym podczas wykonywania.
6. Postęp zadania jest utrwalany w tabeli `jobs` w PostgreSQL, więc stan przetrwa ponowne uruchomienia kontenera. Aktualizacje w czasie rzeczywistym są dostarczane przez SSE pod adresem `/api/v1/jobs/:jobId/progress`.
7. API zwraca `jobId` i `downloadUrl`. Użytkownik pobiera przetworzony plik z `/api/v1/download/:jobId/:filename`.

W przypadku potoków API podaje wynik każdego kroku jako dane wejściowe do następnego, uruchamiając je sekwencyjnie.

W przypadku przetwarzania wsadowego API używa przepływów BullMQ z zadaniami podrzędnymi dla poszczególnych kroków i zwraca plik ZIP ze wszystkimi przetworzonymi plikami.

## Zapotrzebowanie na zasoby {#resource-footprint}

SnapOtter został zaprojektowany z myślą o niskim zużyciu pamięci w stanie spoczynku. Nic nie jest wstępnie ładowane ani utrzymywane w gotowości przy starcie.

### W stanie spoczynku {#at-idle}

Proces Node.js/Fastify, PostgreSQL i Redis są uruchomione. Typowa pamięć RAM w stanie spoczynku wynosi **~200-300 MB** we wszystkich trzech kontenerach (proces Node.js, Postgres i Redis). Brak procesu Pythona, brak wag modeli w pamięci.

### Co się uruchamia i kiedy {#what-starts-and-when}

| Komponent | Uruchamia się, gdy | Pamięć w trakcie działania |
|-----------|-------------|---------------------|
| Serwer Fastify + Postgres + Redis | Uruchomienie kontenera | ~200-300 MB łącznie |
| Procesy robocze BullMQ | Uruchomienie kontenera (w procesie) | Jeden proces roboczy na pulę (image, media, ai, docs, system) |
| Dyspozytor Pythona | Pierwsze żądanie narzędzia AI | Interpreter Pythona + wstępnie zaimportowane biblioteki (PIL, NumPy, MediaPipe, rembg) - bez wag modeli |
| Wagi modeli AI | W trakcie żądania konkretnego narzędzia | Ładowane z dysku, zwalniane po zakończeniu żądania |

### Ładowanie modeli {#model-loading}

Wszystkie pliki wag modeli (łącznie kilka GB) znajdują się na dysku w `/opt/models/` przez cały czas. Każdy skrypt narzędzia AI ładuje do pamięci tylko własne modele na czas trwania żądania, po czym je zwalnia. Niektóre skrypty jawnie wywołują `del model` i `torch.cuda.empty_cache()` po inferencji, aby zapewnić natychmiastowy zwrot pamięci.

Między żądaniami nie ma pamięci podręcznej modeli. Uruchamianie tego samego narzędzia AI jedno po drugim ładuje model za każdym razem. Utrzymuje to pamięć w stanie spoczynku bliską zeru kosztem opóźnienia związanego z ładowaniem modelu przy każdym żądaniu AI.

### Zimny start pierwszego żądania AI {#first-ai-request-cold-start}

Dyspozytor Pythona nie jest uruchomiony, gdy kontener startuje. Pierwsze żądanie AI wyzwala równolegle dwie rzeczy: dyspozytor zaczyna się rozgrzewać w tle, a samo żądanie awaryjnie korzysta z jednorazowego uruchomienia podprocesu Pythona. Gdy dyspozytor zasygnalizuje gotowość, wszystkie kolejne żądania AI używają go bezpośrednio i pomijają koszt uruchamiania podprocesu.

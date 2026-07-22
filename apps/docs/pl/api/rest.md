---
description: "Kompletna dokumentacja API REST. Punkty końcowe narzędzi, przetwarzanie wsadowe, potoki, biblioteka plików, uwierzytelnianie, zespoły i operacje administracyjne."
i18n_output_hash: 4b25a4ffd694
i18n_source_hash: 7e0a0db4abe0
i18n_provenance: human
---

# Dokumentacja API REST {#rest-api-reference}

Interaktywna dokumentacja API z przykładami żądań i odpowiedzi jest dostępna pod adresem [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Specyfikacje odczytywalne maszynowo:
- `/api/v1/openapi.yaml` - specyfikacja OpenAPI 3.1
- `/llms.txt` - podsumowanie przyjazne dla LLM
- `/llms-full.txt` - kompletna dokumentacja przyjazna dla LLM

## Uwierzytelnianie {#authentication}

Wszystkie punkty końcowe wymagają uwierzytelnienia, chyba że `AUTH_ENABLED=false`.

### Token sesji {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

Sesje wygasają po 7 dniach (konfigurowalne za pomocą `SESSION_DURATION_HOURS`).

### Klucze API {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

Klucze są poprzedzone przedrostkiem `si_` i przechowywane jako skróty scrypt - surowy klucz jest pokazywany raz i nigdy więcej nie można go odzyskać.

### Punkty końcowe uwierzytelniania {#auth-endpoints}

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Publiczny | Logowanie, uzyskanie tokena sesji |
| `POST` | `/api/auth/logout` | Uwierzytelniony | Zniszczenie bieżącej sesji |
| `GET` | `/api/auth/session` | Uwierzytelniony | Weryfikacja bieżącej sesji |
| `POST` | `/api/auth/change-password` | Uwierzytelniony | Zmiana własnego hasła (unieważnia wszystkie inne sesje + klucze API) |
| `GET` | `/api/auth/users` | Administrator | Lista wszystkich użytkowników |
| `POST` | `/api/auth/register` | Administrator | Utworzenie nowego użytkownika |
| `PUT` | `/api/auth/users/:id` | Administrator | Aktualizacja roli lub zespołu użytkownika |
| `POST` | `/api/auth/users/:id/reset-password` | Administrator | Zresetowanie hasła użytkownika |
| `DELETE` | `/api/auth/users/:id` | Administrator | Usunięcie użytkownika |
| `GET` | `/api/v1/config/auth` | Publiczny | Sprawdzenie, czy uwierzytelnianie jest włączone (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Uwierzytelniony | Rozpoczęcie rejestracji TOTP MFA. Wymaga funkcji enterprise `mfa` |
| `POST` | `/api/auth/mfa/verify` | Uwierzytelniony | Potwierdzenie rejestracji MFA kodem TOTP |
| `POST` | `/api/auth/mfa/complete` | Publiczny | Zakończenie oczekującego wyzwania logowania MFA |
| `POST` | `/api/auth/mfa/disable` | Uwierzytelniony | Wyłączenie MFA dla bieżącego użytkownika |
| `POST` | `/api/auth/users/:id/mfa/reset` | Administrator (`users:manage`) | Zresetowanie MFA dla użytkownika |
| `GET` | `/api/auth/oidc/login` | Publiczny | Rozpoczęcie logowania OIDC, gdy OIDC jest włączony |
| `GET` | `/api/auth/oidc/callback` | Publiczny | Wywołanie zwrotne autoryzacji OIDC |
| `GET` | `/api/auth/saml/metadata` | Publiczny | Metadane XML SAML SP, gdy SAML jest włączony |
| `GET` | `/api/auth/saml/login` | Publiczny | Rozpoczęcie logowania SAML |
| `POST` | `/api/auth/saml/callback` | Publiczny | Usługa konsumenta asercji SAML |

Gdy MFA jest włączone dla użytkownika, `POST /api/auth/login` zwraca `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` zamiast tokena sesji. Wyślij ten `mfaToken` wraz z kodem TOTP lub kodem odzyskiwania do `/api/auth/mfa/complete`.

### Uprawnienia {#permissions}

| Uprawnienie | Administrator | Użytkownik |
|-----------|:-----:|:----:|
| Korzystanie z narzędzi | ✓ | ✓ |
| Własne pliki/potoki/klucze API | ✓ | ✓ |
| Podgląd plików/potoków/kluczy wszystkich użytkowników | ✓ | - |
| Zapis ustawień | ✓ | - |
| Zarządzanie użytkownikami i zespołami | ✓ | - |
| Zarządzanie marką | ✓ | - |

## Kontrola stanu {#health-check}

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Publiczny | Podstawowa kontrola stanu. Zwraca `{"status":"healthy","version":"..."}` z kodem 200 lub `{"status":"unhealthy"}` z kodem 503, jeśli baza danych jest nieosiągalna. |
| `GET` | `/api/v1/readyz` | Publiczny | Sonda gotowości. Sprawdza PostgreSQL, Redis, miejsce na dysku oraz S3, gdy jest skonfigurowane. Zwraca 503, gdy instancja nie powinna odbierać ruchu. |
| `GET` | `/api/v1/admin/health` | Administrator (`system:health`) | Szczegółowa diagnostyka obejmująca czas działania, tryb przechowywania, stan bazy danych, stan kolejki i dostępność GPU. |

## Korzystanie z narzędzi {#using-tools}

Każde narzędzie działa według tego samego wzorca:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` jest jednym z `image`, `video`, `audio`, `pdf` lub `files`.

- Przesyłany plik ma pole `multipart/form-data`.
- `settings` to ciąg JSON z opcjami specyficznymi dla narzędzia.
- `clientJobId` to opcjonalne pole formularza służące do korelacji postępu dostarczanej przez wywołującego.
- `fileId` to opcjonalne pole formularza odwołujące się do istniejącego elementu biblioteki plików. Gdy jest obecne, przetworzony wynik jest zapisywany jako nowa wersja, a odpowiedź zawiera `savedFileId`.
- **Szybkie narzędzia** zwykle zwracają JSON z kodem 200: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Pobierz przetworzony plik z `downloadUrl`.
- **Każde narzędzie w kolejce** może zwrócić JSON z kodem 202, jeśli działa długo lub przekracza okno synchronicznego oczekiwania: `{"jobId":"...","async":true}`. Połącz się z SSE, aby śledzić postęp, a następnie pobierz plik po zakończeniu (zobacz [Śledzenie postępu](#progress-tracking)).
- **Trasy wsadowe** zwracają archiwum ZIP przesyłane bezpośrednio strumieniowo (z nagłówkiem `X-Job-Id`) dla narzędzi zarejestrowanych w ogólnym rejestrze wsadowym.

## Dokumentacja narzędzi {#tools-reference}

### Ustawienia wstępne konwersji {#conversion-presets}

Wspólny katalog zawiera 83 dedykowane punkty końcowe ustawień wstępnych konwersji, takie jak `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` i `excel-to-csv`. Ustawienia wstępne to pełnoprawne trasy narzędzi:

`POST /api/v1/tools/<section>/<presetId>`

Każde ustawienie wstępne blokuje format wyjściowy i deleguje do narzędzia bazowego, takiego jak `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` lub `convert-spreadsheet`. Zobacz [Ustawienia wstępne konwersji](/pl/tools/conversion-presets), aby uzyskać kompletną tabelę tras i opcjonalne ustawienia.

### Podstawy {#essentials}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `resize` | Zmiana rozmiaru | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, plus 23 ustawienia wstępne mediów społecznościowych |
| `crop` | Kadrowanie | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | Obrót i odbicie | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Konwersja | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Kompresja | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Optymalizacja {#optimization}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `optimize-for-web` | Optymalizacja pod kątem internetu | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Usuwanie metadanych | - |
| `edit-metadata` | Edycja metadanych | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Zmiana nazw zbiorczo | `pattern` (obsługuje `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Obraz do PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Generator favicon | `padding`, `backgroundColor`, `borderRadius` - generuje wszystkie standardowe rozmiary |

### Korekty {#adjustments}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `adjust-colors` | Korekta kolorów | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Wyostrzanie | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Zamiana koloru | `sourceColor`, `targetColor` (zamiennik), `makeTransparent`, `tolerance` |
| `color-blindness` | Symulacja daltonizmu | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, domyślnie "deuteranomaly") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pikselizacja | `blockSize` (2-128), `region` ({left, top, width, height} dla częściowej pikselizacji) |
| `vignette` | Winieta | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Narzędzia AI {#ai-tools}

Wszystkie narzędzia AI działają na Twoim sprzęcie: domyślnie na CPU lub na NVIDIA CUDA, gdy dostępny jest obsługiwany procesor graficzny NVIDIA. Akceleracja iGPU firm Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwana dla wnioskowania AI. Nie wymaga połączenia z internetem.

| ID narzędzia | Nazwa | Model AI | Kluczowe ustawienia |
|---------|------|---------|-------------|
| `remove-background` | Usuwanie tła | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Powiększanie obrazu | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Wymazywanie obiektów | LaMa (ONNX) | Maska wysyłana jako druga część pliku (nazwa pola `mask`), `format`, `quality` |
| `ocr` | OCR / Ekstrakcja tekstu | Tesseract (szybki); RapidOCR + PP-OCR ONNX (zrównoważony/najlepszy) | `quality` (szybki/zrównoważony/najlepszy), `language`, `enhance` |
| `blur-faces` | Rozmycie twarzy / PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Inteligentne kadrowanie | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Poprawa obrazu | Oparte na analizie | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Poprawa twarzy | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Koloryzacja AI | DDColor | `intensity`, `model` |
| `noise-removal` | Usuwanie szumów | Wielopoziomowe odszumianie | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Usuwanie efektu czerwonych oczu | Punkty charakterystyczne twarzy + analiza kolorów | `sensitivity`, `strength` |
| `restore-photo` | Rekonstrukcja zdjęć | Wieloetapowy potok | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Zdjęcie paszportowe | Punkty charakterystyczne MediaPipe | Dwufazowy przepływ. Analiza używa multipart `file`; generowanie używa JSON z `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), punktami charakterystycznymi, wymiarami obrazu |
| `content-aware-resize` | Zmiana rozmiaru z zachowaniem treści | Wycinanie szwów (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Naprawa przezroczystości PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Zamiana tła | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Rozmycie tła | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Rozszerzanie płótna AI | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Znak wodny i nakładka {#watermark-overlay}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `watermark-text` | Tekstowy znak wodny | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Graficzny znak wodny | `opacity`, `position`, `scale` - drugi plik jest znakiem wodnym |
| `text-overlay` | Nakładka tekstowa | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Kompozycja obrazu | `x`, `y`, `opacity`, `blend` - drugi plik jest nakładany na wierzch |
| `meme-generator` | Generator memów | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Obsługuje tryb szablonu (treść JSON z `templateId`) lub tryb obrazu niestandardowego (multipart z plikiem). |

### Narzędzia pomocnicze {#utilities}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `info` | Informacje o obrazie | - (zwraca szerokość, wysokość, format, rozmiar, kanały, hasAlpha, DPI, EXIF) |
| `compare` | Porównanie obrazów | `mode` (side-by-side/overlay/diff), `diffThreshold` - drugi plik jest celem porównania |
| `find-duplicates` | Wyszukiwanie duplikatów | `threshold` (odległość skrótu percepcyjnego, domyślnie 8) - wieloplikowe |
| `color-palette` | Paleta kolorów | `count` (liczba dominujących kolorów), `format` (hex/rgb) |
| `qr-generate` | Generator kodów QR | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (opcjonalny plik) |
| `barcode-read` | Czytnik kodów kreskowych | - (automatyczne wykrywanie QR, EAN, Code128, DataMatrix itd.) |
| `image-to-base64` | Obraz do Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML do obrazu | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogram | `scale` (linear/log) - zwraca wykres histogramu RGB + statystyki dla poszczególnych kanałów |
| `lqip-placeholder` | Symbol zastępczy LQIP | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Generator kodów kreskowych | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Treść JSON, bez przesyłania pliku. |

### Układ i kompozycja {#layout-composition}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `collage` | Kolaż / Siatka | `template` (25+ układów), `gap`, `backgroundColor`, `borderRadius` - wieloplikowe |
| `stitch` | Zszywanie / Łączenie | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - wieloplikowe |
| `split` | Dzielenie obrazu | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Obramowanie i ramka | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Upiększanie zrzutu ekranu | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Kadrowanie okrągłe | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Dopełnianie obrazu | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Arkusz duszków | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - wieloplikowe (2-64 obrazy) |

### Format i konwersja {#format-conversion}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `svg-to-raster` | SVG do rastra | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Obraz do SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | Narzędzia GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), parametry specyficzne dla akcji |
| `gif-webp` | Konwerter GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Narzędzia wideo {#video-tools}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `convert-video` | Konwersja wideo | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Kompresja wideo | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Przycinanie wideo | `startS`, `endS`, `precise` (bool, cięcie z dokładnością do klatki) |
| `mute-video` | Wyciszanie wideo | - |
| `video-to-gif` | Wideo do GIF | `fps` (1-30), `width`, `startS`, `durationS` (maks. 60 s) |
| `resize-video` | Zmiana rozmiaru wideo | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Kadrowanie wideo | `width`, `height`, `x`, `y` |
| `rotate-video` | Obrót wideo | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Zmiana FPS | `fps` (1-120) |
| `video-color` | Kolor wideo | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Prędkość wideo | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Odwracanie wideo | - (maks. 5 minut) |
| `video-loudnorm` | Normalizacja dźwięku | - (EBU R128) |
| `aspect-pad` | Dopełnianie proporcji | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Dopełnianie rozmyciem | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Znak wodny na wideo | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Stabilizacja wideo | `smoothing` (5-60, w klatkach) |
| `gif-to-video` | GIF do wideo | `format` (mp4/webm/mov) |
| `video-to-webp` | Wideo do WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Wideo do klatek | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Łączenie wideo | - (wieloplikowe, znormalizowane do rozdzielczości pierwszego wideo) |
| `replace-audio` | Zamiana dźwięku | - (plik wideo + audio, dwa pliki) |
| `burn-subtitles` | Wypalanie napisów | `fontSize` (8-72) - plik wideo + napisy |
| `embed-subtitles` | Osadzanie napisów | `language` (kod ISO 639-2/B) - plik wideo + napisy |
| `extract-subtitles` | Wyodrębnianie napisów | - (na wyjściu SRT) |
| `images-to-video` | Obrazy do wideo | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - wieloplikowe |
| `video-metadata` | Czyszczenie metadanych wideo | - |
| `auto-subtitles` | Automatyczne napisy (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Wyodrębnianie dźwięku | `format` (mp3/wav/m4a/ogg) |

### Narzędzia audio {#audio-tools}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `convert-audio` | Konwersja dźwięku | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Przycinanie dźwięku | `startS`, `endS` |
| `volume-adjust` | Regulacja głośności | `gainDb` (-30 do 30) |
| `normalize-audio` | Normalizacja dźwięku | - (EBU R128, -16 LUFS) |
| `fade-audio` | Wyciszanie/wzmacnianie dźwięku | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Odwracanie dźwięku | - |
| `audio-speed` | Prędkość dźwięku | `factor` (0.25-4) |
| `pitch-shift` | Przesunięcie tonacji | `semitones` (-12 do 12) |
| `audio-channels` | Kanały dźwięku | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Usuwanie ciszy | `thresholdDb` (-80 do -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Redukcja szumów | `strength` (light/medium/strong) |
| `merge-audio` | Łączenie dźwięku | `format` (mp3/wav/flac/m4a) - wieloplikowe |
| `split-audio` | Dzielenie dźwięku | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Twórca dzwonków | `startS`, `durationS` (1-30) |
| `waveform-image` | Obraz przebiegu | `width`, `height`, `color` (hex) |
| `audio-metadata` | Metadane dźwięku | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Transkrypcja dźwięku (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Narzędzia do dokumentów {#document-tools}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `merge-pdf` | Łączenie plików PDF | - (wieloplikowe, do 20 plików PDF) |
| `split-pdf` | Dzielenie PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Kompresja PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Obrót PDF | `angle` (90/180/270), `range` (zakres stron) |
| `extract-pages` | Wyodrębnianie stron | `range` (składnia qpdf, np. "1-5,8,10-z") |
| `remove-pages` | Usuwanie stron | `pages` (zakres qpdf do usunięcia) |
| `organize-pdf` | Organizacja PDF | `order` (kolejność stron qpdf, np. "3,1,2,5-z") |
| `protect-pdf` | Ochrona PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Odblokowanie PDF | `password` |
| `repair-pdf` | Naprawa PDF | - |
| `linearize-pdf` | Optymalizacja PDF pod kątem internetu | - (linearyzacja dla szybkiego przeglądania w sieci) |
| `grayscale-pdf` | PDF w skali szarości | - |
| `pdfa-convert` | Konwersja do PDF/A | - (archiwalny PDF/A-2) |
| `crop-pdf` | Kadrowanie PDF | `margin` (0-2000 punktów) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Broszura PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Znak wodny PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Numery stron PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Spłaszczanie PDF | - (utrwala formularze i adnotacje) |
| `redact-pdf` | Redakcja PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Podpisywanie PDF | Niestandardowa trasa multipart z plikiem PDF `file`, plikami podpisu `sig0`, `sig1` oraz tablicą JSON `placements` |
| `pdf-to-text` | PDF do tekstu | - |
| `pdf-to-word` | PDF do Word | - |
| `pdf-metadata` | Metadane PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Konwersja dokumentu | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Konwersja prezentacji | `format` (pptx/odp) |
| `convert-spreadsheet` | Konwersja arkusza kalkulacyjnego | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel do PDF | - |
| `word-to-pdf` | Word do PDF | - |
| `powerpoint-to-pdf` | PowerPoint do PDF | - |
| `html-to-pdf` | HTML do PDF | - (zdalne zasoby wyłączone) |
| `markdown-to-docx` | Markdown do Word | - |
| `markdown-to-html` | Markdown do HTML | - |
| `markdown-to-pdf` | Markdown do PDF | - (zdalne zasoby wyłączone) |
| `epub-convert` | Konwersja EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Konwersja do EPUB | - (akceptuje .docx, .md, .html, .txt) |
| `ocr-pdf` | OCR PDF (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF do obrazu | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF do JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF do PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF do TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Narzędzia do plików {#file-tools}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `chart-maker` | Twórca wykresów | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV do Excel | `sheet` (numer arkusza dla wejścia XLSX) - dwukierunkowe |
| `csv-json` | CSV do JSON | `pretty` (bool) - dwukierunkowe |
| `json-xml` | JSON do XML | `pretty` (bool) - dwukierunkowe |
| `split-csv` | Dzielenie CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Łączenie plików CSV | - (wieloplikowe, pasujące kolumny) |
| `yaml-json` | YAML / JSON | - (dwukierunkowe) |
| `xml-to-csv` | XML do CSV | - (automatyczne wyszukiwanie powtarzających się elementów) |
| `excel-to-csv` | Excel do CSV | dedykowane ustawienie wstępne konwersji oparte na `convert-spreadsheet` |
| `create-zip` | Utwórz ZIP | - (wieloplikowe, 2-50 plików) |
| `extract-zip` | Wypakuj ZIP | - (ochrona przed bombą) |

### HTML do obrazu {#html-to-image}

Przechwyć stronę internetową jako obraz. W przeciwieństwie do innych narzędzi ten punkt końcowy przyjmuje `application/json` zamiast danych formularza multipart (bez potrzeby przesyłania pliku).

**Punkt końcowy:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `url` | string | (wymagane) | URL do przechwycenia (tylko http/https) |
| `format` | string | `"png"` | Format wyjściowy: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Jakość 1-100 (tylko JPG/WebP) |
| `fullPage` | boolean | `false` | Przechwyć całą przewijaną stronę |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Niestandardowa szerokość okna widoku 320-3840 |
| `viewportHeight` | number | `720` | Niestandardowa wysokość okna widoku 320-2160 |

**Przykład:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Odpowiedź:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Podtrasy narzędzi {#tool-sub-routes}

Niektóre narzędzia udostępniają dodatkowe punkty końcowe poza standardowym `POST /api/v1/tools/<section>/<toolId>`:

| Metoda | Ścieżka | Opis |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Zwraca popularne identyfikatory narzędzi, wracając do wyselekcjonowanej listy domyślnej, gdy dane o użyciu są skąpe |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Zastosuj efekty tła (color/gradient/blur/shadow) bez ponownego uruchamiania AI. Używa maski z pamięci podręcznej z początkowego usunięcia. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Odczytaj istniejące metadane EXIF/IPTC/XMP z obrazu |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Sprawdź pola metadanych przed usunięciem |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Faza 1: Wykrywanie twarzy AI + usuwanie tła. Zwraca punkty charakterystyczne twarzy i dane z pamięci podręcznej. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Faza 2: Kadrowanie, zmiana rozmiaru i kafelkowanie przy użyciu analizy z pamięci podręcznej. Bez ponownego uruchamiania AI. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Pobierz metadane GIF (liczba klatek, wymiary, czas trwania) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Pobierz metadane PDF (liczba stron, wymiary) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Wygeneruj podgląd konkretnej strony PDF |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Pobierz metadane PDF dla dedykowanego ustawienia wstępnego JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Wygeneruj podgląd strony PDF z ustawieniem wstępnym JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Pobierz metadane PDF dla dedykowanego ustawienia wstępnego PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Wygeneruj podgląd strony PDF z ustawieniem wstępnym PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Pobierz metadane PDF dla dedykowanego ustawienia wstępnego TIFF |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Wygeneruj podgląd strony PDF z ustawieniem wstępnym TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Konwertuj wsadowo wiele plików SVG do rastra |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Przeanalizuj jakość obrazu i zwróć rekomendacje poprawy |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Lekki podgląd do dostrajania parametrów na żywo. Zwraca zoptymalizowany obraz z nagłówkami rozmiaru. |

## Przetwarzanie wsadowe {#batch-processing}

Zastosuj ogólne narzędzie obsługujące tryb wsadowy do wielu plików jednocześnie. Zwraca archiwum ZIP. Niestandardowe trasy wieloplikowe lub wieloetapowe, takie jak podpisywanie PDF oraz trasy ustawień wstępnych PDF-do-obrazu, używają własnego kontraktu punktu końcowego zamiast ogólnej trasy `/batch`.

Narzędzie `ocr-pdf` obsługuje tę ogólną trasę `/batch`.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Współbieżnością steruje `CONCURRENT_JOBS` (domyślnie: automatycznie wykrywana na podstawie rdzeni CPU). `MAX_BATCH_SIZE` ogranicza liczbę plików w partii (domyślnie: 100; ustaw 0 dla braku limitu).

## Potoki {#pipelines}

### Wykonaj potok {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

Wyjście każdego kroku jest wejściem następnego kroku. Potoki domyślnie dopuszczają 20 kroków, co jest konfigurowalne za pomocą `MAX_PIPELINE_STEPS`. Ustaw `MAX_PIPELINE_STEPS=0`, aby usunąć limit.

### Zapisywanie potoków i zarządzanie nimi {#save-and-manage-pipelines}

| Metoda | Ścieżka | Opis |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Zapisz nazwany potok (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Lista zapisanych potoków (administratorzy widzą wszystkie; użytkownicy widzą własne) |
| `DELETE` | `/api/v1/pipeline/:id` | Usuń (właściciel lub administrator) |
| `GET` | `/api/v1/pipeline/tools` | Lista identyfikatorów narzędzi ważnych dla kroków potoku |

## Śledzenie postępu {#progress-tracking}

Długotrwałe zadania, narzędzia w kolejce, zadania wsadowe i potoki emitują postęp w czasie rzeczywistym za pomocą Server-Sent Events. Strumień postępu jest publiczny i identyfikowany przez identyfikator zadania, więc klienci nie muszą wysyłać nagłówka Authorization, aby go odczytać.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Format zdarzenia:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Możesz zażądać anulowania zadania w kolejce lub uruchomionego za pomocą `POST /api/v1/jobs/:jobId/cancel`. Odpowiedzią jest `{"canceled":true|false}`.

## Biblioteka plików {#file-library}

Trwałe przechowywanie plików z historią wersji.

| Metoda | Ścieżka | Opis |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Prześlij pliki do obszaru roboczego (tymczasowe przetwarzanie) |
| `POST` | `/api/v1/files/upload` | Prześlij pliki do trwałej biblioteki plików |
| `POST` | `/api/v1/files/save-result` | Zapisz wynik przetwarzania narzędzia jako nową wersję pliku |
| `GET` | `/api/v1/files` | Lista zapisanych plików (stronicowana, z wyszukiwaniem) |
| `GET` | `/api/v1/files/:id` | Pobierz metadane pliku + łańcuch wersji |
| `GET` | `/api/v1/files/:id/download` | Pobierz plik |
| `GET` | `/api/v1/files/:id/thumbnail` | Pobierz miniaturę JPEG 300px |
| `DELETE` | `/api/v1/files` | Zbiorczo usuń pliki i ich łańcuchy wersji (treść: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Pobierz zdalne adresy URL do obszaru roboczego dla importów opartych na URL |
| `POST` | `/api/v1/preview` | Wygeneruj podgląd WebP zgodny z przeglądarką (dla formatów HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Przesyłaj strumieniowo podgląd zgodny z przeglądarką z pamięci podręcznej lub wygenerowany dla zapisanego pliku PDF, dokumentu biurowego, wideo lub audio |
| `POST` | `/api/v1/preview/generate` | Wygeneruj na żądanie podgląd MP4 lub MP3 dla przesłanego pliku multimedialnego bez uprzedniego zapisywania go |
| `GET` | `/api/v1/download/:jobId/:filename` | Pobierz przetworzony plik z obszaru roboczego |

Aby automatycznie zapisać wynik narzędzia w bibliotece, dołącz `fileId` jako pole formularza multipart odwołujące się do istniejącego pliku w bibliotece. Przetworzony wynik zostanie zapisany jako nowa wersja.

## Zarządzanie kluczami API {#api-key-management}

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Uwierzytelniony | Wygeneruj nowy klucz - pokazywany raz |
| `GET` | `/api/v1/api-keys` | Uwierzytelniony | Lista kluczy (nazwa, id, lastUsedAt - bez surowego klucza) |
| `DELETE` | `/api/v1/api-keys/:id` | Uwierzytelniony | Usuń klucz |

## Zespoły {#teams}

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Administrator (`teams:manage`) | Lista zespołów |
| `POST` | `/api/v1/teams` | Administrator (`teams:manage`) | Utwórz zespół |
| `PUT` | `/api/v1/teams/:id` | Administrator (`teams:manage`) | Zmień nazwę zespołu |
| `DELETE` | `/api/v1/teams/:id` | Administrator (`teams:manage`) | Usuń zespół (nie można usunąć domyślnego zespołu ani zespołów z członkami) |

## Ustawienia {#settings}

Konfiguracja środowiska uruchomieniowego używa zamkniętego zbioru rozpoznawanych kluczy. Odczyt wymaga uprawnienia `settings:read`, a zapis — `settings:write`; klucze zabezpieczeń i zgodności dodatkowo wymagają uprawnienia `security:manage` lub `compliance:manage`. Ustawienia tajne wymagają uprawnień pełnego administratora, natomiast poświadczenia i stan zarządzane przez dedykowane punkty końcowe są tutaj tylko do odczytu. Aktualizacje zbiorcze są weryfikowane przed zapisaniem jakiejkolwiek wartości.

| Metoda | Ścieżka | Opis |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Pobierz wszystkie ustawienia |
| `PUT` | `/api/v1/settings` | Zbiorczo zaktualizuj ustawienia (treść JSON z parami klucz-wartość) |
| `GET` | `/api/v1/settings/:key` | Pobierz konkretne ustawienie według klucza |

Przykładowe klucze: `disabledTools` (tablica JSON identyfikatorów narzędzi), `enableExperimentalTools` (wartość logiczna), `loginAttemptLimit` (zasady zabezpieczeń) oraz `auditRetentionDays` (zasady zgodności). Nieznane klucze są odrzucane.

## Preferencje {#preferences}

Preferencje poszczególnych użytkowników są oddzielone od ustawień instancji. Każdy uwierzytelniony użytkownik może odczytać i zaktualizować własną mapę preferencji.

| Metoda | Ścieżka | Opis |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Pobierz preferencje bieżącego użytkownika jako `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Zapisz lub zaktualizuj jeden lub więcej kluczy preferencji dla bieżącego użytkownika |

## Role {#roles}

Zarządzanie niestandardowymi rolami z granularnymi uprawnieniami.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Administrator (`audit:read`) | Lista wszystkich ról z liczbą użytkowników |
| `POST` | `/api/v1/roles` | Administrator (`security:manage`) | Utwórz niestandardową rolę (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Administrator (`security:manage`) | Zaktualizuj niestandardową rolę (nie można modyfikować wbudowanych ról) |
| `DELETE` | `/api/v1/roles/:id` | Administrator (`security:manage`) | Usuń niestandardową rolę (nie można usuwać wbudowanych ról; dotknięci użytkownicy wracają do roli `user`) |

Dostępne uprawnienia (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Dziennik audytu {#audit-log}

Punkt końcowy tylko dla administratora do przeglądania działań istotnych z punktu widzenia bezpieczeństwa.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Administrator (`audit:read`) | Stronicowany dziennik audytu z opcjonalnymi filtrami |

Parametry zapytania:

| Parametr | Opis |
|-----------|-------------|
| `page` | Numer strony (domyślnie: 1) |
| `limit` | Wpisy na stronę (domyślnie: 50, maks.: 100) |
| `action` | Filtruj według typu akcji (np. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Filtruj według źródłowego adresu IP |
| `from` | Filtruj wpisy po tej dacie ISO 8601 |
| `to` | Filtruj wpisy przed tą datą ISO 8601 |

## Analityka {#analytics}

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Publiczny | Pobierz efektywną konfigurację analityki (klucz PostHog, DSN Sentry, częstotliwość próbkowania). Klucze, DSN i identyfikator instancji są puste, gdy analityka jest wyłączona, zarówno z powodu ustawienia w czasie kompilacji, jak i ustawienia instancji `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Uwierzytelniony | Prześlij wyraźną opinię użytkownika do skonfigurowanego projektu PostHog jako `feedback_submitted`. Trasa respektuje bramkę analityki, ogranicza liczbę zgłoszeń, usuwa pola kontaktowe, chyba że `contactOk` ma wartość true, i nigdy nie akceptuje zawartości plików, nazw plików, ścieżek przesyłania ani surowego, prywatnego tekstu błędu. Gdy analityka jest wyłączona, zwraca `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Administrator (`settings:write`) | Ustaw rezygnację obejmującą całą instancję. Wyślij treść JSON `{ "analyticsEnabled": "false" }`, aby wyłączyć analitykę dla wszystkich, lub `"true"`, aby ją ponownie włączyć. |

## Funkcje / Pakiety AI {#features-ai-bundles}

Zarządzaj pakietami funkcji AI (instaluj/odinstalowuj pakiety modeli AI w środowisku Docker). Preferuj punkt końcowy instalacji na poziomie narzędzia podczas włączania narzędzia z niestandardowej automatyzacji: niektóre narzędzia AI potrzebują więcej niż jednego współdzielonego pakietu, a ten punkt końcowy pomija już zainstalowane pakiety, kolejkując tylko brakujące.

OCR jest opcjonalnym ulepszeniem, a nie stałą zależnością. Poziom `fast` Tesseract działa bez pakietu; `POST /api/v1/admin/features/ocr/install` instaluje podpisany pakiet RapidOCR dla `balanced` i `best` na Linux amd64 lub arm64. Dokładne środowisko wykonawcze OCR wykorzystuje CPU na hostach wyposażonych wyłącznie w procesor i NVIDIA i wymaga co najmniej 4 GiB efektywnej pamięci (skonfigurowany limit kontenera cgroup, w przeciwnym razie pamięć hosta). SnapOtter zgłasza `requiredMemoryBytes`, `effectiveMemoryBytes` i przyczynę kompatybilności `insufficient-memory` i odrzuca niezgodną instalację przed pobraniem. To wymaganie dotyczące pamięci nie dotyczy `fast`. Pakiet zawiera około 208-234 MiB do pobrania i 409-488 MiB do zainstalowania, w zależności od celu; podpisany indeks wiąże dokładne rozmiary wymuszone podczas instalacji.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Uwierzytelniony | Lista wszystkich pakietów funkcji i ich status instalacji |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Administrator (`features:manage`) | Zainstaluj pakiet funkcji (asynchronicznie, zwraca `jobId` do śledzenia postępu) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Administrator (`features:manage`) | Zainstaluj każdy pakiet wymagany przez narzędzie; zwraca status queued/skipped dla poszczególnych pakietów |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Administrator (`features:manage`) | Odinstaluj pakiet funkcji i usuń pliki modeli |
| `GET` | `/api/v1/admin/features/disk-usage` | Administrator (`features:manage`) | Pobierz całkowite zużycie dysku przez modele AI |
| `POST` | `/api/v1/admin/features/import` | Administrator (`features:manage`) | Zaimportuj starszy pakiet AI (`file`) lub podpisaną wersję offline OCR (`index` plus `archive`) |

Import OCR z przerwami powietrznymi musi zawierać podpisany plik `ocr-runtime-index.json` wydania i pasujące archiwum platformy. SnapOtter stosuje tę samą sygnaturę Ed25519, hash artefaktów, kompatybilność, ekstrakcję i kontrole testów dymu, które są używane podczas instalacji online:

```bash
curl -X POST http://localhost:1349/api/v1/admin/features/import \
  -H "Authorization: Bearer <admin-token>" \
  -F "index=@ocr-runtime-index.json" \
  -F "archive=@ocr-linux-amd64-cpu-py312.tar.gz"
```

Użyj archiwum `linux-arm64-cpu-py311` na arm64. Podpisany artefakt innego celu jest odrzucany, a nie instalowany.

## Operacje administracyjne {#admin-operations}

Operacyjne punkty końcowe do obserwowalności, wsparcia, raportowania użycia i statusu kopii zapasowej.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Administrator (`settings:write`) | Odczytaj bieżący poziom logowania w czasie działania |
| `POST` | `/api/v1/admin/log-level` | Administrator (`settings:write`) | Zmień poziom logowania w czasie działania (`fatal`, `error`, `warn`, `info`, `debug`, `trace` lub `silent`) |
| `GET` | `/api/v1/metrics` | Administrator (`system:health`) | Metryki Prometheus w formacie tekstowym |
| `GET` | `/api/v1/admin/support-bundle` | Administrator (`system:health`) | Pobierz zredagowany pakiet diagnostyczny wsparcia ZIP |
| `GET` | `/api/v1/admin/usage` | Administrator (`audit:read`) | Dane pulpitu użycia, z opcjonalnym parametrem zapytania `days` |
| `GET` | `/api/v1/admin/backup-status` | Administrator (`system:health`) | Odczytaj metadane ostatniej kopii zapasowej i status aktualności |
| `POST` | `/api/v1/admin/backup-status` | Administrator (`system:health`) | Zarejestruj ukończoną kopię zapasową (`type`, opcjonalnie `sizeBytes`, opcjonalnie `notes`) |

## API Enterprise {#enterprise-apis}

Te trasy są bramkowane licencją przez powiązaną z nimi funkcję enterprise. Nadal wymagają wymienionego uprawnienia SnapOtter.

**Wbudowany administrator z pełnymi uprawnieniami** oznacza uwierzytelnionego użytkownika z rolą `admin` i pełnym zestawem efektywnych uprawnień administratora. Klucz API, któremu brakuje choć jednego uprawnienia administratora, nie spełnia tego wymagania.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Administrator (`audit:read`) | Eksportuj wpisy audytu jako JSON lub CSV z filtrami |
| `GET` | `/api/v1/enterprise/config/export` | Wbudowany administrator z pełnymi uprawnieniami | Eksportuj zredagowaną konfigurację instancji, niestandardowe role i zespoły |
| `POST` | `/api/v1/enterprise/config/import` | Wbudowany administrator z pełnymi uprawnieniami | Zaimportuj konfigurację, z opcjonalnym przebiegiem próbnym |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Administrator (`security:manage`) | Odczytaj skonfigurowaną listę dozwolonych CIDR |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Administrator (`security:manage`) | Zaktualizuj listę dozwolonych CIDR z ochroną przed zablokowaniem samego siebie |
| `GET` | `/api/v1/enterprise/legal-hold` | Administrator (`compliance:manage`) | Lista blokad prawnych użytkowników i zespołów |
| `PUT` | `/api/v1/enterprise/legal-hold` | Administrator (`compliance:manage`) | Zastosuj lub zwolnij blokadę prawną dla użytkownika lub zespołu |
| `POST` | `/api/v1/enterprise/scim/token` | Administrator (`users:manage`) | Wygeneruj token bearer SCIM, zwracany raz |
| `DELETE` | `/api/v1/enterprise/scim/token` | Administrator (`users:manage`) | Unieważnij bieżący token bearer SCIM |
| `GET` | `/api/v1/enterprise/siem/config` | Administrator (`webhooks:manage`) | Odczytaj konfigurację przekazywania SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Administrator (`webhooks:manage`) | Zaktualizuj konfigurację przekazywania SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Administrator (`webhooks:manage`) | Lista miejsc docelowych webhooków |
| `POST` | `/api/v1/enterprise/webhooks` | Administrator (`webhooks:manage`) | Utwórz miejsce docelowe webhooka |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Administrator (`webhooks:manage`) | Zaktualizuj miejsce docelowe webhooka |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Administrator (`webhooks:manage`) | Usuń miejsce docelowe webhooka |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Administrator (`webhooks:manage`) | Wyślij testowy ładunek webhooka |
| `POST` | `/api/v1/enterprise/users/:id/export` | Administrator (`compliance:manage`) | Rozpocznij zadanie eksportu użytkownika RODO |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Administrator (`compliance:manage`) | Odczytaj status eksportu RODO i adres URL pobierania |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Administrator (`compliance:manage`) | Trwale usuń dane użytkownika po potwierdzeniu |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Administrator (`compliance:manage`) | Trwale usuń dane zespołu po potwierdzeniu |
| `GET` | `/api/v1/admin/version` | Administrator (`system:health`) | Odczytaj metadane wersji aplikacji, kompilacji, Node i schematu |
| `GET` | `/api/v1/admin/migrations/pending` | Administrator (`system:health`) | Porównaj spakowane migracje z zastosowanymi migracjami |
| `GET` | `/api/v1/admin/upgrade-check` | Administrator (`system:health`) | Uruchom kontrole gotowości do aktualizacji |

### SCIM 2.0 {#scim-2-0}

Punkty końcowe wykrywania SCIM są publiczne. Punkty końcowe użytkowników i grup wymagają tokena bearer SCIM wygenerowanego powyżej.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Publiczny | Możliwości serwera SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Publiczny | Wykrywanie schematu SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Publiczny | Wykrywanie typu zasobu SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Token SCIM | Lista użytkowników, z opcjonalnym filtrem SCIM |
| `POST` | `/api/v1/scim/v2/Users` | Token SCIM | Utwórz użytkownika |
| `GET` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Pobierz użytkownika |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Zastąp użytkownika |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Miękka dezaktywacja użytkownika |
| `GET` | `/api/v1/scim/v2/Groups` | Token SCIM | Lista zespołów jako grup SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Token SCIM | Utwórz zespół |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Pobierz zespół |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Zastąp zespół i członkostwo w grupie |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Usuń zespół |

## Szablony memów {#meme-templates}

Wspierające API dla narzędzia generatora memów.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Uwierzytelniony | Lista wszystkich dostępnych szablonów memów z pozycjami pól tekstowych |
| `GET` | `/api/v1/meme-templates/full/:filename` | Uwierzytelniony | Udostępnij obraz szablonu w pełnym rozmiarze |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Uwierzytelniony | Udostępnij miniaturę szablonu |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Uwierzytelniony | Udostępnij plik czcionki używany do renderowania tekstu memu |

## Odpowiedzi z błędami {#error-responses}

Wszystkie błędy zwracają JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Status | Znaczenie |
|--------|---------|
| 400 | Nieprawidłowe żądanie / walidacja nie powiodła się |
| 401 | Brak uwierzytelnienia |
| 403 | Niewystarczające uprawnienia |
| 404 | Nie znaleziono zasobu |
| 413 | Plik zbyt duży (zobacz `MAX_UPLOAD_SIZE_MB`) |
| 422 | Przetwarzanie nie powiodło się po walidacji |
| 429 | Ograniczenie liczby żądań (zobacz `RATE_LIMIT_PER_MIN`) |
| 501 | Wymagany pakiet funkcji AI nie jest zainstalowany (`FEATURE_NOT_INSTALLED`) |
| 500 | Wewnętrzny błąd serwera |

---
description: "Pełna dokumentacja REST API. Punkty końcowe narzędzi, przetwarzanie wsadowe, potoki, biblioteka plików, uwierzytelnianie, zespoły i operacje administracyjne."
i18n_source_hash: eb73a14533a1
i18n_provenance: human
i18n_output_hash: 5edf4af58f52
---

# Dokumentacja REST API {#rest-api-reference}

Interaktywna dokumentacja API z przykładami żądań i odpowiedzi jest dostępna pod adresem [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Specyfikacje do odczytu maszynowego:
- `/api/v1/openapi.yaml` - specyfikacja OpenAPI 3.1
- `/llms.txt` - podsumowanie przyjazne dla LLM
- `/llms-full.txt` - pełna dokumentacja przyjazna dla LLM

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

Sesje wygasają po 7 dniach (konfigurowalne przez `SESSION_DURATION_HOURS`).

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

Klucze mają prefiks `si_` i są przechowywane jako skróty scrypt - surowy klucz jest pokazywany raz i nigdy więcej nie da się go odzyskać.

### Punkty końcowe uwierzytelniania {#auth-endpoints}

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Publiczny | Logowanie, pobranie tokenu sesji |
| `POST` | `/api/auth/logout` | Uwierzytelniony | Zniszczenie bieżącej sesji |
| `GET` | `/api/auth/session` | Uwierzytelniony | Weryfikacja bieżącej sesji |
| `POST` | `/api/auth/change-password` | Uwierzytelniony | Zmiana własnego hasła (unieważnia wszystkie inne sesje i klucze API) |
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
| `GET` | `/api/auth/oidc/login` | Publiczny | Rozpoczęcie logowania OIDC, gdy OIDC jest włączone |
| `GET` | `/api/auth/oidc/callback` | Publiczny | Wywołanie zwrotne autoryzacji OIDC |
| `GET` | `/api/auth/saml/metadata` | Publiczny | XML metadanych SP dla SAML, gdy SAML jest włączone |
| `GET` | `/api/auth/saml/login` | Publiczny | Rozpoczęcie logowania SAML |
| `POST` | `/api/auth/saml/callback` | Publiczny | Usługa konsumenta asercji SAML |

Gdy MFA jest włączone dla użytkownika, `POST /api/auth/login` zwraca `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` zamiast tokenu sesji. Wyślij ten `mfaToken` wraz z kodem TOTP lub kodem odzyskiwania do `/api/auth/mfa/complete`.

### Uprawnienia {#permissions}

| Uprawnienie | Administrator | Użytkownik |
|-----------|:-----:|:----:|
| Korzystanie z narzędzi | ✓ | ✓ |
| Własne pliki/potoki/klucze API | ✓ | ✓ |
| Podgląd plików/potoków/kluczy wszystkich użytkowników | ✓ | - |
| Zapis ustawień | ✓ | - |
| Zarządzanie użytkownikami i zespołami | ✓ | - |
| Zarządzanie brandingiem | ✓ | - |

## Kontrola stanu {#health-check}

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Publiczny | Podstawowa kontrola stanu. Zwraca `{"status":"healthy","version":"..."}` z kodem 200 lub `{"status":"unhealthy"}` z kodem 503, gdy baza danych jest nieosiągalna. |
| `GET` | `/api/v1/readyz` | Publiczny | Sonda gotowości. Sprawdza PostgreSQL, Redis, wolne miejsce na dysku oraz S3, gdy jest skonfigurowane. Zwraca 503, gdy instancja nie powinna przyjmować ruchu. |
| `GET` | `/api/v1/admin/health` | Administrator (`system:health`) | Szczegółowa diagnostyka obejmująca czas działania, tryb przechowywania, status bazy danych, stan kolejki i dostępność GPU. |

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

`<section>` to jedno z `image`, `video`, `audio`, `pdf` lub `files`.

- Przesyłanie odbywa się przez `multipart/form-data`.
- `settings` to ciąg JSON z opcjami specyficznymi dla narzędzia.
- `clientJobId` to opcjonalne pole formularza służące do korelacji postępu dostarczanej przez wywołującego.
- `fileId` to opcjonalne pole formularza odwołujące się do istniejącego elementu biblioteki plików. Gdy jest obecne, przetworzone wyjście jest zapisywane jako nowa wersja, a odpowiedź zawiera `savedFileId`.
- **Szybkie narzędzia** zwykle zwracają 200 JSON: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Pobierz przetworzony plik z `downloadUrl`.
- **Każde narzędzie kolejkowane** może zwrócić 202 JSON, jeśli działa długo lub przekracza synchroniczne okno oczekiwania: `{"jobId":"...","async":true}`. Połącz się z SSE, aby śledzić postęp, a następnie pobierz plik po zakończeniu (zobacz [Śledzenie postępu](#progress-tracking)).
- Trasy **wsadowe** zwracają archiwum ZIP strumieniowane bezpośrednio (z nagłówkiem `X-Job-Id`) dla narzędzi zarejestrowanych w ogólnym rejestrze wsadowym.

## Dokumentacja narzędzi {#tools-reference}

### Ustawienia predefiniowane konwersji {#conversion-presets}

Wspólny katalog zawiera 83 dedykowane punkty końcowe predefiniowanych konwersji, takie jak `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` i `excel-to-csv`. Ustawienia predefiniowane to pełnoprawne trasy narzędzi:

`POST /api/v1/tools/<section>/<presetId>`

Każde ustawienie predefiniowane blokuje format wyjściowy i deleguje do narzędzia bazowego, takiego jak `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` lub `convert-spreadsheet`. Zobacz [Ustawienia predefiniowane konwersji](/pl/tools/conversion-presets), aby poznać pełną tabelę tras i opcjonalne ustawienia.

### Podstawy {#essentials}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `resize` | Zmiana rozmiaru | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, plus 23 ustawienia predefiniowane mediów społecznościowych |
| `crop` | Przycinanie | `left`, `top`, `width`, `height`, `unit` (px/procent) |
| `rotate` | Obrót i odbicie | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Konwersja | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Kompresja | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Optymalizacja {#optimization}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `optimize-for-web` | Optymalizacja dla sieci | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Usuwanie metadanych | - |
| `edit-metadata` | Edycja metadanych | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Zmiana nazw masowa | `pattern` (obsługuje `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Obraz do PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Generator favicon | `padding`, `backgroundColor`, `borderRadius` - generuje wszystkie standardowe rozmiary |

### Regulacje {#adjustments}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `adjust-colors` | Regulacja kolorów | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Wyostrzanie | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Zamiana koloru | `sourceColor`, `targetColor` (zamiennik), `makeTransparent`, `tolerance` |
| `color-blindness` | Symulacja daltonizmu | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, domyślnie "deuteranomaly") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pikselizacja | `blockSize` (2-128), `region` ({left, top, width, height} dla częściowej pikselizacji) |
| `vignette` | Winieta | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Narzędzia AI {#ai-tools}

Wszystkie narzędzia AI działają na Twoim sprzęcie: domyślnie na CPU lub na NVIDIA CUDA, gdy dostępne jest obsługiwane GPU NVIDIA. Akceleracja iGPU Intel/AMD przez VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwana dla wnioskowania AI. Internet nie jest wymagany.

| ID narzędzia | Nazwa | Model AI | Kluczowe ustawienia |
|---------|------|---------|-------------|
| `remove-background` | Usuwanie tła | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Skalowanie obrazu w górę | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Usuwanie obiektów | LaMa (ONNX) | Maska wysyłana jako druga część pliku (nazwa pola `mask`), `format`, `quality` |
| `ocr` | OCR / ekstrakcja tekstu | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Rozmycie twarzy / danych PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Inteligentne przycinanie | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Poprawa jakości obrazu | Oparte na analizie | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Poprawa twarzy | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Koloryzacja AI | DDColor | `intensity`, `model` |
| `noise-removal` | Usuwanie szumu | Wielopoziomowe odszumianie | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Usuwanie czerwonych oczu | Punkty charakterystyczne twarzy + analiza koloru | `sensitivity`, `strength` |
| `restore-photo` | Renowacja zdjęć | Wieloetapowy potok | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Zdjęcie paszportowe | Punkty charakterystyczne MediaPipe | Przepływ dwufazowy. Analiza używa multipart `file`; generowanie używa JSON z `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), punktami charakterystycznymi, wymiarami obrazu |
| `content-aware-resize` | Zmiana rozmiaru z uwzględnieniem treści | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Naprawa przezroczystości PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Zamiana tła | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Rozmycie tła | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Rozszerzanie płótna AI | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Znak wodny i nakładka {#watermark-overlay}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `watermark-text` | Tekstowy znak wodny | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Obrazkowy znak wodny | `opacity`, `position`, `scale` - drugi plik to znak wodny |
| `text-overlay` | Nakładka tekstowa | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Kompozycja obrazu | `x`, `y`, `opacity`, `blend` - drugi plik jest nakładany na wierzch |
| `meme-generator` | Generator memów | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Obsługuje tryb szablonu (treść JSON z `templateId`) lub tryb obrazu niestandardowego (multipart z plikiem). |

### Narzędzia pomocnicze {#utilities}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `info` | Informacje o obrazie | - (zwraca szerokość, wysokość, format, rozmiar, kanały, hasAlpha, DPI, EXIF) |
| `compare` | Porównanie obrazów | `mode` (side-by-side/overlay/diff), `diffThreshold` - drugi plik to cel porównania |
| `find-duplicates` | Wyszukiwanie duplikatów | `threshold` (odległość skrótu percepcyjnego, domyślnie 8) - wiele plików |
| `color-palette` | Paleta kolorów | `count` (liczba dominujących kolorów), `format` (hex/rgb) |
| `qr-generate` | Generator kodów QR | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (opcjonalny plik) |
| `barcode-read` | Czytnik kodów kreskowych | - (automatycznie wykrywa QR, EAN, Code128, DataMatrix itd.) |
| `image-to-base64` | Obraz do Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML do obrazu | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogram | `scale` (linear/log) - zwraca wykres histogramu RGB + statystyki na kanał |
| `lqip-placeholder` | Zastępczy obraz LQIP | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Generator kodów kreskowych | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Treść JSON, bez przesyłania pliku. |

### Układ i kompozycja {#layout-composition}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `collage` | Kolaż / siatka | `template` (25+ układów), `gap`, `backgroundColor`, `borderRadius` - wiele plików |
| `stitch` | Sklejanie / łączenie | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - wiele plików |
| `split` | Dzielenie obrazu | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Obramowanie i ramka | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Upiększanie zrzutu ekranu | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Przycinanie do koła | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Dopełnianie obrazu | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Arkusz sprite'ów | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - wiele plików (2-64 obrazy) |

### Format i konwersja {#format-conversion}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `svg-to-raster` | SVG do rastra | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Obraz do SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | Narzędzia GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), parametry zależne od akcji |
| `gif-webp` | Konwerter GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Narzędzia wideo {#video-tools}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `convert-video` | Konwersja wideo | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Kompresja wideo | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Przycinanie wideo | `startS`, `endS`, `precise` (bool, cięcie z dokładnością do klatki) |
| `mute-video` | Wyciszenie wideo | - |
| `video-to-gif` | Wideo do GIF | `fps` (1-30), `width`, `startS`, `durationS` (maks. 60s) |
| `resize-video` | Zmiana rozmiaru wideo | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Przycinanie kadru wideo | `width`, `height`, `x`, `y` |
| `rotate-video` | Obrót wideo | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Zmiana FPS | `fps` (1-120) |
| `video-color` | Kolor wideo | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Prędkość wideo | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Odwrócenie wideo | - (maks. 5 minut) |
| `video-loudnorm` | Normalizacja dźwięku | - (EBU R128) |
| `aspect-pad` | Dopełnienie proporcji | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Dopełnienie rozmyciem | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Znak wodny wideo | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Stabilizacja wideo | `smoothing` (5-60, w klatkach) |
| `gif-to-video` | GIF do wideo | `format` (mp4/webm/mov) |
| `video-to-webp` | Wideo do WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Wideo do klatek | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Łączenie filmów | - (wiele plików, znormalizowane do rozdzielczości pierwszego filmu) |
| `replace-audio` | Zamiana dźwięku | - (plik wideo + plik audio, dwa pliki) |
| `burn-subtitles` | Wypalenie napisów | `fontSize` (8-72) - plik wideo + plik napisów |
| `embed-subtitles` | Osadzenie napisów | `language` (kod ISO 639-2/B) - plik wideo + plik napisów |
| `extract-subtitles` | Ekstrakcja napisów | - (wyjście SRT) |
| `images-to-video` | Obrazy do wideo | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - wiele plików |
| `video-metadata` | Czyszczenie metadanych wideo | - |
| `auto-subtitles` | Napisy automatyczne (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Ekstrakcja dźwięku | `format` (mp3/wav/m4a/ogg) |

### Narzędzia audio {#audio-tools}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `convert-audio` | Konwersja audio | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Przycinanie audio | `startS`, `endS` |
| `volume-adjust` | Regulacja głośności | `gainDb` (-30 do 30) |
| `normalize-audio` | Normalizacja dźwięku | - (EBU R128, -16 LUFS) |
| `fade-audio` | Płynne przejście audio | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Odwrócenie audio | - |
| `audio-speed` | Prędkość audio | `factor` (0.25-4) |
| `pitch-shift` | Zmiana wysokości dźwięku | `semitones` (-12 do 12) |
| `audio-channels` | Kanały audio | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Usuwanie ciszy | `thresholdDb` (-80 do -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Redukcja szumu | `strength` (light/medium/strong) |
| `merge-audio` | Łączenie audio | `format` (mp3/wav/flac/m4a) - wiele plików |
| `split-audio` | Dzielenie audio | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Kreator dzwonków | `startS`, `durationS` (1-30) |
| `waveform-image` | Obraz przebiegu | `width`, `height`, `color` (hex) |
| `audio-metadata` | Metadane audio | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Transkrypcja audio (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Narzędzia dokumentów {#document-tools}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `merge-pdf` | Łączenie plików PDF | - (wiele plików, do 20 PDF) |
| `split-pdf` | Dzielenie PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Kompresja PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Obrót PDF | `angle` (90/180/270), `range` (zakres stron) |
| `extract-pages` | Wyodrębnienie stron | `range` (składnia qpdf, np. "1-5,8,10-z") |
| `remove-pages` | Usuwanie stron | `pages` (zakres qpdf do usunięcia) |
| `organize-pdf` | Porządkowanie PDF | `order` (kolejność stron qpdf, np. "3,1,2,5-z") |
| `protect-pdf` | Ochrona PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Odblokowanie PDF | `password` |
| `repair-pdf` | Naprawa PDF | - |
| `linearize-pdf` | Optymalizacja PDF dla sieci | - (linearyzacja dla szybkiego przeglądania w sieci) |
| `grayscale-pdf` | PDF w skali szarości | - |
| `pdfa-convert` | Konwersja PDF/A | - (archiwalny PDF/A-2) |
| `crop-pdf` | Przycinanie PDF | `margin` (0-2000 punktów) |
| `nup-pdf` | PDF N-up | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Broszura PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Znak wodny PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Numery stron PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Spłaszczanie PDF | - (utrwala formularze i adnotacje) |
| `redact-pdf` | Redagowanie PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Podpisywanie PDF | Niestandardowa trasa multipart z PDF `file`, plikami podpisów `sig0`, `sig1` oraz tablicą JSON `placements` |
| `pdf-to-text` | PDF do tekstu | - |
| `pdf-to-word` | PDF do Word | - |
| `pdf-metadata` | Metadane PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Konwersja dokumentu | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Konwersja prezentacji | `format` (pptx/odp) |
| `convert-spreadsheet` | Konwersja arkusza kalkulacyjnego | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel do PDF | - |
| `word-to-pdf` | Word do PDF | - |
| `powerpoint-to-pdf` | PowerPoint do PDF | - |
| `html-to-pdf` | HTML do PDF | - (zasoby zdalne wyłączone) |
| `markdown-to-docx` | Markdown do Word | - |
| `markdown-to-html` | Markdown do HTML | - |
| `markdown-to-pdf` | Markdown do PDF | - (zasoby zdalne wyłączone) |
| `epub-convert` | Konwersja EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Konwersja do EPUB | - (akceptuje .docx, .md, .html, .txt) |
| `ocr-pdf` | OCR PDF (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF do obrazu | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF do JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF do PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF do TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Narzędzia plikowe {#file-tools}

| ID narzędzia | Nazwa | Kluczowe ustawienia |
|---------|------|-------------|
| `chart-maker` | Kreator wykresów | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV do Excel | `sheet` (numer arkusza dla wejścia XLSX) - dwukierunkowe |
| `csv-json` | CSV do JSON | `pretty` (bool) - dwukierunkowe |
| `json-xml` | JSON do XML | `pretty` (bool) - dwukierunkowe |
| `split-csv` | Dzielenie CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Łączenie plików CSV | - (wiele plików, pasujące kolumny) |
| `yaml-json` | YAML / JSON | - (dwukierunkowe) |
| `xml-to-csv` | XML do CSV | - (automatycznie znajduje powtarzające się elementy) |
| `excel-to-csv` | Excel do CSV | dedykowane ustawienie predefiniowane konwersji oparte na `convert-spreadsheet` |
| `create-zip` | Utworzenie ZIP | - (wiele plików, 2-50 plików) |
| `extract-zip` | Wypakowanie ZIP | - (chronione przed bombą) |

### HTML do obrazu {#html-to-image}

Przechwyć stronę internetową jako obraz. W przeciwieństwie do innych narzędzi ten punkt końcowy przyjmuje `application/json` zamiast danych formularza multipart (przesyłanie pliku nie jest potrzebne).

**Punkt końcowy:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `url` | string | (wymagane) | URL do przechwycenia (tylko http/https) |
| `format` | string | `"png"` | Format wyjściowy: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Jakość 1-100 (tylko JPG/WebP) |
| `fullPage` | boolean | `false` | Przechwycenie całej przewijalnej strony |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Niestandardowa szerokość okna 320-3840 |
| `viewportHeight` | number | `720` | Niestandardowa wysokość okna 320-2160 |

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
| `GET` | `/api/v1/tools/popular` | Zwraca ID popularnych narzędzi, wracając do wyselekcjonowanej listy domyślnej, gdy dane o użyciu są skąpe |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Zastosowanie efektów tła (color/gradient/blur/shadow) bez ponownego uruchamiania AI. Używa maski z pamięci podręcznej z początkowego usunięcia. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Odczyt istniejących metadanych EXIF/IPTC/XMP z obrazu |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Inspekcja pól metadanych przed usunięciem |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Faza 1: wykrywanie twarzy AI + usuwanie tła. Zwraca punkty charakterystyczne twarzy i dane z pamięci podręcznej. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Faza 2: przycinanie, zmiana rozmiaru i kafelkowanie z użyciem analizy z pamięci podręcznej. Bez ponownego uruchamiania AI. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Pobranie metadanych GIF (liczba klatek, wymiary, czas trwania) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Pobranie metadanych PDF (liczba stron, wymiary) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Wygenerowanie podglądu konkretnej strony PDF |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Pobranie metadanych PDF dla dedykowanego ustawienia predefiniowanego JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Wygenerowanie podglądu strony PDF w ustawieniu predefiniowanym JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Pobranie metadanych PDF dla dedykowanego ustawienia predefiniowanego PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Wygenerowanie podglądu strony PDF w ustawieniu predefiniowanym PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Pobranie metadanych PDF dla dedykowanego ustawienia predefiniowanego TIFF |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Wygenerowanie podglądu strony PDF w ustawieniu predefiniowanym TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Wsadowa konwersja wielu plików SVG do rastra |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Analiza jakości obrazu i zwrócenie rekomendacji poprawy |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Lekki podgląd do strojenia parametrów na żywo. Zwraca zoptymalizowany obraz z nagłówkami rozmiaru. |

## Przetwarzanie wsadowe {#batch-processing}

Zastosuj ogólne narzędzie obsługujące tryb wsadowy do wielu plików naraz. Zwraca archiwum ZIP. Niestandardowe trasy wieloplikowe lub wieloetapowe, takie jak podpisywanie PDF, OCR PDF i trasy ustawień predefiniowanych PDF do obrazu, używają własnego kontraktu punktu końcowego zamiast ogólnej trasy `/batch`.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Współbieżnością steruje `CONCURRENT_JOBS` (domyślnie: automatycznie wykrywana z rdzeni CPU). `MAX_BATCH_SIZE` ogranicza liczbę plików na partię (domyślnie: 100; ustaw 0 dla braku limitu).

## Potoki {#pipelines}

### Uruchomienie potoku {#execute-a-pipeline}

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

Wyjście każdego kroku jest wejściem następnego kroku. Potoki domyślnie dopuszczają 20 kroków, konfigurowalne przez `MAX_PIPELINE_STEPS`. Ustaw `MAX_PIPELINE_STEPS=0`, aby usunąć limit.

### Zapisywanie potoków i zarządzanie nimi {#save-and-manage-pipelines}

| Metoda | Ścieżka | Opis |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Zapisanie nazwanego potoku (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Lista zapisanych potoków (administratorzy widzą wszystkie; użytkownicy widzą własne) |
| `DELETE` | `/api/v1/pipeline/:id` | Usunięcie (właściciel lub administrator) |
| `GET` | `/api/v1/pipeline/tools` | Lista ID narzędzi ważnych dla kroków potoku |

## Śledzenie postępu {#progress-tracking}

Długo działające zadania, narzędzia kolejkowane, zadania wsadowe i potoki emitują postęp w czasie rzeczywistym przez Server-Sent Events. Strumień postępu jest publiczny i identyfikowany przez ID zadania, więc klienci nie muszą wysyłać nagłówka Authorization, aby go odczytać.

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

Możesz zażądać anulowania zadania w kolejce lub działającego za pomocą `POST /api/v1/jobs/:jobId/cancel`. Odpowiedź to `{"canceled":true|false}`.

## Biblioteka plików {#file-library}

Trwałe przechowywanie plików z historią wersji.

| Metoda | Ścieżka | Opis |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Przesłanie plików do obszaru roboczego (tymczasowe przetwarzanie) |
| `POST` | `/api/v1/files/upload` | Przesłanie plików do trwałej biblioteki plików |
| `POST` | `/api/v1/files/save-result` | Zapisanie wyniku przetwarzania narzędzia jako nowej wersji pliku |
| `GET` | `/api/v1/files` | Lista zapisanych plików (stronicowana, z wyszukiwaniem) |
| `GET` | `/api/v1/files/:id` | Pobranie metadanych pliku + łańcucha wersji |
| `GET` | `/api/v1/files/:id/download` | Pobranie pliku |
| `GET` | `/api/v1/files/:id/thumbnail` | Pobranie miniatury JPEG 300px |
| `DELETE` | `/api/v1/files` | Masowe usuwanie plików i ich łańcuchów wersji (treść: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Pobranie zdalnych adresów URL do obszaru roboczego dla importów opartych na URL |
| `POST` | `/api/v1/preview` | Wygenerowanie podglądu WebP zgodnego z przeglądarką (dla formatów HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Strumieniowanie buforowanego lub wygenerowanego podglądu zgodnego z przeglądarką dla zapisanego pliku PDF, dokumentu biurowego, wideo lub audio |
| `POST` | `/api/v1/preview/generate` | Wygenerowanie na żądanie podglądu MP4 lub MP3 dla przesłanego pliku multimedialnego bez jego wcześniejszego zapisania |
| `GET` | `/api/v1/download/:jobId/:filename` | Pobranie przetworzonego pliku z obszaru roboczego |

Aby automatycznie zapisać wynik narzędzia do biblioteki, dołącz `fileId` jako pole formularza multipart odwołujące się do istniejącego pliku biblioteki. Przetworzony wynik zostanie zapisany jako nowa wersja.

## Zarządzanie kluczami API {#api-key-management}

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Uwierzytelniony | Wygenerowanie nowego klucza - pokazywany raz |
| `GET` | `/api/v1/api-keys` | Uwierzytelniony | Lista kluczy (name, id, lastUsedAt - bez surowego klucza) |
| `DELETE` | `/api/v1/api-keys/:id` | Uwierzytelniony | Usunięcie klucza |

## Zespoły {#teams}

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Administrator (`teams:manage`) | Lista zespołów |
| `POST` | `/api/v1/teams` | Administrator (`teams:manage`) | Utworzenie zespołu |
| `PUT` | `/api/v1/teams/:id` | Administrator (`teams:manage`) | Zmiana nazwy zespołu |
| `DELETE` | `/api/v1/teams/:id` | Administrator (`teams:manage`) | Usunięcie zespołu (nie można usunąć domyślnego zespołu ani zespołów z członkami) |

## Ustawienia {#settings}

Konfiguracja klucz-wartość w czasie działania (odczyt przez dowolnego uwierzytelnionego użytkownika, zapis tylko przez administratora).

| Metoda | Ścieżka | Opis |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Pobranie wszystkich ustawień |
| `PUT` | `/api/v1/settings` | Masowa aktualizacja ustawień (treść JSON z parami klucz-wartość) |
| `GET` | `/api/v1/settings/:key` | Pobranie konkretnego ustawienia po kluczu |

Znane klucze: `disabledTools` (tablica JSON ID narzędzi), `enableExperimentalTools` (ciąg bool), `loginAttemptLimit` (liczba).

## Preferencje {#preferences}

Preferencje poszczególnych użytkowników są oddzielone od ustawień instancji. Każdy uwierzytelniony użytkownik może odczytywać i aktualizować własną mapę preferencji.

| Metoda | Ścieżka | Opis |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Pobranie preferencji bieżącego użytkownika jako `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Wstawienie lub aktualizacja jednego lub więcej kluczy preferencji dla bieżącego użytkownika |

## Role {#roles}

Zarządzanie rolami niestandardowymi z granularnymi uprawnieniami.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Administrator (`audit:read`) | Lista wszystkich ról z liczbą użytkowników |
| `POST` | `/api/v1/roles` | Administrator (`security:manage`) | Utworzenie roli niestandardowej (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Administrator (`security:manage`) | Aktualizacja roli niestandardowej (nie można modyfikować ról wbudowanych) |
| `DELETE` | `/api/v1/roles/:id` | Administrator (`security:manage`) | Usunięcie roli niestandardowej (nie można usuwać ról wbudowanych; dotknięci użytkownicy wracają do roli `user`) |

Dostępne uprawnienia (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Dziennik audytu {#audit-log}

Punkt końcowy tylko dla administratorów do przeglądania działań istotnych dla bezpieczeństwa.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Administrator (`audit:read`) | Stronicowany dziennik audytu z opcjonalnymi filtrami |

Parametry zapytania:

| Parametr | Opis |
|-----------|-------------|
| `page` | Numer strony (domyślnie: 1) |
| `limit` | Wpisy na stronę (domyślnie: 50, maks.: 100) |
| `action` | Filtr według typu akcji (np. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Filtr według źródłowego adresu IP |
| `from` | Filtr wpisów po tej dacie ISO 8601 |
| `to` | Filtr wpisów przed tą datą ISO 8601 |

## Analityka {#analytics}

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Publiczny | Pobranie efektywnej konfiguracji analityki (klucz PostHog, DSN Sentry, częstotliwość próbkowania). Klucze, DSN i ID instancji są puste, gdy analityka jest wyłączona, czy to z wypieczenia w czasie kompilacji, czy z ustawienia instancji `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Uwierzytelniony | Przesłanie jawnej opinii użytkownika do skonfigurowanego projektu PostHog jako `feedback_submitted`. Trasa respektuje bramkę analityki, ogranicza liczbę zgłoszeń, usuwa pola kontaktowe, chyba że `contactOk` ma wartość true, i nigdy nie przyjmuje zawartości plików, nazw plików, ścieżek przesyłania ani surowego prywatnego tekstu błędu. Gdy analityka jest wyłączona, zwraca `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Administrator (`settings:write`) | Ustawienie rezygnacji obejmującej całą instancję. Wyślij treść JSON `{ "analyticsEnabled": "false" }`, aby wyłączyć analitykę dla wszystkich, lub `"true"`, aby ją ponownie włączyć. |

## Funkcje / pakiety AI {#features-ai-bundles}

Zarządzanie pakietami funkcji AI (instalacja/deinstalacja pakietów modeli AI w środowisku Docker).

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Uwierzytelniony | Lista wszystkich pakietów funkcji i ich statusu instalacji |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Administrator (`features:manage`) | Instalacja pakietu funkcji (asynchronicznie, zwraca `jobId` do śledzenia postępu) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Administrator (`features:manage`) | Deinstalacja pakietu funkcji i wyczyszczenie plików modeli |
| `GET` | `/api/v1/admin/features/disk-usage` | Administrator (`features:manage`) | Pobranie całkowitego zużycia dysku przez modele AI |
| `POST` | `/api/v1/admin/features/import` | Administrator (`features:manage`) | Import archiwum pakietu AI offline |

## Operacje administracyjne {#admin-operations}

Punkty końcowe operacyjne do obserwowalności, wsparcia, raportowania użycia i statusu kopii zapasowych.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Administrator (`settings:write`) | Odczyt bieżącego poziomu logowania w czasie działania |
| `POST` | `/api/v1/admin/log-level` | Administrator (`settings:write`) | Zmiana poziomu logowania w czasie działania (`fatal`, `error`, `warn`, `info`, `debug`, `trace` lub `silent`) |
| `GET` | `/api/v1/metrics` | Administrator (`system:health`) | Metryki Prometheus w formacie tekstowym |
| `GET` | `/api/v1/admin/support-bundle` | Administrator (`system:health`) | Pobranie zredagowanego diagnostycznego pakietu wsparcia ZIP |
| `GET` | `/api/v1/admin/usage` | Administrator (`audit:read`) | Dane pulpitu użycia, z opcjonalnym parametrem zapytania `days` |
| `GET` | `/api/v1/admin/backup-status` | Administrator (`system:health`) | Odczyt metadanych ostatniej kopii zapasowej i statusu aktualności |
| `POST` | `/api/v1/admin/backup-status` | Administrator (`system:health`) | Zarejestrowanie ukończonej kopii zapasowej (`type`, opcjonalnie `sizeBytes`, opcjonalnie `notes`) |

## API enterprise {#enterprise-apis}

Te trasy są bramkowane licencją przez powiązaną z nimi funkcję enterprise. Nadal wymagają wymienionego uprawnienia SnapOtter.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Administrator (`audit:read`) | Eksport wpisów audytu jako JSON lub CSV z filtrami |
| `GET` | `/api/v1/enterprise/config/export` | Administrator (`system:health`) | Eksport zredagowanej konfiguracji instancji, ról niestandardowych i zespołów |
| `POST` | `/api/v1/enterprise/config/import` | Administrator (`system:health`) | Import konfiguracji, z opcjonalnym uruchomieniem próbnym |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Administrator (`security:manage`) | Odczyt skonfigurowanej listy dozwolonych CIDR |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Administrator (`security:manage`) | Aktualizacja listy dozwolonych CIDR z zapobieganiem samozablokowaniu |
| `GET` | `/api/v1/enterprise/legal-hold` | Administrator (`compliance:manage`) | Lista blokad prawnych użytkowników i zespołów |
| `PUT` | `/api/v1/enterprise/legal-hold` | Administrator (`compliance:manage`) | Nałożenie lub zniesienie blokady prawnej dla użytkownika lub zespołu |
| `POST` | `/api/v1/enterprise/scim/token` | Administrator (`users:manage`) | Wygenerowanie tokenu bearer SCIM, zwracanego raz |
| `DELETE` | `/api/v1/enterprise/scim/token` | Administrator (`users:manage`) | Unieważnienie bieżącego tokenu bearer SCIM |
| `GET` | `/api/v1/enterprise/siem/config` | Administrator (`webhooks:manage`) | Odczyt konfiguracji przekazywania SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Administrator (`webhooks:manage`) | Aktualizacja konfiguracji przekazywania SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Administrator (`webhooks:manage`) | Lista miejsc docelowych webhooków |
| `POST` | `/api/v1/enterprise/webhooks` | Administrator (`webhooks:manage`) | Utworzenie miejsca docelowego webhooka |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Administrator (`webhooks:manage`) | Aktualizacja miejsca docelowego webhooka |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Administrator (`webhooks:manage`) | Usunięcie miejsca docelowego webhooka |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Administrator (`webhooks:manage`) | Wysłanie testowego ładunku webhooka |
| `POST` | `/api/v1/enterprise/users/:id/export` | Administrator (`compliance:manage`) | Rozpoczęcie zadania eksportu użytkownika RODO |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Administrator (`compliance:manage`) | Odczyt statusu eksportu RODO i adresu URL do pobrania |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Administrator (`compliance:manage`) | Trwałe usunięcie danych użytkownika po potwierdzeniu |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Administrator (`compliance:manage`) | Trwałe usunięcie danych zespołu po potwierdzeniu |
| `GET` | `/api/v1/admin/version` | Administrator (`system:health`) | Odczyt metadanych wersji aplikacji, kompilacji, Node i schematu |
| `GET` | `/api/v1/admin/migrations/pending` | Administrator (`system:health`) | Porównanie spakowanych migracji z zastosowanymi migracjami |
| `GET` | `/api/v1/admin/upgrade-check` | Administrator (`system:health`) | Uruchomienie kontroli gotowości do aktualizacji |

### SCIM 2.0 {#scim-2-0}

Punkty końcowe wykrywania SCIM są publiczne. Punkty końcowe użytkowników i grup wymagają wygenerowanego powyżej tokenu bearer SCIM.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Publiczny | Możliwości serwera SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Publiczny | Wykrywanie schematów SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Publiczny | Wykrywanie typów zasobów SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Token SCIM | Lista użytkowników, z opcjonalnym filtrem SCIM |
| `POST` | `/api/v1/scim/v2/Users` | Token SCIM | Utworzenie użytkownika |
| `GET` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Pobranie użytkownika |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Zastąpienie użytkownika |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Miękka dezaktywacja użytkownika |
| `GET` | `/api/v1/scim/v2/Groups` | Token SCIM | Lista zespołów jako grup SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Token SCIM | Utworzenie zespołu |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Pobranie zespołu |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Zastąpienie zespołu i członkostwa w grupie |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Usunięcie zespołu |

## Szablony memów {#meme-templates}

Wspierające API dla narzędzia generatora memów.

| Metoda | Ścieżka | Dostęp | Opis |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Uwierzytelniony | Lista wszystkich dostępnych szablonów memów z pozycjami pól tekstowych |
| `GET` | `/api/v1/meme-templates/full/:filename` | Uwierzytelniony | Udostępnienie pełnowymiarowego obrazu szablonu |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Uwierzytelniony | Udostępnienie miniatury szablonu |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Uwierzytelniony | Udostępnienie pliku czcionki używanego do renderowania tekstu memów |

## Odpowiedzi błędów {#error-responses}

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
| 413 | Plik za duży (zobacz `MAX_UPLOAD_SIZE_MB`) |
| 422 | Przetwarzanie nie powiodło się po walidacji |
| 429 | Ograniczono liczbę żądań (zobacz `RATE_LIMIT_PER_MIN`) |
| 501 | Wymagany pakiet funkcji AI nie jest zainstalowany (`FEATURE_NOT_INSTALLED`) |
| 500 | Wewnętrzny błąd serwera |

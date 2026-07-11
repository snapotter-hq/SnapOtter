---
description: "Dokumentacja silnika AI ze wszystkimi lokalnymi narzędziami ML. Usuwanie tła, powiększanie, OCR, wykrywanie twarzy, renowacja zdjęć i więcej."
i18n_source_hash: 14728c1dcd05
i18n_provenance: machine
i18n_output_hash: d38bde507e84
---

# Dokumentacja silnika AI {#ai-engine-reference}

Pakiet `@snapotter/ai` łączy Node.js z **trwałym procesem pomocniczym Pythona (sidecar)** dla wszystkich operacji ML. Proces dyspozytora pozostaje aktywny między żądaniami, co zapewnia szybkie działanie z rozgrzanego startu. NVIDIA CUDA jest automatycznie wykrywana przy uruchomieniu i używana, gdy jest dostępna; w przeciwnym razie narzędzia AI działają na CPU.

Przyspieszenie iGPU Intel/AMD za pośrednictwem VA-API, Quick Sync lub OpenCL nie jest obecnie obsługiwane dla wnioskowania AI. Mapowanie `/dev/dri` do kontenera nie przyspiesza tych narzędzi procesu pomocniczego Pythona, chyba że dostępny jest GPU NVIDIA obsługujący CUDA.

19 narzędzi AI procesu pomocniczego Pythona w czterech modalnościach (obraz, dźwięk, wideo, dokument), plus 2 narzędzia z opcjonalnymi funkcjami AI. Wszystkie modele działają lokalnie - po początkowym pobraniu modeli internet nie jest wymagany.

## Architektura {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

Oddzielny profil dyspozytora "docs" zastępuje listę dozwolonych AI skryptami do przetwarzania dokumentów (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) i pomija ciężkie importy ML.

**Limity czasu:** 300 s domyślnie; OCR i usuwanie tła BiRefNet otrzymują 600 s.

## Pakiety funkcji {#feature-bundles}

Modele AI są pakowane według współdzielonego stosu zależności, a nie jako jedno archiwum na narzędzie. Pakiet funkcji może włączyć kilka narzędzi, gdy używają tej samej rodziny modeli, tych samych pakietów wheel Pythona lub natywnych bibliotek. Utrzymuje to mniejszy rozmiar wydania obrazu Docker i pozwala uniknąć przechowywania zduplikowanych kopii tych samych modeli mattingu tła, wykrywania twarzy, OCR, renowacji i mowy.

Obraz Docker dostarcza aplikację oraz wspólne środowisko uruchomieniowe. Duże archiwa modeli są pobierane na żądanie do trwałego woluminu `/data/ai`, a następnie ponownie wykorzystywane przez każde narzędzie, które ich potrzebuje. Jeśli pakiet jest już zainstalowany, ponieważ inne narzędzie go potrzebowało, włączenie nowego zależnego narzędzia nie powoduje ponownego pobrania tego pakietu.

Każde narzędzie AI wymaga jednego lub więcej pakietów funkcji, zanim będzie mogło działać. Interfejs administratora instaluje według narzędzia poprzez `POST /api/v1/admin/tools/:toolId/features/install`, które rozwiązuje pełną listę pakietów, pomija pakiety już zainstalowane i kolejkuje tylko brakujące pobrania. Na przykład włączenie Zdjęcia paszportowego na świeżej instancji kolejkuje `background-removal` i `face-detection`; włączenie go po zainstalowaniu już Usuwania tła kolejkuje tylko `face-detection`.

| Pakiet | Rozmiar | Współdzielona grupa zależności | Narzędzia, które go używają |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | matting tła rembg / BiRefNet | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | wykrywanie twarzy i punktów charakterystycznych MediaPipe | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | inpainting/outpainting LaMa oraz DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, odszumianie | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | naprawa rys i potok renowacji | restore-photo |
| `ocr` | 5-6 GB | stos OCR PaddleOCR / Tesseract | ocr, ocr-pdf |
| `transcription` | ~600 MB | modele mowy na tekst faster-whisper | transcribe-audio, auto-subtitles |

Narzędzia z zależnościami międzypakietowymi:

| Narzędzie | Wymagane pakiety | Dlaczego |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Usuwa tło, a następnie używa punktów charakterystycznych twarzy do wykadrowania zgodnie z zasadami zdjęć paszportowych i dowodowych. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Wykrywa twarze przed uruchomieniem ulepszenia GFPGAN lub CodeFormer na wybranych obszarach twarzy. |

Narzędzie jest dostępne tylko wtedy, gdy zainstalowane są wszystkie jego wymagane pakiety. Częściowe instalacje są prawidłowe i obsługiwane przyrostowo: zainstalowane pakiety są ponownie wykorzystywane, brakujące pakiety są pokazywane jako pobrania, a zakolejkowane instalacje uruchamiają się pojedynczo, aby współdzielone środowisko Pythona nie było modyfikowane równocześnie.

---

## Usuwanie tła {#background-removal}

**Trasa narzędzia:** `remove-background`  
**Model:** rembg z BiRefNet (domyślnie) lub warianty U2-Net

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `model` | string | - | Wariant modelu (opcjonalne nadpisanie) |
| `backgroundType` | string | `"transparent"` | Jeden z: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Kolor hex dla jednolitego tła |
| `gradientColor1` | string | - | Pierwszy kolor gradientu |
| `gradientColor2` | string | - | Drugi kolor gradientu |
| `gradientAngle` | number | - | Kąt gradientu w stopniach |
| `blurEnabled` | boolean | - | Włącz efekt rozmycia tła |
| `blurIntensity` | number (0-100) | - | Intensywność rozmycia |
| `shadowEnabled` | boolean | - | Włącz cień pod obiektem |
| `shadowOpacity` | number (0-100) | - | Krycie cienia |
| `outputFormat` | string | - | Format wyjściowy: `png`, `webp` lub `avif` |
| `edgeRefine` | integer (0-3) | - | Poziom wygładzania krawędzi |
| `decontaminate` | boolean | - | Usuń przenikanie koloru z krawędzi |

## Zamiana tła {#background-replace}

**Trasa narzędzia:** `background-replace`  
**Model:** rembg / BiRefNet (współdzielony z remove-background)

Usuwa tło i zastępuje je jednolitym kolorem lub gradientem.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Tryb tła |
| `color` | string | `"#ffffff"` | Kolor hex tła (gdy `backgroundType` to `color`) |
| `gradientColor1` | string | - | Pierwszy kolor hex gradientu |
| `gradientColor2` | string | - | Drugi kolor hex gradientu |
| `gradientAngle` | integer (0-360) | `180` | Kąt gradientu w stopniach |
| `feather` | integer (0-20) | `0` | Promień wtapiania krawędzi |
| `format` | `"png"` \| `"webp"` | `"png"` | Format wyjściowy |

## Rozmycie tła {#blur-background}

**Trasa narzędzia:** `blur-background`  
**Model:** rembg / BiRefNet (współdzielony z remove-background)

Rozmywa tło, zachowując ostrość obiektu.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Intensywność rozmycia |
| `feather` | integer (0-20) | `0` | Promień wtapiania krawędzi |
| `format` | `"png"` \| `"webp"` | `"png"` | Format wyjściowy |

## Powiększanie obrazu {#image-upscaling}

**Trasa narzędzia:** `upscale`  
**Model:** RealESRGAN (z rezerwowym Lanczos, gdy niedostępny)

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Współczynnik powiększenia |
| `model` | string | `"auto"` | Wariant modelu |
| `faceEnhance` | boolean | `false` | Zastosuj przebieg ulepszania twarzy GFPGAN |
| `denoise` | number | `0` | Siła odszumiania |
| `format` | string | `"auto"` | Nadpisanie formatu wyjściowego |
| `quality` | number | `95` | Jakość wyjściowa (1-100) |

## OCR / Wyodrębnianie tekstu {#ocr-text-extraction}

**Trasa narzędzia:** `ocr`  
**Modele:** Tesseract (szybki), PaddleOCR PP-OCRv5 (zrównoważony), PaddleOCR-VL 1.5 (najlepszy)

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Poziom przetwarzania |
| `language` | string | `"auto"` | Język: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Wstępnie przetwórz obraz, aby poprawić dokładność OCR |
| `engine` | string | - | Przestarzałe. Mapuje `tesseract` na `fast`, `paddleocr` na `balanced` |

Zwraca uporządkowane wyniki z ramkami ograniczającymi, wynikami pewności i wyodrębnionymi blokami tekstu.

## OCR PDF {#pdf-ocr}

**Trasa narzędzia:** `ocr-pdf`  
**Modele:** Ten sam system poziomów co OCR obrazu

Wyodrębnia tekst ze skanowanych dokumentów PDF przy użyciu OCR wspieranego przez AI, strona po stronie.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Poziom przetwarzania |
| `language` | string | `"auto"` | Język: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Wybór stron: `"all"`, `"1-3"`, `"1,3,5"` |

## Rozmycie twarzy / danych osobowych {#face-pii-blur}

**Trasa narzędzia:** `blur-faces`  
**Model:** wykrywanie twarzy MediaPipe

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Promień rozmycia gaussowskiego |
| `sensitivity` | number (0-1) | `0.5` | Próg pewności wykrywania |

## Ulepszanie twarzy {#face-enhancement}

**Trasa narzędzia:** `enhance-faces`  
**Modele:** GFPGAN, CodeFormer

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Model ulepszania |
| `strength` | number (0-1) | `0.8` | Siła ulepszania |
| `sensitivity` | number (0-1) | `0.5` | Próg wykrywania twarzy |
| `onlyCenterFace` | boolean | `false` | Ulepsz tylko najbardziej centralną twarz |

## Koloryzacja AI {#ai-colorization}

**Trasa narzędzia:** `colorize`  
**Model:** DDColor (z rezerwowym OpenCV DNN)

Przekształca zdjęcia czarno-białe lub w skali szarości na pełny kolor.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Siła nasycenia kolorów |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Wariant modelu |

## Usuwanie szumu {#noise-removal}

**Trasa narzędzia:** `noise-removal`  
**Model:** SCUNet (wielopoziomowy potok odszumiania)

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Poziom przetwarzania |
| `strength` | number (0-100) | `50` | Siła odszumiania |
| `detailPreservation` | number (0-100) | `50` | Ile detali zachować; wyższa wartość zachowuje więcej tekstury |
| `colorNoise` | number (0-100) | `30` | Siła redukcji szumu kolorów |
| `format` | string | `"original"` | Format wyjściowy: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Jakość kodowania wyjścia |

## Usuwanie czerwonych oczu {#red-eye-removal}

**Trasa narzędzia:** `red-eye-removal`

Wykrywa punkty charakterystyczne twarzy, lokalizuje obszary oczu i koryguje nadmierne nasycenie kanału czerwonego.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Próg wykrywania czerwonych pikseli |
| `strength` | number (0-100) | `70` | Siła korekcji |
| `format` | string | - | Nadpisanie formatu wyjściowego (opcjonalne) |
| `quality` | number (1-100) | `90` | Jakość wyjściowa |

## Renowacja zdjęć {#photo-restoration}

**Trasa narzędzia:** `restore-photo`

Wieloetapowy potok dla starych lub uszkodzonych zdjęć: wykrywanie i naprawa rys/rozdarć, ulepszanie twarzy, odszumianie oraz opcjonalna koloryzacja.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Wykryj i napraw rysy, rozdarcia |
| `faceEnhancement` | boolean | `true` | Zastosuj przebieg ulepszania twarzy |
| `fidelity` | number (0-1) | `0.7` | Siła ulepszania twarzy (wyższa = bardziej zachowawcza) |
| `denoise` | boolean | `true` | Zastosuj przebieg odszumiania |
| `denoiseStrength` | number (0-100) | `25` | Siła odszumiania |
| `colorize` | boolean | `false` | Koloryzuj po renowacji |
| `colorizeStrength` | number (0-100) | `85` | Intensywność koloryzacji |

## Zdjęcie paszportowe {#passport-photo}

**Trasa narzędzia:** `passport-photo`  
**Modele:** punkty charakterystyczne twarzy MediaPipe + usuwanie tła BiRefNet

Dwufazowy przepływ pracy: analiza (wykryj twarz + usuń tło), a następnie generowanie (kadrowanie, zmiana rozmiaru, kafelkowanie). Obsługuje ponad 37 krajów w 6 regionach.

### Faza 1: Analiza {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Przyjmuje plik obrazu (multipart). Zwraca dane punktów charakterystycznych twarzy, podgląd base64 oraz wymiary obrazu.

### Faza 2: Generowanie {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Przyjmuje treść JSON z wynikami Fazy 1 oraz ustawieniami generowania:

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `jobId` | string | (wymagane) | Identyfikator zadania z Fazy 1 |
| `filename` | string | (wymagane) | Oryginalna nazwa pliku z Fazy 1 |
| `countryCode` | string | (wymagane) | Kod kraju ISO (np. `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Typ dokumentu |
| `bgColor` | string | `"#FFFFFF"` | Kolor tła hex |
| `printLayout` | string | `"none"` | Układ wydruku: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Maksymalny rozmiar pliku w KB (0 = brak limitu) |
| `dpi` | number (72-1200) | `300` | DPI wyjścia |
| `customWidthMm` | number | - | Niestandardowa szerokość w mm (nadpisuje specyfikację kraju) |
| `customHeightMm` | number | - | Niestandardowa wysokość w mm (nadpisuje specyfikację kraju) |
| `zoom` | number (0.5-3) | `1` | Współczynnik przybliżenia |
| `adjustX` | number | `0` | Korekta położenia w poziomie |
| `adjustY` | number | `0` | Korekta położenia w pionie |
| `landmarks` | object | (wymagane) | Punkty charakterystyczne z Fazy 1 |
| `imageWidth` | number | (wymagane) | Szerokość obrazu z Fazy 1 |
| `imageHeight` | number | (wymagane) | Wysokość obrazu z Fazy 1 |

## Usuwanie obiektów (Inpainting) {#object-erasing-inpainting}

**Trasa narzędzia:** `erase-object`  
**Model:** LaMa przez ONNX Runtime

Maska jest wysyłana jako **druga część pliku** (nazwa pola `mask`), a nie jako base64. Białe piksele w masce wskazują obszary do usunięcia. Ustawienia `format` i `quality` są wysyłane jako pola formularza najwyższego poziomu.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `file` | file | (wymagane) | Obraz źródłowy (multipart) |
| `mask` | file | (wymagane) | Obraz maski (multipart, nazwa pola `mask`, biały = usuń) |
| `format` | string | `"auto"` | Format wyjściowy: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Jakość wyjściowa |

Przyspieszane przez CUDA, gdy dostępny jest GPU NVIDIA.

## Rozszerzanie kadru AI {#ai-canvas-expand}

**Trasa narzędzia:** `ai-canvas-expand`  
**Model:** outpainting oparty na LaMa

Rozszerza kadr obrazu w dowolnym kierunku i wypełnia nowe obszary treścią wygenerowaną przez AI, która pasuje do istniejącego obrazu.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Piksele do rozszerzenia u góry |
| `extendRight` | integer | `0` | Piksele do rozszerzenia po prawej |
| `extendBottom` | integer | `0` | Piksele do rozszerzenia u dołu |
| `extendLeft` | integer | `0` | Piksele do rozszerzenia po lewej |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Poziom jakości |
| `format` | string | `"auto"` | Format wyjściowy: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Jakość wyjściowa |

Co najmniej jeden kierunek rozszerzenia musi być większy niż 0.

## Inteligentne kadrowanie {#smart-crop}

**Trasa narzędzia:** `smart-crop`  
**Model:** wykrywanie twarzy MediaPipe (tylko tryb twarzy)

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Strategia kadrowania: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategia dla trybu obiektu |
| `width` | integer | - | Szerokość wyjścia |
| `height` | integer | - | Wysokość wyjścia |
| `padding` | integer (0-50) | `0` | Procent marginesu wokół obiektu |
| `facePreset` | string | `"head-shoulders"` | Predefiniowane kadrowanie, gdy `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Próg wykrywania twarzy |
| `threshold` | integer (0-255) | `30` | Próg wykrywania tła (tryb przycinania) |
| `padToSquare` | boolean | `false` | Dopełnij przycięty wynik do kwadratu |
| `padColor` | string | `"#ffffff"` | Kolor tła dla dopełnienia kwadratowego |
| `targetSize` | integer | - | Docelowy rozmiar dla dopełnionego wyjścia (piksele) |
| `quality` | integer (1-100) | - | Jakość wyjściowa |

Starsze wartości `mode` `attention` i `content` są akceptowane i mapowane odpowiednio na `subject` i `trim`.

**Predefiniowane ustawienia twarzy:**

| Predefiniowane | Najlepsze do |
|--------|---------|
| `closeup` | Zdjęcia portretowe |
| `head-shoulders` | Zdjęcia profilowe |
| `upper-body` | LinkedIn / formalne |
| `half-body` | Pełna górna część ciała |

## Transkrypcja dźwięku {#transcribe-audio}

**Trasa narzędzia:** `transcribe-audio`  
**Model:** faster-whisper

Przekształca mowę na tekst. Obsługuje formaty wyjściowe zwykły tekst, SRT i VTT.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Język: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Format wyjściowy |

## Automatyczne napisy {#auto-subtitles}

**Trasa narzędzia:** `auto-subtitles`  
**Model:** faster-whisper (wyodrębnia dźwięk z wideo, a następnie transkrybuje)

Generuje pliki napisów ze ścieżki dźwiękowej wideo.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Język: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Format wyjściowy napisów |

## Naprawa przezroczystości PNG {#png-transparency-fixer}

**Trasa narzędzia:** `transparency-fixer`  
**Model:** BiRefNet HR-matting (rozdzielczość 2048x2048)

Naprawia "fałszywie przezroczyste" pliki PNG, w których tło zostało usunięte, ale pozostawiło obwódki, aureole lub półprzezroczyste artefakty. Używa modelu mattingu wysokiej rozdzielczości BiRefNet, aby uzyskać czysty kanał alfa, a następnie stosuje konfigurowalne przetwarzanie usuwające przebarwienia w celu usunięcia zanieczyszczenia kolorem wzdłuż krawędzi.

**Łańcuch rezerwowy OOM:** Jeśli BiRefNet HR-matting przekroczy dostępną pamięć, narzędzie automatycznie przechodzi na `birefnet-general`, a następnie na `u2net`.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Siła usuwania obwódek krawędzi w celu usunięcia zanieczyszczenia kolorem |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Format obrazu wyjściowego |
| `removeWatermark` | boolean | `false` | Zastosuj wstępne przetwarzanie usuwania znaku wodnego (filtr medianowy) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Narzędzia z opcjonalnymi funkcjami AI {#tools-with-optional-ai-capabilities}

Poniższe narzędzia nie są narzędziami procesu pomocniczego Pythona, ale używają funkcji AI, gdy włączone są określone opcje.

### Ulepszanie obrazu {#image-enhancement}

**Trasa narzędzia:** `image-enhancement`  
**Silnik:** oparty na analizie (histogram i statystyki Sharp)

Analizuje obraz i stosuje automatyczne korekcje ekspozycji, kontrastu, balansu bieli, nasycenia, ostrości i szumu. Obsługuje tryby dostosowane do sceny.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Tryb sceny do dostrajania korekcji |
| `intensity` | number (0-100) | `50` | Ogólna siła korekcji |
| `corrections.exposure` | boolean | `true` | Zastosuj korekcję ekspozycji |
| `corrections.contrast` | boolean | `true` | Zastosuj korekcję kontrastu |
| `corrections.whiteBalance` | boolean | `true` | Zastosuj korekcję balansu bieli |
| `corrections.saturation` | boolean | `true` | Zastosuj korekcję nasycenia |
| `corrections.sharpness` | boolean | `true` | Zastosuj korekcję ostrości |
| `corrections.denoise` | boolean | `true` | Zastosuj odszumianie |
| `deepEnhance` | boolean | `false` | Włącz usuwanie szumu AI przez SCUNet (wymaga pakietu `upscale-enhance`) |

Dodatkowy punkt końcowy analizy jest dostępny pod `POST /api/v1/tools/image/image-enhancement/analyze`, który zwraca wykryte korekcje bez ich stosowania.

### Zmiana rozmiaru z uwzględnieniem treści (Seam Carving) {#content-aware-resize-seam-carving}

**Trasa narzędzia:** `content-aware-resize`  
**Silnik:** binarka Go `caire` (nie Python - brak korzyści z GPU)

Inteligentnie zmienia rozmiar obrazów, usuwając szwy o niskiej energii i zachowując ważną treść.

| Parametr | Typ | Domyślnie | Opis |
|-----------|------|---------|-------------|
| `width` | number | - | Docelowa szerokość |
| `height` | number | - | Docelowa wysokość |
| `protectFaces` | boolean | `false` | Chroń wykryte obszary twarzy (wymaga pakietu `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Wstępne rozmycie do obliczania energii |
| `sobelThreshold` | number (1-20) | `2` | Próg czułości krawędzi |
| `square` | boolean | `false` | Wymuś kwadratowe wyjście |

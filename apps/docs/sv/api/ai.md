---
description: "Referens för AI-motorn med alla lokala ML-verktyg. Bakgrundsborttagning, uppskalning, OCR, ansiktsdetektering, fotorestaurering och mer."
i18n_output_hash: 73c354201c5c
i18n_source_hash: aa9a56cdddc7
i18n_provenance: human
---

# Referens för AI-motorn {#ai-engine-reference}

`@snapotter/ai`-paketet koordinerar inbyggda verktyg och Python-körtider för lokala ML-operationer. De flesta ML-verktyg använder en ihållande Python sidecar för snabba varma starter. OCR är avsiktligt separat: `fast` anropar den ursprungliga binära Tesseract, medan `balanced` och `best` använder en dedikerad beständig JSONL dispatcher fästad till den aktiva oföränderliga RapidOCR-generationen under `/data/ai/v3`. Varje begäran innehåller en generation lease. Under en uppgradering kör SnapOtter en smoke test på kandidaten före aktivering, växlar atomärt till den nya dispatcher och dränerar sedan den gamla generationen före garbage collection.

NVIDIA CUDA upptäcks automatiskt och används av körtider som stöder det. OCR använder CPU på varje värd, inklusive system med NVIDIA GPU:er, och undviker CUDA och drivrutinskoppling för detta verktyg.

Acceleration via Intel/AMD-iGPU genom VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens idag. Att mappa `/dev/dri` in i en container accelererar inte dessa Python-sidecar-verktyg om inte en CUDA-kapabel NVIDIA-GPU finns tillgänglig.

19 Python-sidecar-AI-verktyg över fyra modaliteter (bild, ljud, video, dokument), plus 2 verktyg med valfria AI-funktioner. Alla modeller körs lokalt - ingen internetuppkoppling krävs efter den första nedladdningen av modellerna.


<!-- korean-ocr-contract:start -->
::: info Kompatibilitet för koreansk OCR
Snabb OCR stöder `auto`, `en`, `de`, `es`, `fr`, `zh` och `ja`, men inte koreanska (`ko`). Koreanska kräver det exakta OCR-paketet och `balanced` eller `best`. Paketet fungerar i officiella Linux amd64- och arm64-containrar, även på NVIDIA-värdar där OCR fortsätter köras på CPU. System som inte stöds får ett uttryckligt kompatibilitetsfel och faller aldrig tyst tillbaka till `fast`. Koreanska med `fast` eller det äldre aliaset `tesseract` avvisas före köläggning med `FEATURE_INCOMPATIBLE` och `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## Arkitektur {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 +-- Native Tesseract + Ghostscript (fast image/PDF OCR)
 |
 +-- Isolated OCR runtime (persistent JSONL dispatcher)
 |     `-- RapidOCR + ONNX Runtime CPU + pinned PP-OCR models
 |
 `-- Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
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

En separat "docs"-dispatcherprofil ersätter AI-tillåtelselistan med skript för dokumentbearbetning (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) och hoppar över tunga ML-importer.

**Tidsgränser:** 300 s som standard; OCR och BiRefNet-bakgrundsborttagning får 600 s.

## Funktionspaket {#feature-bundles}

AI-modeller paketeras efter delad beroendestack, inte ett arkiv per verktyg. Ett funktionspaket kan aktivera flera verktyg när de använder samma modellfamilj, Python-wheels eller inbyggda bibliotek. Detta håller den utgivna Docker-avbildningen mindre och undviker att lagra dubbletter av samma modeller för bakgrundsmattning, ansiktsdetektering, OCR, restaurering och tal.

Docker-avbildningen levereras med applikationen plus den gemensamma körtidsmiljön. Stora modellarkiv laddas ned vid behov till den beständiga volymen `/data/ai` och återanvänds sedan av alla verktyg som behöver dem. Om ett paket redan är installerat eftersom ett annat verktyg behövde det, laddas det paketet inte ned igen när ett nytt beroende verktyg aktiveras.

De flesta AI-verktyg kräver ett eller flera funktionspaket innan de kan köras. Administratörsgränssnittet installerar dessa med hjälp av `POST /api/v1/admin/tools/:toolId/features/install`, vilket löser hela paketlistan, hoppar över paket som redan är installerade och köar endast de saknade nedladdningarna. Till exempel, aktivering av Passfoto på en ny instans köer `background-removal` och `face-detection`; aktivera det efter att bakgrundsborttagning redan är installerat köer endast `face-detection`. OCR är undantaget eftersom `fast` inte behöver något pack; installera dess valfria exakta körtid genom UI eller `POST /api/v1/admin/features/ocr/install`.

| Paket | Storlek | Delad beroendegrupp | Verktyg som använder det |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet bakgrundsmattning | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | MediaPipe ansiktsdetektering och landmärken | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa inpainting/outpainting och DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, brusreducering | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | pipeline för reparation av repor och restaurering | restore-photo |
| `ocr` | ~208-234 MiB nedladdning / ~409-488 MiB installerad | Tillval RapidOCR 3.9.1, ONNX Runtime 1.20.1 och stiftade PP-OCR-modeller | ocr, ocr-pdf (endast `balanced` och `best`) |
| `transcription` | ~600 MB | faster-whisper tal-till-text-modeller | transcribe-audio, auto-subtitles |

Verktyg med beroenden över flera paket:

| Verktyg | Nödvändiga paket | Varför |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Tar bort bakgrunden och använder sedan ansiktslandmärken för att beskära bilden enligt reglerna för pass- och ID-foton. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Detekterar ansikten innan GFPGAN- eller CodeFormer-förbättring körs på de valda ansiktsregionerna. |

Ett verktyg är endast tillgängligt när alla dess nödvändiga buntar är installerade, förutom OCR: dess inbyggda `fast`-nivå förblir tillgänglig utan det valfria OCR-paketet. Delinstallationer är giltiga och hanteras inkrementellt: installerade paket återanvänds, saknade paket visas som nedladdningar och installationer i kö körs en i taget så att den delade Python-miljön inte ändras samtidigt.

### Exakt OCR runtime installation {#accurate-ocr-runtime-installation}

Det exakta OCR-paketet är en plattformsspecifik körtid för den officiella Linux amd64- eller Linux arm64-behållaren. amd64-bygget använder Python 3.12; arm64-bygget använder Python 3.11. Båda byggen kör RapidOCR genom ONNX Runtime:s `CPUExecutionProvider`, så samma paket fungerar på endast CPU- och NVIDIA Docker-värdar. Den exakta körtiden kräver minst 4 GiB effektivt minne: den konfigurerade behållarens cgroup-gräns, annars värdminne. Ett system under det signerade kompatibilitetsminimum avvisas före nedladdning. Detta krav gäller inte för inbyggd Fast OCR. Bare-metal-builds avvisas eftersom deras libc och Python ABI inte kan härledas säkert; Snabb OCR förblir tillgänglig när värden tillhandahåller Tesseract och Ghostscript.

Den valfria artefakten är cirka 208-234 MiB komprimerad och 409-488 MiB extraherad, beroende på arkitektur. Det signerade indexet binder de exakta komprimerade och extraherade byteantalerna som upprätthålls av installationsprogrammet. Inbyggd Tesseract lägger till cirka 25 MiB till den officiella bilden och behöver inga filer i `/data/ai`.

Onlineinstallation hämtar ett signerat releaseindex och den exakta innehållsadresserade artefakten för den aktuella plattformen. SnapOtter verifierar Ed25519 indexsignatur, artefaktstorlek, SHA-256 sammanfattning, modellsammandrag, sökvägar, fillägen och iscensatta smoke test innan den nya generationen atomärt aktiveras. En misslyckad installation lämnar den tidigare friska generationen aktiv.

För installation med luftgap, ladda upp både releasens `ocr-runtime-index.json` och matchande OCR runtime-arkiv till `POST /api/v1/admin/features/import` med hjälp av flerdelade fält som heter `index` och `archive`. Offlineimport tillämpar samma signatur-, hash-, extraktions-, kompatibilitets- och röktestkontroller som onlineinstallation; ett arkiv utan dess betrodda signerade index avvisas.

---

## Bakgrundsborttagning {#background-removal}

**Verktygsrutt:** `remove-background`
**Modell:** rembg med BiRefNet (standard) eller U2-Net-varianter

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `model` | string | - | Modellvariant (valfri åsidosättning) |
| `backgroundType` | string | `"transparent"` | En av: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Hexfärg för enfärgad bakgrund |
| `gradientColor1` | string | - | Första gradientfärgen |
| `gradientColor2` | string | - | Andra gradientfärgen |
| `gradientAngle` | number | - | Gradientvinkel i grader |
| `blurEnabled` | boolean | - | Aktivera oskärpeeffekt på bakgrunden |
| `blurIntensity` | number (0-100) | - | Oskärpans intensitet |
| `shadowEnabled` | boolean | - | Aktivera slagskugga på motivet |
| `shadowOpacity` | number (0-100) | - | Skuggans opacitet |
| `outputFormat` | string | - | Utdataformat: `png`, `webp` eller `avif` |
| `edgeRefine` | integer (0-3) | - | Nivå för kantförfining |
| `decontaminate` | boolean | - | Ta bort färgblödning från kanter |

## Bakgrundsutbyte {#background-replace}

**Verktygsrutt:** `background-replace`
**Modell:** rembg / BiRefNet (delas med remove-background)

Tar bort bakgrunden och ersätter den med en enfärgad färg eller gradient.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Bakgrundsläge |
| `color` | string | `"#ffffff"` | Bakgrundens hexfärg (när `backgroundType` är `color`) |
| `gradientColor1` | string | - | Första gradientens hexfärg |
| `gradientColor2` | string | - | Andra gradientens hexfärg |
| `gradientAngle` | integer (0-360) | `180` | Gradientvinkel i grader |
| `feather` | integer (0-20) | `0` | Radie för kantutjämning |
| `format` | `"png"` \| `"webp"` | `"png"` | Utdataformat |

## Oskärp bakgrund {#blur-background}

**Verktygsrutt:** `blur-background`
**Modell:** rembg / BiRefNet (delas med remove-background)

Gör bakgrunden oskarp samtidigt som motivet hålls skarpt.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Oskärpans intensitet |
| `feather` | integer (0-20) | `0` | Radie för kantutjämning |
| `format` | `"png"` \| `"webp"` | `"png"` | Utdataformat |

## Bilduppskalning {#image-upscaling}

**Verktygsrutt:** `upscale`
**Modell:** RealESRGAN (med Lanczos-reserv när den inte är tillgänglig)

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Uppskalningsfaktor |
| `model` | string | `"auto"` | Modellvariant |
| `faceEnhance` | boolean | `false` | Kör en GFPGAN-ansiktsförbättring |
| `denoise` | number | `0` | Styrka på brusreducering |
| `format` | string | `"auto"` | Åsidosättning av utdataformat |
| `quality` | number | `95` | Utdatakvalitet (1-100) |

## OCR / Textextraktion {#ocr-text-extraction}

**Verktygsrutt:** `ocr`
**Modeller:** Tesseract (`fast`); RapidOCR med PP-OCRv6 små modeller (`balanced`); PP-OCRv6 mellanmodeller med kalibrerad variantpoäng (`best`)

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | Dynamisk | När `quality` och `engine` utelämnas väljer SnapOtter den bästa tillgängliga nivån i ordningen `best`, `balanced`, `fast`. För koreanska väljs aldrig `fast`; `best`, sedan `balanced` används, annars returneras installations- eller kompatibilitetsfelet för den exakta körmiljön. |
| `language` | string | `"auto"` | Språk: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | booleskt | Tierberoende | Förbättra den lokala kontrasten. Fast applicerar det direkt; exakta nivåer behåller varianten endast när kalibrerad poängsättning förbättrar OCR. Standard på för Best |
| `engine` | sträng | - | Utfasat kompatibilitetsalias. Mappar `tesseract` till `fast` och det äldre `paddleocr`-värdet till `balanced`; den laddar inte PaddlePaddle |

Returnerar extraherad text plus härkomstmetadata: motor, begärd och faktisk kvalitet, enhet, leverantör, försämringstillstånd, varningar och korrekt körtid/modellversioner när tillämpligt. Explicita kvalitetsförfrågningar faller aldrig tillbaka till en annan nivå. Om `balanced` eller `best` är otillgängliga, returnerar API `FEATURE_NOT_INSTALLED` eller `FEATURE_INCOMPATIBLE` istället för att köra `fast` tyst.

## PDF-OCR {#pdf-ocr}

**Verktygsrutt:** `ocr-pdf`
**Modeller:** Samma nivåsystem som bild-OCR

Extraherar text från inskannade PDF-dokument med AI-driven OCR, sida för sida.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | Dynamisk | När `quality` och `engine` utelämnas väljer SnapOtter den bästa tillgängliga nivån i ordningen `best`, `balanced`, `fast`. För koreanska väljs aldrig `fast`; `best`, sedan `balanced` används, annars returneras installations- eller kompatibilitetsfelet för den exakta körmiljön. |
| `language` | string | `"auto"` | Språk: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Sidval: `"all"`, `"1-3"`, `"1,3,5"` |
| `enhance` | booleskt | Tierberoende | Förbättra den lokala kontrasten. Fast applicerar det direkt; exakta nivåer behåller varianten endast när kalibrerad poängsättning förbättrar OCR. Standard på för Best |
| `engine` | sträng | - | Utfasat kompatibilitetsalias. Mappar `tesseract` till `fast` och det äldre `paddleocr`-värdet till `balanced`; den laddar inte PaddlePaddle |

Samma regel om ingen nedgradering gäller för PDF OCR. PDF sidor rastreras före igenkänning, och en begäran kan välja högst 50 sidor.

## Oskärp ansikten / PII {#face-pii-blur}

**Verktygsrutt:** `blur-faces`
**Modell:** MediaPipe ansiktsdetektering

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Radie för gaussisk oskärpa |
| `sensitivity` | number (0-1) | `0.5` | Konfidenströskel för detektering |

## Ansiktsförbättring {#face-enhancement}

**Verktygsrutt:** `enhance-faces`
**Modeller:** GFPGAN, CodeFormer

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Förbättringsmodell |
| `strength` | number (0-1) | `0.8` | Styrka på förbättring |
| `sensitivity` | number (0-1) | `0.5` | Tröskel för ansiktsdetektering |
| `onlyCenterFace` | boolean | `false` | Förbättra endast det mest centrala ansiktet |

## AI-kolorering {#ai-colorization}

**Verktygsrutt:** `colorize`
**Modell:** DDColor (med OpenCV DNN-reserv)

Omvandlar svartvita eller gråskalefoton till fullständig färg.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Styrka på färgmättnad |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Modellvariant |

## Brusreducering {#noise-removal}

**Verktygsrutt:** `noise-removal`
**Modell:** SCUNet (nivåindelad pipeline för brusreducering)

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Bearbetningsnivå |
| `strength` | number (0-100) | `50` | Styrka på brusreducering |
| `detailPreservation` | number (0-100) | `50` | Hur mycket detaljer som ska bevaras; högre behåller mer textur |
| `colorNoise` | number (0-100) | `30` | Styrka på reducering av färgbrus |
| `format` | string | `"original"` | Utdataformat: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Kvalitet på utdatakodning |

## Borttagning av röda ögon {#red-eye-removal}

**Verktygsrutt:** `red-eye-removal`

Detekterar ansiktslandmärken, lokaliserar ögonregioner och korrigerar övermättnad i rödkanalen.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Tröskel för detektering av röda pixlar |
| `strength` | number (0-100) | `70` | Styrka på korrigering |
| `format` | string | - | Åsidosättning av utdataformat (valfritt) |
| `quality` | number (1-100) | `90` | Utdatakvalitet |

## Fotorestaurering {#photo-restoration}

**Verktygsrutt:** `restore-photo`

Pipeline i flera steg för gamla eller skadade foton: detektering och reparation av repor/revor, ansiktsförbättring, brusreducering och valfri kolorering.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Detektera och reparera repor, revor |
| `faceEnhancement` | boolean | `true` | Kör en ansiktsförbättring |
| `fidelity` | number (0-1) | `0.7` | Styrka på ansiktsförbättring (högre = mer konservativ) |
| `denoise` | boolean | `true` | Kör en brusreducering |
| `denoiseStrength` | number (0-100) | `25` | Styrka på brusreducering |
| `colorize` | boolean | `false` | Kolorera efter restaurering |
| `colorizeStrength` | number (0-100) | `85` | Intensitet på kolorering |

## Passfoto {#passport-photo}

**Verktygsrutt:** `passport-photo`
**Modeller:** MediaPipe ansiktslandmärken + BiRefNet-bakgrundsborttagning

Arbetsflöde i två faser: analysera (detektera ansikte + ta bort bakgrund) och sedan generera (beskär, ändra storlek, lägg i rutmönster). Stöder 37+ länder över 6 regioner.

### Fas 1: Analysera {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Tar emot en bildfil (multipart). Returnerar data om ansiktslandmärken, en base64-förhandsvisning och bilddimensioner.

### Fas 2: Generera {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Tar emot en JSON-kropp med resultaten från Fas 1 plus genereringsinställningar:

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `jobId` | string | (obligatorisk) | Jobb-ID från Fas 1 |
| `filename` | string | (obligatorisk) | Ursprungligt filnamn från Fas 1 |
| `countryCode` | string | (obligatorisk) | ISO-landskod (t.ex. `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Dokumenttyp |
| `bgColor` | string | `"#FFFFFF"` | Bakgrundsfärg i hex |
| `printLayout` | string | `"none"` | Utskriftslayout: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Maximal filstorlek i KB (0 = ingen gräns) |
| `dpi` | number (72-1200) | `300` | Utdata-DPI |
| `customWidthMm` | number | - | Anpassad bredd i mm (åsidosätter landsspecifikationen) |
| `customHeightMm` | number | - | Anpassad höjd i mm (åsidosätter landsspecifikationen) |
| `zoom` | number (0.5-3) | `1` | Zoomfaktor |
| `adjustX` | number | `0` | Justering av horisontellt läge |
| `adjustY` | number | `0` | Justering av vertikalt läge |
| `landmarks` | object | (obligatorisk) | Landmärken från Fas 1 |
| `imageWidth` | number | (obligatorisk) | Bildbredd från Fas 1 |
| `imageHeight` | number | (obligatorisk) | Bildhöjd från Fas 1 |

## Objektborttagning (Inpainting) {#object-erasing-inpainting}

**Verktygsrutt:** `erase-object`
**Modell:** LaMa via ONNX Runtime

Masken skickas som en **andra fildel** (fältnamn `mask`), inte som base64. Vita pixlar i masken anger områden som ska raderas. Inställningarna `format` och `quality` skickas som formulärfält på toppnivå.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `file` | file | (obligatorisk) | Källbild (multipart) |
| `mask` | file | (obligatorisk) | Maskbild (multipart, fältnamn `mask`, vitt = radera) |
| `format` | string | `"auto"` | Utdataformat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Utdatakvalitet |

CUDA-accelererad när en NVIDIA-GPU finns tillgänglig.

## AI-canvasutökning {#ai-canvas-expand}

**Verktygsrutt:** `ai-canvas-expand`
**Modell:** LaMa-baserad outpainting

Utökar bildens canvas i valfri riktning och fyller nya områden med AI-genererat innehåll som matchar den befintliga bilden.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Antal pixlar att utöka upptill |
| `extendRight` | integer | `0` | Antal pixlar att utöka till höger |
| `extendBottom` | integer | `0` | Antal pixlar att utöka nedtill |
| `extendLeft` | integer | `0` | Antal pixlar att utöka till vänster |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Kvalitetsnivå |
| `format` | string | `"auto"` | Utdataformat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Utdatakvalitet |

Minst en utökningsriktning måste vara större än 0.

## Smart beskärning {#smart-crop}

**Verktygsrutt:** `smart-crop`
**Modell:** MediaPipe ansiktsdetektering (endast ansiktsläge)

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Beskärningsstrategi: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategi för motivläge |
| `width` | integer | - | Utdatabredd |
| `height` | integer | - | Utdatahöjd |
| `padding` | integer (0-50) | `0` | Marginal i procent runt motivet |
| `facePreset` | string | `"head-shoulders"` | Förinställd inramning när `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Tröskel för ansiktsdetektering |
| `threshold` | integer (0-255) | `30` | Tröskel för bakgrundsdetektering (trimläge) |
| `padToSquare` | boolean | `false` | Fyll ut trimmat resultat till en kvadrat |
| `padColor` | string | `"#ffffff"` | Bakgrundsfärg för kvadratisk utfyllnad |
| `targetSize` | integer | - | Målstorlek för utfyllt utdata (pixlar) |
| `quality` | integer (1-100) | - | Utdatakvalitet |

Äldre `mode`-värden `attention` och `content` accepteras och mappas till `subject` respektive `trim`.

**Förinställningar för ansikte:**

| Förinställning | Bäst för |
|--------|---------|
| `closeup` | Porträttbilder |
| `head-shoulders` | Profilbilder |
| `upper-body` | LinkedIn / formellt |
| `half-body` | Hela överkroppen |

## Transkribera ljud {#transcribe-audio}

**Verktygsrutt:** `transcribe-audio`
**Modell:** faster-whisper

Omvandlar tal till text. Stöder utdataformaten oformaterad text, SRT och VTT.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Språk: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Utdataformat |

## Automatiska undertexter {#auto-subtitles}

**Verktygsrutt:** `auto-subtitles`
**Modell:** faster-whisper (extraherar ljud från video och transkriberar sedan)

Genererar undertextfiler från en videos ljudspår.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Språk: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Utdataformat för undertext |

## PNG-transparensfixare {#png-transparency-fixer}

**Verktygsrutt:** `transparency-fixer`
**Modell:** BiRefNet HR-matting (2048x2048 upplösning)

Åtgärdar "falskt transparenta" PNG-filer där bakgrunden togs bort men lämnade kvar fransning, glorior eller halvtransparenta artefakter. Använder BiRefNets högupplösta mattningsmodell för att producera en ren alfakanal och tillämpar sedan konfigurerbar defringe-bearbetning för att ta bort färgkontaminering längs kanterna.

**Reservkedja vid minnesbrist:** Om BiRefNet HR-matting överskrider tillgängligt minne faller verktyget automatiskt tillbaka till `birefnet-general`, sedan till `u2net`.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Styrka på kant-defringe för att ta bort färgkontaminering |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Utdatabildens format |
| `removeWatermark` | boolean | `false` | Kör förbehandling för borttagning av vattenstämpel (medianfilter) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Verktyg med valfria AI-funktioner {#tools-with-optional-ai-capabilities}

Följande verktyg är inte Python-sidecar-verktyg men använder AI-funktioner när vissa alternativ är aktiverade.

### Bildförbättring {#image-enhancement}

**Verktygsrutt:** `image-enhancement`
**Motor:** Analysbaserad (Sharp-histogram och statistik)

Analyserar bilden och tillämpar automatiska korrigeringar för exponering, kontrast, vitbalans, mättnad, skärpa och brus. Stöder scenspecifika lägen.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Scenläge för att finjustera korrigeringar |
| `intensity` | number (0-100) | `50` | Total korrigeringsstyrka |
| `corrections.exposure` | boolean | `true` | Tillämpa exponeringskorrigering |
| `corrections.contrast` | boolean | `true` | Tillämpa kontrastkorrigering |
| `corrections.whiteBalance` | boolean | `true` | Tillämpa vitbalanskorrigering |
| `corrections.saturation` | boolean | `true` | Tillämpa mättnadskorrigering |
| `corrections.sharpness` | boolean | `true` | Tillämpa skärpekorrigering |
| `corrections.denoise` | boolean | `true` | Tillämpa brusreducering |
| `deepEnhance` | boolean | `false` | Aktivera AI-brusreducering via SCUNet (kräver paketet `upscale-enhance`) |

En ytterligare analysslutpunkt finns tillgänglig på `POST /api/v1/tools/image/image-enhancement/analyze` som returnerar de detekterade korrigeringarna utan att tillämpa dem.

### Innehållsmedveten storleksändring (Seam Carving) {#content-aware-resize-seam-carving}

**Verktygsrutt:** `content-aware-resize`
**Motor:** Go-binären `caire` (inte Python - ingen GPU-fördel)

Ändrar storlek på bilder intelligent genom att ta bort lågenergisömmar och bevara viktigt innehåll.

| Parameter | Typ | Standard | Beskrivning |
|-----------|------|---------|-------------|
| `width` | number | - | Målbredd |
| `height` | number | - | Målhöjd |
| `protectFaces` | boolean | `false` | Skydda detekterade ansiktsregioner (kräver paketet `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Föroskärpa för energiberäkning |
| `sobelThreshold` | number (1-20) | `2` | Tröskel för kantkänslighet |
| `square` | boolean | `false` | Tvinga kvadratiskt utdata |

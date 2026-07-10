---
description: "AI-engine-referentie met alle lokale ML-tools. Achtergrond verwijderen, upscaling, OCR, gezichtsdetectie, fotorestauratie en meer."
i18n_source_hash: dd135f2e9fdb
i18n_provenance: machine
i18n_output_hash: 26f864430390
---

# AI-engine-referentie {#ai-engine-reference}

Het `@snapotter/ai` pakket verbindt Node.js met een **persistente Python-sidecar** voor alle ML-bewerkingen. Het dispatcher-proces blijft tussen aanvragen actief voor snelle warm-start-prestaties. NVIDIA CUDA wordt bij het opstarten automatisch gedetecteerd en gebruikt indien beschikbaar; anders draaien AI-tools op de CPU.

Intel/AMD-iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt vandaag niet ondersteund voor AI-inferentie. Het mappen van `/dev/dri` in een container versnelt deze Python-sidecar-tools niet, tenzij een CUDA-geschikte NVIDIA-GPU beschikbaar is.

19 Python-sidecar-AI-tools verdeeld over vier modaliteiten (afbeelding, audio, video, document), plus 2 tools met optionele AI-mogelijkheden. Alle modellen draaien lokaal - geen internet vereist na de eerste modeldownload.

## Architectuur {#architecture}

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

Een apart "docs"-dispatcher-profiel vervangt de AI-allowlist door document-verwerkingsscripts (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) en slaat zware ML-imports over.

**Time-outs:** 300 s standaard; OCR en BiRefNet-achtergrond­verwijdering krijgen 600 s.

## Feature-bundels {#feature-bundles}

Elke AI-tool vereist dat er vóór gebruik een modelbundel is geïnstalleerd. Bundels worden op aanvraag geïnstalleerd via de admin-UI of `install_feature.py`.

| Bundel | Grootte | Tools |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr, ocr-pdf |
| `transcription` | ~600 MB | transcribe-audio, auto-subtitles |

---

## Achtergrond verwijderen {#background-removal}

**Tool-route:** `remove-background`  
**Model:** rembg met BiRefNet (standaard) of U2-Net-varianten

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `model` | string | - | Modelvariant (optionele override) |
| `backgroundType` | string | `"transparent"` | Een van: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Hex-kleur voor effen achtergrond |
| `gradientColor1` | string | - | Eerste gradiëntkleur |
| `gradientColor2` | string | - | Tweede gradiëntkleur |
| `gradientAngle` | number | - | Gradiënthoek in graden |
| `blurEnabled` | boolean | - | Achtergrondvervaging inschakelen |
| `blurIntensity` | number (0-100) | - | Vervagingsintensiteit |
| `shadowEnabled` | boolean | - | Slagschaduw op onderwerp inschakelen |
| `shadowOpacity` | number (0-100) | - | Schaduwdekking |
| `outputFormat` | string | - | Uitvoerformaat: `png`, `webp` of `avif` |
| `edgeRefine` | integer (0-3) | - | Niveau van randverfijning |
| `decontaminate` | boolean | - | Kleurbloeding aan de randen verwijderen |

## Achtergrond vervangen {#background-replace}

**Tool-route:** `background-replace`  
**Model:** rembg / BiRefNet (gedeeld met remove-background)

Verwijdert de achtergrond en vervangt deze door een effen kleur of gradiënt.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Achtergrondmodus |
| `color` | string | `"#ffffff"` | Hex-kleur van achtergrond (wanneer `backgroundType` gelijk is aan `color`) |
| `gradientColor1` | string | - | Eerste gradiënt-hex-kleur |
| `gradientColor2` | string | - | Tweede gradiënt-hex-kleur |
| `gradientAngle` | integer (0-360) | `180` | Gradiënthoek in graden |
| `feather` | integer (0-20) | `0` | Straal van randvervaging |
| `format` | `"png"` \| `"webp"` | `"png"` | Uitvoerformaat |

## Achtergrond vervagen {#blur-background}

**Tool-route:** `blur-background`  
**Model:** rembg / BiRefNet (gedeeld met remove-background)

Vervaagt de achtergrond terwijl het onderwerp scherp blijft.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Vervagingsintensiteit |
| `feather` | integer (0-20) | `0` | Straal van randvervaging |
| `format` | `"png"` \| `"webp"` | `"png"` | Uitvoerformaat |

## Afbeelding upscalen {#image-upscaling}

**Tool-route:** `upscale`  
**Model:** RealESRGAN (met Lanczos-fallback indien niet beschikbaar)

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Upscale-factor |
| `model` | string | `"auto"` | Modelvariant |
| `faceEnhance` | boolean | `false` | GFPGAN-gezichtsverbeteringspass toepassen |
| `denoise` | number | `0` | Sterkte van ruisvermindering |
| `format` | string | `"auto"` | Override van uitvoerformaat |
| `quality` | number | `95` | Uitvoerkwaliteit (1-100) |

## OCR / Tekstextractie {#ocr-text-extraction}

**Tool-route:** `ocr`  
**Modellen:** Tesseract (snel), PaddleOCR PP-OCRv5 (gebalanceerd), PaddleOCR-VL 1.5 (best)

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Verwerkingsniveau |
| `language` | string | `"auto"` | Taal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Afbeelding voorbewerken om OCR-nauwkeurigheid te verbeteren |
| `engine` | string | - | Verouderd. Zet `tesseract` om naar `fast`, `paddleocr` naar `balanced` |

Geeft gestructureerde resultaten terug met begrenzingsvakken, betrouwbaarheidsscores en geëxtraheerde tekstblokken.

## PDF-OCR {#pdf-ocr}

**Tool-route:** `ocr-pdf`  
**Modellen:** Zelfde niveausysteem als afbeeldings-OCR

Extraheert tekst uit gescande PDF-documenten met AI-gestuurde OCR, pagina voor pagina.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Verwerkingsniveau |
| `language` | string | `"auto"` | Taal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Paginaselectie: `"all"`, `"1-3"`, `"1,3,5"` |

## Gezicht- / PII-vervaging {#face-pii-blur}

**Tool-route:** `blur-faces`  
**Model:** MediaPipe-gezichtsdetectie

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Straal van Gaussische vervaging |
| `sensitivity` | number (0-1) | `0.5` | Betrouwbaarheidsdrempel voor detectie |

## Gezichtsverbetering {#face-enhancement}

**Tool-route:** `enhance-faces`  
**Modellen:** GFPGAN, CodeFormer

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Verbeteringsmodel |
| `strength` | number (0-1) | `0.8` | Sterkte van verbetering |
| `sensitivity` | number (0-1) | `0.5` | Drempel voor gezichtsdetectie |
| `onlyCenterFace` | boolean | `false` | Alleen het meest centrale gezicht verbeteren |

## AI-inkleuring {#ai-colorization}

**Tool-route:** `colorize`  
**Model:** DDColor (met OpenCV-DNN-fallback)

Zet zwart-wit- of grijstintenfoto's om naar volledige kleur.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Sterkte van kleurverzadiging |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Modelvariant |

## Ruis verwijderen {#noise-removal}

**Tool-route:** `noise-removal`  
**Model:** SCUNet (gelaagde denoising-pijplijn)

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Verwerkingsniveau |
| `strength` | number (0-100) | `50` | Sterkte van ruisvermindering |
| `detailPreservation` | number (0-100) | `50` | Hoeveel detail behouden blijft; hoger behoudt meer textuur |
| `colorNoise` | number (0-100) | `30` | Sterkte van kleurruisvermindering |
| `format` | string | `"original"` | Uitvoerformaat: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Kwaliteit van uitvoercodering |

## Rode ogen verwijderen {#red-eye-removal}

**Tool-route:** `red-eye-removal`

Detecteert gezichtsoriëntatiepunten, lokaliseert oogregio's en corrigeert oververzadiging in het rode kanaal.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Detectiedrempel voor rode pixels |
| `strength` | number (0-100) | `70` | Sterkte van correctie |
| `format` | string | - | Override van uitvoerformaat (optioneel) |
| `quality` | number (1-100) | `90` | Uitvoerkwaliteit |

## Fotorestauratie {#photo-restoration}

**Tool-route:** `restore-photo`

Meerstaps-pijplijn voor oude of beschadigde foto's: detectie en reparatie van krassen/scheuren, gezichtsverbetering, ruisvermindering en optionele inkleuring.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Krassen en scheuren detecteren en repareren |
| `faceEnhancement` | boolean | `true` | Gezichtsverbeteringspass toepassen |
| `fidelity` | number (0-1) | `0.7` | Sterkte van gezichtsverbetering (hoger = behoudender) |
| `denoise` | boolean | `true` | Ruisverminderingspass toepassen |
| `denoiseStrength` | number (0-100) | `25` | Sterkte van ruisvermindering |
| `colorize` | boolean | `false` | Inkleuren na restauratie |
| `colorizeStrength` | number (0-100) | `85` | Intensiteit van inkleuring |

## Pasfoto {#passport-photo}

**Tool-route:** `passport-photo`  
**Modellen:** MediaPipe-gezichtsoriëntatiepunten + BiRefNet-achtergrondverwijdering

Tweefasige workflow: analyseren (gezicht detecteren + achtergrond verwijderen) en vervolgens genereren (bijsnijden, formaat aanpassen, tegelen). Ondersteunt 37+ landen in 6 regio's.

### Fase 1: Analyseren {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Accepteert een afbeeldingsbestand (multipart). Geeft gezichtsoriëntatiepunt-gegevens, een base64-voorbeeld en afbeeldingsafmetingen terug.

### Fase 2: Genereren {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Accepteert een JSON-body met de resultaten van fase 1 plus generatie-instellingen:

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `jobId` | string | (vereist) | Job-ID uit fase 1 |
| `filename` | string | (vereist) | Oorspronkelijke bestandsnaam uit fase 1 |
| `countryCode` | string | (vereist) | ISO-landcode (bijv. `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Documenttype |
| `bgColor` | string | `"#FFFFFF"` | Hex-code achtergrondkleur |
| `printLayout` | string | `"none"` | Printlayout: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Max bestandsgrootte in KB (0 = geen limiet) |
| `dpi` | number (72-1200) | `300` | Uitvoer-DPI |
| `customWidthMm` | number | - | Aangepaste breedte in mm (overschrijft landspecificatie) |
| `customHeightMm` | number | - | Aangepaste hoogte in mm (overschrijft landspecificatie) |
| `zoom` | number (0.5-3) | `1` | Zoomfactor |
| `adjustX` | number | `0` | Horizontale positieaanpassing |
| `adjustY` | number | `0` | Verticale positieaanpassing |
| `landmarks` | object | (vereist) | Oriëntatiepunten uit fase 1 |
| `imageWidth` | number | (vereist) | Afbeeldingsbreedte uit fase 1 |
| `imageHeight` | number | (vereist) | Afbeeldingshoogte uit fase 1 |

## Objecten wissen (Inpainting) {#object-erasing-inpainting}

**Tool-route:** `erase-object`  
**Model:** LaMa via ONNX Runtime

Het masker wordt verzonden als een **tweede bestandsonderdeel** (fieldname `mask`), niet als base64. Witte pixels in het masker geven te wissen gebieden aan. De instellingen `format` en `quality` worden verzonden als top-level formuliervelden.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `file` | file | (vereist) | Bronafbeelding (multipart) |
| `mask` | file | (vereist) | Maskerafbeelding (multipart, fieldname `mask`, wit = wissen) |
| `format` | string | `"auto"` | Uitvoerformaat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Uitvoerkwaliteit |

CUDA-versneld wanneer een NVIDIA-GPU beschikbaar is.

## AI-canvas uitbreiden {#ai-canvas-expand}

**Tool-route:** `ai-canvas-expand`  
**Model:** LaMa-gebaseerde outpainting

Breidt het canvas van een afbeelding in elke richting uit en vult nieuwe gebieden met AI-gegenereerde inhoud die aansluit op de bestaande afbeelding.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Pixels om bovenaan uit te breiden |
| `extendRight` | integer | `0` | Pixels om rechts uit te breiden |
| `extendBottom` | integer | `0` | Pixels om onderaan uit te breiden |
| `extendLeft` | integer | `0` | Pixels om links uit te breiden |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Kwaliteitsniveau |
| `format` | string | `"auto"` | Uitvoerformaat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Uitvoerkwaliteit |

Ten minste één uitbreidingsrichting moet groter zijn dan 0.

## Slim bijsnijden {#smart-crop}

**Tool-route:** `smart-crop`  
**Model:** MediaPipe-gezichtsdetectie (alleen gezichtsmodus)

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Bijsnijstrategie: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategie voor onderwerpmodus |
| `width` | integer | - | Uitvoerbreedte |
| `height` | integer | - | Uitvoerhoogte |
| `padding` | integer (0-50) | `0` | Opvulpercentage rond onderwerp |
| `facePreset` | string | `"head-shoulders"` | Vooraf ingestelde kadering wanneer `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Drempel voor gezichtsdetectie |
| `threshold` | integer (0-255) | `30` | Drempel voor achtergronddetectie (trim-modus) |
| `padToSquare` | boolean | `false` | Bijgesneden resultaat opvullen tot een vierkant |
| `padColor` | string | `"#ffffff"` | Achtergrondkleur voor vierkante opvulling |
| `targetSize` | integer | - | Doelgrootte voor opgevulde uitvoer (pixels) |
| `quality` | integer (1-100) | - | Uitvoerkwaliteit |

Verouderde `mode`-waarden `attention` en `content` worden geaccepteerd en respectievelijk omgezet naar `subject` en `trim`.

**Gezichtspresets:**

| Preset | Best voor |
|--------|---------|
| `closeup` | Portretfoto's |
| `head-shoulders` | Profielfoto's |
| `upper-body` | LinkedIn / formeel |
| `half-body` | Volledig bovenlichaam |

## Audio transcriberen {#transcribe-audio}

**Tool-route:** `transcribe-audio`  
**Model:** faster-whisper

Zet spraak om naar tekst. Ondersteunt uitvoerformaten als platte tekst, SRT en VTT.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Taal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Uitvoerformaat |

## Automatische ondertitels {#auto-subtitles}

**Tool-route:** `auto-subtitles`  
**Model:** faster-whisper (extraheert audio uit video en transcribeert daarna)

Genereert ondertitelbestanden uit de audiotrack van een video.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Taal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Uitvoerformaat voor ondertitels |

## PNG-transparantiehersteller {#png-transparency-fixer}

**Tool-route:** `transparency-fixer`  
**Model:** BiRefNet HR-matting (2048x2048 resolutie)

Herstelt "nep-transparante" PNG's waarbij de achtergrond werd verwijderd maar franjes, halo's of semi-transparante artefacten achterbleven. Gebruikt BiRefNets matting-model met hoge resolutie om een schoon alfakanaal te produceren en past vervolgens configureerbare defringe-verwerking toe om kleurvervuiling langs randen te verwijderen.

**OOM-fallback-keten:** Als BiRefNet HR-matting het beschikbare geheugen overschrijdt, valt de tool automatisch terug op `birefnet-general` en vervolgens op `u2net`.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Sterkte van rand-defringe om kleurvervuiling te verwijderen |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Uitvoerbeeldformaat |
| `removeWatermark` | boolean | `false` | Watermerkverwijdering als voorbewerking toepassen (mediaanfilter) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Tools met optionele AI-mogelijkheden {#tools-with-optional-ai-capabilities}

De volgende tools zijn geen Python-sidecar-tools, maar gebruiken AI-functies wanneer bepaalde opties zijn ingeschakeld.

### Afbeeldingsverbetering {#image-enhancement}

**Tool-route:** `image-enhancement`  
**Engine:** Analysegebaseerd (Sharp-histogram en -statistieken)

Analyseert de afbeelding en past automatische correcties toe voor belichting, contrast, witbalans, verzadiging, scherpte en ruis. Ondersteunt scènespecifieke modi.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Scènemodus voor het afstemmen van correcties |
| `intensity` | number (0-100) | `50` | Algehele correctiesterkte |
| `corrections.exposure` | boolean | `true` | Belichtingscorrectie toepassen |
| `corrections.contrast` | boolean | `true` | Contrastcorrectie toepassen |
| `corrections.whiteBalance` | boolean | `true` | Witbalanscorrectie toepassen |
| `corrections.saturation` | boolean | `true` | Verzadigingscorrectie toepassen |
| `corrections.sharpness` | boolean | `true` | Scherptecorrectie toepassen |
| `corrections.denoise` | boolean | `true` | Ruisvermindering toepassen |
| `deepEnhance` | boolean | `false` | AI-ruisverwijdering via SCUNet inschakelen (vereist `upscale-enhance`-bundel) |

Er is een aanvullend analyse-endpoint beschikbaar op `POST /api/v1/tools/image/image-enhancement/analyze` dat de gedetecteerde correcties teruggeeft zonder ze toe te passen.

### Content-Aware Resize (Seam Carving) {#content-aware-resize-seam-carving}

**Tool-route:** `content-aware-resize`  
**Engine:** Go-binary `caire` (geen Python - geen GPU-voordeel)

Wijzigt op intelligente wijze de afmetingen van afbeeldingen door naden met lage energie te verwijderen, waarbij belangrijke inhoud behouden blijft.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `width` | number | - | Doelbreedte |
| `height` | number | - | Doelhoogte |
| `protectFaces` | boolean | `false` | Gedetecteerde gezichtsregio's beschermen (vereist `face-detection`-bundel) |
| `blurRadius` | number (0-20) | `4` | Voorvervaging voor energieberekening |
| `sobelThreshold` | number (1-20) | `2` | Drempel voor randgevoeligheid |
| `square` | boolean | `false` | Vierkante uitvoer forceren |

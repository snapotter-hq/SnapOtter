---
description: "AI-engine-referentie met alle lokale ML-tools. Achtergrondverwijdering, upscaling, OCR, gezichtsdetectie, fotorestauratie en meer."
i18n_output_hash: 6c642f2518a9
i18n_source_hash: aa9a56cdddc7
i18n_provenance: human
---

# AI-engine-referentie {#ai-engine-reference}

Het `@snapotter/ai`-pakket coördineert native tools en Python-runtimes voor lokale ML-bewerkingen. De meeste ML-tools gebruiken een persistente Python sidecar voor snelle warme starts. OCR is opzettelijk gescheiden: `fast` roept het oorspronkelijke Tesseract binaire bestand aan, terwijl `balanced` en `best` een speciale persistente JSONL dispatcher gebruiken die is vastgemaakt aan de actieve onveranderlijke RapidOCR-generatie onder `/data/ai/v3`. Elk verzoek bevat een generation lease. Tijdens een upgrade voert SnapOtter een smoke test uit op de kandidaat vóór activering, schakelt atomair over naar de nieuwe dispatcher en leegt vervolgens de oude generatie vóór garbage collection.

NVIDIA CUDA wordt automatisch gedetecteerd en gebruikt door runtimes die dit ondersteunen. OCR gebruikt CPU op elke host, inclusief systemen met NVIDIA GPU's, waardoor CUDA en driverkoppeling voor deze tool worden vermeden.

Intel/AMD iGPU-versnelling via VA-API, Quick Sync of OpenCL wordt vandaag niet ondersteund voor AI-inferentie. Het toewijzen van `/dev/dri` aan een container versnelt deze Python-sidecar-tools niet, tenzij er een CUDA-compatibele NVIDIA-GPU beschikbaar is.

19 Python-sidecar-AI-tools verdeeld over vier modaliteiten (afbeelding, audio, video, document), plus 2 tools met optionele AI-mogelijkheden. Alle modellen draaien lokaal: na de eerste modeldownload is er geen internet vereist.


<!-- korean-ocr-contract:start -->
::: info Compatibiliteit voor Koreaanse OCR
Snelle OCR ondersteunt `auto`, `en`, `de`, `es`, `fr`, `zh` en `ja`, maar geen Koreaans (`ko`). Koreaans vereist het nauwkeurige OCR-pakket en `balanced` of `best`. Het pakket werkt in officiële Linux amd64- en arm64-containers, ook op NVIDIA-hosts waar OCR op de CPU blijft draaien. Niet-ondersteunde systemen krijgen een expliciete compatibiliteitsfout en vallen nooit stil terug op `fast`. Koreaans met `fast` of de oude alias `tesseract` wordt vóór het in de wachtrij plaatsen geweigerd met `FEATURE_INCOMPATIBLE` en `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## Architectuur {#architecture}

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

Een apart "docs"-dispatcher-profiel vervangt de AI-allowlist door scripts voor documentverwerking (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) en slaat zware ML-imports over.

**Time-outs:** 300 s standaard; OCR en BiRefNet-achtergrondverwijdering krijgen 600 s.

## Feature-bundels {#feature-bundles}

AI-modellen worden per gedeelde dependency-stack gebundeld, niet één archief per tool. Een feature-bundel kan meerdere tools inschakelen wanneer ze dezelfde modelfamilie, Python-wheels of native libraries gebruiken. Dit houdt de release-Docker-image kleiner en voorkomt het opslaan van dubbele kopieën van dezelfde achtergrondmatting-, gezichtsdetectie-, OCR-, restauratie- en spraakmodellen.

De Docker-image levert de applicatie plus de gedeelde runtime. Grote modelarchieven worden op aanvraag gedownload naar het persistente `/data/ai`-volume en vervolgens hergebruikt door elke tool die ze nodig heeft. Als een bundel al geïnstalleerd is omdat een andere tool deze nodig had, downloadt het inschakelen van een nieuwe afhankelijke tool die bundel niet opnieuw.

De meeste AI-tools hebben een of meer functiebundels nodig voordat ze kunnen worden uitgevoerd. De beheerdersinterface installeert deze per tool via `POST /api/v1/admin/tools/:toolId/features/install`, die de volledige bundellijst oplost, bundels overslaat die al zijn geïnstalleerd en alleen de ontbrekende downloads in de wachtrij plaatst. Als u bijvoorbeeld Passport Photo inschakelt op een nieuw exemplaar, staan ​​de wachtrijen `background-removal` en `face-detection` in; inschakelen nadat Achtergrondverwijdering al is geïnstalleerd, alleen wachtrijen `face-detection`. OCR is de uitzondering omdat `fast` geen pakket nodig heeft; installeer de optionele nauwkeurige runtime via de gebruikersinterface of `POST /api/v1/admin/features/ocr/install`.

| Bundel | Grootte | Gedeelde dependency-groep | Tools die het gebruiken |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet-achtergrondmatting | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | MediaPipe-gezichtsdetectie en -landmarks | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa inpainting/outpainting en DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, denoising | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | krasreparatie- en restauratiepijplijn | restore-photo |
| `ocr` | ~208-234 MiB downloaden / ~409-488 MiB geïnstalleerd | Optionele RapidOCR 3.9.1-, ONNX Runtime 1.20.1- en vastgezette PP-OCR-modellen | ocr, ocr-pdf (alleen `balanced` en `best`) |
| `transcription` | ~600 MB | faster-whisper spraak-naar-tekst-modellen | transcribe-audio, auto-subtitles |

Tools met bundeloverschrijdende afhankelijkheden:

| Tool | Vereiste bundels | Waarom |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Verwijdert de achtergrond en gebruikt vervolgens gezichtslandmarks om de uitsnede te kaderen volgens de regels voor pasfoto's en ID-foto's. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Detecteert gezichten voordat GFPGAN- of CodeFormer-verbetering op de geselecteerde gezichtsregio's wordt uitgevoerd. |

Een tool is alleen beschikbaar als alle vereiste bundels zijn geïnstalleerd, behalve OCR: de ingebouwde `fast`-laag blijft beschikbaar zonder het optionele OCR-pakket. Gedeeltelijke installaties zijn geldig en worden stapsgewijs afgehandeld: geïnstalleerde bundels worden hergebruikt, ontbrekende bundels worden weergegeven als downloads en installaties in de wachtrij worden één voor één uitgevoerd, zodat de gedeelde Python-omgeving niet tegelijkertijd wordt gewijzigd.

### Nauwkeurige OCR runtime-installatie {#accurate-ocr-runtime-installation}

Het nauwkeurige OCR-pakket is een platformspecifieke runtime voor de officiële Linux amd64 of Linux arm64-container. De amd64-build maakt gebruik van Python 3.12; de arm64-build maakt gebruik van Python 3.11. Beide builds draaien RapidOCR via ONNX Runtime's `CPUExecutionProvider`, dus hetzelfde pakket werkt alleen op CPU- en NVIDIA Docker-hosts. De nauwkeurige runtime vereist minimaal 4 GiB effectief geheugen: de geconfigureerde container cgroup-limiet, anders hostgeheugen. Een systeem onder het ondertekende compatibiliteitsminimum wordt vóór het downloaden afgewezen. Deze vereiste geldt niet voor ingebouwde Fast OCR. Bare-metal-builds worden afgewezen omdat hun libc en Python ABI niet veilig kunnen worden afgeleid; Snelle OCR blijft beschikbaar wanneer de host Tesseract en Ghostscript biedt.

Het optionele artefact is ongeveer 208-234 MiB gecomprimeerd en 409-488 MiB geëxtraheerd, afhankelijk van de architectuur. De ondertekende index bindt de exacte gecomprimeerde en geëxtraheerde bytetellingen die door het installatieprogramma worden afgedwongen. Ingebouwde Tesseract voegt ongeveer 25 MiB toe aan de officiële image en heeft geen bestanden nodig in `/data/ai`.

Online installatie haalt een ondertekende release-index en het exacte op de inhoud geadresseerde artefact voor het huidige platform op. SnapOtter verifieert de Ed25519-indexhandtekening, artefactgrootte, SHA-256-samenvatting, modelsamenvattingen, paden, bestandsmodi en geënsceneerde smoke test voordat de nieuwe generatie atomair wordt geactiveerd. Bij een mislukte installatie blijft de vorige gezonde generatie actief.

Voor air-gapped installatie uploadt u zowel de `ocr-runtime-index.json` van de release als het bijbehorende OCR runtime-archief naar `POST /api/v1/admin/features/import` met behulp van meerdelige velden genaamd `index` en `archive`. Bij offline importeren worden dezelfde handtekening-, hash-, extractie-, compatibiliteits- en rooktestcontroles toegepast als bij online installatie; een archief zonder de vertrouwde ondertekende index wordt afgewezen.

---

## Achtergrondverwijdering {#background-removal}

**Toolroute:** `remove-background`  
**Model:** rembg met BiRefNet (standaard) of U2-Net-varianten

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `model` | string | - | Modelvariant (optionele override) |
| `backgroundType` | string | `"transparent"` | Een van: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Hex-kleur voor effen achtergrond |
| `gradientColor1` | string | - | Eerste verloopkleur |
| `gradientColor2` | string | - | Tweede verloopkleur |
| `gradientAngle` | number | - | Verloophoek in graden |
| `blurEnabled` | boolean | - | Achtergrondvervaging inschakelen |
| `blurIntensity` | number (0-100) | - | Vervagingsintensiteit |
| `shadowEnabled` | boolean | - | Slagschaduw op onderwerp inschakelen |
| `shadowOpacity` | number (0-100) | - | Schaduwdekking |
| `outputFormat` | string | - | Uitvoerformaat: `png`, `webp`, of `avif` |
| `edgeRefine` | integer (0-3) | - | Niveau van randverfijning |
| `decontaminate` | boolean | - | Kleurdoorloop van randen verwijderen |

## Achtergrond vervangen {#background-replace}

**Toolroute:** `background-replace`  
**Model:** rembg / BiRefNet (gedeeld met remove-background)

Verwijdert de achtergrond en vervangt deze door een effen kleur of verloop.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Achtergrondmodus |
| `color` | string | `"#ffffff"` | Hex-achtergrondkleur (wanneer `backgroundType` `color` is) |
| `gradientColor1` | string | - | Eerste hex-verloopkleur |
| `gradientColor2` | string | - | Tweede hex-verloopkleur |
| `gradientAngle` | integer (0-360) | `180` | Verloophoek in graden |
| `feather` | integer (0-20) | `0` | Straal van randvervaging |
| `format` | `"png"` \| `"webp"` | `"png"` | Uitvoerformaat |

## Achtergrond vervagen {#blur-background}

**Toolroute:** `blur-background`  
**Model:** rembg / BiRefNet (gedeeld met remove-background)

Vervaagt de achtergrond terwijl het onderwerp scherp blijft.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Vervagingsintensiteit |
| `feather` | integer (0-20) | `0` | Straal van randvervaging |
| `format` | `"png"` \| `"webp"` | `"png"` | Uitvoerformaat |

## Afbeelding upscalen {#image-upscaling}

**Toolroute:** `upscale`  
**Model:** RealESRGAN (met Lanczos-fallback wanneer niet beschikbaar)

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Upscale-factor |
| `model` | string | `"auto"` | Modelvariant |
| `faceEnhance` | boolean | `false` | GFPGAN-gezichtsverbeteringspas toepassen |
| `denoise` | number | `0` | Denoising-sterkte |
| `format` | string | `"auto"` | Override van uitvoerformaat |
| `quality` | number | `95` | Uitvoerkwaliteit (1-100) |

## OCR / Tekstextractie {#ocr-text-extraction}

**Toolroute:** `ocr`  
**Modellen:** Tesseract (`fast`); RapidOCR met PP-OCRv6 kleine modellen (`balanced`); PP-OCRv6 middelgrote modellen met gekalibreerde variantscore (`best`)

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | Dynamisch | Als `quality` en `engine` zijn weggelaten, kiest SnapOtter de beste beschikbare laag in deze volgorde: `best`, `balanced`, `fast`. Voor Koreaans wordt `fast` nooit gekozen; het gebruikt `best`, daarna `balanced`, of geeft een installatie- of compatibiliteitsfout voor de nauwkeurige runtime terug. |
| `language` | string | `"auto"` | Taal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | Booleaans | Niveau-afhankelijk | Verbeter het lokale contrast. Snel past het direct toe; nauwkeurige niveaus behouden de variant alleen als de gekalibreerde score OCR verbetert. Standaard ingeschakeld voor Beste |
| `engine` | snaar | - | Verouderde compatibiliteitsalias. Wijst `tesseract` toe aan `fast` en de oude `paddleocr`-waarde aan `balanced`; PaddlePaddle wordt niet geladen |

Retourneert geëxtraheerde tekst plus metagegevens over de herkomst: engine, gevraagde en werkelijke kwaliteit, apparaat, provider, degradatiestatus, waarschuwingen en nauwkeurige runtime-/modelversies, indien van toepassing. Expliciete kwaliteitsverzoeken vallen nooit terug naar een ander niveau. Als `balanced` of `best` niet beschikbaar is, retourneert API `FEATURE_NOT_INSTALLED` of `FEATURE_INCOMPATIBLE` in plaats van `fast` stil uit te voeren.

## PDF-OCR {#pdf-ocr}

**Toolroute:** `ocr-pdf`  
**Modellen:** Hetzelfde niveausysteem als afbeeldings-OCR

Extraheert tekst uit gescande PDF-documenten met AI-gestuurde OCR, pagina voor pagina.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | Dynamisch | Als `quality` en `engine` zijn weggelaten, kiest SnapOtter de beste beschikbare laag in deze volgorde: `best`, `balanced`, `fast`. Voor Koreaans wordt `fast` nooit gekozen; het gebruikt `best`, daarna `balanced`, of geeft een installatie- of compatibiliteitsfout voor de nauwkeurige runtime terug. |
| `language` | string | `"auto"` | Taal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Paginaselectie: `"all"`, `"1-3"`, `"1,3,5"` |
| `enhance` | Booleaans | Niveau-afhankelijk | Verbeter het lokale contrast. Snel past het direct toe; nauwkeurige niveaus behouden de variant alleen als de gekalibreerde score OCR verbetert. Standaard ingeschakeld voor Beste |
| `engine` | snaar | - | Verouderde compatibiliteitsalias. Wijst `tesseract` toe aan `fast` en de oude `paddleocr`-waarde aan `balanced`; PaddlePaddle wordt niet geladen |

Dezelfde regel zonder downgrade is van toepassing op PDF OCR. PDF-pagina's worden vóór herkenning gerasterd, en één verzoek kan maximaal 50 pagina's selecteren.

## Gezicht / PII vervagen {#face-pii-blur}

**Toolroute:** `blur-faces`  
**Model:** MediaPipe-gezichtsdetectie

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Straal van gaussische vervaging |
| `sensitivity` | number (0-1) | `0.5` | Drempel voor detectiebetrouwbaarheid |

## Gezichtsverbetering {#face-enhancement}

**Toolroute:** `enhance-faces`  
**Modellen:** GFPGAN, CodeFormer

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Verbeteringsmodel |
| `strength` | number (0-1) | `0.8` | Verbeteringssterkte |
| `sensitivity` | number (0-1) | `0.5` | Gezichtsdetectiedrempel |
| `onlyCenterFace` | boolean | `false` | Alleen het meest centrale gezicht verbeteren |

## AI-inkleuring {#ai-colorization}

**Toolroute:** `colorize`  
**Model:** DDColor (met OpenCV DNN-fallback)

Zet zwart-wit- of grijswaardenfoto's om naar volledige kleur.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Sterkte van kleurverzadiging |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Modelvariant |

## Ruisverwijdering {#noise-removal}

**Toolroute:** `noise-removal`  
**Model:** SCUNet (getrapte denoising-pijplijn)

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Verwerkingsniveau |
| `strength` | number (0-100) | `50` | Denoising-sterkte |
| `detailPreservation` | number (0-100) | `50` | Hoeveel detail behouden blijft; hoger behoudt meer textuur |
| `colorNoise` | number (0-100) | `30` | Sterkte van kleurruisreductie |
| `format` | string | `"original"` | Uitvoerformaat: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Kwaliteit van uitvoercodering |

## Rode-ogenverwijdering {#red-eye-removal}

**Toolroute:** `red-eye-removal`

Detecteert gezichtslandmarks, lokaliseert oogregio's en corrigeert oververzadiging van het rode kanaal.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Detectiedrempel voor rode pixels |
| `strength` | number (0-100) | `70` | Correctiesterkte |
| `format` | string | - | Override van uitvoerformaat (optioneel) |
| `quality` | number (1-100) | `90` | Uitvoerkwaliteit |

## Fotorestauratie {#photo-restoration}

**Toolroute:** `restore-photo`

Meerstaps-pijplijn voor oude of beschadigde foto's: detectie en reparatie van krassen/scheuren, gezichtsverbetering, denoising en optionele inkleuring.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Krassen en scheuren detecteren en repareren |
| `faceEnhancement` | boolean | `true` | Gezichtsverbeteringspas toepassen |
| `fidelity` | number (0-1) | `0.7` | Sterkte van gezichtsverbetering (hoger = behoudender) |
| `denoise` | boolean | `true` | Denoising-pas toepassen |
| `denoiseStrength` | number (0-100) | `25` | Denoising-sterkte |
| `colorize` | boolean | `false` | Inkleuren na restauratie |
| `colorizeStrength` | number (0-100) | `85` | Inkleurintensiteit |

## Pasfoto {#passport-photo}

**Toolroute:** `passport-photo`  
**Modellen:** MediaPipe-gezichtslandmarks + BiRefNet-achtergrondverwijdering

Workflow in twee fasen: analyseren (gezicht detecteren + achtergrond verwijderen) en vervolgens genereren (uitsnijden, formaat wijzigen, tegelen). Ondersteunt meer dan 37 landen in 6 regio's.

### Fase 1: Analyseren {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Accepteert een afbeeldingsbestand (multipart). Retourneert gezichtslandmark-gegevens, een base64-voorbeeld en afbeeldingsafmetingen.

### Fase 2: Genereren {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Accepteert een JSON-body met de resultaten van fase 1 plus generatie-instellingen:

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `jobId` | string | (vereist) | Job-ID uit fase 1 |
| `filename` | string | (vereist) | Oorspronkelijke bestandsnaam uit fase 1 |
| `countryCode` | string | (vereist) | ISO-landcode (bijv. `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Documenttype |
| `bgColor` | string | `"#FFFFFF"` | Hex-achtergrondkleur |
| `printLayout` | string | `"none"` | Afdruklay-out: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Max. bestandsgrootte in KB (0 = geen limiet) |
| `dpi` | number (72-1200) | `300` | Uitvoer-DPI |
| `customWidthMm` | number | - | Aangepaste breedte in mm (overschrijft landspecificatie) |
| `customHeightMm` | number | - | Aangepaste hoogte in mm (overschrijft landspecificatie) |
| `zoom` | number (0.5-3) | `1` | Zoomfactor |
| `adjustX` | number | `0` | Horizontale positieaanpassing |
| `adjustY` | number | `0` | Verticale positieaanpassing |
| `landmarks` | object | (vereist) | Landmarks uit fase 1 |
| `imageWidth` | number | (vereist) | Afbeeldingsbreedte uit fase 1 |
| `imageHeight` | number | (vereist) | Afbeeldingshoogte uit fase 1 |

## Objecten wissen (Inpainting) {#object-erasing-inpainting}

**Toolroute:** `erase-object`  
**Model:** LaMa via ONNX Runtime

Het masker wordt verzonden als een **tweede bestandsdeel** (fieldname `mask`), niet als base64. Witte pixels in het masker geven gebieden aan die gewist moeten worden. De instellingen `format` en `quality` worden verzonden als velden op het hoogste niveau van het formulier.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `file` | file | (vereist) | Bronafbeelding (multipart) |
| `mask` | file | (vereist) | Maskerafbeelding (multipart, fieldname `mask`, wit = wissen) |
| `format` | string | `"auto"` | Uitvoerformaat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Uitvoerkwaliteit |

CUDA-versneld wanneer een NVIDIA-GPU beschikbaar is.

## AI-canvas uitbreiden {#ai-canvas-expand}

**Toolroute:** `ai-canvas-expand`  
**Model:** LaMa-gebaseerde outpainting

Breidt het canvas van een afbeelding in elke richting uit en vult nieuwe gebieden met door AI gegenereerde inhoud die aansluit op de bestaande afbeelding.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Aantal pixels om bovenaan uit te breiden |
| `extendRight` | integer | `0` | Aantal pixels om rechts uit te breiden |
| `extendBottom` | integer | `0` | Aantal pixels om onderaan uit te breiden |
| `extendLeft` | integer | `0` | Aantal pixels om links uit te breiden |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Kwaliteitsniveau |
| `format` | string | `"auto"` | Uitvoerformaat: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Uitvoerkwaliteit |

Ten minste één uitbreidingsrichting moet groter zijn dan 0.

## Slim uitsnijden {#smart-crop}

**Toolroute:** `smart-crop`  
**Model:** MediaPipe-gezichtsdetectie (alleen gezichtsmodus)

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Uitsnijstrategie: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Strategie voor onderwerpmodus |
| `width` | integer | - | Uitvoerbreedte |
| `height` | integer | - | Uitvoerhoogte |
| `padding` | integer (0-50) | `0` | Percentage opvulling rond onderwerp |
| `facePreset` | string | `"head-shoulders"` | Vaste kadering wanneer `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Gezichtsdetectiedrempel |
| `threshold` | integer (0-255) | `30` | Achtergronddetectiedrempel (trimmodus) |
| `padToSquare` | boolean | `false` | Getrimd resultaat opvullen tot een vierkant |
| `padColor` | string | `"#ffffff"` | Achtergrondkleur voor vierkante opvulling |
| `targetSize` | integer | - | Doelgrootte voor opgevulde uitvoer (pixels) |
| `quality` | integer (1-100) | - | Uitvoerkwaliteit |

Verouderde `mode`-waarden `attention` en `content` worden geaccepteerd en respectievelijk toegewezen aan `subject` en `trim`.

**Gezichtspresets:**

| Preset | Best voor |
|--------|---------|
| `closeup` | Portretfoto's |
| `head-shoulders` | Profielfoto's |
| `upper-body` | LinkedIn / formeel |
| `half-body` | Volledig bovenlichaam |

## Audio transcriberen {#transcribe-audio}

**Toolroute:** `transcribe-audio`  
**Model:** faster-whisper

Zet spraak om naar tekst. Ondersteunt platte tekst, SRT en VTT als uitvoerformaten.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Taal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Uitvoerformaat |

## Automatische ondertiteling {#auto-subtitles}

**Toolroute:** `auto-subtitles`  
**Model:** faster-whisper (extraheert audio uit video en transcribeert vervolgens)

Genereert ondertitelbestanden op basis van het audiospoor van een video.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Taal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Uitvoerformaat voor ondertitels |

## PNG-transparantiehersteller {#png-transparency-fixer}

**Toolroute:** `transparency-fixer`  
**Model:** BiRefNet HR-matting (2048x2048-resolutie)

Herstelt "nep-transparante" PNG's waarbij de achtergrond werd verwijderd maar fringing, halo's of semi-transparante artefacten achterbleven. Gebruikt het hoge-resolutie-mattingmodel van BiRefNet om een schoon alfakanaal te produceren en past vervolgens configureerbare defringe-verwerking toe om kleurverontreiniging langs randen te verwijderen.

**OOM-fallbackketen:** Als BiRefNet HR-matting het beschikbare geheugen overschrijdt, valt de tool automatisch terug op `birefnet-general` en vervolgens op `u2net`.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Sterkte van rand-defringe om kleurverontreiniging te verwijderen |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Uitvoerformaat voor afbeelding |
| `removeWatermark` | boolean | `false` | Voorbewerking voor watermerkverwijdering toepassen (mediaanfilter) |

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

**Toolroute:** `image-enhancement`  
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
| `corrections.denoise` | boolean | `true` | Denoising toepassen |
| `deepEnhance` | boolean | `false` | AI-ruisverwijdering via SCUNet inschakelen (vereist `upscale-enhance`-bundel) |

Er is een aanvullend analyse-endpoint beschikbaar op `POST /api/v1/tools/image/image-enhancement/analyze` dat de gedetecteerde correcties retourneert zonder ze toe te passen.

### Inhoudsbewuste vergroting/verkleining (Seam Carving) {#content-aware-resize-seam-carving}

**Toolroute:** `content-aware-resize`  
**Engine:** Go `caire`-binary (geen Python: geen GPU-voordeel)

Wijzigt op intelligente wijze het formaat van afbeeldingen door naden met lage energie te verwijderen, met behoud van belangrijke inhoud.

| Parameter | Type | Standaard | Beschrijving |
|-----------|------|---------|-------------|
| `width` | number | - | Doelbreedte |
| `height` | number | - | Doelhoogte |
| `protectFaces` | boolean | `false` | Gedetecteerde gezichtsregio's beschermen (vereist `face-detection`-bundel) |
| `blurRadius` | number (0-20) | `4` | Voorvervaging voor energieberekening |
| `sobelThreshold` | number (1-20) | `2` | Drempel voor randgevoeligheid |
| `square` | boolean | `false` | Vierkante uitvoer forceren |

---
description: "Extraheer tekst lokaal uit afbeeldingen met de ingebouwde Tesseract of de optionele zeer nauwkeurige RapidOCR-runtime."
i18n_output_hash: 3b0a511716a7
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Text Extraction {#ocr-text-extraction}

Extraheer tekst uit afbeeldingen zonder de afbeelding naar een externe service te sturen. De ingebouwde `fast`-laag gebruikt Tesseract. De optionele lagen `balanced` en `best` gebruiken RapidOCR met vastgezette PP-OCR ONNX-modellen.


<!-- korean-ocr-contract:start -->
::: info Compatibiliteit voor Koreaanse OCR
Snelle OCR ondersteunt `auto`, `en`, `de`, `es`, `fr`, `zh` en `ja`, maar geen Koreaans (`ko`). Koreaans vereist het nauwkeurige OCR-pakket en `balanced` of `best`. Het pakket werkt in officiële Linux amd64- en arm64-containers, ook op NVIDIA-hosts waar OCR op de CPU blijft draaien. Niet-ondersteunde systemen krijgen een expliciete compatibiliteitsfout en vallen nooit stil terug op `fast`. Koreaans met `fast` of de oude alias `tesseract` wordt vóór het in de wachtrij plaatsen geweigerd met `FEATURE_INCOMPATIBLE` en `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Verwerking:** OCR wordt altijd asynchroon uitgevoerd. Na validatie en plaatsing in de wachtrij retourneert het endpoint onmiddellijk `202 Accepted` met een `jobId`. Volg de SSE-voortgangsstroom van de taak tot de afsluitende gebeurtenis `complete` of `failed`; bij succes bevat de `result` de OCR-velden.

**Nauwkeurig OCR-pakket:** Optionele `ocr`-runtime (ongeveer 208-234 MiB om te downloaden en 409-488 MiB geïnstalleerd, afhankelijk van het doel). `fast` heeft dit pakket niet nodig; het installatieprogramma verifieert de exacte afmetingen die zijn gebonden aan de ondertekende index.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Beeldbestand (meerdere delen), tot 512 MiB gecodeerd en 40 megapixels gedecodeerd; er geldt nog steeds een lagere uploadlimiet voor operators |
| quality | string | Nee | Dynamisch | Kwaliteitsniveau: `fast` (Tesseract), `balanced` (RapidOCR met de kleine PP-OCRv6-modellen) of `best` (de medium PP-OCRv6-modellen met hogere nauwkeurigheid met gekalibreerde variantscores) |
| language | string | Nee | `"auto"` | Taalhint: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Nee | Niveau-afhankelijk | Verbeter het lokale contrast vóór herkenning. Snel past het direct toe; Gebalanceerd en Best behouden de variant alleen als gekalibreerde scores het resultaat verbeteren. Standaard ingesteld op `true` voor `best` en `false` voor `fast`/`balanced` |
| engine | string | Nee | - | Verouderde compatibiliteitsalias. Gebruik in plaats daarvan `quality`. `tesseract` wordt toegewezen aan `fast`; de oude `paddleocr`-waarde wordt toegewezen aan `balanced` maar laadt PaddlePaddle niet |

Als `quality` en `engine` zijn weggelaten, kiest SnapOtter de beste beschikbare laag in deze volgorde: `best`, `balanced`, `fast`. Voor Koreaans wordt `fast` nooit gekozen; het gebruikt `best`, daarna `balanced`, of geeft een installatie- of compatibiliteitsfout voor de nauwkeurige runtime terug.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Geaccepteerd antwoord (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Voortgang en resultaat (SSE) {#progress-sse-optional}

Maak verbinding met `GET /api/v1/jobs/{jobId}/progress` met de `jobId` uit het `202`-antwoord (of de opgegeven `clientJobId`). Houd de stream open tot de afsluitende gebeurtenis `complete` of `failed`. Een geslaagd terminaal frame bevat de OCR-uitvoer in `result`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

Verwerkingsfouten komen aan in het veld `error` van de afsluitende gebeurtenis `failed`; na plaatsing in de wachtrij worden ze niet als HTTP `422` teruggestuurd.

## Notes {#notes}

- `fast` is altijd beschikbaar in ondersteunde SnapOtter-images. Voor `balanced` en `best` is het optionele, nauwkeurige OCR-pakket vereist.
- Ingebouwde Tesseract voegt ongeveer 25 MiB toe aan de officiële afbeelding. Het nauwkeurige pakket wordt opgeslagen in `/data/ai` en niet in de afbeelding ingebakken.
- Het nauwkeurige pakket is gepubliceerd voor de officiële Linux amd64- en arm64-containers. Het maakt bewust gebruik van de CPU-provider van ONNX Runtime, ook op NVIDIA-hosts, dus het is niet afhankelijk van CUDA-bibliotheken of GPU-compatibiliteit. Bron- en vooraf gebouwde bare-metal-installaties gebruiken snelle OCR, tenzij ze hun eigen compatibele runtime bieden.
- De geslaagde terminal-`result` bevat zowel de geëxtraheerde tekst in `text` als een downloadbaar `.txt`-artefact in `downloadUrl`.
- SnapOtter respecteert een expliciet gevraagd niveau. Als `balanced` of `best` niet beschikbaar is, retourneert API `501` met `FEATURE_NOT_INSTALLED` of `FEATURE_INCOMPATIBLE`; het downgradet het verzoek nooit stilletjes naar een ander niveau.
- Een succesvol leeg resultaat blijft een leeg resultaat. Runtime-fouten retourneren een fout in plaats van opnieuw te proberen met een engine van lagere kwaliteit.
- De geslaagde terminal-`result` rapporteert zowel `requestedQuality` als `actualQuality`, plus de motor-, apparaat-, provider-, runtime- en modelversies, en eventuele waarschuwingen.
- Ondersteunt de invoerformaten HEIC/HEIF, RAW, TGA, PSD, EXR en HDR via automatische decodering.
- Extra grote gecodeerde ingangen retourneren `413`. Afbeeldingen groter dan 40 megapixels en OCR-reacties boven hun begrensde uitvoerlimieten worden afgewezen in plaats van gedeeltelijk verwerkt.

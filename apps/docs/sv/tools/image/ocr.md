---
description: "Extrahera text från bilder lokalt med inbyggd Tesseract eller den valfria RapidOCR-körtiden med hög precision."
i18n_output_hash: c4e9a0811cc2
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Textextrahering {#ocr-text-extraction}

Extrahera text från bilder utan att skicka bilden till en extern tjänst. Den inbyggda `fast`-nivån använder Tesseract. De valfria `balanced`- och `best`-nivåerna använder RapidOCR med stiftade PP-OCR ONNX-modeller.


<!-- korean-ocr-contract:start -->
::: info Kompatibilitet för koreansk OCR
Snabb OCR stöder `auto`, `en`, `de`, `es`, `fr`, `zh` och `ja`, men inte koreanska (`ko`). Koreanska kräver det exakta OCR-paketet och `balanced` eller `best`. Paketet fungerar i officiella Linux amd64- och arm64-containrar, även på NVIDIA-värdar där OCR fortsätter köras på CPU. System som inte stöds får ett uttryckligt kompatibilitetsfel och faller aldrig tyst tillbaka till `fast`. Koreanska med `fast` eller det äldre aliaset `tesseract` avvisas före köläggning med `FEATURE_INCOMPATIBLE` och `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Bearbetning:** OCR körs alltid asynkront. Efter validering och köläggning returnerar slutpunkten omedelbart `202 Accepted` med ett `jobId`. Följ jobbets SSE-förloppsström till den avslutande händelsen `complete` eller `failed`; vid ett lyckat resultat innehåller `result` OCR-fälten.

**Exakt OCR-paket:** Valfri `ocr`-körtid (cirka 208-234 MiB att ladda ner och 409-488 MiB installerad, beroende på målet). `fast` kräver inte detta paket; Installationsprogrammet verifierar de exakta storlekarna bundna av det signerade indexet.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (flerdelar), upp till 512 MiB kodade och 40 megapixlar avkodade; en lägre uppladdningsgräns för operatören gäller fortfarande |
| quality | string | Inga | Dynamisk | Kvalitetsnivå: `fast` (Tesseract), `balanced` (RapidOCR med de små PP-OCRv6-modellerna), eller `best` (de medelstora PP-OCRv6-modellerna med högre precision med poängkalibrerade varianter) |
| language | string | Nej | `"auto"` | Språktips: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Inga | Tierberoende | Förbättra den lokala kontrasten före igenkänning. Fast applicerar det direkt; Balanced och Best behåller varianten endast när kalibrerad poängsättning förbättrar resultatet. Standard är `true` för `best` och `false` för `fast`/`balanced` |
| engine | string | Inga | - | Utfasat kompatibilitetsalias. Använd `quality` istället. `tesseract` mappar till `fast`; det äldre `paddleocr`-värdet mappas till `balanced` men laddar inte PaddlePaddle |

När `quality` och `engine` utelämnas väljer SnapOtter den bästa tillgängliga nivån i ordningen `best`, `balanced`, `fast`. För koreanska väljs aldrig `fast`; `best`, sedan `balanced` används, annars returneras installations- eller kompatibilitetsfelet för den exakta körmiljön.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Accepterat svar (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Förlopp och resultat (SSE) {#progress-sse-optional}

Anslut till `GET /api/v1/jobs/{jobId}/progress` med det `jobId` som returnerades i `202`-svaret (eller angivet `clientJobId`). Håll strömmen öppen tills den avslutande händelsen `complete` eller `failed`. En lyckad slutram innehåller OCR-utdata i `result`:

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

Bearbetningsfel levereras i fältet `error` i den avslutande händelsen `failed`; efter köläggning returneras de inte som HTTP `422`.

## Anteckningar {#notes}

- `fast` är alltid tillgänglig i SnapOtter-bilder som stöds. `balanced` och `best` kräver valfritt OCR-paket.
- Inbyggd Tesseract lägger till cirka 25 MiB till den officiella bilden. Den exakta förpackningen lagras i `/data/ai`, inte inbakad i bilden.
- Det korrekta paketet publiceras för de officiella Linux amd64- och arm64-behållarna. Den använder medvetet ONNX Runtime:s CPU-leverantör, inklusive på NVIDIA-värdar, så det beror inte på CUDA-bibliotek eller GPU-kompatibilitet. Käll- och förbyggda bare-metal-installationer använder Fast OCR om de inte tillhandahåller sin egen kompatibla körtid.
- Ett lyckat terminalt `result` innehåller både den extraherade texten i `text` och en nedladdningsbar `.txt`-artefakt i `downloadUrl`.
- SnapOtter hedrar en uttryckligen begärd nivå. Om `balanced` eller `best` inte är tillgänglig, returnerar API `501` med `FEATURE_NOT_INSTALLED` eller `FEATURE_INCOMPATIBLE`; den nedgraderar aldrig förfrågan i tysthet till en annan nivå.
- Ett framgångsrikt tomt resultat förblir ett tomt resultat. Körtidsfel returnerar ett fel istället för att försöka igen med en motor av lägre kvalitet.
- Ett lyckat terminalt `result` rapporterar både `requestedQuality` och `actualQuality`, plus motor, enhet, leverantör, körtid och modellversioner, och eventuella varningar.
- Stöder HEIC/HEIF-, RAW-, TGA-, PSD-, EXR- och HDR-indataformat via automatisk avkodning.
- Överdimensionerade kodade ingångar returnerar `413`. Bilder över 40 megapixlar och OCR-svar över sina gränsade utdatagränser avvisas istället för att delvis bearbetas.

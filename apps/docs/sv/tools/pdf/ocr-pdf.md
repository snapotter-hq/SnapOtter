---
description: "Extrahera text från skannade PDF-filer lokalt med inbyggd Tesseract eller den valfria RapidOCR-körtiden med hög precision."
i18n_output_hash: 3c4cbee240b7
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

Extrahera text från skannade PDF-dokument sida för sida utan att skicka PDF till en extern tjänst. Den inbyggda `fast`-nivån använder Tesseract. De valfria `balanced`- och `best`-nivåerna använder RapidOCR med stiftade PP-OCR ONNX-modeller.


<!-- korean-ocr-contract:start -->
::: info Kompatibilitet för koreansk OCR
Snabb OCR stöder `auto`, `en`, `de`, `es`, `fr`, `zh` och `ja`, men inte koreanska (`ko`). Koreanska kräver det exakta OCR-paketet och `balanced` eller `best`. Paketet fungerar i officiella Linux amd64- och arm64-containrar, även på NVIDIA-värdar där OCR fortsätter köras på CPU. System som inte stöds får ett uttryckligt kompatibilitetsfel och faller aldrig tyst tillbaka till `fast`. Koreanska med `fast` eller det äldre aliaset `tesseract` avvisas före köläggning med `FEATURE_INCOMPATIBLE` och `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Tar emot multipart-formulärdata med en PDF-fil och ett valfritt JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | PDF-fil (flerpart), upp till 512 MiB-kodade; en lägre uppladdningsgräns för operatören gäller fortfarande |
| quality | string | Inga | Dynamisk | OCR kvalitetsnivå: `fast`, `balanced` eller `best` |
| language | string | Nej | `"auto"` | Dokumentspråk: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Nej | `"all"` | Sidval, t.ex. `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | Inga | Tierberoende | Förbättra den lokala kontrasten före igenkänning. Fast applicerar det direkt; Balanced och Best behåller varianten endast när kalibrerad poängsättning förbättrar resultatet. Standard är `true` för `best` och `false` för `fast`/`balanced` |
| engine | string | Inga | - | Utfasat kompatibilitetsalias. Använd `quality` istället. `tesseract` mappar till `fast`; det äldre `paddleocr`-värdet mappas till `balanced` men laddar inte PaddlePaddle |

När `quality` och `engine` utelämnas väljer SnapOtter den bästa tillgängliga nivån i ordningen `best`, `balanced`, `fast`. För koreanska väljs aldrig `fast`; `best`, sedan `balanced` används, annars returneras installations- eller kompatibilitetsfelet för den exakta körmiljön.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

Returnerar `202 Accepted`. Följ förloppet via SSE på `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Godkänt indataformat: `.pdf`.
- `fast` är inbyggd och lägger till cirka 25 MiB till den officiella bilden. `balanced` och `best` kräver det valfria OCR-paketet (ca 208-234 MiB att ladda ner och 409-488 MiB installerat, beroende på målet).
- Det exakta paketet stöder Linux amd64 och arm64 och använder ONNX Runtime på CPU, inklusive på NVIDIA-värdar.
– En uttryckligen begärd nivå nedgraderas aldrig tyst. Om `balanced` eller `best` är otillgängliga, returnerar API `501` med `FEATURE_NOT_INSTALLED` eller `FEATURE_INCOMPATIBLE`.
- PDF-sidor rastreras i hög upplösning före OCR. `best` använder PP-OCRv6-modellerna med högre precision och ger orienterings- och förbättringsvarianter, vilket förbättrar igenkänningen till priset av hastighet.
- Språkinställningen `auto` möjliggör igenkänning över den skriptuppsättning som stöds; en explicit ledtråd kan förbättra resultaten för ett känt dokumentspråk.
- Du kan rikta in dig på specifika sidor med intervall (`"1-3"`), kommaseparerade listor (`"1,3,5"`) eller `"all"` för varje sida.
– En förfrågan kan behandla som mest 50 sidor. Rasteriserade skrapdata är begränsade till 512 MiB och det sammanlagda UTF-8 OCR-svaret är begränsat till 1 000 000 byte; over-limit jobb misslyckas snarare än att returnera deltext.
- För PDF-filer som redan innehåller markerbar text bör du överväga att använda det snabbare verktyget [PDF to Text](./pdf-to-text) istället.

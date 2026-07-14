---
description: "Extraheer tekst lokaal uit gescande PDF's met de ingebouwde Tesseract of de optionele uiterst nauwkeurige RapidOCR-runtime."
i18n_output_hash: eec0a577d772
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# PDF OCR {#pdf-ocr}

Extraheer tekst uit gescande PDF-documenten pagina voor pagina zonder de PDF naar een externe service te sturen. De ingebouwde `fast`-laag maakt gebruik van Tesseract. De optionele lagen `balanced` en `best` gebruiken RapidOCR met vastgezette PP-OCR ONNX-modellen.


<!-- korean-ocr-contract:start -->
::: info Compatibiliteit voor Koreaanse OCR
Snelle OCR ondersteunt `auto`, `en`, `de`, `es`, `fr`, `zh` en `ja`, maar geen Koreaans (`ko`). Koreaans vereist het nauwkeurige OCR-pakket en `balanced` of `best`. Het pakket werkt in officiële Linux amd64- en arm64-containers, ook op NVIDIA-hosts waar OCR op de CPU blijft draaien. Niet-ondersteunde systemen krijgen een expliciete compatibiliteitsfout en vallen nooit stil terug op `fast`. Koreaans met `fast` of de oude alias `tesseract` wordt vóór het in de wachtrij plaatsen geweigerd met `FEATURE_INCOMPATIBLE` en `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een optioneel JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | PDF-bestand (meerdere delen), tot 512 MiB gecodeerd; er geldt nog steeds een lagere uploadlimiet voor operators |
| quality | string | Nee | Dynamisch | OCR-kwaliteitsniveau: `fast`, `balanced` of `best` |
| language | string | Nee | `"auto"` | Documenttaal: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Nee | `"all"` | Paginaselectie, bijv. `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | Nee | Niveau-afhankelijk | Verbeter het lokale contrast vóór herkenning. Snel past het direct toe; Gebalanceerd en Best behouden de variant alleen als gekalibreerde scores het resultaat verbeteren. Standaard ingesteld op `true` voor `best` en `false` voor `fast`/`balanced` |
| engine | string | Nee | - | Verouderde compatibiliteitsalias. Gebruik in plaats daarvan `quality`. `tesseract` wordt toegewezen aan `fast`; de oude `paddleocr`-waarde wordt toegewezen aan `balanced` maar laadt PaddlePaddle niet |

Als `quality` en `engine` zijn weggelaten, kiest SnapOtter de beste beschikbare laag in deze volgorde: `best`, `balanced`, `fast`. Voor Koreaans wordt `fast` nooit gekozen; het gebruikt `best`, daarna `balanced`, of geeft een installatie- of compatibiliteitsfout voor de nauwkeurige runtime terug.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Example Response {#example-response}

Geeft `202 Accepted` terug. Volg de voortgang via SSE op `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Geaccepteerd invoerformaat: `.pdf`.
- `fast` is ingebouwd en voegt ongeveer 25 MiB toe aan de officiële afbeelding. Voor `balanced` en `best` is het optionele, nauwkeurige OCR-pakket vereist (ongeveer 208-234 MiB om te downloaden en 409-488 MiB geïnstalleerd, afhankelijk van het doel).
- Het nauwkeurige pakket ondersteunt Linux amd64 en arm64 en gebruikt ONNX Runtime op CPU, inclusief op NVIDIA-hosts.
- Een expliciet aangevraagd niveau wordt nooit stilzwijgend gedegradeerd. Als `balanced` of `best` niet beschikbaar is, retourneert de API `501` met `FEATURE_NOT_INSTALLED` of `FEATURE_INCOMPATIBLE`.
- PDF-pagina's worden vóór OCR met hoge resolutie gerasterd. `best` voert de PP-OCRv6-modellen met hogere nauwkeurigheid uit en scoort oriëntatie- en verbeteringsvarianten, waardoor de herkenning wordt verbeterd ten koste van de snelheid.
- De taalinstelling `auto` maakt herkenning via de ondersteunde scriptset mogelijk; een expliciete hint kan de resultaten voor een bekende documenttaal verbeteren.
- Je kunt specifieke pagina's aanwijzen met bereiken (`"1-3"`), door komma's gescheiden lijsten (`"1,3,5"`), of `"all"` voor elke pagina.
- Een aanvraag kan maximaal 50 pagina's verwerken. Gerasterde scratch-gegevens zijn beperkt tot 512 MiB en de totale UTF-8 OCR-respons is beperkt tot 1.000.000 bytes; taken die te hoog zijn, mislukken in plaats van een gedeeltelijke tekst terug te geven.
- Voor PDF's die al selecteerbare tekst bevatten, kun je beter het snellere hulpmiddel [PDF to Text](./pdf-to-text) gebruiken.

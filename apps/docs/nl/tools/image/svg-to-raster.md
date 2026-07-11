---
description: "SVG-bestanden converteren naar PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF of JXL met aangepaste resolutie en DPI, inclusief batchondersteuning."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: f79cac860287
---

# SVG naar Raster {#svg-to-raster}

Converteer SVG-bestanden naar rasterafbeeldingsformaten (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF of JXL) met aangepaste resolutie en DPI. Ondersteunt ook batchconversie van meerdere SVG's.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| width | integer | Nee | - | Doelbreedte in pixels (1 tot 65536). Behoudt de beeldverhouding als slechts één dimensie is ingesteld. |
| height | integer | Nee | - | Doelhoogte in pixels (1 tot 65536). Behoudt de beeldverhouding als slechts één dimensie is ingesteld. |
| dpi | integer | Nee | 300 | Render-DPI, bepaalt de basisdichtheid van de rasterisatie (36 tot 2400) |
| quality | number | Nee | 90 | Uitvoerkwaliteit voor lossy formaten (1 tot 100) |
| backgroundColor | string | Nee | `"#00000000"` | Achtergrondkleur als hex (6 of 8 tekens, 8 tekens is inclusief alfa) |
| outputFormat | string | Nee | `"png"` | Uitvoerformaat: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Batch Endpoint {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Converteer meerdere SVG-bestanden in één verzoek. Retourneert een ZIP-archief.

### Aanvullende batchparameters {#additional-batch-parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| clientJobId | string | Nee | - | Optionele, door de client opgegeven job-ID voor voortgangsregistratie (max. 128 tekens) |

### Batch-voorbeeldverzoek {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Batchrespons {#batch-response}

Het batch-endpoint streamt een ZIP-bestand rechtstreeks met headers:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Opmerkingen {#notes}

- Accepteert alleen SVG- en SVGZ-bestanden (valideert de inhoud, niet alleen de extensie). SVGZ wordt automatisch gedecomprimeerd.
- SVG-inhoud wordt vóór het renderen gesaneerd om XSS en het laden van externe bronnen te voorkomen.
- De instelling `dpi` bepaalt de dichtheid waarmee de SVG wordt gerasteriseerd. Een hogere DPI produceert grotere pixelafmetingen vanuit dezelfde SVG-viewport.
- Wanneer zowel `width` als `height` zijn opgegeven, wordt de afbeelding geschaald met `fit: inside` (behoudt de beeldverhouding binnen de grenzen).
- Er wordt een `previewUrl` opgenomen in de respons voor formaten die browsers niet native kunnen weergeven (TIFF, HEIF). De voorbeeldweergave is een WebP-thumbnail van 1200px.
- De standaardachtergrond `#00000000` is volledig transparant. Stel deze in op `#FFFFFF` voor een witte achtergrond (handig bij JPEG-uitvoer, die geen transparantie ondersteunt).
- Batchverwerking respecteert de serverconfiguratie `MAX_BATCH_SIZE` en gebruikt gelijktijdige workers voor prestaties.
- De voortgang van batchbewerkingen kan worden gevolgd via SSE op `/api/v1/jobs/:jobId/progress`.

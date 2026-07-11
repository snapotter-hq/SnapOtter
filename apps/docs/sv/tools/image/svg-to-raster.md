---
description: "Konvertera SVG-filer till PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF eller JXL med anpassad upplösning och DPI, med batchstöd."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: b95821c2ad41
---

# SVG till raster {#svg-to-raster}

Konvertera SVG-filer till rasterbildformat (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF eller JXL) med anpassad upplösning och DPI. Stöder även batchkonvertering av flera SVG-filer.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Målbredd i pixlar (1 till 65536). Bevarar bildförhållandet om endast en dimension anges. |
| height | integer | No | - | Målhöjd i pixlar (1 till 65536). Bevarar bildförhållandet om endast en dimension anges. |
| dpi | integer | No | 300 | Renderings-DPI, styr bastätheten för rasterisering (36 till 2400) |
| quality | number | No | 90 | Utdatakvalitet för destruktiva format (1 till 100) |
| backgroundColor | string | No | `"#00000000"` | Bakgrundsfärg i hex (6 eller 8 tecken, 8 tecken inkluderar alfa) |
| outputFormat | string | No | `"png"` | Utdataformat: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Example Response {#example-response}

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

Konvertera flera SVG-filer i en begäran. Returnerar ett ZIP-arkiv.

### Additional Batch Parameters {#additional-batch-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| clientJobId | string | No | - | Valfritt klienttillhandahållet jobb-ID för förloppsspårning (max 128 tecken) |

### Batch Example Request {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Batch Response {#batch-response}

Batchslutpunkten strömmar en ZIP-fil direkt med rubriker:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Notes {#notes}

- Tar endast emot SVG- och SVGZ-filer (validerar innehåll, inte bara filändelse). SVGZ dekomprimeras automatiskt.
- SVG-innehåll saneras före rendering för att förhindra XSS och laddning av externa resurser.
- Inställningen `dpi` styr tätheten vid vilken SVG-filen rasteriseras. Högre DPI ger större pixeldimensioner från samma SVG-vyport.
- När både `width` och `height` anges storleksändras bilden med `fit: inside` (bevarar bildförhållandet inom gränserna).
- En `previewUrl` inkluderas i svaret för format som webbläsare inte kan visa direkt (TIFF, HEIF). Förhandsvisningen är en 1200px WebP-miniatyr.
- Standardbakgrunden `#00000000` är helt transparent. Ställ in på `#FFFFFF` för en vit bakgrund (användbart med JPEG-utdata som inte stöder transparens).
- Batchbearbetning respekterar serverkonfigurationen `MAX_BATCH_SIZE` och använder samtidiga arbetare för prestanda.
- Förlopp för batchoperationer kan spåras via SSE på `/api/v1/jobs/:jobId/progress`.

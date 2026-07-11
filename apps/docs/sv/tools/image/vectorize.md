---
description: "Konvertera rasterbilder till SVG med svartvit (potrace) och fullfärgs flerlagersvektorisering."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: e341d3dc5c7b
---

# Bild till SVG {#image-to-svg}

Vektorisera rasterbilder till SVG med spårningsalgoritmer. Stöder svartvit spårning (potrace) och fullfärgs flerlagersvektorisering.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colorMode | string | No | `"bw"` | Spårningsläge: `bw` (svartvitt) eller `color` (flerfärgslager) |
| threshold | number | No | 128 | Ljusstyrketröskel för svartvitt läge (0 till 255). Pixlar under blir svarta. |
| colorPrecision | number | No | 6 | Precision för färgkvantisering i färgläge (1 till 16). Högre värden ger fler distinkta färglager. |
| layerDifference | number | No | 6 | Minsta färgskillnad mellan lager i färgläge (1 till 128) |
| filterSpeckle | number | No | 4 | Minsta area för spårade former i pixlar (1 till 256). Tar bort brus/fläckar. |
| pathMode | string | No | `"spline"` | Utjämning av banor: `none` (kantiga), `polygon` (raka segment), `spline` (mjuka kurvor) |
| cornerThreshold | number | No | 60 | Vinkeltröskel för hörndetektering i färgläge (0 till 180 grader) |
| invert | boolean | No | `false` | Invertera bilden före spårning (byt svart/vitt) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Color Vectorization {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Notes {#notes}

- Utdata är alltid en SVG-fil oavsett indataformat.
- Stöder indataformaten HEIC, RAW, PSD och SVG (avkodas automatiskt till raster före spårning).
- Svartvitt läge använder potrace-algoritmen. Bilden konverteras först till gråskala och tröskelvärdesbestäms sedan till rent svartvitt före spårning.
- Färgläge använder ett flerlagerstillvägagångssätt: bilden kvantiseras till färglager, som var och en spåras separat och staplas i SVG-utdatan.
- Lägre värden på `filterSpeckle` bevarar fler detaljer men ger större SVG-filer med fler banor.
- Inställningen `pathMode` påverkar filstorleken avsevärt: `none` ger flest banor, `spline` ger den jämnaste (och vanligtvis minsta) utdatan.
- För bästa resultat med logotyper och ikoner, använd svartvitt läge med en ren indata med hög kontrast. För fotografier eller illustrationer, använd färgläge med högre `colorPrecision`.

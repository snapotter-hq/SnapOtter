---
description: "AI-driven generator för pass- och ID-foton med ansiktsigenkänning, bakgrundsborttagning och plattläggning för utskriftsark."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: e44237afe18a
---

# Passfoto {#passport-photo}

AI-driven generator för pass- och ID-foton. Arbetsflöde i två faser: analysera (ansiktsigenkänning + bakgrundsborttagning) och sedan generera (beskär, ändra storlek och lägg ut för utskrift).

## API-slutpunkter {#api-endpoints}

Detta verktyg använder ett tvåfasflöde med separata slutpunkter för analys och generering.

**Modellpaket:** `background-removal` och `face-detection`

---

### Fas 1: Analysera {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Detekterar ansiktslandmärken och tar bort bakgrunden. Returnerar landmärkesdata och en förhandsvisning för att frontenden ska kunna visa en beskärningsförhandsvisning.

#### Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bildfil (multipart) |
| clientJobId | string | Nej | - | Valfritt jobb-ID för förloppsspårning via SSE |

#### Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Svar (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Förlopp (SSE, valfritt) {#progress-sse-optional}

Om `clientJobId` anges strömmas förloppet (0-30 % för ansiktsigenkänning, 30-95 % för bakgrundsborttagning).

#### Fel: Inget ansikte hittades (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Fas 2: Generera {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Beskär, ändrar storlek och lägger valfritt ut fotot på ett utskriftsark. Använder cachade bilder från fas 1 (ingen ny AI-körning).

#### Parametrar (JSON-kropp) {#parameters-json-body}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| jobId | string | Ja | - | Jobb-ID från fas 1 |
| filename | string | Ja | - | Ursprungligt filnamn från fas 1 |
| countryCode | string | Ja | - | Landskod för passpecifikation (t.ex. `US`, `GB`, `IN`) |
| documentType | string | Nej | `"passport"` | Dokumenttyp (från landsspecifikation) |
| bgColor | string | Nej | `"#FFFFFF"` | Bakgrundsfärg i hex |
| printLayout | string | Nej | `"none"` | Utskriftspappersets layout: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | Nej | `0` | Maximal filstorleksbegränsning i KB (0 = ingen gräns) |
| dpi | number | Nej | `300` | Utdata-DPI (72-1200) |
| customWidthMm | number | Nej | - | Egen fotobredd i mm (åsidosätter landsspecifikation) |
| customHeightMm | number | Nej | - | Egen fotohöjd i mm (åsidosätter landsspecifikation) |
| zoom | number | Nej | `1` | Zoomfaktor (0.5-3). Värden > 1 beskär hårdare |
| adjustX | number | Nej | `0` | Horisontell positionsjustering |
| adjustY | number | Nej | `0` | Vertikal positionsjustering |
| landmarks | object | Ja | - | Landmärkesobjekt från svaret i fas 1 |
| imageWidth | number | Ja | - | Bildbredd från svaret i fas 1 |
| imageHeight | number | Ja | - | Bildhöjd från svaret i fas 1 |

#### Exempelförfrågan {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Svar (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Basrutt {#base-route}

`POST /api/v1/tools/image/passport-photo`

Returnerar vägledning om att använda rätt underslutpunkt.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Anteckningar {#notes}

- Kräver att modellpaketen `background-removal` och `face-detection` är installerade.
- Fas 1 kör AI (ansiktslandmärken + bakgrundsborttagning) och cachar resultaten. Fas 2 är ren Sharp-bildmanipulering (snabb, ingen AI behövs).
- Landmärken returneras som normaliserade koordinater (intervall 0-1 relativt bilddimensionerna).
- Fältet `preview` i analyssvaret är en base64-kodad PNG (max 800 px bred) för snabb visning.
- Landsspecifikationer inkluderar dokumentdimensioner, huvudhöjdsförhållanden och positionering av ögonlinjen baserat på officiella krav för passfoton.
- Alternativet `printLayout` genererar ett plattlagt ark på 4x6\"- eller A4-papper med 2 mm mellanrum mellan fotona.
- När `maxFileSizeKb` är satt komprimeras utdata iterativt för att rymmas inom storleksgränsen.

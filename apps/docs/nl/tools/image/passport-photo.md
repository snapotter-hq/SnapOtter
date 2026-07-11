---
description: "AI-aangedreven generator voor pasfoto's en ID-foto's met gezichtsdetectie, achtergrondverwijdering en het tegelen van printvellen."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 6800a32f93e2
---

# Passport Photo {#passport-photo}

AI-aangedreven generator voor pasfoto's en ID-foto's. Workflow in twee fasen: analyseren (gezichtsdetectie + achtergrondverwijdering) en vervolgens genereren (bijsnijden, verkleinen en tegelen voor het printen).

## API Endpoints {#api-endpoints}

Deze tool gebruikt een flow in twee fasen met aparte endpoints voor analyse en generatie.

**Modelbundels:** `background-removal` en `face-detection`

---

### Phase 1: Analyze {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Detecteert gezichtskenmerken en verwijdert de achtergrond. Geeft kenmerkgegevens en een voorbeeld terug zodat de frontend een voorbeeld van de uitsnede kan tonen.

#### Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| clientJobId | string | Nee | - | Optioneel job-ID voor voortgangsregistratie via SSE |

#### Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Response (200 OK) {#response-200-ok}

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

#### Progress (SSE, optional) {#progress-sse-optional}

Als `clientJobId` is opgegeven, wordt de voortgang gestreamd (0-30% voor gezichtsdetectie, 30-95% voor achtergrondverwijdering).

#### Error: No Face Detected (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Phase 2: Generate {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Snijdt de foto bij, verkleint deze en tegelt hem optioneel op een printvel. Gebruikt de in de cache opgeslagen afbeeldingen uit Fase 1 (geen herhaling van de AI).

#### Parameters (JSON body) {#parameters-json-body}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| jobId | string | Ja | - | Job-ID uit Fase 1 |
| filename | string | Ja | - | Oorspronkelijke bestandsnaam uit Fase 1 |
| countryCode | string | Ja | - | Landcode voor de pasfotospecificatie (bijv. `US`, `GB`, `IN`) |
| documentType | string | Nee | `"passport"` | Documenttype (uit de landspecificatie) |
| bgColor | string | Nee | `"#FFFFFF"` | Hex-code van de achtergrondkleur |
| printLayout | string | Nee | `"none"` | Lay-out van het printpapier: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | Nee | `0` | Beperking van de maximale bestandsgrootte in KB (0 = geen limiet) |
| dpi | number | Nee | `300` | Uitvoer-DPI (72-1200) |
| customWidthMm | number | Nee | - | Aangepaste fotobreedte in mm (overschrijft de landspecificatie) |
| customHeightMm | number | Nee | - | Aangepaste fotohoogte in mm (overschrijft de landspecificatie) |
| zoom | number | Nee | `1` | Zoomfactor (0.5-3). Waarden > 1 snijden strakker bij |
| adjustX | number | Nee | `0` | Horizontale positieaanpassing |
| adjustY | number | Nee | `0` | Verticale positieaanpassing |
| landmarks | object | Ja | - | Kenmerken-object uit de respons van Fase 1 |
| imageWidth | number | Ja | - | Afbeeldingsbreedte uit de respons van Fase 1 |
| imageHeight | number | Ja | - | Afbeeldingshoogte uit de respons van Fase 1 |

#### Example Request {#example-request-1}

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

#### Response (200 OK) {#response-200-ok-1}

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

### Base Route {#base-route}

`POST /api/v1/tools/image/passport-photo`

Geeft richtlijnen om het juiste sub-endpoint te gebruiken.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notes {#notes}

- Vereist dat de modelbundels `background-removal` en `face-detection` zijn geïnstalleerd.
- Fase 1 draait de AI (gezichtskenmerken + achtergrondverwijdering) en slaat de resultaten op in de cache. Fase 2 is pure beeldbewerking met Sharp (snel, geen AI nodig).
- Kenmerken worden teruggegeven als genormaliseerde coördinaten (bereik 0-1 ten opzichte van de afbeeldingsafmetingen).
- Het veld `preview` in de analyserespons is een base64-gecodeerde PNG (max. 800px breed) voor snelle weergave.
- Landspecificaties bevatten documentafmetingen, verhoudingen voor de hoofdhoogte en de positionering van de ooglijn op basis van officiële eisen voor pasfoto's.
- De optie `printLayout` genereert een getegeld vel op 4x6\"- of A4-papier met een tussenruimte van 2 mm tussen de foto's.
- Wanneer `maxFileSizeKb` is ingesteld, wordt de uitvoer iteratief gecomprimeerd om binnen de groottelimiet te passen.

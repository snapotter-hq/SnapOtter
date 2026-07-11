---
description: "Onderwerp-, gezichts- en entropiebewust bijsnijden dat afbeeldingen slim kadreert met Sharp en AI-gezichtsherkenning."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: e307e0e518c3
---

# Smart Crop {#smart-crop}

Slim bijsnijden op basis van onderwerp, gezicht of trim. Gebruikt de attention/entropy-strategieën van Sharp en AI-gezichtsherkenning voor intelligente kadrering.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Verwerking:** Asynchroon (retourneert 202, poll `/api/v1/jobs/{jobId}/progress` voor de status via SSE)

**Modelbundel:** `face-detection` (200-300 MB) - alleen vereist voor de modus `face`

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Afbeeldingsbestand (multipart) |
| mode | string | Nee | `"subject"` | Bijsnijmodus: `subject`, `face`, `trim`. (De verouderde waarden `attention` en `content` verwijzen naar `subject` en `trim`) |
| strategy | string | Nee | `"attention"` | Strategie voor de onderwerpmodus: `attention` of `entropy` |
| width | integer | Nee | - | Doelbreedte in pixels |
| height | integer | Nee | - | Doelhoogte in pixels |
| padding | integer | Nee | `0` | Opvulpercentage rond het onderwerp (0-50) |
| facePreset | string | Nee | `"head-shoulders"` | Preset voor gezichtskadrering: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | Nee | `0.5` | Gevoeligheid van gezichtsherkenning (0-1) |
| threshold | integer | Nee | `30` | Trimmodusdrempel voor achtergronddetectie (0-255) |
| padToSquare | boolean | Nee | `false` | Getrimd resultaat opvullen tot een vierkant |
| padColor | string | Nee | `"#ffffff"` | Achtergrondkleur voor de opvulling |
| targetSize | integer | Nee | - | Doelgrootte voor de opgevulde uitvoer (pixels) |
| quality | integer | Nee | - | Uitvoerkwaliteit (1-100) |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
```

## Respons {#response}

### Eerste respons (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Voortgang (SSE op `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","percent":50}
```

### Eindresultaat (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modi {#modes}

### Onderwerpmodus {#subject-mode}
Gebruikt de attention- of entropy-strategie van Sharp om het visueel meest interessante gebied te vinden en snijdt daaromheen bij.

### Gezichtsmodus {#face-mode}
Detecteert gezichten met AI en kadreert de uitsnede vervolgens rond de gevonden gezichten met de opgegeven `facePreset`. Valt terug op de onderwerpmodus (attention-strategie) als er geen gezichten worden gedetecteerd.

### Trimmodus {#trim-mode}
Verwijdert uniforme randen/achtergrond uit de afbeelding. Vult het resultaat optioneel op tot een vierkant met een opgegeven achtergrondkleur en doelgrootte.

## Opmerkingen {#notes}

- Dit gereedschap gebruikt de factory `createToolRoute` met `executionHint: "long"`, dus het retourneert 202 met SSE-voortgang.
- De gezichtsmodus vereist de modelbundel `face-detection` (200-300 MB).
- De onderwerp- en trimmodi werken zonder enige AI-modelbundel.
- De `facePreset` bepaalt hoe strak de uitsnede gedetecteerde gezichten kadreert: `closeup` is het strakst, `half-body` is het ruimst.
- Als er geen breedte/hoogte is opgegeven, is de standaard 1080x1080.

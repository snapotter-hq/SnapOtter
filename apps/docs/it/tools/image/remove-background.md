---
description: "Rimozione dello sfondo basata sull'AI con effetti opzionali (sfocatura, ombra, gradiente, sfondo personalizzato)."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: dad99fea9f5b
---

# Remove Background {#remove-background}

Rimozione dello sfondo basata sull'AI con effetti opzionali (sfocatura, ombra, gradiente, sfondo personalizzato).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Elaborazione:** Asincrona (restituisce 202, esegui il polling su `/api/v1/jobs/{jobId}/progress` per lo stato tramite SSE)

**Bundle del modello:** `background-removal` (4-5 GB)

## Parameters {#parameters}

La Fase 1 rimuove lo sfondo e memorizza in cache la maschera PNG trasparente e l'immagine originale. La sostituzione dello sfondo, la sfocatura, l'ombra esterna e la conversione del formato di output vengono applicate nella [Fase 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) (oppure quando `remove-background` viene eseguito come passaggio di una pipeline o come job batch); passare questi campi alla Fase 1 restituisce 400.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File immagine (multipart) |
| model | string | No | - | Variante del modello AI da usare |
| edgeRefine | integer | No | - | Livello di rifinitura dei bordi (0-3) |
| decontaminate | boolean | No | - | Rimuovi lo sbordamento di colore dai bordi |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Effects Endpoint (Phase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Riapplica gli effetti di sfondo senza rieseguire il modello AI. Usa la maschera in cache e l'originale dalla Fase 1.

### Parameters {#parameters-1}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| settings | JSON | Yes | - | JSON con le impostazioni degli effetti (vedi sotto) |
| backgroundImage | file | Obbligatorio quando `backgroundType` è `image` | - | Immagine di sfondo personalizzata (quando backgroundType è `image`) |

#### Settings JSON fields {#settings-json-fields}

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| jobId | string | Yes | - | ID del job dalla Fase 1 |
| filename | string | Yes | - | Nome file originale dalla Fase 1 |
| backgroundType | string | No | `"transparent"` | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Obbligatorio quando `backgroundType` è `color` | - | Colore esadecimale per lo sfondo pieno: `#RRGGBB` o `#RGB` (il `#` è facoltativo) |
| gradientColor1 | string | Obbligatorio quando `backgroundType` è `gradient` | - | Primo colore del gradiente, esadecimale come `backgroundColor` |
| gradientColor2 | string | Obbligatorio quando `backgroundType` è `gradient` | - | Secondo colore del gradiente, esadecimale come `backgroundColor` |
| gradientAngle | number | No | - | Angolo del gradiente in gradi |
| blurEnabled | boolean | No | - | Sfoca lo sfondo originale dietro il soggetto (`backgroundType: "blur"` lo implica) |
| blurIntensity | number | No | - | Intensità della sfocatura (0-100) |
| shadowEnabled | boolean | No | - | Abilita l'ombra esterna |
| shadowOpacity | number | No | `35` | Opacità dell'ombra (0-100), usata quando `shadowEnabled` è true |
| outputFormat | string | No | `"png"` | `png`, `webp`, o `avif` |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

#### Error: Background Removal Expired (410) {#error-background-removal-expired-410}

L'endpoint degli effetti lavora sulla maschera e sull'originale che la Fase 1 ha memorizzato per `jobId`. Gli output memorizzati vengono eliminati dopo un certo periodo, quindi se passa troppo tempo tra le due chiamate non sono più disponibili. Esegui di nuovo la Fase 1 con la stessa immagine e usa il `jobId` che restituisce.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

Un `jobId` o `filename` che non può indicare un file memorizzato (un separatore di percorso, `..`, una stringa vuota) restituisce 400.

## Notes {#notes}

- Richiede l'installazione del bundle del modello `background-removal` (4-5 GB).
- La Fase 1 memorizza in cache la maschera trasparente e l'immagine originale, così la Fase 2 (effetti) può riapplicare istantaneamente sfondi diversi senza rieseguire il modello AI.
- Supporta i formati di input HEIC/HEIF, RAW, TGA, PSD, EXR e HDR tramite decodifica automatica.
- La rotazione EXIF viene corretta automaticamente prima dell'elaborazione.

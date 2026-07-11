---
description: "Generatore di foto tessera e per documenti basato sull'AI con rilevamento del volto, rimozione dello sfondo e composizione su foglio di stampa."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: e7ae0364beed
---

# Passport Photo {#passport-photo}

Generatore di foto tessera e per documenti basato sull'AI. Flusso di lavoro in due fasi: analisi (rilevamento del volto + rimozione dello sfondo) e poi generazione (ritaglio, ridimensionamento e composizione per la stampa).

## API Endpoints {#api-endpoints}

Questo strumento usa un flusso in due fasi con endpoint separati per l'analisi e la generazione.

**Bundle dei modelli:** `background-removal` e `face-detection`

---

### Phase 1: Analyze {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Rileva i punti di riferimento del volto e rimuove lo sfondo. Restituisce i dati dei punti di riferimento e un'anteprima affinché il frontend possa mostrare un'anteprima del ritaglio.

#### Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | File immagine (multipart) |
| clientJobId | string | No | - | ID del job opzionale per il tracciamento dell'avanzamento tramite SSE |

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

Se viene fornito `clientJobId`, l'avanzamento viene trasmesso in streaming (0-30% per il rilevamento del volto, 30-95% per la rimozione dello sfondo).

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

Ritaglia, ridimensiona e facoltativamente compone la foto su un foglio di stampa. Usa le immagini in cache dalla Fase 1 (nessuna riesecuzione dell'AI).

#### Parameters (JSON body) {#parameters-json-body}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| jobId | string | Yes | - | ID del job dalla Fase 1 |
| filename | string | Yes | - | Nome file originale dalla Fase 1 |
| countryCode | string | Yes | - | Codice paese per le specifiche del passaporto (ad es. `US`, `GB`, `IN`) |
| documentType | string | No | `"passport"` | Tipo di documento (dalle specifiche del paese) |
| bgColor | string | No | `"#FFFFFF"` | Colore di sfondo in esadecimale |
| printLayout | string | No | `"none"` | Layout della carta da stampa: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | No | `0` | Vincolo di dimensione massima del file in KB (0 = nessun limite) |
| dpi | number | No | `300` | DPI di output (72-1200) |
| customWidthMm | number | No | - | Larghezza personalizzata della foto in mm (sovrascrive le specifiche del paese) |
| customHeightMm | number | No | - | Altezza personalizzata della foto in mm (sovrascrive le specifiche del paese) |
| zoom | number | No | `1` | Fattore di zoom (0.5-3). Valori > 1 ritagliano più stretto |
| adjustX | number | No | `0` | Regolazione della posizione orizzontale |
| adjustY | number | No | `0` | Regolazione della posizione verticale |
| landmarks | object | Yes | - | Oggetto dei punti di riferimento dalla risposta della Fase 1 |
| imageWidth | number | Yes | - | Larghezza dell'immagine dalla risposta della Fase 1 |
| imageHeight | number | Yes | - | Altezza dell'immagine dalla risposta della Fase 1 |

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

Restituisce indicazioni su quale sotto-endpoint corretto usare.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notes {#notes}

- Richiede l'installazione dei bundle dei modelli `background-removal` e `face-detection`.
- La Fase 1 esegue l'AI (punti di riferimento del volto + rimozione dello sfondo) e memorizza i risultati in cache. La Fase 2 è pura manipolazione dell'immagine con Sharp (veloce, senza bisogno di AI).
- I punti di riferimento vengono restituiti come coordinate normalizzate (intervallo 0-1 relativo alle dimensioni dell'immagine).
- Il campo `preview` nella risposta di analisi è un PNG codificato in base64 (max 800px di larghezza) per una visualizzazione rapida.
- Le specifiche dei paesi includono le dimensioni del documento, i rapporti di altezza della testa e il posizionamento della linea degli occhi in base ai requisiti ufficiali delle foto per il passaporto.
- L'opzione `printLayout` genera un foglio composto su carta 4x6\" o A4 con margini di 2mm tra le foto.
- Quando è impostato `maxFileSizeKb`, l'output viene compresso iterativamente per rientrare nel limite di dimensione.

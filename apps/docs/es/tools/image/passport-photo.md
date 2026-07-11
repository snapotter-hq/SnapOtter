---
description: "Generador de fotos de pasaporte y de identificación con IA, con detección de rostros, eliminación de fondo y composición para hojas de impresión."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: c88f536e67f0
---

# Foto de pasaporte {#passport-photo}

Generador de fotos de pasaporte y de identificación con IA. Flujo de trabajo en dos fases: analizar (detección de rostros + eliminación de fondo) y luego generar (recortar, redimensionar y componer para impresión).

## Endpoints de la API {#api-endpoints}

Esta herramienta usa un flujo de dos fases con endpoints separados para el análisis y la generación.

**Paquetes de modelos:** `background-removal` y `face-detection`

---

### Fase 1: Analizar {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Detecta los puntos de referencia del rostro y elimina el fondo. Devuelve los datos de los puntos de referencia y una vista previa para que el frontend muestre una previsualización del recorte.

#### Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| clientJobId | string | No | - | ID de trabajo opcional para el seguimiento del progreso vía SSE |

#### Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Respuesta (200 OK) {#response-200-ok}

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

#### Progreso (SSE, opcional) {#progress-sse-optional}

Si se proporciona `clientJobId`, el progreso se transmite (0-30 % para la detección de rostros, 30-95 % para la eliminación de fondo).

#### Error: no se detectó ningún rostro (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Fase 2: Generar {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Recorta, redimensiona y, opcionalmente, compone la foto en una hoja de impresión. Usa las imágenes en caché de la Fase 1 (sin volver a ejecutar la IA).

#### Parámetros (cuerpo JSON) {#parameters-json-body}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| jobId | string | Sí | - | ID de trabajo de la Fase 1 |
| filename | string | Sí | - | Nombre de archivo original de la Fase 1 |
| countryCode | string | Sí | - | Código de país para la especificación de pasaporte (por ejemplo, `US`, `GB`, `IN`) |
| documentType | string | No | `"passport"` | Tipo de documento (según la especificación del país) |
| bgColor | string | No | `"#FFFFFF"` | Color de fondo en hexadecimal |
| printLayout | string | No | `"none"` | Diseño del papel de impresión: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | No | `0` | Restricción de tamaño máximo de archivo en KB (0 = sin límite) |
| dpi | number | No | `300` | DPI de salida (72-1200) |
| customWidthMm | number | No | - | Ancho de foto personalizado en mm (anula la especificación del país) |
| customHeightMm | number | No | - | Alto de foto personalizado en mm (anula la especificación del país) |
| zoom | number | No | `1` | Factor de zoom (0.5-3). Los valores > 1 recortan más ajustado |
| adjustX | number | No | `0` | Ajuste de posición horizontal |
| adjustY | number | No | `0` | Ajuste de posición vertical |
| landmarks | object | Sí | - | Objeto de puntos de referencia de la respuesta de la Fase 1 |
| imageWidth | number | Sí | - | Ancho de imagen de la respuesta de la Fase 1 |
| imageHeight | number | Sí | - | Alto de imagen de la respuesta de la Fase 1 |

#### Ejemplo de solicitud {#example-request-1}

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

#### Respuesta (200 OK) {#response-200-ok-1}

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

### Ruta base {#base-route}

`POST /api/v1/tools/image/passport-photo`

Devuelve orientación sobre cómo usar el sub-endpoint correcto.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notas {#notes}

- Requiere que los paquetes de modelos `background-removal` y `face-detection` estén instalados.
- La Fase 1 ejecuta la IA (puntos de referencia del rostro + eliminación de fondo) y almacena los resultados en caché. La Fase 2 es pura manipulación de imágenes con Sharp (rápida, sin necesidad de IA).
- Los puntos de referencia se devuelven como coordenadas normalizadas (rango de 0-1 relativo a las dimensiones de la imagen).
- El campo `preview` de la respuesta del análisis es un PNG codificado en base64 (máximo 800 px de ancho) para una visualización rápida.
- Las especificaciones de país incluyen las dimensiones del documento, las proporciones de la altura de la cabeza y la posición de la línea de los ojos según los requisitos oficiales de las fotos de pasaporte.
- La opción `printLayout` genera una hoja compuesta en papel de 4x6\" o A4 con separaciones de 2 mm entre las fotos.
- Cuando se establece `maxFileSizeKb`, la salida se comprime de forma iterativa para ajustarse al límite de tamaño.

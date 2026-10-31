---
description: "Eliminación de fondo con IA con efectos opcionales (desenfoque, sombra, degradado, fondo personalizado)."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: ce54e46e1115
---

# Eliminar fondo {#remove-background}

Eliminación de fondo con IA con efectos opcionales (desenfoque, sombra, degradado, fondo personalizado).

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Procesamiento:** asíncrono (devuelve 202, consulta `/api/v1/jobs/{jobId}/progress` para conocer el estado vía SSE)

**Paquete del modelo:** `background-removal` (4-5 GB)

## Parámetros {#parameters}

La Fase 1 elimina el fondo y almacena en caché la máscara PNG transparente y la imagen original. El reemplazo de fondo, el desenfoque, la sombra paralela y la conversión de formato de salida se aplican en la [Fase 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) (o al ejecutar `remove-background` como paso de una canalización o como tarea por lotes); si pasas esos campos a la Fase 1, devuelve 400.

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| model | string | No | - | Variante del modelo de IA que se usará |
| edgeRefine | integer | No | - | Nivel de refinamiento de bordes (0-3) |
| decontaminate | boolean | No | - | Eliminar el sangrado de color de los bordes |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
```

## Respuesta {#response}

### Respuesta inicial (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progreso (SSE en `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Resultado final (vía SSE) {#final-result-via-sse}

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

## Endpoint de efectos (Fase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Vuelve a aplicar los efectos de fondo sin volver a ejecutar el modelo de IA. Usa la máscara y el original en caché de la Fase 1.

### Parámetros {#parameters-1}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| settings | JSON | Sí | - | JSON con los ajustes de los efectos (ver más abajo) |
| backgroundImage | file | Obligatorio cuando `backgroundType` es `image` | - | Imagen de fondo personalizada |

#### Campos del JSON de ajustes {#settings-json-fields}

| Campo | Tipo | Obligatorio | Predeterminado | Descripción |
|-------|------|----------|---------|-------------|
| jobId | string | Sí | - | ID de trabajo de la Fase 1 |
| filename | string | Sí | - | Nombre de archivo original de la Fase 1 |
| backgroundType | string | No | `"transparent"` | Uno de: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Obligatorio cuando `backgroundType` es `color` | - | Color hexadecimal: `#RRGGBB` o `#RGB` (el `#` es opcional) |
| gradientColor1 | string | Obligatorio cuando `backgroundType` es `gradient` | - | Primer color del degradado, en hexadecimal como `backgroundColor` |
| gradientColor2 | string | Obligatorio cuando `backgroundType` es `gradient` | - | Segundo color del degradado, en hexadecimal como `backgroundColor` |
| gradientAngle | number | No | - | Ángulo del degradado en grados |
| blurEnabled | boolean | No | - | Desenfocar el fondo original detrás del sujeto (`backgroundType: "blur"` lo implica) |
| blurIntensity | number | No | - | Intensidad del desenfoque (0-100) |
| shadowEnabled | boolean | No | - | Habilitar la sombra paralela sobre el sujeto |
| shadowOpacity | number | No | `35` | Opacidad de la sombra (0-100), se usa cuando `shadowEnabled` es true |
| outputFormat | string | No | `"png"` | Formato de salida: `png`, `webp` o `avif` |

### Ejemplo de solicitud {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Respuesta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

#### Error: eliminación de fondo expirada (410) {#error-background-removal-expired-410}

El endpoint de efectos funciona a partir de la máscara y el original que la Fase 1 guardó para `jobId`. Las salidas almacenadas se limpian pasado un tiempo, así que si pasa demasiado tiempo entre las dos llamadas, ya no están. Vuelve a ejecutar la Fase 1 con la misma imagen y usa el `jobId` que devuelve.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

Un `jobId` o `filename` que no pueda nombrar un archivo almacenado (un separador de ruta, `..`, una cadena vacía) responde 400.

## Notas {#notes}

- Requiere que el paquete del modelo `background-removal` esté instalado (4-5 GB).
- La Fase 1 almacena en caché la máscara transparente y la imagen original para que la Fase 2 (efectos) pueda volver a aplicar distintos fondos al instante sin volver a ejecutar el modelo de IA.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.
- La rotación EXIF se corrige automáticamente antes del procesamiento.

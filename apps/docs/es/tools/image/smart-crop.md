---
description: "Recorte sensible al sujeto, a las caras y a la entropía que encuadra las imágenes de forma inteligente con Sharp y detección de caras por IA."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: 6c96a761c039
---

# Recorte inteligente {#smart-crop}

Recorte inteligente sensible al sujeto, a las caras o basado en el recorte de bordes. Usa las estrategias de atención/entropía de Sharp y la detección de caras por IA para un encuadre inteligente.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Procesamiento:** Asíncrono (devuelve 202, sondea `/api/v1/jobs/{jobId}/progress` para conocer el estado mediante SSE)

**Paquete de modelos:** `face-detection` (200-300 MB): necesario solo para el modo `face`

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| mode | string | No | `"subject"` | Modo de recorte: `subject`, `face`, `trim`. (Los valores heredados `attention` y `content` se asignan a `subject` y `trim`) |
| strategy | string | No | `"attention"` | Estrategia para el modo de sujeto: `attention` o `entropy` |
| width | integer | No | - | Ancho objetivo en píxeles |
| height | integer | No | - | Alto objetivo en píxeles |
| padding | integer | No | `0` | Porcentaje de relleno alrededor del sujeto (0-50) |
| facePreset | string | No | `"head-shoulders"` | Ajuste preestablecido de encuadre de caras: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | No | `0.5` | Sensibilidad de la detección de caras (0-1) |
| threshold | integer | No | `30` | Umbral del modo de recorte de bordes para la detección del fondo (0-255) |
| padToSquare | boolean | No | `false` | Rellena el resultado recortado hasta formar un cuadrado |
| padColor | string | No | `"#ffffff"` | Color de fondo para el relleno |
| targetSize | integer | No | - | Tamaño objetivo de la salida rellenada (píxeles) |
| quality | integer | No | - | Calidad de salida (1-100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### Resultado final (mediante SSE) {#final-result-via-sse}

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

## Modos {#modes}

### Modo de sujeto {#subject-mode}
Usa la estrategia de atención o entropía de Sharp para encontrar la región visualmente más interesante y recorta a su alrededor.

### Modo de caras {#face-mode}
Detecta caras mediante IA y luego encuadra el recorte alrededor de las caras detectadas usando el `facePreset` especificado. Recurre al modo de sujeto (estrategia de atención) si no se detecta ninguna cara.

### Modo de recorte de bordes {#trim-mode}
Elimina los bordes/fondos uniformes de la imagen. De forma opcional, rellena el resultado hasta formar un cuadrado con un color de fondo y un tamaño objetivo especificados.

## Notas {#notes}

- Esta herramienta usa la fábrica `createToolRoute` con `executionHint: "long"`, por lo que devuelve 202 con progreso por SSE.
- El modo de caras requiere el paquete de modelos `face-detection` (200-300 MB).
- Los modos de sujeto y recorte de bordes funcionan sin ningún paquete de modelos de IA.
- El `facePreset` determina la precisión con que el recorte encuadra las caras detectadas: `closeup` es el más ajustado, `half-body` es el más amplio.
- Si no se especifica ancho/alto, el valor predeterminado es 1080x1080.

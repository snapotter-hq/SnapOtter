---
description: "Corrige PNG con falsa transparencia mediante matting por IA (BiRefNet) para producir un alfa real, además de limpieza de bordes con defringe."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: dd81a9469007
---

# Corrector de transparencia PNG {#png-transparency-fixer}

Corrige PNG con falsa transparencia con un solo clic. Usa matting por IA (modelo BiRefNet HR Matting) para producir una transparencia alfa real, con postprocesamiento de defringe para limpiar los bordes.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Procesamiento:** Asíncrono (devuelve 202, sondea `/api/v1/jobs/{jobId}/progress` para conocer el estado mediante SSE)

**Paquete de modelos:** `background-removal` (4-5 GB)

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| defringe | number | No | `30` | Intensidad de defringe (0-100). Elimina los píxeles de franja semitransparente alrededor de los bordes |
| outputFormat | string | No | `"png"` | Formato de salida: `png` o `webp` |
| removeWatermark | boolean | No | `false` | Aplica un preprocesamiento de eliminación de marca de agua (filtro de mediana) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Resultado final (mediante SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Notas {#notes}

- Requiere que el paquete de modelos `background-removal` esté instalado (4-5 GB).
- Usa `birefnet-hr-matting` como modelo principal para un matting alfa de alta calidad. Recurre a `birefnet-general` si el modelo HR se queda sin memoria.
- La opción `defringe` elimina los píxeles de franja semitransparente que el matting por IA a veces deja alrededor del cabello, el pelaje y los bordes finos. Funciona desenfocando el canal alfa y poniendo a cero los píxeles de baja confianza.
- La opción `removeWatermark` aplica un paso de preprocesamiento con filtro de mediana. Es una reducción básica de marcas de agua, no una herramienta dedicada a la eliminación de marcas de agua.
- Solo produce PNG o WebP sin pérdida (ambos admiten transparencia alfa).
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.

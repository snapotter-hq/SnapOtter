---
description: "Rota imágenes en cualquier ángulo y voltéalas horizontal o verticalmente."
i18n_source_hash: af2581d7cd8d
i18n_provenance: human
i18n_output_hash: e8b33640b0cc
---

# Rotar y voltear {#rotate-flip}

Rota imágenes en un ángulo arbitrario o voltéalas horizontal o verticalmente. Las operaciones de rotación y volteo se pueden combinar en una sola solicitud.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| angle | number | No | `0` | Ángulo de rotación en grados (en sentido horario). Acepta cualquier valor numérico. |
| horizontal | boolean | No | `false` | Voltear la imagen horizontalmente (espejo) |
| vertical | boolean | No | `false` | Voltear la imagen verticalmente |

## Ejemplo de solicitud {#example-request}

Rotar 90 grados en sentido horario:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Voltear horizontalmente:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Rotar y voltear a la vez:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notas {#notes}

- Primero se aplica la rotación y luego las operaciones de volteo.
- Las rotaciones que no son de 90 grados (por ejemplo, 45 grados) ampliarán el lienzo para ajustarse a la imagen rotada, con relleno transparente o negro según el formato de salida.
- Valores comunes: 90, 180, 270 para rotaciones de cuarto de vuelta.
- La orientación EXIF se aplica automáticamente antes del procesamiento, por lo que la rotación es relativa a la orientación visual.

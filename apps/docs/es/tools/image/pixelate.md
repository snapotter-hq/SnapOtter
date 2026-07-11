---
description: "Aplica un efecto de pixelado a toda la imagen o a una región específica."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 1bfe0eacc368
---

# Pixelar {#pixelate}

Aplica un efecto de pixelado a una imagen completa o a una región rectangular específica. Útil para ocultar contenido sensible como rostros, matrículas o información personal.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| blockSize | integer | No | `12` | Tamaño del bloque de píxeles (2-128); los valores más altos producen un pixelado más grueso |
| region | object | No | - | Restringir el pixelado a un rectángulo (ver más abajo) |

### Objeto de región {#region-object}

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|----------|-------------|
| left | integer | Sí | Desplazamiento izquierdo en píxeles (>= 0) |
| top | integer | Sí | Desplazamiento superior en píxeles (>= 0) |
| width | integer | Sí | Ancho de la región en píxeles (>= 1) |
| height | integer | Sí | Alto de la región en píxeles (>= 1) |

## Ejemplo de solicitud {#example-request}

Pixelar la imagen completa:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Pixelar una región específica:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notas {#notes}

- Cuando se omite `region`, se pixela toda la imagen.
- Las coordenadas de la región están en píxeles relativos a la esquina superior izquierda de la imagen. La región debe quedar dentro de los límites de la imagen.
- El formato de salida coincide con el formato de entrada. Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.

---
description: "Recorta una imagen a un círculo centrado con esquinas transparentes."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 2278500ec38e
---

# Recorte circular {#circle-crop}

Recorta una imagen a un círculo centrado con esquinas transparentes. Admite zoom, desplazamiento, borde y tamaño de salida ajustables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| zoom | number | No | `1` | Factor de zoom (1-5); los valores más altos recortan más de cerca |
| offsetX | number | No | `0.5` | Posición horizontal del centro (0-1) |
| offsetY | number | No | `0.5` | Posición vertical del centro (0-1) |
| borderWidth | integer | No | `0` | Ancho del borde en píxeles (0-200) |
| borderColor | string | No | `"#ffffff"` | Color hexadecimal del borde |
| background | string | No | `"transparent"` | Relleno de las esquinas: `"transparent"` o un color hexadecimal |
| outputSize | integer | No | - | Dimensión cuadrada final en píxeles (16-4096) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Notes {#notes}

- La salida siempre es PNG para conservar las esquinas transparentes (a menos que `background` se ajuste a un color sólido).
- El círculo se inscribe dentro de la dimensión más corta de la imagen. Usa `zoom` para recortar más de cerca y `offsetX`/`offsetY` para desplazar el área visible.
- Cuando se proporciona `outputSize`, el resultado se redimensiona a esa dimensión cuadrada después del recorte.
- Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.

---
description: "Añade un efecto de viñeta con intensidad, color y posición ajustables."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: 9bb2db4b168f
---

# Viñeta {#vignette}

Añade un efecto de viñeta que oscurece o tiñe los bordes de una imagen. Admite intensidad, color, radio, suavidad, redondez y posición del centro ajustables.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Acepta datos de formulario multipart con un archivo de imagen y un campo `settings` en JSON.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| strength | number | No | `0.5` | Opacidad de la viñeta (0.1-1) |
| color | string | No | `"#000000"` | Color hexadecimal de la viñeta |
| radius | integer | No | `70` | Radio exterior como porcentaje de la mitad de la diagonal (0-100) |
| softness | integer | No | `50` | Suavidad del desvanecimiento (0-100); los valores más altos producen una atenuación más gradual |
| roundness | integer | No | `100` | Forma: 100 = círculo, 0 = elipse que coincide con la relación de aspecto de la imagen |
| centerX | integer | No | `50` | Posición horizontal del centro como porcentaje (0-100) |
| centerY | integer | No | `50` | Posición vertical del centro como porcentaje (0-100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Notas {#notes}

- Un `radius` más pequeño oscurece una mayor parte de la imagen; un radio más grande confina la viñeta a los bordes extremos.
- Usa un `color` que no sea negro (por ejemplo, tonos blancos o sepia) para lograr efectos de viñeta creativos.
- Ajustar `centerX` y `centerY` te permite colocar el área despejada fuera del centro, útil para dirigir la atención hacia un sujeto que no está en el medio del encuadre.
- El formato de salida coincide con el formato de entrada. Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.

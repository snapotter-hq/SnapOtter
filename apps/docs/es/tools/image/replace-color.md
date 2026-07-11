---
description: "Reemplaza un color específico de una imagen por otro color o hazlo transparente."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: d11c7f753fc6
---

# Reemplazar e invertir color {#replace-invert-color}

Reemplaza los píxeles que coinciden con un color de origen por un color de destino, o hazlos transparentes. Usa la distancia euclidiana en el espacio RGB con una tolerancia configurable para una mezcla suave en los límites de color.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| sourceColor | string | No | `"#FF0000"` | Color hexadecimal que se buscará (formato: `#RRGGBB`) |
| targetColor | string | No | `"#00FF00"` | Color hexadecimal con el que se reemplazará (formato: `#RRGGBB`) |
| makeTransparent | boolean | No | `false` | Hacer transparentes los píxeles coincidentes en lugar de reemplazarlos por el color de destino |
| tolerance | number | No | `30` | Tolerancia de coincidencia de color (0 a 255). Los valores más altos coinciden con una gama más amplia de colores similares |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Hacer transparente un fondo verde:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notas {#notes}

- La coincidencia de color usa la distancia euclidiana en el espacio RGB, escalada por `tolerance * sqrt(3)`.
- La mezcla del reemplazo es proporcional a la distancia de color: los píxeles más cercanos al color de origen reciben más del color de destino, lo que crea transiciones suaves.
- Cuando `makeTransparent` es `true`, la salida se fuerza a PNG (o WebP/AVIF) si el formato de entrada no admite canales alfa (por ejemplo, JPEG).
- Una tolerancia de 0 coincide únicamente con el color de origen exacto. Los valores más altos (50+) coincidirán con una gama más amplia de tonos similares.
- El formato de salida coincide con el formato de entrada, a menos que se necesite transparencia y el formato de entrada carezca de soporte para alfa.

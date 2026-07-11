---
description: "Aplica un efecto duotono de dos colores con colores personalizados de sombra y luz."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: 862b03827908
---

# Duotono {#duotone}

Aplica un efecto duotono de dos colores a una imagen. La imagen se convierte a escala de grises y luego se asigna a un gradiente entre el color de sombra (tonos oscuros) y el color de luz (tonos brillantes).

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| shadow | string | No | `"#1e3a8a"` | Color hex de sombra (aplicado a los tonos oscuros) |
| highlight | string | No | `"#fbbf24"` | Color hex de luz (aplicado a los tonos brillantes) |
| intensity | integer | No | `100` | Intensidad del efecto (0-100); 0 devuelve el original, 100 aplica el duotono completo |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Notas {#notes}

- El formato de salida coincide con el formato de entrada. Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.
- Una `intensity` menor que 100 mezcla el resultado duotono con la imagen original, lo que permite efectos más sutiles.
- Las combinaciones duotono populares incluyen azul marino/dorado, verde azulado/coral y morado/rosa.

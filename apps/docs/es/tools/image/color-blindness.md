---
description: "Simula cómo aparecen las imágenes para personas con distintos tipos de deficiencia de la visión del color."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: cd9c55d02dbc
---

# Simulación de daltonismo {#color-blindness-simulation}

Simula la deficiencia de la visión del color (CVD) para previsualizar cómo aparecen las imágenes para personas con varios tipos de daltonismo. Útil para pruebas de accesibilidad de diseños, gráficos e interfaces de usuario.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| simulationType | string | No | `"deuteranomaly"` | Tipo de deficiencia de la visión del color que se simula |

### Tipos de simulación {#simulation-types}

| Valor | Condición | Descripción |
|-------|-----------|-------------|
| `protanopia` | Ceguera al rojo | Ausencia total de células cono rojas |
| `deuteranopia` | Ceguera al verde | Ausencia total de células cono verdes |
| `tritanopia` | Ceguera al azul | Ausencia total de células cono azules |
| `protanomaly` | Debilidad al rojo | Sensibilidad reducida de los conos rojos |
| `deuteranomaly` | Debilidad al verde | Sensibilidad reducida de los conos verdes (la más común) |
| `tritanomaly` | Debilidad al azul | Sensibilidad reducida de los conos azules |
| `achromatopsia` | Ceguera total al color | Ausencia total de visión del color |
| `blueConeMonochromacy` | Solo conos azules | Solo los conos azules son funcionales |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Notas {#notes}

- La deuteranomalía (debilidad al verde) es la opción predeterminada porque es la forma más común de deficiencia de la visión del color, y afecta a alrededor del 6 % de los hombres.
- La simulación usa matrices de transformación de color que modelan cómo los fotorreceptores cono reducidos o ausentes alteran los colores percibidos.
- Esta herramienta no es destructiva y solo produce una vista previa. No modifica la imagen original para accesibilidad.
- El formato de salida coincide con el formato de entrada. Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.

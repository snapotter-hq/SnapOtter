---
description: "Combina varias imágenes en collages de cuadrícula con más de 25 plantillas, espacios y esquinas ajustables, y desplazamiento y zoom por celda."
i18n_source_hash: 96f2055717df
i18n_provenance: human
i18n_output_hash: 76d7bdb22d30
---

# Collage / Cuadrícula {#collage-grid}

Combina varias imágenes en collages de cuadrícula atractivos con más de 25 plantillas. Admite diseños de 2 a 9 imágenes con espacio, radio de esquina, color de fondo y controles de desplazamiento/zoom por celda personalizables.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| templateId | string | Sí | - | ID del diseño de plantilla (p. ej. `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | No | - | Array de ajustes por celda con `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Sí | - | Índice de la imagen que se coloca en esta celda (basado en 0) |
| cells[].panX | number | No | 0 | Desplazamiento horizontal (-100 a 100) |
| cells[].panY | number | No | 0 | Desplazamiento vertical (-100 a 100) |
| cells[].zoom | number | No | 1 | Nivel de zoom (1 a 10) |
| cells[].objectFit | string | No | `"cover"` | Cómo llena la imagen la celda: `cover` o `contain` |
| gap | number | No | 8 | Espacio entre celdas en píxeles (0 a 500) |
| cornerRadius | number | No | 0 | Radio de esquina para cada celda en píxeles (0 a 500) |
| backgroundColor | string | No | `"#FFFFFF"` | Color de fondo como hex o `"transparent"` |
| aspectRatio | string | No | `"free"` | Relación de aspecto del lienzo: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | No | `"png"` | Formato de salida: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | Calidad de salida (1 a 100) |

## Plantillas disponibles {#available-templates}

| ID de plantilla | Imágenes | Diseño |
|-------------|--------|--------|
| `2-h-equal` | 2 | Dos columnas iguales |
| `2-v-equal` | 2 | Dos filas iguales |
| `2-h-left-large` | 2 | Izquierda 2/3, derecha 1/3 |
| `2-h-right-large` | 2 | Izquierda 1/3, derecha 2/3 |
| `3-left-large` | 3 | Grande a la izquierda, dos apiladas a la derecha |
| `3-right-large` | 3 | Dos apiladas a la izquierda, grande a la derecha |
| `3-top-large` | 3 | Grande arriba, dos columnas abajo |
| `3-h-equal` | 3 | Tres columnas iguales |
| `3-v-equal` | 3 | Tres filas iguales |
| `4-grid` | 4 | Cuadrícula 2x2 |
| `4-left-large` | 4 | Grande a la izquierda, tres apiladas a la derecha |
| `4-top-large` | 4 | Grande arriba, tres columnas abajo |
| `4-bottom-large` | 4 | Tres columnas arriba, grande abajo |
| `5-top2-bottom3` | 5 | Dos arriba, tres abajo |
| `5-top3-bottom2` | 5 | Tres arriba, dos abajo |
| `5-left-large` | 5 | Grande a la izquierda, cuatro apiladas a la derecha |
| `5-center-large` | 5 | Grande al centro, cuatro en las esquinas |
| `6-grid-2x3` | 6 | 2 columnas x 3 filas |
| `6-grid-3x2` | 6 | 3 columnas x 2 filas |
| `6-top-large` | 6 | Grande arriba, cinco columnas abajo |
| `7-mosaic` | 7 | Diseño de mosaico |
| `8-mosaic` | 8 | Diseño de mosaico |
| `9-grid` | 9 | Cuadrícula 3x3 |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Notas {#notes}

- Sube varios archivos de imagen en la solicitud multipart. Las imágenes se asignan a las celdas de la plantilla en el orden de carga.
- Si se suben más imágenes de las que admite la plantilla, las imágenes sobrantes se ignoran.
- Admite los formatos de entrada HEIC, RAW, PSD y SVG (decodificados automáticamente).
- El tamaño base del lienzo es de 2400 px en el lado más largo, escalado según la relación de aspecto elegida.
- Cuando `aspectRatio` es `"free"`, el lienzo usa de forma predeterminada 4:3 (2400x1800).
- Los valores de `panX`/`panY` por celda desplazan la ventana de recorte dentro de la celda. Un valor de 100 la mueve por completo hacia un borde, y -100 hacia el otro.
- El color de fondo `"transparent"` solo se conserva con los formatos de salida `png`, `webp` o `avif`.

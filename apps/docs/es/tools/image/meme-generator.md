---
description: "Crea memes con plantillas o imágenes personalizadas, cuadros de texto con estilo y opciones de fuente."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 9b59ca094e7f
---

# Generador de memes {#meme-generator}

Crea memes usando plantillas integradas o imágenes personalizadas. Añade texto con el estilo clásico de los memes (texto en negrita con contorno), varios diseños predefinidos y opciones de fuente.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Acepta cualquiera de estas opciones:
- **Datos de formulario multipart** con un archivo de imagen y un campo JSON `settings` (modo de imagen personalizada)
- **Cuerpo JSON** con un `templateId` (modo plantilla, sin necesidad de subir un archivo)

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| templateId | string | No | - | ID de plantilla de meme integrada. Si se proporciona, no es necesario subir una imagen |
| textLayout | string | No | `"top-bottom"` | Diseño de los cuadros de texto: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | No | `[]` | Array de objetos de cuadro de texto con campos `id` y `text` |
| fontFamily | string | No | `"anton"` | Fuente: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | No | auto | Tamaño de fuente en píxeles (8 a 200). Se calcula automáticamente si se omite |
| textColor | string | No | `"#ffffff"` | Color de relleno del texto |
| strokeColor | string | No | `"#000000"` | Color del trazo/contorno del texto |
| textAlign | string | No | `"center"` | Alineación del texto: `left`, `center`, `right` |
| allCaps | boolean | No | `true` | Convertir el texto a mayúsculas |

### Cuadros de texto {#text-boxes}

Cada entrada del array `textBoxes` debe tener:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | string | Identificador del cuadro que coincide con el diseño (por ejemplo, `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | El texto del meme que se mostrará |

### IDs de los cuadros según el diseño del texto {#text-layout-box-ids}

| Diseño | IDs de cuadro disponibles |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Ejemplo de solicitud {#example-request}

Imagen personalizada con texto arriba y abajo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Usando una plantilla integrada (cuerpo JSON, sin subir archivo):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notas {#notes}

- Se requiere `templateId` o un archivo de imagen subido. Si se proporcionan ambos, se usa la plantilla.
- Las plantillas definen sus propias posiciones de cuadro de texto; el parámetro `textLayout` se ignora al usar plantillas.
- El texto se renderiza como SVG con contornos de trazo para lograr el aspecto clásico del meme.
- El tamaño de fuente se calcula automáticamente para ajustarse al cuadro de texto si no se establece de forma explícita.
- Los cuadros de texto vacíos se omiten (no se renderiza nada si todos los cuadros están vacíos).
- El nombre del archivo de salida incluye el ID de la plantilla cuando se usan plantillas (por ejemplo, `meme-drake.png`).
- Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.

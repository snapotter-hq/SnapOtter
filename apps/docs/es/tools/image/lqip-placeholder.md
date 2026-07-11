---
description: "Genera un marcador de posición de imagen de baja calidad diminuto con URI de datos en base64."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: 91cc8380aa64
---

# Marcador de posición LQIP {#lqip-placeholder}

Genera un marcador de posición de imagen de baja calidad (LQIP) diminuto a partir de una imagen de origen. Devuelve un pequeño archivo de marcador de posición junto con un URI de datos en base64, una etiqueta HTML `<img>` lista para usar y un fragmento de CSS `background-image` para incrustar de inmediato.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| width | integer | No | `16` | Ancho objetivo en píxeles (4-64) |
| blur | number | No | `2` | Radio de difuminado para la estrategia de difuminado (0-20) |
| strategy | string | No | `"blur"` | Estrategia del marcador de posición: `blur`, `pixelate` o `solid` |
| format | string | No | `"webp"` | Formato de salida: `webp`, `png` o `jpeg` |
| quality | integer | No | `50` | Calidad de salida (1-100) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Notas {#notes}

- El campo `dataUri` contiene el URI de datos completo, listo para usar en atributos `src` o CSS sin ninguna solicitud adicional.
- Los campos `html` y `css` proporcionan fragmentos listos para copiar y pegar en casos de uso comunes.
- La estrategia `blur` produce una miniatura suave y difuminada. La estrategia `pixelate` crea un mosaico de bloques. La estrategia `solid` devuelve un único color promediado.
- Los tamaños de marcador de posición típicos son de 200-500 bytes, lo que los hace adecuados para incrustarlos directamente en HTML.
- El alto se calcula automáticamente para conservar la relación de aspecto de la imagen de origen.
- Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.

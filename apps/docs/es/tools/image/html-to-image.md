---
description: "Captura páginas web o fragmentos de HTML como imágenes de alta calidad con emulación de dispositivos."
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: 7767c9e196ce
---

# HTML a imagen {#html-to-image}

Captura la URL de una página web o contenido HTML sin procesar como una imagen de captura de pantalla. Admite emulación de dispositivos (escritorio, tableta, móvil), captura de página completa y varios formatos de salida.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

Acepta un **cuerpo JSON** (no multipart). No es necesario subir ningún archivo.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| url | string | Condicional | - | URL a capturar (debe ser una URL válida) |
| html | string | Condicional | - | Contenido HTML sin procesar a renderizar (1 a 5.000.000 de caracteres) |
| format | string | No | `"png"` | Formato de salida: `jpg`, `png`, `webp` |
| quality | number | No | `90` | Calidad de salida para formatos con pérdidas (1 a 100) |
| fullPage | boolean | No | `false` | Captura la página completa con desplazamiento, no solo la ventana visible |
| devicePreset | string | No | `"desktop"` | Emulación de dispositivo: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | No | `1280` | Ancho de la ventana visible personalizado en píxeles (320 a 3840, se usa cuando devicePreset es `custom`) |
| viewportHeight | number | No | `720` | Alto de la ventana visible personalizado en píxeles (320 a 2160, se usa cuando devicePreset es `custom`) |

Debe proporcionarse `url` o `html`, pero no ambos.

### Preajustes de dispositivo {#device-presets}

| Preajuste | Ancho | Alto | UA móvil |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | No |
| `tablet` | 768 | 1024 | No |
| `mobile` | 375 | 812 | Sí |
| `custom` | (especificado por el usuario) | (especificado por el usuario) | No |

## Ejemplo de solicitud {#example-request}

Capturar una página web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

Renderizar contenido HTML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Notas {#notes}

- Requiere que Chromium esté instalado en el servidor. Devuelve HTTP 503 si el servicio del navegador no está disponible.
- Las URL se validan contra ataques SSRF (las direcciones de red privadas/internas están bloqueadas).
- Este endpoint tiene un límite de 120 solicitudes por hora.
- `originalSize` siempre es 0 ya que esta herramienta genera imágenes a partir de URL/HTML.
- El nombre del archivo de salida es `screenshot.<format>`.
- Si la página tarda demasiado en cargar, la solicitud devuelve HTTP 504 (tiempo de espera de la puerta de enlace agotado).
- Si el servicio del navegador se bloquea repetidamente, se desactiva temporalmente y devuelve HTTP 503 con el código `BROWSER_CRASHED`.

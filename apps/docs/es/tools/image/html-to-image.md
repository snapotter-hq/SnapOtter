---
description: "Captura páginas web o fragmentos de HTML como imágenes de alta calidad con emulación de dispositivos."
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: acc640a907bb
i18n_hash_version: 2
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
| clientJobId | string | No | - | Tu propio ID de trabajo, para que puedas abrir el flujo de progreso antes de que llegue la respuesta |

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

### Páginas lentas {#slow-pages}

La captura se ejecuta como un trabajo en cola. Una captura que termina dentro de la ventana de espera síncrona responde `200` con el resultado anterior. Una más lenta responde `202` con un ID de trabajo:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

Sigue `progressUrl` (Server-Sent Events) hasta que el trabajo termine. El evento de finalización incluye el mismo objeto de resultado que la respuesta `200`. Puedes cancelar el trabajo con `POST /api/v1/jobs/{jobId}/cancel`.

::: warning Cambio posterior a 2.3.0
Hasta la versión 2.3.0, este endpoint siempre mantenía la solicitud abierta hasta que terminaba la captura y respondía `200`. Los scripts que solo gestionan `200` también deben gestionar `202`.
:::

## Notas {#notes}

- Requiere que Chromium esté instalado en el servidor. Devuelve HTTP 503 si el servicio del navegador no está disponible.
- Las URL se validan contra ataques SSRF (las direcciones de red privadas/internas están bloqueadas).
- Este endpoint tiene un límite de 120 solicitudes por hora.
- `originalSize` siempre es 0 ya que esta herramienta genera imágenes a partir de URL/HTML.
- El nombre del archivo de salida es `screenshot.<format>`.
- Si la página tarda demasiado en cargar, la captura falla con HTTP 504 (tiempo de espera de la puerta de enlace agotado).
- Si el servicio del navegador se bloquea repetidamente, se desactiva temporalmente y la captura falla con HTTP 503 y el código `BROWSER_CRASHED`.
- Un bloqueo del navegador (HTTP 503) se reintenta una vez antes de notificar el fallo, igual que otros trabajos de imagen en cola. Un tiempo de espera de carga de página no se reintenta.
- Una captura que ya ha respondido `202` notifica un fallo en su flujo de progreso en lugar de en el estado HTTP.

---
description: "Desenfoca el fondo manteniendo el sujeto nítido usando IA."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: 7be502479467
---

# Desenfocar fondo {#blur-background}

Desenfoca el fondo de una imagen manteniendo el sujeto nítido. El modelo de IA aísla el sujeto, aplica un desenfoque al fondo original y compone el sujeto nítido encima.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| intensity | integer | No | `50` | Intensidad del desenfoque (1-100) |
| feather | integer | No | `0` | Radio de suavizado de bordes (0-20) |
| format | string | No | `"png"` | Formato de salida: `png` o `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Sigue el progreso mediante SSE en `GET /api/v1/jobs/{jobId}/progress`. Cuando el trabajo se completa, el flujo SSE emite un evento `completed` con la URL de descarga.

## Notes {#notes}

- Esta es una herramienta impulsada por IA que devuelve `202 Accepted` y procesa de forma asíncrona. Conéctate al endpoint SSE para recibir las actualizaciones de progreso y el resultado final.
- Requiere que esté instalado el paquete de funciones **background-removal**. Devuelve `501` si el paquete no está disponible.
- Los valores de intensidad más altos producen un efecto de desenfoque más fuerte. Los valores superiores a 80 crean una separación pronunciada de tipo bokeh.
- Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.

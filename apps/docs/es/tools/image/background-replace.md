---
description: "Reemplaza el fondo de la imagen por un color sólido o un degradado usando IA."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 9467cbbb7ddd
---

# Reemplazar fondo {#background-replace}

Reemplaza el fondo de una imagen por un color sólido o un degradado. El modelo de IA detecta el sujeto, elimina el fondo original y compone el sujeto sobre el fondo que elijas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"color"` | Modo de fondo: `color` o `gradient` |
| color | string | No | `"#ffffff"` | Color hexadecimal de fondo (cuando backgroundType es `color`) |
| gradientColor1 | string | No | - | Primer color hexadecimal del degradado |
| gradientColor2 | string | No | - | Segundo color hexadecimal del degradado |
| gradientAngle | integer | No | `180` | Ángulo del degradado en grados (0-360) |
| feather | integer | No | `0` | Radio de suavizado de bordes (0-20) |
| format | string | No | `"png"` | Formato de salida: `png` o `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
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
- Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.
- La salida es PNG por defecto para conservar la transparencia alrededor del sujeto.

---
description: "Redimensionado por seam carving que añade o elimina píxeles a lo largo de rutas de baja importancia para preservar el contenido clave y las caras."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: c0ac6ce09b69
---

# Redimensionado con reconocimiento de contenido {#content-aware-resize}

Redimensionado por seam carving que elimina o añade de forma inteligente píxeles a lo largo de las rutas de menor importancia visual, preservando el contenido importante y protegiendo opcionalmente las caras.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Procesamiento:** Síncrono (devuelve el resultado directamente)

**Paquete de modelo:** Ninguno necesario para la operación básica. La protección de caras usa el paquete `face-detection` (200-300 MB) si se activa.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| file | file | Sí | - | Archivo de imagen (multipart) |
| width | number | No | - | Ancho objetivo en píxeles |
| height | number | No | - | Alto objetivo en píxeles |
| protectFaces | boolean | No | `false` | Detecta y protege las caras de la eliminación de costuras |
| blurRadius | number | No | `4` | Radio de desenfoque de preprocesamiento para el cálculo de energía (0-20) |
| sobelThreshold | number | No | `2` | Umbral de detección de bordes Sobel (1-20). Los valores más altos hacen que el algoritmo sea más agresivo |
| square | boolean | No | `false` | Redimensiona a un cuadrado (usa la dimensión menor) |

Debe especificarse al menos uno de `width`, `height` o `square`.

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Respuesta (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Notas {#notes}

- Esta ruta personalizada devuelve actualmente una respuesta síncrona 200.
- Usa la biblioteca de seam carving `caire` para el redimensionado con reconocimiento de contenido.
- Solo reduce dimensiones (elimina costuras). No puede expandir una imagen más allá de su tamaño original.
- La opción `protectFaces` usa detección de caras por IA para marcar las regiones de caras como de alta energía, evitando que las costuras pasen a través de las caras.
- `blurRadius` controla el suavizado antes del cálculo del mapa de energía. Los valores más altos hacen el mapa de energía más uniforme, lo que puede ayudar con imágenes ruidosas.
- `sobelThreshold` afecta a la agresividad con la que se detectan los bordes. Los valores más bajos preservan bordes más sutiles.
- La salida siempre está en formato PNG.
- Admite los formatos de entrada HEIC/HEIF, RAW, TGA, PSD, EXR y HDR mediante decodificación automática.

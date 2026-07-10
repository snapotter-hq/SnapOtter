---
description: "Rellena una imagen hasta una relación de aspecto objetivo con un fondo de color sólido, transparente o difuminado."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: da3d8c4f9c0a
---

# Relleno de imagen {#image-pad}

Rellena una imagen hasta una relación de aspecto objetivo añadiendo a su alrededor un fondo de color sólido, transparente o difuminado. Útil para ajustar imágenes a relaciones de aspecto fijas para redes sociales o impresión sin recortar.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| target | string | No | `"1:1"` | Relación de aspecto objetivo: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` o `custom` |
| ratioW | integer | No | `1` | Ancho de la relación personalizada (1-100, se usa cuando target es `custom`) |
| ratioH | integer | No | `1` | Alto de la relación personalizada (1-100, se usa cuando target es `custom`) |
| background | string | No | `"color"` | Modo de fondo: `color`, `transparent` o `blur` |
| color | string | No | `"#ffffff"` | Color hexadecimal de fondo (cuando background es `color`) |
| padding | integer | No | `0` | Relleno adicional como porcentaje del lienzo (0-50) |

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Notas {#notes}

- El modo de fondo `blur` crea una copia difuminada de la imagen original como relleno del padding, produciendo un resultado visualmente cohesivo.
- Al usar el fondo `transparent`, la salida se convierte a PNG para conservar la transparencia.
- El formato de salida coincide con el formato de entrada salvo que intervenga la transparencia. Las entradas HEIC, RAW, PSD y SVG se decodifican automáticamente antes del procesamiento.
- Establece `target` en `custom` y proporciona `ratioW` y `ratioH` para relaciones de aspecto arbitrarias (p. ej., `ratioW: 3, ratioH: 2` para 3:2).

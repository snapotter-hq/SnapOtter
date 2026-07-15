---
description: "Convierte imágenes entre formatos, incluidos formatos modernos como AVIF, JXL y HEIC."
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: a306e06e0b7a
---

# Convertir imagen {#convert}

Convierte imágenes entre formatos. Admite formatos web comunes así como formatos especializados como HEIC, JXL, BMP, ICO, JP2, QOI y PSD.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/convert`

Acepta datos de formulario multipart con un archivo de imagen y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | Sí | - | Formato objetivo: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | No | - | Calidad de salida (1-100). Se aplica a formatos con pérdida como jpg, webp, avif, heic. |

## Formatos de salida admitidos {#supported-output-formats}

| Formato | Tipo | Notas |
|--------|------|-------|
| jpg | Con pérdida | JPEG, la mejor compatibilidad |
| png | Sin pérdida | Admite transparencia |
| webp | Ambos | Formato web moderno, buena compresión |
| avif | Con pérdida | Formato de nueva generación, excelente compresión |
| tiff | Ambos | Flujos de trabajo de impresión/publicación |
| gif | Sin pérdida | Limitado a 256 colores |
| heic / heif | Con pérdida | Formato del ecosistema Apple |
| jxl | Ambos | JPEG XL, formato de nueva generación |
| bmp | Sin pérdida | Mapa de bits sin comprimir |
| ico | Sin pérdida | Formato de icono de Windows |
| jp2 | Con pérdida | JPEG 2000 |
| qoi | Sin pérdida | Formato Quite OK Image |
| psd | Por capas | Adobe Photoshop (requiere ImageMagick) |
| ppm | Sin pérdida | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vectorial | Encapsulated PostScript |
| tga | Sin pérdida | Formato de imagen Targa |

## Ejemplo de solicitud {#example-request}

Convertir a WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Convertir a PNG (sin pérdida):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Notas {#notes}

- La extensión del nombre del archivo de salida se actualiza automáticamente para coincidir con el formato objetivo.
- Las entradas SVG se rasterizan a 300 DPI antes de la conversión.
- La conversión a PSD requiere que ImageMagick esté instalado en el servidor.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI y TGA usan codificadores CLI especializados y omiten el procesamiento de Sharp.
- La codificación HEIC/HEIF usa la biblioteca del codificador HEIC del sistema.
- Los formatos de entrada son amplios: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, etc.), PSD, SVG, BMP y más.

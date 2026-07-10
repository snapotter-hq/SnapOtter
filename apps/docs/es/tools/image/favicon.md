---
description: "Genera todos los tamaños estándar de favicon e iconos de aplicación a partir de una imagen de origen."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 93ef1c938433
---

# Generador de favicons {#favicon-generator}

Genera un conjunto completo de archivos de favicon e iconos de aplicación a partir de una imagen de origen. Produce todos los tamaños estándar necesarios para navegadores, dispositivos Apple y Android, junto con un manifiesto web y un fragmento de HTML.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Acepta datos de formulario multipart con uno o varios archivos de imagen y un campo JSON `settings` opcional.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| background | string | No | - | Color hexadecimal de fondo (p. ej. `"#ffffff"`). Cuando se define, el icono se aplana sobre este color. |
| padding | integer | No | `0` | Porcentaje de relleno alrededor del contenido del icono (0 a 40) |
| radius | integer | No | `0` | Porcentaje de radio de las esquinas para iconos redondeados (0 a 50) |
| sizes | integer[] | No | - | Limita la salida a tamaños de píxel concretos (p. ej. `[16, 32, 180]`). Omítelo para generar todos los tamaños estándar. |
| themeColor | string | No | `"#ffffff"` | Color de tema hexadecimal para el manifiesto web |

## Archivos generados {#generated-files}

Por cada imagen de entrada se producen los siguientes archivos:

| Archivo | Tamaño | Propósito |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Icono de pestaña del navegador |
| `favicon-32x32.png` | 32x32 | Icono de pestaña del navegador (HiDPI) |
| `favicon-48x48.png` | 48x48 | Acceso directo de escritorio |
| `apple-touch-icon.png` | 180x180 | Pantalla de inicio de iOS |
| `android-chrome-192x192.png` | 192x192 | Pantalla de inicio de Android |
| `android-chrome-512x512.png` | 512x512 | Pantalla de bienvenida de Android |
| `favicon.ico` | 32x32 | Formato ICO heredado |
| `manifest.json` | - | Manifiesto de aplicación web con referencias de iconos |
| `favicon-snippet.html` | - | Etiquetas de enlace HTML listas para usar |

## Ejemplo de solicitud {#example-request}

Una sola imagen de origen con esquinas redondeadas y relleno:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Varias imágenes de origen (cada una obtiene su propio conjunto en una subcarpeta):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Ejemplo de respuesta {#example-response}

La respuesta es un archivo ZIP transmitido directamente. Las cabeceras de la respuesta son:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Fragmento de HTML incluido {#html-snippet-included}

El ZIP incluye un archivo `favicon-snippet.html` que puedes pegar en el `<head>` de tu HTML:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Notas {#notes}

- Las imágenes de origen se redimensionan usando el modo de ajuste `cover`, lo que significa que se recortan para rellenar cada tamaño cuadrado. Para obtener los mejores resultados, usa una imagen de origen cuadrada.
- Cuando se suben varios archivos, cada uno obtiene su propia subcarpeta en el ZIP (nombrada según el archivo de origen).
- En el caso de subir un solo archivo, todas las salidas están en la raíz del ZIP sin subcarpeta.
- Los archivos que no superan la validación o la decodificación se omiten, y se incluye un `skipped-files.txt` en el ZIP que explica los problemas.
- Formatos de entrada admitidos: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD y más.
- La orientación EXIF se aplica automáticamente antes de redimensionar.

---
description: "Renombra varios archivos usando una plantilla de patrón y descárgalos como ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 0b1606c2fba1
---

# Renombrado masivo {#bulk-rename}

Renombra varios archivos usando una plantilla de patrón con marcadores de posición para el índice, el índice con relleno de ceros y el nombre de archivo original. Devuelve un archivo ZIP que contiene todos los archivos renombrados.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Acepta datos de formulario multipart con varios archivos y un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pattern | string | No | `"image-{{index}}"` | Patrón de nombres con marcadores de posición (máx. 1000 caracteres) |
| startIndex | number | No | `1` | Número de índice inicial |

### Pattern Placeholders {#pattern-placeholders}

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{index}}` | Número secuencial que empieza en `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Número secuencial con relleno de ceros | `01`, `02`, `03` |
| `{{original}}` | Nombre de archivo original sin extensión | `photo`, `IMG_001` |

La extensión de archivo original siempre se conserva.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Esto produce: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Usando el nombre de archivo original:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Esto produce: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Example Response {#example-response}

La respuesta es un archivo ZIP transmitido directamente (no una respuesta JSON). Los encabezados de la respuesta son:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Notes {#notes}

- Esta herramienta no procesa imágenes. Solo renombra archivos y los empaqueta en un archivo ZIP.
- El ancho del relleno de ceros para `{{padded}}` se determina automáticamente según el número total de archivos (por ejemplo, 100 archivos usarían un relleno de 3 dígitos: `001`, `002`, etc.).
- Las extensiones de archivo se conservan de los nombres de archivo originales.
- Los nombres de archivo se depuran para eliminar caracteres no seguros.
- Debe proporcionarse al menos un archivo.

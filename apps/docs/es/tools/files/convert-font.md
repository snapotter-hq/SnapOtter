---
description: "Convierte fuentes entre TTF, OTF, WOFF y WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: fb002b4bc3c8
i18n_hash_version: 2
---

# Convertir fuente {#convert-font}

Convierte un archivo de fuente entre TrueType (TTF), OpenType CFF (OTF), WOFF y WOFF2. Úsalo para convertir una fuente de escritorio en una fuente web, o para obtener un TTF a partir de un OTF para una aplicación que solo acepta TrueType.

## Endpoint de la API {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Acepta datos de formulario multipart con un archivo `.ttf`, `.otf`, `.woff` o `.woff2` y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| format | string | No | `ttf` | Formato de salida: `ttf`, `otf`, `woff` o `woff2` |

## Ejemplo de solicitud {#example-request}

De OTF a TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

De TTF a WOFF2 para la web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Notas {#notes}

- WOFF y WOFF2 son envoltorios comprimidos de los mismos datos de fuente, así que convertir a esos formatos o desde ellos no cambia los contornos.
- De OTF a TTF convierte las curvas cúbicas (CFF) en curvas cuadráticas de TrueType. Cada curva queda a menos de 1 unidad de fuente de la original, algo invisible en tamaños normales, pero la conversión no es exactamente reversible. De TTF a OTF conserva la forma de las curvas y solo redondea los puntos de control a unidades de fuente enteras.
- Los permisos de incrustación de la fuente (el campo OS/2 `fsType`) se mantienen tal cual.
- No se admiten colecciones de fuentes (`.ttc`). Las fuentes TrueType variables no se pueden convertir a OTF y las fuentes CFF2 variables no se pueden convertir a TTF; en esos casos, conviértelas a WOFF o WOFF2.
- La conversión se ejecuta en el worker de documentos de Python, con el mismo tiempo límite que las demás herramientas de documentos, y no dentro del proceso de la API.

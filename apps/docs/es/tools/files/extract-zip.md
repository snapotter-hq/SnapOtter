---
description: "Extrae archivos de forma segura de un archivo ZIP con protección contra bombas."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 6cfbbb30b401
---

# Extraer ZIP {#extract-zip}

Extrae archivos de forma segura de un archivo ZIP. Los archivos con un solo fichero devuelven directamente el fichero contenido; los archivos con varios ficheros devuelven un ZIP plano con el contenido extraído.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Acepta datos de formulario multipart con un archivo ZIP. No se requiere un campo de ajustes.

## Parámetros {#parameters}

Esta herramienta no tiene parámetros configurables. Sube un archivo `.zip` para extraerlo.

## Ejemplo de solicitud {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notas {#notes}

- Solo se aceptan archivos `.zip` como entrada.
- Si el archivo contiene un solo fichero, ese fichero se devuelve directamente (no envuelto en un ZIP).
- Si el archivo contiene varios ficheros, se devuelve un ZIP plano con todos los ficheros extraídos al nivel raíz (la estructura de directorios anidada se aplana).
- La protección integrada contra bombas rechaza los archivos con ratios de compresión o cantidades de ficheros excesivas para evitar el agotamiento de recursos.

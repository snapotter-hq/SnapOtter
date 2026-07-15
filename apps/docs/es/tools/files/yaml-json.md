---
description: "Convierte entre YAML y JSON en ambos sentidos."
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: 052c4635f8ba
---

# Convertir YAML / JSON {#yaml-json}

Convierte entre los formatos YAML y JSON en ambos sentidos. Sube un archivo YAML para obtener JSON, o sube un archivo JSON para obtener YAML.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Acepta datos de formulario multipart con un archivo YAML o JSON. No se requiere ningún campo de configuración.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. El sentido de la conversión se determina por la extensión del archivo de entrada.

## Example Request {#example-request}

YAML a JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON a YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Notes {#notes}

- El sentido de la conversión se detecta automáticamente a partir de la extensión del archivo de entrada: `.yaml` o `.yml` produce `.json`, y `.json` produce `.yaml`.
- Se aceptan tanto las extensiones `.yaml` como `.yml`.
- Solo se convierte el primer documento de un archivo YAML con varios documentos; los documentos adicionales separados por `---` se ignoran.

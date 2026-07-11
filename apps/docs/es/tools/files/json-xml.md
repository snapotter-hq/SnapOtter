---
description: "Convierte entre JSON y XML, en ambas direcciones."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: edd892e4082c
---

# JSON a XML {#json-to-xml}

Convierte entre los formatos JSON y XML en ambas direcciones. Sube un archivo JSON para obtener XML, o sube un archivo XML para obtener JSON.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Acepta datos de formulario multipart con un archivo JSON o XML y un campo JSON `settings`.

## Parámetros {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Formatea la salida con sangría |

## Ejemplo de solicitud {#example-request}

JSON a XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML a JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Ejemplo de respuesta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notas {#notes}

- La dirección de conversión se detecta automáticamente a partir de la extensión del archivo de entrada: `.json` produce `.xml`, y `.xml` produce `.json`.
- El parámetro `pretty` se aplica en ambas direcciones. Cuando es `false`, la salida es compacta y sin sangría.
- Los atributos XML y las estructuras anidadas se conservan durante la conversión de ida y vuelta siempre que sea posible.

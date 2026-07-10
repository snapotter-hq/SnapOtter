---
description: "Extrae elementos repetidos de un XML a una tabla CSV."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: fa044966477c
---

# XML a CSV {#xml-to-csv}

Extrae elementos repetidos de un archivo XML a una tabla CSV plana. La herramienta encuentra automáticamente el primer array de objetos en el árbol XML y asigna cada elemento a una fila.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Acepta datos de formulario multipart con un archivo XML. No se requiere ningún campo de configuración.

## Parameters {#parameters}

Esta herramienta no tiene parámetros configurables. El elemento repetido se detecta automáticamente a partir de la estructura del XML.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Notes {#notes}

- Solo se aceptan archivos `.xml` como entrada.
- La herramienta recorre el árbol XML en busca del primer conjunto repetido de elementos hermanos y los usa como filas.
- Cada nombre único de elemento hijo o de atributo se convierte en un encabezado de columna del CSV.
- Esta es una conversión de un solo sentido. Para la conversión bidireccional entre JSON y XML, usa la herramienta [JSON a XML](/es/tools/files/json-xml).

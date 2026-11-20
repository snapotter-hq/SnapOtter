---
description: "Combina varios archivos de texto o Markdown en uno, en el orden que elijas."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: f37900ede756
i18n_hash_version: 2
---

# Unir archivos de texto {#merge-text}

Combina varios archivos de texto o Markdown en un único archivo. Los archivos se unen en el orden en que se suben, así que reordénalos en la lista de archivos antes de ejecutar si el orden importa.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Acepta datos de formulario multipart con dos o más archivos de texto y una cadena JSON `settings` opcional.

## Parameters {#parameters}

| Parámetro | Tipo | Predeterminado | Descripción |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | Lo que va entre los archivos: `"blank-line"`, `"rule"` (una línea `---`) o `"filename-heading"` (el nombre de cada archivo como encabezado) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Notes {#notes}

- Acepta archivos `.txt`, `.md`, `.markdown`, `.csv` y `.log`, entre 2 y 50 por solicitud.
- Todos los archivos deben ser texto UTF-8. Un archivo binario o que no sea UTF-8 se rechaza y su nombre aparece en el error.
- Cuando todas las entradas tienen la misma extensión, la salida la conserva (`merged.md`, `merged.log`). Las entradas mixtas producen `merged.txt`.
- Con `filename-heading`, la salida Markdown usa encabezados `# name.md`; la salida de texto plano usa líneas marcadoras `==> name.txt <==`.
- Se recortan las líneas en blanco al final de cada archivo para que el separador quede limpio entre documentos. Se elimina una marca de orden de bytes inicial.
- Los archivos CSV se unen como texto plano. Usa [Combinar CSV](./merge-csvs) para combinar tablas con una única fila de encabezado.
- Los archivos de correo `.eml` todavía no se admiten.

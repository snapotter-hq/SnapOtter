---
description: "Añade protección con contraseña mediante cifrado AES-256 a un PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 0850252ddf52
---

# Proteger PDF {#protect-pdf}

Añade protección con contraseña a un PDF mediante cifrado AES-256.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| userPassword | string | Sí | - | Contraseña necesaria para abrir el PDF (1-256 caracteres) |
| ownerPassword | string | No | Igual que `userPassword` | Contraseña de propietario para los permisos (1-256 caracteres) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- El cifrado usa AES-256.
- Si se omite `ownerPassword`, su valor predeterminado es el mismo que `userPassword`.
- Las contraseñas se ocultan en los registros de auditoría.
- El PDF cifrado requiere la contraseña de usuario para abrirse y la contraseña de propietario (si es diferente) para tener todos los permisos.

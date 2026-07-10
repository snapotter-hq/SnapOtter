---
description: "Elimina la protección con contraseña de un PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: c7840a025b61
---

# Desbloquear PDF {#unlock-pdf}

Elimina la protección con contraseña de un PDF cifrado proporcionando la contraseña correcta.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Acepta datos de formulario multipart con un archivo PDF y un campo JSON `settings`.

## Parameters {#parameters}

| Parámetro | Tipo | Obligatorio | Predeterminado | Descripción |
|-----------|------|----------|---------|-------------|
| password | string | Sí | - | Contraseña para descifrar el PDF (1-256 caracteres) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Se debe proporcionar la contraseña correcta; una contraseña incorrecta devuelve un error 400.
- Tanto la contraseña de usuario como la de propietario funcionarán para el descifrado.
- Las contraseñas se ocultan en los registros de auditoría.

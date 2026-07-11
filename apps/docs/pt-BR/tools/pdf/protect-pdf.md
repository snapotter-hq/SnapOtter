---
description: "Adicione proteção por senha com criptografia AES-256 a um PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: a3b7b2e29bfd
---

# Protect PDF {#protect-pdf}

Adicione proteção por senha a um PDF usando criptografia AES-256.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| userPassword | string | Sim | - | Senha necessária para abrir o PDF (1-256 caracteres) |
| ownerPassword | string | Não | Igual a `userPassword` | Senha do proprietário para permissões (1-256 caracteres) |

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

- A criptografia usa AES-256.
- Se `ownerPassword` for omitido, ele assume por padrão o mesmo valor de `userPassword`.
- As senhas são ocultadas dos logs de auditoria.
- O PDF criptografado exige a senha do usuário para abrir e a senha do proprietário (se diferente) para permissões completas.

---
description: "Remova a proteção por senha de um PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: e9050d1a1b08
---

# Unlock PDF {#unlock-pdf}

Remova a proteção por senha de um PDF criptografado fornecendo a senha correta.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| password | string | Sim | - | Senha para descriptografar o PDF (1-256 caracteres) |

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

- A senha correta deve ser fornecida; uma senha incorreta retorna um erro 400.
- Tanto a senha do usuário quanto a senha do proprietário funcionam para a descriptografia.
- As senhas são ocultadas dos logs de auditoria.

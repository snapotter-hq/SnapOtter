---
description: "Leia e escreva metadados de documentos PDF."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: d9353f5c61dd
---

# PDF Metadata {#pdf-metadata}

Leia e atualize campos de metadados de documentos PDF, como título, autor, assunto e palavras-chave. Quando nenhuma configuração é fornecida, os metadados existentes são retornados sem modificação.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings` opcional.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| title | string | Não | - | Título do documento (máximo de 500 caracteres) |
| author | string | Não | - | Autor do documento (máximo de 500 caracteres) |
| subject | string | Não | - | Assunto do documento (máximo de 500 caracteres) |
| keywords | string | Não | - | Palavras-chave do documento (máximo de 500 caracteres) |

Todos os parâmetros são opcionais. Os campos omitidos permanecem inalterados.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Formato de entrada aceito: `.pdf`.
- Esta é uma ferramenta rápida (síncrona) que retorna o resultado diretamente.
- O campo `metadata` na resposta contém os metadados resultantes após quaisquer atualizações.
- Para ler os metadados sem modificá-los, omita o campo `settings` ou envie um objeto vazio.
- Cada campo de metadados é limitado a 500 caracteres.

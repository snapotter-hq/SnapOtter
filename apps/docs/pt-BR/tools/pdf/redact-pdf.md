---
description: "Remova permanentemente ocorrências de texto de um PDF (redação verdadeira verificada)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 3d230772545c
---

# Redact PDF {#redact-pdf}

Remova permanentemente ocorrências de texto especificadas de um PDF usando redação verdadeira verificada. O texto redigido é completamente removido do arquivo, não apenas coberto com uma caixa preta.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| terms | string[] | Sim | - | Strings de texto a redigir (1-50 termos, cada um com até 200 caracteres) |
| caseSensitive | boolean | Não | `false` | Se a correspondência diferencia maiúsculas de minúsculas |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Formato de entrada aceito: `.pdf`.
- Esta é uma ferramenta rápida (síncrona) que retorna o resultado diretamente.
- Isto executa uma redação verdadeira: o texto correspondente é removido do fluxo de conteúdo do PDF, não apenas ocultado visualmente.
- O campo `found` na resposta indica quantas ocorrências foram redigidas.
- Você pode redigir até 50 termos em uma única requisição.

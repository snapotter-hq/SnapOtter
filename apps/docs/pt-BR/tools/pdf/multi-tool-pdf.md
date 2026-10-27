---
description: "Reordene, rotacione, exclua e extraia páginas de outros PDFs em um editor ou pela API."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 5c6cbc12777d
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

Monte um PDF a partir de um plano de páginas explícito: reordene, duplique, rotacione ou exclua páginas e extraia páginas de PDFs adicionais, tudo em uma única requisição.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Aceita dados de formulário multipart com um ou mais arquivos PDF e um campo JSON `settings`.
Até 20 documentos de entrada e 1.200 páginas de saída são suportados por requisição.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-------------|
| items | array | Sim | Plano de páginas de saída, na ordem de saída. Cada item é `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` indexa os arquivos enviados na ordem de envio (base 0); `page` é um número de página base 1 nesse documento. |
| pageCounts | array | Sim | Número real de páginas de cada documento enviado, na mesma ordem. Uma página do plano além da contagem do documento é rejeitada com 400. |

## Example Request {#example-request}

Pegue as páginas 3 e 1 do primeiro documento e as páginas 1 e 2 do segundo, rotacionando a primeira página de saída em 90° no sentido horário:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- A mesma página pode aparecer várias vezes em `items` para duplicá-la.
- Páginas ausentes de `items` são omitidas da saída.
- `rot` registra a nova orientação de exibição na página copiada (composta com qualquer rotação existente); o conteúdo da página não é alterado.
- A rotação é aplicada por cópia de saída, então duplicatas podem ter rotações diferentes.
- A saída é um documento novo e plano; marcadores e metadados em nível de documento de origem não são mantidos.
- O processamento requer o binário qpdf, que acompanha a imagem Docker oficial.

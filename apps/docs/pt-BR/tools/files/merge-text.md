---
description: "Combine vários arquivos de texto ou Markdown em um só, na ordem que você escolher."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: a45a3ca87816
i18n_hash_version: 2
---

# Mesclar arquivos de texto {#merge-text}

Combine vários arquivos de texto ou Markdown em um único arquivo. Os arquivos são unidos na ordem de envio, então reordene-os na lista de arquivos antes de executar se a ordem importar.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Aceita dados de formulário multipart com dois ou mais arquivos de texto e uma string JSON `settings` opcional.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | O que fica entre os arquivos: `"blank-line"`, `"rule"` (uma linha `---`) ou `"filename-heading"` (o nome de cada arquivo como título) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Observações {#notes}

- Aceita arquivos `.txt`, `.md`, `.markdown`, `.csv` e `.log`, entre 2 e 50 por requisição.
- Todo arquivo deve ser texto UTF-8. Um arquivo binário ou fora de UTF-8 é rejeitado, com o nome dele no erro.
- Quando todas as entradas têm a mesma extensão, a saída a mantém (`merged.md`, `merged.log`). Entradas mistas produzem `merged.txt`.
- Com `filename-heading`, a saída Markdown usa títulos `# name.md`; a saída em texto simples usa linhas marcadoras `==> name.txt <==`.
- As linhas em branco no final de cada arquivo são removidas para que o separador fique limpo entre os documentos. Uma marca de ordem de bytes no início é descartada.
- Arquivos CSV são unidos como texto simples. Use [Mesclar CSVs](./merge-csvs) para combinar tabelas com uma única linha de cabeçalho.
- Arquivos de e-mail `.eml` ainda não são suportados.

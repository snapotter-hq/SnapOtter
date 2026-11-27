---
description: "Leia e escreva metadados de documentos PDF."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: 3c97cb69b159
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

Leia e atualize campos de metadados de documentos PDF, como título, autor, assunto e palavras-chave, ou remova por completo os metadados do documento. Quando nenhuma configuração é fornecida, os metadados existentes são retornados sem modificação.

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
| stripAll | boolean | Não | false | Remove todo o dicionário Info (datas, Creator, Producer, chaves personalizadas), todos os streams XMP (documento, páginas, imagens) e todos os dados de aplicativo PieceInfo, e depois grava os campos informados acima |
| removeAttachments | boolean | Não | false | Remove também os arquivos incorporados: a lista de anexos do documento, as anotações de arquivo anexado e os arquivos associados (`/AF`). Requer `stripAll` |

Todos os parâmetros são opcionais. Os campos omitidos permanecem inalterados, a menos que `stripAll` esteja definido.

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
- Com `stripAll`, a resposta também traz `stripped`: as chaves Info que foram removidas (`removed`), se o stream XMP do documento foi removido (`xmpRemoved`), o nível PDF/A declarado pela entrada (`pdfa`, ou `null`), quantos streams XMP foram retirados de páginas, imagens e outros objetos (`objectXmpRemoved`), quantos dicionários PieceInfo foram removidos (`pieceInfoRemoved`) e quantos arquivos incorporados foram removidos (`attachmentsRemoved`, sempre `0` sem `removeAttachments`). Remover o XMP quebra a conformidade com PDF/A.
- `stripAll` sozinho mantém os arquivos anexados incorporados, pois removê-los muda o conteúdo do documento. Adicione `removeAttachments` para removê-los também. Isso remove o XML anexado de e-faturas ZUGFeRD e Factur-X e quebra a conformidade com PDF/A-3.
- Enviar `removeAttachments` sem `stripAll` retorna 400.

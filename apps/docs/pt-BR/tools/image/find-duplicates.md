---
description: "Detecte imagens duplicadas e quase duplicadas usando hashing perceptual."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 22f8b191c0e2
---

# Encontrar Duplicatas {#find-duplicates}

Envie várias imagens para detectar duplicatas e quase duplicatas usando hashing perceptual (dHash). Agrupa imagens semelhantes, identifica a versão de melhor qualidade em cada grupo e calcula a economia potencial de espaço.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Aceita dados de formulário multipart com vários arquivos de imagem e um campo JSON `settings` opcional.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| threshold | number | Não | `8` | Distância de Hamming máxima para considerar imagens como duplicatas (0 a 20). Menor = correspondência mais rigorosa |

### Campos de Arquivo {#file-fields}

Envie pelo menos 2 arquivos de imagem na requisição multipart (todos usando o nome de campo `file` ou qualquer nome de campo para as partes de arquivo).

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Campos da Resposta {#response-fields}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| totalImages | number | Número de imagens analisadas com sucesso |
| duplicateGroups | array | Grupos de imagens duplicadas |
| uniqueImages | number | Número de imagens que não fazem parte de nenhum grupo de duplicatas |
| spaceSaveable | number | Total de bytes que poderiam ser economizados removendo as duplicatas que não são as melhores |
| skippedFiles | array | Arquivos que não puderam ser processados (com nome do arquivo e motivo) |

### Objeto de Grupo de Duplicatas {#duplicate-group-object}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| groupId | number | Identificador do grupo |
| files | array | Imagens neste grupo de duplicatas |

### Objeto de Arquivo (dentro de um grupo) {#file-object-within-a-group}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| filename | string | Nome original do arquivo |
| similarity | number | Percentual de similaridade em relação à imagem de referência (a primeira do grupo) |
| width | number | Largura da imagem em pixels |
| height | number | Altura da imagem em pixels |
| fileSize | number | Tamanho do arquivo em bytes |
| format | string | Formato da imagem |
| isBest | boolean | Se esta é a versão de maior qualidade (mais pixels, arquivo maior) |
| thumbnail | string ou null | Miniatura JPEG em base64 (200px de largura) para pré-visualização |

## Observações {#notes}

- Usa um dHash de 128 bits (linha de 64 bits + coluna de 64 bits) para detecção de similaridade perceptual. Isso captura duplicatas mesmo após redimensionamentos, recompressões e pequenas edições.
- O limite representa a distância de Hamming máxima entre os hashes. O padrão de 8 captura quase duplicatas evitando falsos positivos. Use 0 para apenas idênticas em pixels, ou 15-20 para correspondência bem flexível.
- A imagem "melhor" em cada grupo é aquela com mais pixels (largura x altura), com o tamanho do arquivo como critério de desempate.
- São necessárias pelo menos 2 imagens. Arquivos que falham na validação ou na decodificação são reportados em `skippedFiles` em vez de fazer toda a requisição falhar.
- As miniaturas são pré-visualizações JPEG de 200px de largura codificadas como data URIs.
- Todos os formatos comuns são suportados (HEIC, RAW, PSD, SVG decodificados automaticamente).

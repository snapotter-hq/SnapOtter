---
description: "Extraia as cores dominantes de uma imagem como uma paleta de cores."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: 075b58e68a9b
---

# Paleta de Cores {#color-palette}

Extraia as cores dominantes de uma imagem e obtenha-as como valores de cor hexadecimais. Usa análise de frequência quantizada para identificar as cores mais proeminentes e visualmente distintas.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings` opcional.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| count | integer | Não | `8` | Número de cores a extrair (2-16) |
| format | string | Não | `"hex"` | Formato da cor: `hex`, `rgb`, `hsl` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Campos da Resposta {#response-fields}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| filename | string | Nome de arquivo higienizado |
| colors | array | Array de strings de cor no formato solicitado, ordenado por dominância (mais frequente primeiro) |
| hex | array | Array de strings de cor hexadecimais (sempre hexadecimal, independentemente da configuração `format`) |
| count | number | Número de cores extraídas |

## Notas {#notes}

- Retorna até `count` cores dominantes (padrão 8, faixa 2-16), ordenadas por frequência (mais comuns primeiro).
- A imagem é redimensionada internamente para 100x100 pixels para a análise, então a paleta representa a distribuição geral de cores em vez de pequenos detalhes.
- As cores são extraídas usando quantização por corte mediano, que divide recursivamente as populações de pixels ao longo do canal com a maior amplitude.
- O canal alfa é removido antes da análise, então áreas transparentes não são consideradas.
- Este é um endpoint somente leitura. Ele não produz um arquivo de saída baixável nem um `jobId`.
- Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes da análise.

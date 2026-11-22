---
description: "Calcule a largura ou a altura que falta para manter a proporção e simplifique a razão."
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: e69093f41667
i18n_hash_version: 2
---

# Calculadora de proporção {#aspect-ratio-calculator}

Informe a largura e a altura originais, depois uma nova largura ou uma nova altura, e receba o outro lado de volta para manter as proporções. A razão volta na forma mais simples, então 1920 × 1080 é 16:9. No aplicativo web, você pode partir de uma proporção comum (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) e alternar entre paisagem e retrato.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

Aceita um corpo JSON (não multipart) e responde com números em vez de um arquivo para download.

## Parâmetros {#parameters}

| Nome | Tipo | Padrão | Descrição |
|------|------|---------|-------------|
| `width` | number | (obrigatório) | Largura original. |
| `height` | number | (obrigatório) | Altura original. |
| `newWidth` | number | - | Largura de destino. A resposta calcula `newHeight` a partir dela. |
| `newHeight` | number | - | Altura de destino. A resposta calcula `newWidth` a partir dela. |
| `round` | boolean | `true` | Arredonda o lado calculado para um número inteiro. Quando `false`, mantém duas casas decimais. |

Toda dimensão deve estar entre `0.0001` e `1000000`. Envie `newWidth` ou `newHeight`, não os dois. Omita ambos para receber apenas a razão simplificada.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

`newWidth` e `newHeight` são `null` quando a requisição não enviou nenhum dos dois.

## Observações {#notes}

- Tamanhos fracionários são reduzidos a uma razão de números inteiros usando até quatro casas decimais, então `8.5` × `11` volta como `17:22`.
- `ratioDecimal` é a largura dividida pela altura, arredondada para quatro casas decimais.
- Um lado calculado nunca volta como `0`. Com o arredondamento ativado, ele é no mínimo `1`, e com o arredondamento desativado, no mínimo `0.01`.
- Enviar `newWidth` e `newHeight` juntos, ou uma dimensão fora do intervalo permitido, retorna um erro 400.
- A calculadora nunca lê nem grava arquivos. Para aplicar os números, use [Redimensionar Imagem](/pt-BR/tools/image/resize) ou [Recortar Imagem](/pt-BR/tools/image/crop).

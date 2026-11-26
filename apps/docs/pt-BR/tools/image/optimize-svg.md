---
description: "Minifique arquivos SVG com o svgo e mantenha o resultado como SVG vetorial, com controles de precisão, várias passagens, metadados e formatação."
i18n_source_hash: 07a564ab53dd
i18n_provenance: machine
i18n_output_hash: dca4f33a83ac
i18n_hash_version: 2
---

# Otimizar SVG {#optimize-svg}

Reduza o tamanho de arquivos SVG removendo resíduos de editor, atributos redundantes e casas decimais em excesso, e baixe o resultado como SVG. Diferente de “Otimizar para web”, a saída nunca é rasterizada.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Aceita dados de formulário multipart com um arquivo `.svg` ou `.svgz` e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| precision | number | Não | `3` | Casas decimais mantidas nos dados de caminho e nos números (0 a 8). Valores menores geram arquivos menores e curvas um pouco menos finas. |
| multipass | boolean | Não | `true` | Executar o otimizador repetidamente até a saída parar de diminuir |
| removeMetadata | boolean | Não | `true` | Remover comentários, `<metadata>`, elementos `<desc>` vazios ou gerados por editores e dados específicos de editores. Desative para mantê-los. |
| pretty | boolean | Não | `false` | Indentar a saída para facilitar a leitura em vez de minificá-la em poucas linhas |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notas {#notes}

- A entrada deve ser um arquivo SVG ou SVGZ. Uma imagem raster é rejeitada com `400` e o código `IMAGE_UNDECODABLE`.
- A entrada `.svgz` é descompactada primeiro, e a saída é sempre um `.svg` simples.
- O SVG é limitado a 10 MB após a descompactação. Um arquivo maior é rejeitado com `400` e o código `SVG_TOO_LARGE`.
- `viewBox` e `<title>` são sempre mantidos, para que o gráfico continue escalando e mantenha seu nome acessível.
- A entrada e a saída passam pelo sanitizador de SVG, que remove scripts e outros conteúdos ativos.
- Reduzir `precision` é a maior economia de tamanho em artes com muitos caminhos. Confira o resultado visualmente entre 0 e 2.

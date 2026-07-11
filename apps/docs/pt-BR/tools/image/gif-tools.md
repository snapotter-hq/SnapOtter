---
description: "Redimensione, otimize, altere a velocidade, inverta, gire e extraia quadros de GIFs animados em uma única ferramenta."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: d1d8927c0c47
---

# Ferramentas de GIF {#gif-tools}

Redimensione, otimize, altere a velocidade, inverta, extraia quadros e gire GIFs animados. Oferece vários modos de operação em uma única ferramenta.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parâmetros {#parameters}

### Parâmetros Comuns {#common-parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| mode | string | Não | `"resize"` | Modo de operação: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | Não | 0 | Número de repetições do GIF de saída (0 = infinito, 1-100 = repetições finitas) |

### Parâmetros do Modo Redimensionar {#resize-mode-parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| width | integer | Não | - | Largura alvo em pixels (1 a 16384) |
| height | integer | Não | - | Altura alvo em pixels (1 a 16384) |
| percentage | number | Não | - | Escala por percentual (1 a 500). Sobrepõe width/height se definido. |

### Parâmetros do Modo Otimizar {#optimize-mode-parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| colors | number | Não | 256 | Número máximo de cores na paleta (2 a 256) |
| dither | number | Não | 1.0 | Intensidade de dithering (0 a 1, onde 0 desativa o dithering) |
| effort | number | Não | 7 | Nível de esforço de otimização (1 a 10, maior = mais lento porém menor) |

### Parâmetros do Modo Velocidade {#speed-mode-parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| speedFactor | number | Não | 1.0 | Multiplicador de velocidade (0.1 a 10). Valores > 1 aceleram, < 1 desaceleram. |

### Parâmetros do Modo Extrair {#extract-mode-parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| extractMode | string | Não | `"single"` | Modo de extração: `single`, `range`, `all` |
| frameNumber | number | Não | 0 | Índice do quadro a extrair no modo `single` (base 0) |
| frameStart | number | Não | 0 | Índice do quadro inicial para o modo `range` (base 0) |
| frameEnd | number | Não | - | Índice do quadro final para o modo `range` (base 0, inclusivo) |
| extractFormat | string | Não | `"png"` | Formato para os quadros extraídos: `png`, `webp` |

### Parâmetros do Modo Girar {#rotate-mode-parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| angle | number | Não | - | Ângulo de rotação: `90`, `180` ou `270` graus |
| flipH | boolean | Não | `false` | Inverter horizontalmente |
| flipV | boolean | Não | `false` | Inverter verticalmente |

## Exemplos de Requisição {#example-requests}

### Redimensionar {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Otimizar {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Acelerar {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Extrair Quadro Único {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Sub-rota de Info {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Retorna metadados sobre um GIF animado sem processá-lo.

### Requisição de Info {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Resposta de Info {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Observações {#notes}

- Usa a fábrica padrão `createToolRoute` para o endpoint principal de processamento.
- O endpoint de info requer apenas o envio de um arquivo (não são necessárias configurações).
- No modo `resize`, se `percentage` for fornecido ele tem prioridade sobre `width`/`height`. O redimensionamento usa `fit: inside` para manter a proporção.
- No modo `speed`, os atrasos dos quadros são divididos pelo fator de velocidade. O atraso mínimo por quadro é de 20ms (limitação da especificação do GIF).
- No modo `reverse`, o parâmetro `speedFactor` também está disponível para ajustar a velocidade simultaneamente à inversão.
- No modo `extract` com `range` ou `all`, a saída é um arquivo ZIP contendo os quadros individuais.
- No modo `rotate`, cada quadro é processado individualmente e remontado em uma animação.
- O parâmetro `loop` controla quantas vezes o GIF de saída se repete. Use 0 para repetição infinita.
- O campo `duration` na resposta de info é a duração total da animação em milissegundos.

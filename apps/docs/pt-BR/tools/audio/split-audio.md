---
description: "Divida o áudio por intervalos de tempo, partes iguais ou detecção de silêncio."
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: acef79f79f44
---

# Dividir Áudio {#split-audio}

Divida um arquivo de áudio em segmentos por intervalos de tempo fixos, partes iguais ou detecção automática de silêncio. Retorna um arquivo ZIP com os segmentos.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| mode | string | Não | `"time"` | Estratégia de divisão: `time`, `parts`, `silence` |
| segmentS | number | Não | `60` | Duração do segmento em segundos, 1 a 3600 (usado quando mode é `time`) |
| parts | integer | Não | `2` | Número de partes iguais, 2 a 20 (usado quando mode é `parts`) |
| thresholdDb | number | Não | `-40` | Limiar de silêncio em dB, -80 a -20 (usado quando mode é `silence`) |
| minSilenceS | number | Não | `0.3` | Intervalo mínimo de silêncio em segundos, 0,1 a 10 (usado quando mode é `silence`) |

## Exemplo de Requisição {#example-request}

Dividir em segmentos de 30 segundos:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

Dividir por detecção de silêncio:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notas {#notes}

- O `downloadUrl` aponta para um arquivo ZIP contendo todos os segmentos.
- Apenas os parâmetros relevantes para o `mode` escolhido são usados; os demais são ignorados.
- Os nomes dos arquivos de segmento são numerados em sequência (ex.: `part-000.mp3`, `part-001.mp3`).
- O formato de saída corresponde ao formato de entrada.

---
description: "Reduza o ruído de fundo do áudio com remoção de ruído baseada em FFT."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: dc25a9021e5c
---

# Redução de Ruído {#noise-reduction}

Reduza o ruído de fundo em um arquivo de áudio usando remoção de ruído baseada em FFT, com intensidade selecionável.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| strength | string | Não | `"medium"` | Intensidade da remoção de ruído: `light`, `medium`, `strong` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notas {#notes}

- `light` preserva mais detalhes, mas remove menos ruído. `strong` remove mais ruído, mas pode introduzir artefatos sutis.
- Melhores resultados em gravações com ruído de fundo constante (zumbido de ventilador, ar-condicionado, chiado).
- A saída normalmente mantém o contêiner de entrada. Entrada AAC é gravada como M4A, e entradas apenas de decodificação não suportadas recorrem a MP3.

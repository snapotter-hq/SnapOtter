---
description: "Aumente ou reduza o tom do áudio em semitons sem alterar a velocidade."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 68c6f9f8f2cd
---

# Alteração de Tom {#pitch-shift}

Aumente ou reduza o tom de um arquivo de áudio em uma quantidade de semitons sem alterar sua velocidade de reprodução.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| semitones | integer | Não | `3` | Semitons a deslocar (-12 a 12). Deve ser diferente de zero. |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- Valores positivos elevam o tom; valores negativos o reduzem.
- Um deslocamento de 12 semitons equivale a uma oitava acima; -12 equivale a uma oitava abaixo.
- A duração da reprodução permanece a mesma, independentemente da quantidade de deslocamento.
- A saída normalmente mantém o contêiner de entrada. Entrada AAC é gravada como M4A, e entradas apenas de decodificação não suportadas recorrem a MP3.

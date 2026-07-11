---
description: "Visualize, edite ou remova tags de metadados de áudio (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: fcfafab83640
---

# Metadados de Áudio {#audio-metadata}

Visualize, edite ou remova tags de metadados de áudio como título, artista e álbum (ID3 e formatos de tag similares).

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

Aceita dados de formulário multipart com um arquivo de áudio e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| strip | boolean | Não | `false` | Remover todas as tags de metadados existentes |
| title | string | Não | - | Definir a tag de título (máx. 500 caracteres) |
| artist | string | Não | - | Definir a tag de artista (máx. 500 caracteres) |
| album | string | Não | - | Definir a tag de álbum (máx. 500 caracteres) |

## Exemplo de Requisição {#example-request}

Editar tags de metadados:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

Remover todos os metadados:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## Notas {#notes}

- A resposta inclui um objeto `metadata` com formato do contêiner, duração, bitrate e tags atuais.
- Quando `strip` é `true`, todos os campos de tag são ignorados e todas as tags existentes são removidas.
- Apenas as tags que você fornece são atualizadas; as tags não especificadas permanecem inalteradas.
- O formato de saída corresponde ao formato de entrada.

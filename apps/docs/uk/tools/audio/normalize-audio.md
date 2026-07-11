---
description: "Вирівнюйте гучність до стандартних рівнів мовлення (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: e6b316a59fe1
---

# Нормалізувати аудіо {#normalize-audio}

Вирівнюйте гучність аудіо до стандартних рівнів мовлення за допомогою нормалізації EBU R128 (-16 LUFS).

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Приймає багаточастинні дані форми з аудіофайлом та JSON-полем `settings`.

## Параметри {#parameters}

Цей інструмент не має налаштовуваних параметрів. Він застосовує нормалізацію гучності EBU R128 автоматично.

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Примітки {#notes}

- Використовує стандарт гучності EBU R128 із ціллю -16 LUFS.
- Ідеально для подкастів, аудіокниг та мовленнєвого контенту, де важлива стала гучність.
- Вихідна частота дискретизації зберігається у виході.
- Вихід зазвичай зберігає вхідний контейнер. Вхід AAC записується як M4A, а непідтримувані входи лише для декодування переходять на MP3.

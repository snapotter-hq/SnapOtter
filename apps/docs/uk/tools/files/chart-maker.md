---
description: "Створення стовпчастих, лінійних або кругових діаграм з даних CSV чи JSON."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: 92922dd47e97
---

# Chart Maker {#chart-maker}

Створення стовпчастих, лінійних або кругових діаграм з даних CSV чи JSON. Повертає зображення PNG відрендереної діаграми.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Приймає дані форми multipart з файлом CSV чи JSON та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | Тип діаграми: `bar`, `line`, `pie` |
| title | string | No | - | Заголовок діаграми (максимум 120 символів) |
| width | integer | No | `960` | Ширина діаграми в пікселях (320-2048) |
| height | integer | No | `540` | Висота діаграми в пікселях (240-1536) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- Вхідними даними має бути файл `.csv` або `.json`. Файли CSV повинні мати рядок заголовків з іменами стовпців.
- Перший стовпець використовується як мітка категорії; другий стовпець має бути числовим і надає значення даних. Використовуються лише два стовпці.
- Вхідні дані JSON мають бути масивом об'єктів `{label, value}` або простим об'єктом, ключі якого стають мітками, а значення - точками даних.
- Максимум 100 точок даних. Усі значення мають бути нуль або більше.
- Вивід завжди є зображенням PNG незалежно від вхідного формату.

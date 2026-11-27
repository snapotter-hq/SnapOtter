---
description: "Обрезка всех страниц PDF по полям или до заданной области."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: 5a30f8f4cd9c
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

Обрежьте все страницы PDF с одним полем на каждом краю, с отдельным полем для каждого края или до заданной области, например транспортной этикетки, напечатанной в углу листа.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Принимает данные multipart form с PDF-файлом и JSON-полем `settings`.

## Parameters {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| mode | string | Нет | `uniform` | `uniform`, `sides`, или `region` |
| margin | number | Нет | `20` | Режим `uniform`: поле обрезки для каждого края в пунктах (0-2000) |
| top, right, bottom, left | number | Нет | `0` | Режим `sides`: поле обрезки для каждого края отдельно в пунктах (0-2000) |
| x, y | number | Нет | `0` | Режим `region`: смещение области от левого и верхнего краёв страницы в пунктах |
| width, height | number | Нет | `288`, `432` | Режим `region`: размер области в пунктах (этикетка 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Оставьте только этикетку 4x6 in в левом верхнем углу каждой страницы:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Все значения задаются в пунктах PDF (1 пункт = 1/72 дюйма). Страница US Letter имеет размер 612 x 792 пункта.
- Каждый режим читает только свои поля, поэтому запрос, отправляющий только `margin`, продолжает работать.
- Область отсчитывается от левого верхнего угла каждой страницы и должна помещаться на каждой странице. Поля должны оставлять часть каждой страницы. Иначе запрос завершится ошибкой `400`.
- На странице, у которой задано отображение с поворотом, положения и края относятся к странице в том виде, в каком она отображается, поэтому левый верхний угол области совпадает с левым верхним углом повёрнутой страницы.
- Каждый режим отсчитывает от полного media box, поэтому обрезка уже обрезанной страницы начинается с полной страницы. Равномерное поле `0` показывает весь media box.

---
description: "Витягнення повторюваних елементів з XML у таблицю CSV."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: cbafbd9a9199
---

# XML у CSV {#xml-to-csv}

Витягнення повторюваних елементів з файлу XML у пласку таблицю CSV. Інструмент автоматично знаходить перший масив об'єктів у дереві XML і зіставляє кожен елемент з рядком.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Приймає дані форми у форматі multipart із файлом XML. Поле налаштувань не потрібне.

## Параметри {#parameters}

Цей інструмент не має настроюваних параметрів. Повторюваний елемент визначається автоматично зі структури XML.

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Примітки {#notes}

- Як вхідні дані приймаються лише файли `.xml`.
- Інструмент сканує дерево XML на перший повторюваний набір сусідніх елементів і використовує їх як рядки.
- Кожне унікальне ім'я дочірнього елемента або атрибута стає заголовком стовпця CSV.
- Це одностороннє перетворення. Для двостороннього перетворення JSON/XML використовуйте інструмент [JSON у XML](/uk/tools/files/json-xml).

---
description: "Извлечение повторяющихся элементов из XML в таблицу CSV."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: b9c246538577
---

# XML в CSV {#xml-to-csv}

Извлеките повторяющиеся элементы из файла XML в плоскую таблицу CSV. Инструмент автоматически находит первый массив объектов в дереве XML и сопоставляет каждый элемент со строкой.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Принимает multipart form data с файлом XML. Поле настроек не требуется.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Повторяющийся элемент автоматически определяется по структуре XML.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Примечания {#notes}

- В качестве ввода принимаются только файлы `.xml`.
- Инструмент сканирует дерево XML в поисках первого повторяющегося набора соседних элементов и использует их в качестве строк.
- Каждое уникальное имя дочернего элемента или атрибута становится заголовком столбца CSV.
- Это одностороннее преобразование. Для двустороннего преобразования JSON/XML используйте инструмент [JSON в XML](/ru/tools/files/json-xml).

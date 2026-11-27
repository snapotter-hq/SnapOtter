---
description: "PDF のすべてのページを A4、Letter、4x6 in の配送ラベル、またはカスタムサイズにリサイズします。"
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 36b1e710f96d
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

PDF のすべてのページのページサイズを変更します。内容は新しいページに収まるように拡大縮小されて中央に配置されるため、テキスト、ベクターアート、バーコードは鮮明なままです。配送ラベルをサーマルプリンター用の 4x6 in のページにしたい場合や、A4 と US Letter の間で文書を移したい場合に使用してください。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

PDF ファイルと JSON `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | 目標サイズ: `4x6in`、`100x150mm`、`a4`、`a5`、`a6`、`letter`、`legal`、または `custom` |
| width | number | No | `4` | カスタムのページ幅。`pageSize` が `custom` のときに使用されます |
| height | number | No | `6` | カスタムのページ高さ。`pageSize` が `custom` のときに使用されます |
| unit | string | No | `"in"` | カスタムサイズの単位: `in` または `mm` |
| keepOrientation | boolean | No | `false` | 幅と高さを固定せず、各ページの向きに合わせて目標サイズを回転します |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- ページは収まるように拡大縮小され、引き伸ばされることはありません。縦横比が異なる場合、余った部分は空白のままになります。
- リサイズでは切り抜きは行われません。Letter や A4 のページの4分の1に印刷されたラベルは、新しいページでも4分の1しか占めません。
- カスタムサイズは、各辺が 0.5〜200 in(12.7〜5080 mm)である必要があります。
- ページにクロップボックスがある場合は、それを基準にリサイズされるため、切り抜かれたページでは切り抜かれた領域だけが残ります。

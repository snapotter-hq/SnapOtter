---
description: "位置、不透明度、回転、タイリングを設定できるテキストウォーターマークを追加します。"
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 472dcfef6f9f
---

# Text Watermark {#text-watermark}

画像にテキストウォーターマークのオーバーレイを追加します。角/中央への単一配置、または画像全体へのタイル状の繰り返しに対応し、フォントサイズ、色、不透明度、回転を設定できます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

画像ファイルとJSON形式の`settings`フィールドを含むmultipartフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | ウォーターマークのテキスト（1〜500文字） |
| fontSize | number | No | `48` | フォントサイズ（ピクセル、8〜1000） |
| color | string | No | `"#000000"` | テキストの色（16進形式、`#RRGGBB`） |
| opacity | number | No | `50` | テキストの不透明度の割合（0〜100） |
| position | string | No | `"center"` | 配置: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | No | `0` | テキストの回転角度（度、-360〜360） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

画像全体へのタイル状ウォーターマーク:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- ウォーターマークはSVGテキストとしてレンダリングされ画像に合成されるため、出力品質が保たれます。
- タイルモードは、フォントサイズに基づいてテキスト要素の間隔を決めます（水平6倍、垂直4倍の間隔）。最大500要素に制限されます。
- 角の位置では、縁からの余白はフォントサイズと同じになります。
- 使用されるフォントはシステムのデフォルトのsans-serifフォントです。
- テキスト内のXML特殊文字（`&`, `<`, `>`, `"`, `'`）は安全にエスケープされます。
- 出力フォーマットは入力フォーマットに一致します。HEIC、RAW、PSD、SVGの入力は処理前に自動的にデコードされます。

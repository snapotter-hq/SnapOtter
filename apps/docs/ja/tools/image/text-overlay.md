---
description: "ドロップシャドウと背景ボックスを備えたスタイル付きテキストオーバーレイを追加します。"
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 3a2c40ceb577
---

# Text Overlay {#text-overlay}

画像に、オプションのドロップシャドウと半透明の背景ボックスを備えたスタイル付きテキストを追加します。写真のタイトル、キャプション、注釈に適しています。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

画像ファイルとJSON形式の`settings`フィールドを含むmultipartフォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | オーバーレイするテキスト（1〜500文字） |
| fontSize | number | No | `48` | フォントサイズ（ピクセル、8〜200） |
| color | string | No | `"#FFFFFF"` | テキストの色（16進形式、`#RRGGBB`） |
| position | string | No | `"bottom"` | 垂直方向の配置: `top`, `center`, `bottom` |
| backgroundBox | boolean | No | `false` | テキストの背後に半透明の背景矩形を表示します |
| backgroundColor | string | No | `"#000000"` | 背景ボックスの色（16進形式、`#RRGGBB`） |
| shadow | boolean | No | `true` | テキストの背後にドロップシャドウを適用します |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

背景ボックス付き:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- テキストは常に画像内で水平方向に中央揃えされます。
- ドロップシャドウは、2pxのオフセットと3pxのぼかしを、70%の黒の不透明度で使用します。
- 背景ボックスは画像の全幅にわたり不透明度70%で表示され、高さはフォントサイズに比例します（1.8倍）。
- テキストはSVGコンポジットでレンダリングされるため、システムのデフォルトのsans-serifフォントが使用されます。
- テキスト内のXML特殊文字は安全にエスケープされます。
- 出力フォーマットは入力フォーマットに一致します。HEIC、RAW、PSD、SVGの入力は処理前に自動的にデコードされます。

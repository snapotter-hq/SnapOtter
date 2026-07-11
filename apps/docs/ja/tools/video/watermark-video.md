---
description: "動画のフレームにテキストの透かしを焼き込みます。"
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: 86d023861820
---

# Watermark Video {#watermark-video}

位置、サイズ、不透明度、色を設定できるテキストの透かしを、動画のすべてのフレームに焼き込みます。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

動画ファイルと JSON の `settings` フィールドを含む multipart フォームデータを受け付けます。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | 透かしのテキスト（1-200 文字） |
| position | string | No | `"br"` | フレーム上の位置: `tl`、`tc`、`tr`、`l`、`c`、`r`、`bl`、`bc`、`br` |
| fontSize | integer | No | `36` | フォントサイズ（ピクセル単位、8-120） |
| opacity | number | No | `0.5` | 透かしの不透明度（0.05-1） |
| color | string | No | `"#ffffff"` | テキストの16進数カラー（例: `"#ffffff"`） |

### Position Values {#position-values}

- **tl** - 左上、**tc** - 上中央、**tr** - 右上
- **l** - 中央左、**c** - 中央、**r** - 中央右
- **bl** - 左下、**bc** - 下中央、**br** - 右下

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- 透かしは動画のフレームに恒久的にレンダリングされ、処理後に削除することはできません。
- 透かしには FFmpeg に組み込まれたサンセリフフォントを使用します。
- 画像の透かしには、代わりに画像の Watermark ツールを使用してください。

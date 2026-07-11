---
description: "加上純色橫條以符合目標長寬比。"
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: 6e6951cb1cc8
---

# 長寬比填充 {#aspect-pad}

加上純色的上下黑邊或左右黑邊，讓影片在不裁切的情況下符合目標長寬比。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

接受包含影片檔案與 JSON `settings` 欄位的 multipart 表單資料。

## 參數 {#parameters}

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|-----------|------|----------|---------|-------------|
| target | string | 否 | `"9:16"` | 目標長寬比：`16:9`、`9:16`、`1:1`、`4:3`、`3:4` |
| color | string | 否 | `"#000000"` | 填充橫條的十六進位色碼（例如 `"#000000"` 代表黑色） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## 注意事項 {#notes}

- 若影片已符合目標長寬比，則會原封不動地回傳檔案。
- 對於垂直/直向的社群媒體格式（TikTok、Reels、Shorts），請使用 `9:16`。
- 若想使用模糊填充而非純色，請使用「模糊填充」工具。

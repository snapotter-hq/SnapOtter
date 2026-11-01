---
description: "SnapOtter कौन सा अनाम usage data एकत्र करता है, इसे कब भेजा जाता है, और instance-wide product analytics को कैसे बंद करें।"
i18n_source_hash: 875ed3efcabd
i18n_provenance: human
i18n_output_hash: cf0c51fe9a2f
---

# What SnapOtter collects {#what-snapotter-collects}

Anonymous Product Analytics default रूप से चालू है और एक administrator द्वारा पूरे instance के लिए सेट किया जाता है। इसे Settings > System > Privacy के तहत बंद करें।

## Events we send (when enabled) {#events-we-send-when-enabled}

- tool_used: tool id, status, duration, category, यह एक AI tool है या नहीं, विफलता पर एक error code।
- pipeline_executed: step count, tool ids, batch flag, file count, duration, status।
- ai_bundle_action: bundle id, action, duration।
- Frontend usage: कौन से tool pages खुलते हैं, जोड़ी गई files (केवल counts), tool शुरू हुआ, downloads, saves, search (केवल result count), batch processed।
- Crash reports: error type और केवल file basenames के साथ एक source stack।

## What we never collect {#what-we-never-collect}

- File names या paths
- File contents
- OCR output text
- Image metadata (EXIF)
- Extracted document text
- आपका IP address या account identity

## अपडेट सूचनाएँ {#update-notices}

जब तक एनालिटिक्स चालू है, सर्वर हर कुछ घंटों में इंस्टेंस की अनाम आईडी और उसके संस्करण के साथ PostHog से पूछता है कि SnapOtter का सबसे नया रिलीज़ कौन-सा है। नया रिलीज़ उपलब्ध होने पर एडमिन को रिलीज़ नोट्स के लिंक के साथ एक सूचना दिखती है। इसे बंद करने पर यह अगले रिलीज़ तक छिपी रहती है। आपकी ओर से कुछ भी इंस्टॉल या डाउनलोड नहीं किया जाता, और एनालिटिक्स बंद होने पर सर्वर कभी नहीं पूछता।

## Turning it off {#turning-it-off}

Admins: Settings > System > Privacy, "Anonymous Product Analytics" को बंद कर दें। यह तुरंत रुक जाता है, instance-wide। एक ऐसी image बनाने के लिए जो कभी emit न कर सके, `SNAPOTTER_ANALYTICS=off` build arg सेट करें।

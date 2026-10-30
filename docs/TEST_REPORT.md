# 实测报告

验收日期：2026-10-30（中国标准时间）。

## 求解器与后端

`npm test`：40 / 40 通过。覆盖：串联、并联、陌生混联、桥式、多电源、功率守恒、开关、滑动变阻器、浮置电压表、理想短路、缺值不造数、几何交叉与真实节点区别、参数扫描逐点真值、CSV、语音转写后的统一命令路径、Agent 结构化操作、CORS、请求大小、持久原子限额和去敏错误。

`npx tsc -p worker/tsconfig.json`：通过。

`npm run build`：通过。生产 JavaScript 约 113 KB gzip；CSS 约 8 KB gzip。`npm audit`：0 漏洞。

## 真实 AI 验收（与模拟测试分开）

`npm run test:live` 调用已部署 Worker，Worker 使用新的 AI Circuit Secret 和 `deepseek-flash`。使用真实 `image_url` base64 PNG 输入，不是将图片当文本。每一张原图及最终解析对象均保存在仓库。

| 原图 / 输入 | 预期总电流 | 实际 MNA 结果 | HTTP | 实测用时 |
| --- | --- | --- | --- | --- |
| `public/examples/series.png`，10V、4Ω+6Ω | 1 A | 0.9999999999999999 A | 200 | 42.747 秒 |
| `public/examples/parallel.png`，12V、6Ω//3Ω | 6 A | 6 A | 200 | 13.611 秒 |
| `public/examples/mixed.png`，12V、2Ω+(6Ω//3Ω) | 3 A | 3 A | 200 | 23.015 秒 |
| 真实文字：10V、4Ω+6Ω，串接电流表 | 1 A | 0.9999999999999999 A | 200 | 9.653 秒 |
| Agent：在 R1 后新增6Ω，保留仪表 | 0.625 A | 0.625 A | 200 | 2.331 秒 |

最终 5 / 5 通过，见 `docs/evidence/live-report.json`。每个 `*-recognition.json` 包含原图路径、AI 解析节点/元件、提供者/模型、实际求解结果；`agent-modification.json` 包含真实 Agent 回复、编译后的电路及真实读数。原图均由本项目的 `scripts/create-fixtures.py` 原创绘制。

前两轮实际失败同样保留在 `first-pass/` 与 `second-pass/`，没有用模拟结果覆盖失败：关闭推理时出现遗漏回线、短接电阻、电源类型错误，之后增加明确端子契约、真实可解性复核、启用有上限推理，并将 Agent 修改改为确定性操作编译。最终成功不保证其他图片准确，UI 对不确定识别要求复核。

## 浏览器

Playwright 对 1440px 桌面与 390px 手机运行相同 10 类测试：初始数值、参数修改、撤销重做、并联示例、开关、CSV、图片预览及按实际图数据搭建、缺值、不确定识别、超时恢复、超限上传、接线确认、曲线与表格、无水平溢出。

最终桌面/手机 20 / 20 通过（46.8 秒）。这些可重复 UI 测试中，识别错误态与缺值场景使用明确的模拟服务；不能作为真实识别证据。真实 AI 验收见上一节。截图位于 `docs/screenshots/`。

语音：验证转写文本进入同一命令函数；没有声称自动测试完成真人麦克风转写。浏览器不支持或用户未授权时提供可理解提示和文字输入。

## 公开发布验证

2026-10-30 20:41 CST，在真正的 `https://simonxz578.github.io/AI-Circuit-Experiment/` 上完成 Playwright 公网验收，2 / 2 通过：

- 桌面 1440×1000：真实文字生成（17.307秒）、混联图片识别（43.899秒）、AI 新增串联电阻（1.665秒），均 HTTP 200、提供者模型 `deepseek-flash`；确认前保留原读数，确认后 0.625A，再将电压改为20V得到1.25A。
- 手机 390×844：公开页面、服务连接、参数、真实本地求解和曲线均通过，无水平溢出。手机不重复付费 AI 请求；真实 AI 流程在公开桌面浏览器中完成。
- 导航至首屏可用约桌面4.089秒、手机4.374秒；参数修改至读数更新约桌面11ms、手机49ms。这是当前设备与网络下的一次测量，不是通用性能保证。
- JS / CSS 均 HTTP 200；公开脚本不含凭据格式；真实 CORS 预检204，允许来源精确为 `https://simonxz578.github.io`；脚本错误与站内失败资源均为0。
- GitHub Actions 验证/构建/Pages 发布成功，仓库为 public，HTTPS 开启。正式页面已在应用旁边打开。

证据：`public-desktop.json`、`public-mobile.json`，及 `docs/screenshots/public-desktop.png`、`public-mobile.png`。

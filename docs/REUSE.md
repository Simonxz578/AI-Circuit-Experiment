# 来源、复用与许可

## Ninefold

来源：用户自有的私有仓库 `Simonxz578/Ninefold`，本地 `Ninefold-Unified-V5` 的 `codex/ninefold-prism-experiment` 分支，提交 `1be7d9156a61d8f0561cf245f9317f136a9223f2`。

实际检查了本地分支、远端分支清单和 `origin/main`。实验模块存在于前述分支，main 不含该目录；没有从 README 假设模块存在。

| 源文件 | 本项目复用方式 |
| --- | --- |
| `src/experiments/experimentPlot.ts` | 复用 `plotScale` 的 1/2/5/10 刻度算法；参数扫描改为逐点求解通用电路拓扑 |
| `src/experiments/LabApparatus.tsx` | 改造电阻带纹、仪表面板、端子与 SVG 元件几何；重写为节点数据驱动渲染 |
| `src/experiments/laboratoryModels.ts` | 审查固定串并联公式，用作独立数值基准；未将固定模板当通用求解器 |
| `src/unified/ChatDictation.tsx` | 参考“转写先成为草稿，用户确认后发送”的交互原则；本站实现独立 Web Speech 适配，无旧 ASR 密钥或 Worker 依赖 |
| `worker/src/inference.ts` | 审查超时、结果核验与错误去敏思路；新 Worker 独立实现持久限流与 DeepSeek 代理 |

仅复制必要的自有代码与派生几何，没有复制整站、课程数据、人物、天空、私有学习内容或配置。蓝色按用户提供的 Ninefold 蓝色截图用 CSS 重建，无背景图片。原 Ninefold 源码未修改、未推送、未重新部署。

## emotional-skill

来源：https://github.com/Simonxz578/emotional-skill ，提交 `1e443b36faf3847186e6c71f3e744d6525765c21`。

实际读取了 `SKILL.md`、`references/reasoning-framework.md`、`references/evidence-model.md`、`references/response-style.md`、`scripts/validate_skill.py`、`scripts/validate_privacy.py`、`tests/test_reasoning_contract.md` 与 MIT 许可。

迁移原则：观察与推断分离、对不确定性作明确说明、最新证据更新判断、普通解释优先、不从一次错误推断学生心理或能力、先给适量提示而非嘲讽。没有移植关系分析、私人档案或案例。结构/隐私验证机制用于发布审查思路；未声称该仓库本身的完整结构验证能证明教学质量。

本站助教提示位于 `worker/src/prompts.ts`；真实 Agent 修改由 `docs/evidence/agent-modification.json` 记录，未用 mock 冒充真实问答。

MIT License

Copyright (c) 2026 Emotional Skill contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## 其他

React / Vite / TypeScript / Zod / Vitest：MIT；Lucide：ISC；Playwright：Apache-2.0；Wrangler：MIT/Apache-2.0（以依赖各自 LICENSE 为准）。DM Sans 与 Noto Sans SC 由 Google Fonts 提供，使用 SIL Open Font License；系统字体作为回退。黑白机器人 SVG 与三张电路 PNG 由本项目原创绘制。没有引入 CircuitJS1 代码、外部 iframe 或其许可负担。

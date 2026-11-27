# ChromAI · 智能色谱方法平台

> 集色谱模拟、AI 方法设计、文献检索、化合物查询与界面检测于一体的色谱方法开发工作台。

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Runtime Dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)](https://github.com/piaopiaohu003/AI-Chromatography-Prediction)
[![Tests](https://img.shields.io/badge/tests-32%20passing-brightgreen)](https://github.com/piaopiaohu003/AI-Chromatography-Prediction)

ChromAI 以原有 Flask 应用的接口契约与科学模型为基础，重写为零依赖的 Node.js 20 单体应用，并合并了 ION 工作台的 ChemicalBook 参考检索与模拟界面检测能力。服务端同时提供 `/api/*` 接口与前端静态资源，部署只需一个进程。

平台源码位于 [`chromai/platform`](chromai/platform)，更细粒度的实现说明见 [chromai/platform/README.md](chromai/platform/README.md)。

---

## 目录

- [在线演示](#在线演示)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [核心逻辑](#核心逻辑)
- [API 一览](#api-一览)
- [配置项](#配置项)
- [测试](#测试)
- [部署](#部署)
- [已知限制](#已知限制)

---

## 在线演示

| 项目 | 值 |
|-|-|
| 访问地址 | https://37m1k101rxo54tm3drm.traesite.cn |
| 演示账号 | `demo` |
| 演示密码 | `ChromAI2026` |

演示账号可通过环境变量 `CHROM_DEMO_USER` / `CHROM_DEMO_PASS` 覆盖，生产部署前请务必修改默认凭据。

---

## 功能特性

前端为单页应用，五个视图共用同一套状态：

| 视图 | 用途 | 依赖接口 |
|-|-|-|
| 色谱模拟 | 编辑样品组分与方法条件，计算保留时间、分离度、柱压并绘制色谱图；可录入实测峰数据并与模拟结果对比 | `POST /api/simulate`、`POST /api/compare` |
| AI 条件设计 | 先按组分与约束检索文献，再结合化学性质与分离原理生成 pH、有机相、色谱柱、流速、波长与梯度程序，附文献依据、设计依据与风险提示 | `POST /api/recommend` |
| 文献参考 | 检索 Europe PMC / Crossref / OpenAlex，可限定分析化学顶级期刊；支持按主题建立监控并扫描新文献 | `/api/literature/*` |
| 化合物检索 | ChemicalBook 四级展示：数据源状态 → 匹配列表 → 化合物档案 → 性质与摘要 | `GET /api/compounds/search` |
| 界面检测 | 模拟识别仪器界面模块，六项方法参数联合校验，可选上传截图 | `POST /api/interface/detect` |

视图之间相互打通：

- 模拟页“样品与目标”的添加弹窗并行查询 PubChem 与 ChemicalBook，结果标注来源并可直接多选加入样品。
- 化合物检索详情可“加入样品与目标”，弹窗也可跳转到完整检索页并带入关键词。
- 界面检测的六项参数可一键同步回模拟台。

---

## 技术栈

- **运行时**：Node.js `>=20`（建议 20.18.x），无任何 npm 运行时依赖。
- **HTTP**：Node 原生 `http`，自行实现路由、JSON 解析、Cookie、静态文件与路径穿越防护。
- **存储**：同一套 JSON 文档模型，支持本地文件或 Redis（内置精简 RESP2 客户端）。
- **账户安全**：`crypto.scryptSync` + 每用户随机盐 + `timingSafeEqual` 校验。
- **前端**：原生 ES Module 脚本与 CSS，无构建步骤；色谱图由自研 Canvas 渲染器绘制。
- **部署**：`build.sh` 生成 `dist/`，`run.sh` 直接执行 `node server.js`。

---

## 系统架构

```
浏览器 SPA (index.html + app.js + chart.js)
        │  fetch /api/*（same-origin Cookie）
        ▼
Node HTTP 服务 (server.js)
        │
        ├── 鉴权层 auth.js ──────────────► store.js ──► JSON 文件 / Redis
        ├── 领域层 lib/*
        │      ├── simulation ──► recommend / identify / detector
        │      ├── chemicalbook ──► www.chemicalbook.com
        │      ├── pubchem     ──► PubChem PUG REST
        │      ├── literature  ──► Europe PMC / Crossref / OpenAlex（顶刊库）
        │      └── ai-client   ──► OpenAI 兼容推理服务（可选）
        └── 静态层 public/（/ 与 /static/*）
```

设计原则：

1. **单一进程**：API 与前端同域，避免跨域与 Cookie 问题，部署只需要一个 Node 服务。
2. **零依赖**：所有能力用标准库实现，部署侧无需安装依赖，冷启动快。
3. **模型与路由分离**：`lib/*` 不感知 HTTP，便于单元测试与复用。
4. **失败可解释**：上游异常转换为明确的状态码与错误码，不吞错、不伪造数据。

---

## 快速开始

环境要求：Node.js `>=20`。仓库不依赖 npm 运行时包，无需 `npm install`。

```bash
cd chromai/platform
npm start                 # 启动服务，默认监听 http://localhost:8000
```

浏览器打开 http://localhost:8000，使用演示账号或自行注册登录。

其他命令：

```bash
npm test                  # 运行 32 项后端测试
npm run build             # 执行 build.sh，生成 dist/
```

如需启用 AI 条件设计或 Redis 存储，可先导出环境变量再启动：

```bash
export CHROM_AI_BASE_URL="https://api.moonshot.cn/v1"
export CHROM_AI_MODEL="kimi-k3"
export CHROM_AI_API_KEY="sk-..."
export REDIS_URL="redis://127.0.0.1:6379"
npm start
```

未配置模型密钥时，AI 条件设计会自动回退到内置规则专家系统，功能仍可用。

---

## 项目结构

```
AI-Chromatography-Prediction/
├── chromai/platform/          # ChromAI 智能色谱方法平台（本文档主体）
│   ├── server.js              # HTTP 入口：路由、鉴权、静态资源、错误映射
│   ├── lib/                   # 领域模块（不感知 HTTP）
│   │   ├── models.js          # 请求体归一化与参数校验
│   │   ├── simulation.js      # 色谱物理模型
│   │   ├── recommend.js       # 规则专家系统 + 可选 LLM 方法设计
│   │   ├── compare.js         # 模拟与实测偏差、一致性与评级
│   │   ├── identify.js        # 未知峰最优指派
│   │   ├── compounds.js       # 内置化合物与分类
│   │   ├── pubchem.js         # PubChem 在线检索与性质估算
│   │   ├── chemicalbook.js    # ChemicalBook 检索页/详情页解析
│   │   ├── detector.js        # 界面检测
│   │   ├── literature.js      # 三大文献源合并检索与主题扫描
│   │   ├── ai-client.js       # OpenAI 兼容接口封装
│   │   ├── auth.js            # 注册/登录/会话/偏好/收藏/密码重置
│   │   ├── store.js           # FileStore / RedisStore
│   │   ├── mailer.js          # SMTP 发信
│   │   └── util.js            # 数值工具
│   ├── public/                # 单页前端（index.html + app.js + chart.js）
│   ├── tests/merged.test.js   # 32 项后端测试
│   ├── build.sh               # 生成 dist/
│   ├── run.sh                 # exec node server.js
│   └── package.json
├── frontend/                  # ION 色谱预测工作台前端（Vite）
├── server.js                  # ION 工作台 API 服务
└── tests/                     # 工作台接口测试
```

---

## 核心逻辑

**色谱模拟（simulation.js）** 对每个组分依次计算 LSS 保留、pH 电离修正、van 't Hoff 温度校正、Knox 型塔板高度、梯度洗脱积分、EMG 峰形与检测器响应，输出曲线、峰表与指标；数值采用 Python 风格 `round`（ties-to-even），保证与原始实现一致、可重复。

**方法设计（recommend.js）** 归一化组分与约束后，遍历 pH 候选评估保留与选择性，选择色谱柱、流速、温度、波长，生成等度或梯度程序，并用模拟器逐候选复核，最终选出最优方案。启用 LLM 时，先检索文献、再结合化学性质与分离原理设计方案；`references` 只保留检索结果中真实存在的编号，无法编造文献。LLM 失败或超时会自动回退规则方案并写入 `llm_error`。

**实测对比（compare.js）** 按组分名称匹配模拟峰与实测峰，逐峰输出 `ΔtR`、`%RE`、`k`、`ΔRs`、塔板数与通过状态，汇总 `bias`、`MAE`、`RMSE`、`MAPE`、Bland-Altman 界限、覆盖率与顺序一致率，并给出 A/B/C 评级。

**界面检测（detector.js）** 校验六项方法参数的必填、类型与范围，校验图片文件头签名（不落盘），输出模拟识别的模块、置信度与参数；`simulate` 模式额外返回曲线与峰表。

**外部数据源** ChemicalBook 解析检索页与详情页，20 s 超时、128 条内存缓存，命中人机验证即返回 `502 upstream_unavailable`，绝不伪装成“无匹配”；PubChem 在线结果失败只写 `online_error`，不影响本地库。文献模块并行查询 Europe PMC、Crossref 与 OpenAlex，合并去重，并内置分析化学顶级期刊 ISSN 库。

---

## API 一览

| 方法 | 路径 | 鉴权 | 说明 |
|-|-|-|-|
| GET | `/api/health` | 否 | 健康检查 |
| POST | `/api/auth/register` / `login` | 否 | 注册 / 登录，成功写入会话 Cookie |
| POST | `/api/auth/logout` | 是 | 注销 |
| GET | `/api/auth/me` | 是 | 当前用户 |
| POST | `/api/auth/password-reset/request` / `confirm` | 否 | 重置码申请 / 确认 |
| GET/PUT | `/api/account` / `preferences` | 是 | 账户与偏好 |
| POST | `/api/account/password` | 是 | 修改密码 |
| POST/DELETE | `/api/account/favorites[/:id]` | 是 | 收藏增删 |
| GET | `/api/compounds` | 否 | 内置化合物与分类 |
| GET | `/api/compounds/search` | 否 | 本地 + PubChem；`source=chemicalbook` 切换参考库 |
| GET | `/api/literature/search` | 否 | 文献检索 |
| GET/POST/DELETE | `/api/literature/watch[/:id]` | 是 | 监控主题管理 |
| GET/POST | `/api/literature/watch/:id/items` / `scan` | 是 | 已见条目 / 扫描新增 |
| GET/POST | `/api/ai/status` | 是 | 查看/保存模型配置 |
| POST | `/api/ai/test` | 是 | 连通性测试 |
| POST | `/api/simulate` | 是 | 色谱模拟 |
| POST | `/api/compare` | 是 | 模拟结果与实测峰对比、偏差统计与评级 |
| POST | `/api/recommend` | 是 | 方法设计 |
| POST | `/api/identify` | 是 | 未知峰识别 |
| POST | `/api/interface/detect` | 否 | 模拟界面检测 |

错误统一为 `{ "error": { "code", "message", "fields?" } }`；旧接口仍兼容 `{ "detail": "..." }` 形式。`GET /api/literature/search` 额外支持 `journals=1`，用于叠加分析化学顶级期刊库。

---

## 配置项

| 变量 | 默认值 | 作用 |
|-|-|-|
| `PORT` | `8000` | 监听端口（固定绑定 `0.0.0.0`） |
| `CHROM_USER_DB` | `/tmp/chromai-users.json` | 文件后端路径 |
| `REDIS_URL` / `REDIS_HOST` | 未设置 | 设置且可 PING 时启用 Redis 后端 |
| `CHROM_REDIS_KEY_PREFIX` | `chromai` | Redis 键前缀 |
| `CHROM_DEMO_USER` / `CHROM_DEMO_PASS` | `demo` / `ChromAI2026` | 演示账号 |
| `CHROM_AI_BASE_URL` / `OPENAI_BASE_URL` | 未设置 | OpenAI 兼容接口地址 |
| `CHROM_AI_MODEL` / `OPENAI_MODEL` | 未设置 | 模型名 |
| `CHROM_AI_API_KEY` / `OPENAI_API_KEY` | 未设置 | 模型密钥；缺失时仅用规则引擎 |
| `CHROM_AI_TIMEOUT_MS` | `40000` | 调用大模型的等待上限，超时回退规则方案 |
| `CHROM_SMTP_URL` / `CHROM_MAIL_FROM` | 未设置 | 密码重置邮件；未配置时重置码不可投递 |

---

## 测试

```bash
cd chromai/platform
npm test
```

32 项测试覆盖关键不变量，包括 ChemicalBook 字段解析与空结果、模拟结果确定性与参数敏感性、界面检测的参数校验与图片签名、检测器响应差异、实测对比的评级与偏差识别、文献排序与引用白名单、AI 失败降级等。

---

## 部署

```bash
cd chromai/platform
npm run build             # 生成 dist/
./dist/run.sh             # 前台运行，默认端口 8000
```

构建产物：

```
dist/
├── server.js
├── lib/
├── public/
├── package.json
└── run.sh                # exec node server.js
```

部署契约：

- 构建：`nodejs20` + `build.sh`，产物目录 `dist`
- 运行：`nodejs20` + `dist/run.sh`，端口 `8000`
- 健康检查：`GET /api/health` → `{"status":"ok"}`

注意事项：

- 云端运行目录的临时文件会随实例回收而丢失；需要持久账户数据时配置 Redis。
- 服务本身无状态（除存储与内存缓存），可水平扩容，但文件后端不跨实例共享。

---

## 已知限制

- ChemicalBook 连续请求后可能触发人机验证，此时返回 502 并提示重试，不会伪装成“无匹配”。
- ChemicalBook 不提供 logP/pKa/λmax，加入样品时使用中性、logP 2.5、λ 254 nm 的估算值并明确标注。
- PubChem 不可用时在线结果降级为空，本地库与已添加组分不受影响。
- 方法设计在无模型密钥时完全依赖规则引擎，结果可复现但不具备大模型的开放性推理。
- 未知峰识别仅提供 API，尚无前端入口。
- 模拟与界面检测均为教学/方法开发用途的仿真，不替代实测。
- 实测对比需人工录入峰数据，尚不支持直接读取仪器原始数据文件。

---

本仓库以 ChromAI 原有科学模型与接口为基础，在保持行为一致的前提下完成了 Node.js 重写与 ION 能力合并。后续修改应优先补充测试，再更新本文件中的契约说明。

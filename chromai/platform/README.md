# ChromAI 智能色谱方法平台

以 ChromAI 原有 Flask 应用的接口契约与科学模型为基础重写的 **零依赖 Node.js 20 单体应用**，并合并了 ION 工作台的 ChemicalBook 参考检索与模拟界面检测能力。

- 在线地址：https://37m1k101rxo54tm3drm.traesite.cn
- 演示账号：`demo` / `ChromAI2026`（可由环境变量覆盖）
- 运行形态：单进程 HTTP 服务，同时提供 `/api/*` 与前端静态资源

---

## 1. 功能概览

前端为单页应用，顶部五个视图共用同一套状态：

| 视图 | 用途 | 依赖接口 |
|-|-|-|
| 色谱模拟 | 编辑样品组分与方法条件，计算保留时间、分离度、柱压并绘制色谱图 | `POST /api/simulate` |
| AI 条件设计 | 先按组分与约束检索文献，再结合化学性质与分离原理生成 pH、有机相、色谱柱、流速、波长与梯度程序，附文献依据、设计依据与风险 | `POST /api/recommend` |
| 文献参考 | 检索 Europe PMC / Crossref，按主题建立监控并扫描新文献 | `/api/literature/*` |
| 化合物检索 | ChemicalBook 四级展示：数据源状态 → 匹配列表 → 化合物档案 → 性质与摘要 | `GET /api/compounds/search` |
| 界面检测 | 模拟识别仪器界面模块，六项方法参数联合校验，可选上传截图 | `POST /api/interface/detect` |

视图之间是打通的：

- 模拟页“样品与目标”的添加弹窗并行查询 PubChem 与 ChemicalBook，结果标注来源并可直接多选加入样品。
- 化合物检索详情可“加入样品与目标”；弹窗也可跳转到完整检索页并带入关键词。
- 界面检测的六项参数可一键同步回模拟台。

---

## 2. 技术栈

- **运行时**：Node.js `>=20`（部署环境使用 `nodejs20`），无任何 npm 运行时依赖。
- **HTTP**：Node 原生 `http`，自行实现路由、JSON 解析、Cookie、静态文件与路径穿越防护。
- **存储**：同一套 JSON 文档模型，支持本地文件或 Redis（内置精简 RESP2 客户端）。
- **账户安全**：`crypto.scryptSync` + 每用户随机盐 + `timingSafeEqual` 校验。
- **前端**：原生 ES Module 脚本与 CSS，无构建步骤；色谱图由自研 Canvas 渲染器绘制。
- **部署**：`build.sh` 生成 `dist/`，`run.sh` 直接执行 `node server.js`。

---

## 3. 目录结构

```
chromai/platform/
├── server.js              # HTTP 入口：路由、鉴权、静态资源、错误映射
├── lib/
│   ├── models.js          # 请求体归一化与参数校验（抛 ValidationError）
│   ├── simulation.js      # 反相/正相保留时间与色谱图物理模型
│   ├── recommend.js       # 规则专家系统 + 可选 LLM 方法设计
│   ├── identify.js        # 未知峰与候选组分的最优指派
│   ├── compounds.js       # 29 种内置化合物与分类
│   ├── pubchem.js         # PubChem 在线检索与性质估算
│   ├── chemicalbook.js    # ChemicalBook 检索页/详情页抓取与解析
│   ├── detector.js        # 界面检测：六参数校验、图片签名、模拟识别
│   ├── literature.js      # Europe PMC + Crossref 检索与主题扫描
│   ├── ai-client.js       # OpenAI 兼容接口封装、JSON 提取、连通性测试
│   ├── auth.js            # 注册/登录/会话/偏好/收藏/文献主题/密码重置
│   ├── store.js           # FileStore / RedisStore 二选一
│   ├── mailer.js          # SMTP 发信（密码重置）
│   └── util.js            # clamp、Python 风格 round、插值、EMG 等数值工具
├── public/
│   ├── index.html         # 五个视图、弹窗与登录门
│   └── static/
│       ├── css/style.css  # 深色青绿主题
│       └── js/
│           ├── app.js     # 状态、视图、请求、鉴权与全部交互
│           └── chart.js   # Canvas 色谱图渲染
├── tests/merged.test.js   # 10 项后端测试
├── build.sh               # 生成 dist/
├── run.sh                 # exec node server.js
└── package.json
```

---

## 4. 总体架构

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
        │      ├── literature  ──► Europe PMC / Crossref
        │      └── ai-client   ──► OpenAI 兼容推理服务（可选）
        └── 静态层 public/（/ 与 /static/*）
```

设计原则：

1. **单一进程**：API 与前端同域，避免跨域与 Cookie 问题，部署只需要一个 Node 服务。
2. **零依赖**：所有能力用标准库实现，部署侧不需要安装依赖，冷启动快。
3. **模型与路由分离**：`lib/*` 不感知 HTTP，便于单元测试与复用。
4. **失败可解释**：上游异常转换为明确的状态码与错误码，不吞错、不伪造数据。

---

## 5. 请求生命周期（server.js）

1. 解析 URL 并对 pathname 做 `decodeURIComponent`，失败返回 400。
2. 以 `/api/` 开头的请求进入 `handleApi`，其余只允许 `GET/HEAD`。
3. 读取请求体：默认上限 **20 MB**，超限抛 `ValidationError`；除图片以 base64 内嵌外均为 JSON。
4. 受保护接口先校验会话 Cookie：`/api/account/*`、`/api/simulate`、`/api/recommend`、`/api/identify`、`/api/ai/*`、文献监控等；未登录返回 401。
5. 业务处理：先用 `models.*` 归一化并校验，再调用领域模块；校验错误返回 400 与字段级 `fields`。
6. 错误映射：
   - `ValidationError` → 400（携带 `error.code=validation_error` 与 `fields`）
   - ChemicalBook 上游失败 → 502 `upstream_unavailable`
   - 其他未捕获异常 → 500
7. 非 API 请求：`/` 返回 `index.html`；`/static/*` 先 `path.resolve` 再校验必须位于静态目录内，防路径穿越；找不到返回 404。
8. 启动顺序：等待存储后端探测完成 → 播种演示账号 → 监听 `0.0.0.0:${PORT:-8000}`。

---

## 6. 后端模块职责

| 模块 | 职责 | 关键行为 |
|-|-|-|
| `models.js` | 请求归一化 | 校验组分、条件、约束、观测峰；统一字段名与范围 |
| `simulation.js` | 物理模型 | LSS 保留、电离、温度校正、Knox 塔板、梯度积分、EMG 峰形 |
| `recommend.js` | 方法设计 | 规则引擎生成候选并用同一模拟器复核；LLM 路径先检索文献、再结合化学性质与分离原理设计，引用经白名单校验 |
| `identify.js` | 未知峰识别 | 候选池过滤 + 匈牙利算法最优指派，最多 200 候选 |
| `detector.js` | 界面检测 | 六参数必填/范围、五种路由、图片签名、模块置信度 |
| `chemicalbook.js` | 参考检索 | 20 s 超时、128 条内存缓存、人机验证识别、四级解析 |
| `pubchem.js` | 在线检索 | 名称/CAS → 结构字段，缺失的 logP/pKa/λ 采用经验估算 |
| `literature.js` | 文献 | Europe PMC + Crossref 合并去重；支持超时预算；主题监控记录已见 ID |
| `ai-client.js` | 模型调用 | 解析 `chat/completions`、提取 JSON、超时与错误封装 |
| `auth.js` | 账户 | scrypt 密码、7 天会话、偏好、收藏、文献主题、重置码 |
| `store.js` | 持久化 | Redis 可用则用 Redis，否则写本地 JSON（原子替换） |
| `mailer.js` | 邮件 | 密码重置验证码发送，未配置 SMTP 时返回明确状态 |

---

## 7. 核心逻辑

### 7.1 色谱模拟（simulation.js）

对每个组分依次计算：

1. **LSS 保留**：`log10 k = log10 k_w − S·φ`。
2. **电离修正**：按 pH 与 pKa 计算中性分数，缩放有效 `k`。
3. **温度修正**：van 't Hoff 关系校正 `k_w`。
4. **塔板高度**：Knox 型简化 van Deemter，结合扩散系数与流速。
5. **梯度洗脱**：显式积分溶质迁移，计入系统延迟体积；等度模式退化为单点计算。
6. **峰形**：指数修正高斯（EMG），以稳定 erfc 近似实现拖尾。
7. **检测器响应**：UV/DAD 按 Beer-Lambert 吸光系数（狭缝带宽内取平均）；FLD 按激发波长邻近 λmax 估算相对荧光；RID/ELSD/CAD/MS 使用通用质量响应，ELSD 增益影响响应强度。检测器类型与参数写入条件并在结果 `metrics.detector` 中回显，同时输出对应提示（如 RID 梯度漂移、ELSD/CAD 需挥发性缓冲盐）。

输出：

```json
{
  "time": [ ... ],
  "signal": [ ... ],
  "composition": [ ... ],
  "peaks": [ { "tr_min": 0, "component": "...", "...": "..." } ],
  "metrics": { "dead_time": 0, "plate_count": 0, "pressure_bar": 0, "min_resolution": 0 },
  "warnings": [ ... ]
}
```

数值采用 Python 风格 `round`（ties-to-even）与固定精度输出，保证与原始实现一致、可重复。

### 7.2 方法设计（recommend.js）

```
归一化组分/约束
  → 选择相模式（反相/正相）与有机相
  → 遍历 pH 候选（2.5–10.5）评估保留与选择性
  → 选择色谱柱、流速、温度、波长
  → 生成等度或梯度程序
  → 用 simulation 逐候选复核（分离度、峰形、运行时间）
  → 选出最优方案
  → （可选）按“组分英文名 + 检测器 + 相模式”检索 Europe PMC / Crossref
  → LLM 先依据文献结论、再结合化学性质与分离原理给出方案
  → 结构校验 + 引用编号白名单校验 → 再次物理复核
```

- 未配置 API Key 或 LLM 失败时，自动回退到规则引擎并写入 `llm_error`。
- 文献检索与 LLM 串行执行：检索预算 8 s（超时或上游失败立即降级），LLM 预算 40 s，合计低于网关上限；文献失败不阻断条件生成，只记录在 `literature.status/errors`。
- 返回包含 `conditions`、`result`、`method`、`rationale`、`risks`、`references`、`literature`、`expected_order`。
- `references` 只保留检索结果中真实存在的编号；模型输出与 rationale 中出现的 `[n]` 都会经过白名单过滤，无法编造文献。
- 单次最多 20 个组分；AI 覆盖结果必须通过 `coerceAiConditions` 的范围校验。
- 请求默认不发送 `temperature`，兼容仅接受固定温度（如 Moonshot `kimi-k3`）的模型；若调用方显式指定且上游拒绝，会自动去掉该字段重试一次。
- 上游等待上限由 `CHROM_AI_TIMEOUT_MS` 控制（默认 40 s）；超时抛 `大模型响应超时`，由 `recommend` 捕获后返回规则方案并写入 `llm_error`，避免网关 504。

### 7.3 界面检测（detector.js）

- **输入**：`mode`（`simulate`/`analyze`）、`route`（combined/inlet/uv_vis/temperature/column）、`parameters` 六项、可选 `compound`、可选 `image`。
- **校验**：六项参数全部必填，逐项检查数值类型与范围（如流速 0.05–5 mL/min、柱温 4–100 °C），错误返回 `error.fields`。
- **图片**：仅接受 PNG/JPEG/WebP，按文件头签名校验，不落盘。
- **输出**：模拟识别模块与置信度、`recognized_parameters`、界面质量；`simulate` 额外返回色谱曲线与峰表，`analyze` 返回识别结果而不生成曲线。
- 检测结果中的模块名与参数均为**模拟**，界面持续提示“仿真”。

### 7.4 ChemicalBook 与 PubChem

ChemicalBook：

1. 请求检索页 `Search_EN.aspx?keyword=`，解析 `table.mbox` 匹配块（名称、CAS、分子式、分子量、CB 号、详情链接）。
2. 选中记录再抓详情页，解析产品名、CAS、MF、MW、沸点与 “Chemical property” 段落。
3. 20 s 超时、最多 128 条 URL 缓存；命中 `/verify` 或出现人机验证文案即视为上游不可用。
4. 任何上游失败统一映射为 `502 upstream_unavailable`，**绝不**当作“无匹配”返回空列表。

PubChem：

- `/api/compounds/search` 始终返回本地匹配；在线部分失败只写 `online_error`，不影响本地结果。
- 在线记录缺少的 logP/pKa/λ 由经验规则估算，并在前端标注“估算”。

### 7.5 文献（literature.js）

- 并行查询 Europe PMC 与 Crossref，规范化标题、作者、期刊、年份、DOI 并去重。
- `search` 支持 `timeout_ms`（2–12 s），AI 条件设计使用 8 s 预算，确保文献步骤不会挤占 LLM 的网关时间。
- 主题监控按用户保存检索式与已见记录 ID；`scan` 只返回新增条目。
- 上游失败返回 502，不返回伪造记录；AI 条件设计内部检索失败时降级为“仅基于化学性质与分离原理”。

### 7.6 未知峰识别（identify.js）

- 输入观测峰、候选池与方法条件；按容差窗口匹配并计算得分。
- 使用匈牙利算法求全局最优指派，避免贪心错配。
- 当前仅提供接口能力，前端未暴露入口。

---

## 8. API 一览

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
| POST | `/api/recommend` | 是 | 方法设计 |
| POST | `/api/identify` | 是 | 未知峰识别 |
| POST | `/api/interface/detect` | 否 | 模拟界面检测 |

错误统一为 `{ "error": { "code", "message", "fields?" } }`；旧接口仍兼容 `{ "detail": "..." }` 形式。

---

## 9. 前端结构（app.js / chart.js）

- **状态**：`state` 保存组分、条件、视图、账户、文献、AI 配置与检测状态；派生数据按需计算，不做双向绑定。
- **视图控制**：`setTab(view)` 切换 `sim / ai / lit / cb / detect`，各视图懒加载数据（文献、收藏等）。
- **持久化**：
  - `localStorage` 保存方法参数与界面偏好，刷新后恢复。
  - AI Key 仅存 `sessionStorage`，关闭标签页即清除；账户级配置存服务端。
- **登录门**：未登录时显示统一入口，登录成功后按账户偏好与收藏恢复工作区。
- **绘图**：`chart.js` 使用 Canvas 绘制曲线、梯度背景、峰标注与十字准星，无第三方图表库。
- **交互细节**：化合物搜索双数据源并行、失败降级提示、按钮状态去重（已添加/已在样品中）、参数越界内联报错。
- **错误展示**：所有请求失败显示可读原因；ChemicalBook 502 显示“上游暂不可用”而非空结果。

---

## 10. 账户与会话

- 密码：`scrypt(password, salt, 64)`，盐为每用户随机值，比较时 `timingSafeEqual`。
- 会话：Cookie `chromai_session`，`HttpOnly`、`SameSite=Lax`、7 天有效；HTTPS 下附加 `Secure`。
- 存储结构：

```json
{
  "version": 1,
  "users": [ { "id": "...", "username": "...", "salt": "...", "password_hash": "...",
               "preferences": {}, "favorites": [], "literature_watch": [] } ],
  "sessions": { "<token>": { "user_id": "...", "expires_at": 0 } },
  "password_resets": { }
}
```

- 默认文件后端路径 `/tmp/chromai-users.json`，写入采用“临时文件 + rename”保证原子性。
- 配置 Redis 后整体 JSON 作为单键存储（`{prefix}:v1:db`），多实例共享账户数据。
- 启动时若不存在演示账号则自动播种；生产环境请修改默认凭据。

---

## 11. 环境变量

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
| `CHROM_AI_TIMEOUT_MS` | `40000` | 调用大模型的等待上限；超时立即回退规则方案，避免网关 504 |
| `CHROM_SMTP_URL` / `CHROM_MAIL_FROM` | 未设置 | 密码重置邮件；未配置时重置码不可投递 |

---

## 12. 构建与部署

```bash
npm start          # 本地直接运行（默认 8000）
npm test           # 10 项后端测试
npm run build      # 执行 build.sh，生成 dist/
```

`build.sh` 只做确定性打包，不安装依赖：

```
dist/
├── server.js
├── lib/
├── public/
├── package.json
└── run.sh          # exec node server.js
```

部署契约：

- 构建：`nodejs20` + `build.sh`，产物目录 `dist`
- 运行：`nodejs20` + `dist/run.sh`，端口 `8000`
- 健康检查：`GET /api/health` → `{"status":"ok"}`

注意事项：

- 云端运行目录的临时文件会随实例回收而丢失；需要持久账户数据时配置 Redis。
- 服务本身无状态（除存储与内存缓存），可水平扩容，但文件后端不跨实例共享。

---

## 13. 测试覆盖（tests/merged.test.js）

14 项测试覆盖关键不变量：

1. ChemicalBook 检索页字段解析（含缺失字段为 `null`）。
2. 详情页性质映射与摘要提取。
3. 空结果页返回空数组。
4. 模拟结果确定性与输出完整性。
5. 改变流速/柱温后保留时间与历史结果一致。
6. `analyze` 模式不返回曲线且字段独立。
7. 六项参数必填、类型与越界校验。
8. 参数边界值可通过。
9. 非法路由与模式被拒绝。
10. 图片文件头签名校验。
11. 检测器默认值 UV 与非法枚举拒绝。
12. UV 随波长变化而 RID 保持通用响应。
13. 狭缝带宽与 FLD 激发波长会改变响应。
14. 各检测器输出对应提示。

---

## 14. 已知限制

- ChemicalBook 在连续请求后可能触发人机验证，此时返回 502 并提示重试；不会伪装成“无匹配”。
- ChemicalBook 不提供 logP/pKa/λmax，加入样品时使用中性、logP 2.5、λ254 的估算值并明确标注。
- PubChem 不可用时在线结果降级为空，本地库与已添加组分不受影响。
- 方法设计在无模型 Key 时完全依赖规则引擎，结果可复现但不具备大模型的开放性推理。
- 未知峰识别仅提供 API，尚无前端入口。
- 模拟与检测均为教学/方法开发用途的仿真，不替代实测。

---

以 ChromAI 原有科学模型与接口为基础，本仓库在保持行为一致的前提下完成了 Node.js 重写与 ION 能力合并；后续修改应优先补充测试，再更新本文件中的契约说明。

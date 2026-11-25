# ChromAI · 智能色谱方法平台

反相（RPLC）与正相（NPLC）高效液相色谱通用的**正演模拟**与**AI 条件设计**系统：

- **色谱模拟**：给定组分与色谱条件（色谱柱、流动相、流速、pH、温度、梯度、检测波长），基于保留模型预测并可视化色谱图、峰表与系统适用性指标。
- **四相流动相**：A 相（水 / 缓冲水相 / 正己烷 / 正庚烷 / 环己烷）、B 相（ACN / MeOH / IPA / EtOAc / THF / EtOH）以及辅助相 C/D 均可选择并输入自定义名称；C/D 为恒定比例通道，A 相比例自动取 100 − B − C − D。
- **四相保留与柱压**：按各溶剂的相对洗脱强度加权计算有效改性剂比例，柱压按各通道体积分数与黏度混合估算；比例合计超过 100% 或相态不兼容时给出警告。
- **动态组分检索**：侧栏搜索框输入即搜，本地化合物库即时匹配；输入 2 个字符以上同时检索 PubChem 并可直接加入样品（在线参数标注为估算值）。完整组分库支持类别筛选、自定义化合物与多选添加。
- **AI 条件设计**：给定组分，由 LLM 生成可上机的色谱条件，并强制通过物理模型复核；若存在未洗脱组分或分离度不足，自动回退到规则专家系统。等度方案会扫描 B 相比例，综合分离度与保留窗口择优。未配置模型时直接使用规则引擎。
- **用户系统**：注册 / 登录后使用平台；密码以 scrypt 加盐哈希存储，会话通过 HttpOnly Cookie 维持。
- **账户设置**：可保存默认色谱模式 / 有机相 / 检测器 / 柱温偏好、修改密码（并注销其他设备会话），以及收藏当前色谱条件并一键恢复。

## 快速开始

```bash
python3 -m pip install -r requirements.txt
python3 run.py
# 打开 http://localhost:8000
```

可选环境变量（也可在页面右上角「设置」中填写，Key 仅保存在浏览器会话）：

```bash
export CHROM_AI_API_KEY=sk-...                 # 或 OPENAI_API_KEY
export CHROM_AI_BASE_URL=https://api.deepseek.com/v1
export CHROM_AI_MODEL=deepseek-chat
export HOST=0.0.0.0 PORT=8000
```

任何兼容 `/chat/completions` 的服务均可使用（OpenAI、DeepSeek、Moonshot、通义千问兼容模式、本地 vLLM/Ollama 网关等）。

账号数据保存为 JSON 文件，路径由 `CHROM_USER_DB` 指定，缺省位于系统临时目录。部署实例的临时目录可能在重新部署后重置，此时需要重新注册。

### Node.js 运行（线上部署版本）

仓库同时提供一份与 FastAPI 接口契约一致的 Node.js 实现，用于函数型托管：

```bash
cd node-app
sh build.sh          # 同步 static/ 到 public/，并生成 dist/ 产物
PORT=8000 node server.js
```

`build.sh` 从仓库根的 `static/` 复制前端资源，`server.js` 同时提供 `/api/*` 与静态页面。两种实现共用相同的环境变量与账户数据格式，切换后端无需修改前端。

## 科学模型

**保留模型（LSS）**

```
log10 k = log10 k_w − S · φ
```

- `k_w`、`S` 为化合物校准参数，见 `app/compounds.py`。
- 电离校正：酸 `1/(1+10^(pH−pKa))`，碱 `1/(1+10^(pKa−pH))`，中性化合物不校正。
- 温度校正：van't Hoff 关系修正 `k_w`。
- 梯度洗脱：按局部流动相组成数值积分溶质迁移，计入系统延迟体积（dwell volume）。

**正相（NPLC）保留模型**

```
log10 k = log10 k_ref − S_np · (φ − 0.10)
```

- A 相为正己烷，B 相为异丙醇（IPA）或乙酸乙酯（EtOAc）；保留随极性调节剂比例升高而降低。
- `log k_ref`、`S_np` 由 logP 经 QSRR 估算，也可由化合物参数覆盖。
- 正相不使用 pH/缓冲盐，固定相限定为硅胶、二醇或氨基柱。
- 自定义 A/B 相若未提供物性参数，分别按对应相态的基准溶剂（水 / 正己烷，乙腈 / 异丙醇）估算黏度与洗脱强度，并在结果中给出提示。

**色谱柱与峰形**

- Knox 型折合 van Deemter 方程估算理论塔板高度：`h = 1.75 + 1.25/ν + 0.06ν`。
- 峰形使用指数修正高斯（EMG）描述拖尾；UV 响应按化合物 `λmax` 的高斯吸收包络计算。
- 输出死时间、运行时间、柱压、峰数、最小分离度 `Rs`、最大保留因子 `k`，并给出柱压、pH、分离度等风险提示。

**条件设计**

1. 模式选择：可指定反相/正相；自动模式下依据组分 logP 与可电离性选择。
2. 反相：pH 候选搜索（2.5–10.5），优先使组分处于单一电离态且远离 pKa；正相：搜索 IPA/EtOAc 梯度窗口。
3. 等度可行性判断（`k = 1–10` 窗口），不满足时搜索梯度起止组成与时长。
4. 依据检测器选择柱型/流速（UV 常规柱、MS 窄径柱），优化检测波长，推荐缓冲盐。
5. LLM 结果经同一模拟器复核并做参数约束；调用失败时自动回退规则引擎。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/auth/register` | 注册并自动登录 |
| `POST` | `/api/auth/login` | 登录 |
| `POST` | `/api/auth/logout` | 退出登录 |
| `GET` | `/api/auth/me` | 当前登录用户 |
| `GET` | `/api/account` | 账户偏好与收藏列表 |
| `PUT` | `/api/account/preferences` | 保存偏好设置 |
| `POST` | `/api/account/password` | 修改密码 |
| `POST` | `/api/account/favorites` | 收藏当前色谱条件 |
| `DELETE` | `/api/account/favorites/{id}` | 删除收藏 |
| `GET` | `/api/compounds` | 内置化合物库与分类 |
| `GET` | `/api/compounds/search` | 本地 + PubChem 动态化合物搜索 |
| `POST` | `/api/simulate` | 条件 → 色谱图数据 |
| `POST` | `/api/recommend` | 组分 → 推荐条件与方法 |
| `POST` | `/api/identify` | 条件 + 观测保留时间 → 候选组分识别 |
| `GET/POST` | `/api/ai/status` | 大模型配置状态 |
| `POST` | `/api/ai/test` | 测试大模型连接 |

`/api/identify` 目前以 API 形式提供：提交观测保留时间与候选组分，即可按当前条件反查最可能的组分及匹配分数。

## 目录结构

```
app/                  FastAPI 后端
  compounds.py    内置化合物库与 LSS 参数
  simulation.py   保留/峰形/梯度数值积分与指标计算
  recommend.py    规则专家系统 + LLM 条件设计
  ai_client.py    OpenAI 兼容客户端
  main.py         FastAPI 路由与静态资源
node-app/             Node.js 后端（线上部署）
  server.js       HTTP 服务、鉴权、静态托管
  lib/            模型校验、模拟、推荐、识别、PubChem、账户
  build.sh        前端同步与 dist 构建
static/               前端源码（两种后端共用）
  index.html      单页界面
  js/app.js       交互、状态与 API 调用
  js/chart.js     Canvas 色谱图渲染
  css/style.css   深色实验室风格样式
```

修改前端后需执行 `cp static/... node-app/public/...`（或运行 `node-app/build.sh`）再部署，避免线上使用旧资源。

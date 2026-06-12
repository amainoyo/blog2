# 个人博客从 Railway 迁到 Synology NAS

> **状态**：**2026-06-04 启动推进**。先生决策：先备份原项目到 `D:/Blog`，再在原项目上分阶段实施。每步 git commit + 先生 review。
>
> **当前进度**：阶段 0（代码改造）—— 待开始。

## 目标

把 `blog.oywz.top` 从 Railway 迁到自家 Synology NAS（家里 IPv6 + DDNS）。一次到位，解决之前的所有隐患（502 慢连接、MemoryStore 重启丢 session）。

**预期收益**：
- 月费从 $4.80（Railway）降到 ¥0（家里 NAS 电费可忽略）
- 数据完全自主（SQLite 文件就在 NAS 硬盘）
- 之前 502 + session 丢失连环 bug 全部消失
- Session 持久化（用 SQLite session store，重启不丢）

**用户背景（2026-06-04 校准）**：
- 已有 Synology NAS
- 域名 `oywz.top`（阿里云注册，阿里云 DNS）
- **未 ICP 备案**；网站**不面向公众**，仅个人/小圈子用 —— **自己访问 NAS 不受备案限制**
- 家宽 ISP **封禁 80/443 端口**（IPv4 路径），靠 **IPv6 + DDNS** 暴露
- 海外 IPv4 用户基本访问不到，**接受这个限制**
- 不用 Cloudflare
- 喜欢折腾："对于搞技术的人来说，折腾也是一种乐趣"

**规模**：18 篇文章本地电脑都有（不需数据迁移）、~5 个用户、零星流量。SQLite 足够，无需 PG。

## 总体架构

```
[访客 IPv6]  →  [DDNS 解析到 NAS IPv6]  →  [Synology 反代 (nginx, 443)]
                                                      ↓
                                                 [Docker 容器: Node 22 + Express]
                                                      ↓
                                                 [volume 映射: ./data/blog.db]
                                                      ↓
                                                 [SQLite 库 (表 + session)]
                                                      ↓
                                                 [volume 映射: ./public/uploads/]
```

- **反代**：DSM Control Panel → Login Portal → 反代（图形化配置，HTTPS 终结在 DSM 层）
- **SSL**：**阿里云免费证书**，**90 天有效期**，**手动续**（先生熟悉此流程）。验证方式用 **DNS 验证**（添加一条 TXT 记录到阿里云 DNS），**不依赖 80 端口**
- **Docker**：DSM Container Manager 跑 node:22-alpine 镜像，挂载 2 个目录
- **持久化**：Docker volume 映射到 NAS 实际路径（`/volume1/docker/blog/data` 和 `/volume1/docker/blog/uploads`）
- **传输**：代码部署用 **SMB 直传**（不用 `git clone`，NAS 走国内网络拉 GitHub 慢）

## 实施分 6 个阶段

每阶段**独立可验证**，失败了不会污染前阶段。**每步一个 git commit，错了能 `git revert`。**

### 阶段 0: 代码改造（先做，目标是让应用脱离 PG 跑起来）

> **关键决策（2026-06-04）**：
> - **不做** PG → SQLite 数据迁移脚本（18 篇文章本地都有，重新发布即可）
> - `src/database.js` **干净重写**（不用考虑旧数据兼容）
> - Railway 验证**只看代码能跑**（启动 + 登录 + 写一篇文章）

#### 0.1 改 `package.json`
- 增 `better-sqlite3`（同步驱动，单文件）
- 增 `better-sqlite3-session-store`（session 持久化）
- 删 `pg`
- 删 `connect-pg-simple`（**实际上代码里没用过，省一步**）

#### 0.2 改 `src/database.js`（主要工作量，~400 行重写）
- `const { Pool } = require('pg')` → `const Database = require('better-sqlite3')`
- 删 Pool 配置（SSL、connectionString 都不需要）
- 改 `initDb()`：打开 `./data/blog.db`，跑 schema，`PRAGMA journal_mode=WAL`（更好的并发）
- **所有 SQL 占位符 `$1, $2, ...` → `?`**（实际有 **30+ 处**，不是 20）
- `pool.query(sql, [params])` → `db.prepare(sql).all/get/run(...args)`
- `SERIAL PRIMARY KEY` → `INTEGER PRIMARY KEY AUTOINCREMENT`（schema 4 处）
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`（PG 9.6+ 语法）→ 用 `PRAGMA table_info` 查列后再判断
- `ILIKE`（PG 大小写不敏感）→ `LIKE` + `LOWER()` 或 `COLLATE NOCASE`（search 方法）
- `ON CONFLICT DO NOTHING`（PG）→ `INSERT OR IGNORE`（SQLite）
- `COUNT(*)::int`（PG 强类型）→ 直接 `as count` 数字返回
- `RETURNING *` SQLite 也支持，**不动**
- `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` 两边都支持，**不动**
- 改完后所有模型方法 (User/Post/Comment/Tag) **无需重写**，只需替换 query 调用模式

#### 0.3 改 `src/app.js`
- 加 `const sessionStore = require('better-sqlite3-session-store')(session);`
- `session({...})` 配置加 `store: new sessionStore({ client: db, table: 'blog_sessions' })`
- **关键收益**：session 持久化到 SQLite，重启不丢

#### ~~0.4 写 `scripts/migrate-pg-to-sqlite.js`~~ — **取消**
- 文章本地都有，重新发布即可
- 用户/评论数据不重要（个人用，可重新注册/灌数据）

#### 0.5 写 `Dockerfile`（NAS 用）
- 基础镜像 `node:22-alpine`
- 装 `better-sqlite3` 编译依赖（python3, make, g++）→ `npm install` → `npm prune`
- COPY app
- EXPOSE 3000
- CMD `node src/app.js`

#### 0.6 写 `docker-compose.yml`（NAS 用）
```yaml
version: '3.8'
services:
  blog:
    build: .
    container_name: blog
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"   # 只 listen 在 NAS 内部，不暴露公网
    volumes:
      - /volume1/docker/blog/data:/app/data
      - /volume1/docker/blog/uploads:/app/public/uploads
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=<random-32-bytes>
      - SQLITE_PATH=/app/data/blog.db
```

#### 0.7 Railway 上验证（**简化版**，不删 Railway 实例）
- 推送新代码
- 启动后看日志："博客已启动: http://localhost:3000"
- 浏览器访问：能打开首页
- 登录后台：账号密码能用
- 写一篇文章：能保存，能读出来
- 验证通过则保留 Railway 实例（阶段 5 切流前不要删）
- 如果失败，`git revert` 上一 commit

### 阶段 1: Synology NAS 准备

#### 1.1 套件安装
- DSM → Package Center
- 搜索并安装：**Container Manager**（旧版叫 Docker）
- 不需要 **Node.js 套件**（用 Docker）
- **File Services → SMB** 启用（代码部署用）

#### 1.2 文件夹准备
- 在 File Station 里创建：
  - `/docker/blog/` — 挂载点
  - `/docker/blog/data/` — SQLite 数据库
  - `/docker/blog/uploads/` — 用户上传的图片
- 权限：所有人能读写

#### 1.3 防火墙（**ISP 已封 80/443，无需配置**）
- ❌ **不需要** 80/443 防火墙规则（ISP 层面就拦了）
- ✅ 反代/服务都走 IPv6
- ✅ SSH 22 端口可按需开（部署时临时用）
- ⚠️ **3000 端口绝对不要开**（反代走 IPv6 直连 443 → 内部 3000）

#### 1.4 DDNS 检查
- DSM → Control Panel → External Access → DDNS 看到了
- **从外网用 `ping6 blog.oywz.top` 测试**（IPv6 解析 + 可达）
- 如果 ping 不通：检查运营商是否分配公网 IPv6

### 阶段 2: 部署应用到 NAS（**SMB 直传，不用 git clone**）

#### 2.1 SMB 传输代码
- Windows 资源管理器访问 `\\NAS_IP\docker\blog\app`（DSM File Services → SMB 启用）
- **整个 `D:/Claude_Project` 拖进去**（除 `node_modules/` 和 `.git/`，见下）
- 跳过：
  - ❌ `node_modules/`（Dockerfile 里 `npm install` 会自己装）
  - ❌ `.git/`（NAS 端独立 init，需要时先生决定）
- 包含：
  - ✅ `src/`, `views/`, `public/`, `scripts/`
  - ✅ `package.json`, `package-lock.json`
  - ✅ 文档、素材

#### 2.2 准备环境
- SSH 到 NAS（或用 Container Manager 的 terminal）
- `cd /volume1/docker/blog/app`
- `cp .env.example .env` 然后填 `SESSION_SECRET=<32 字节随机>`
- `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成密钥

#### 2.3 docker-compose up
- `cd /volume1/docker/blog/app`
- `docker-compose build`（首次慢，10-20 分钟；NAS CPU 弱的话可能更慢）
- `docker-compose up -d`
- `docker logs -f blog` 看启动日志
- 预期：看到 "博客已启动: http://localhost:3000"

#### 2.4 本地测试
- NAS 内部：`curl http://localhost:3000/` → 应该 200
- 局域网：`curl http://NAS-LAN-IP:3000/` → 应该 200
- 暂不测外网（还没配反代/SSL）

### 阶段 3: 反代 + SSL

> **关键说明**：
> - **80 端口不开**（ISP 封了）—— 没有 HTTP→HTTPS 重定向
> - 用户输 `http://blog.oywz.top` 会**连不上**（不是不安全，是连接被拒）
> - 浏览器自动试 HTTPS，影响小
> - 反代走 **443（IPv6 路径）**

#### 3.1 申请 / 导入 SSL 证书（**阿里云免费证书，90 天手动续**）

**申请**（首次 + 每次续期都重复此流程）：
1. 阿里云控制台 → SSL 证书 → 免费证书 → 立即购买
2. 填域名 `blog.oywz.top`
3. 验证方式选 **DNS 验证** → 系统给一个 TXT 记录值
4. 去阿里云 DNS 控制台添加这条 TXT
5. 几分钟内自动签发
6. 下载 Nginx 格式 → 解压得到 `blog.oywz.top.pem` 和 `blog.oywz.top.key`

**导入 DSM**：
1. DSM → Control Panel → Security → Certificate → Add → **Import certificate**
2. 粘贴两个文件内容（或直接上传）
3. 命名（如 `blog-oywz`）

**绑定到系统 443**：
- Certificate → Settings → 把这个证书设为 DSM 系统默认（这样反代 443 自动用这个证书）

**续期**（每 90 天一次，5-10 分钟）：
- 阿里云证书快到期前 1 周会发短信/邮件提醒
- 重复上述申请流程
- 一年 4 次手动操作

#### 3.2 配置反代
- DSM → Control Panel → Login Portal → Advanced → Reverse Proxy
- Add：
  - Source: `https://blog.oywz.top:443` (HSTS 勾上)
  - Destination: `http://localhost:3000`
  - **不**启用 WebSocket（博客不需要）

#### 3.3 配置 DSM 系统端口
- DSM → Control Panel → Security → Certificate → Settings
- 把 `blog.oywz.top` 的证书设为 DSM 系统默认（这样反代 443 自动用这个证书）

#### 3.4 测试
- 外网 `curl -6 https://blog.oywz.top/` → 应该 200，证书有效
- 浏览器访问（IPv6 网络）：能看到博客首页，URL 是 https 绿色锁
- 浏览器访问（IPv4 网络）：**连接超时**（已知，接受）
- HSTS 头验证：`curl -I https://blog.oywz.top/` 应包含 `Strict-Transport-Security`

### ~~阶段 4: 数据迁移~~ — **取消**

> 文章本地电脑都有，重新发布即可。
> - 用户/评论等数据不重要
> - 重新注册 admin 账号，重新发布 18 篇文章
> - 评论系统作为新功能逐步用起来

**替代任务**：阶段 5 切流后，先生花 1-2 天把 18 篇文章重新在 NAS 上的 Blog 后台发布。

### 阶段 5: 切流量

#### 5.1 DNS 改 TTL
- 阿里云 DNS 控制台：把 `blog.oywz.top` 的解析从 Railway CNAME 改到 **AAAA 记录指向 NAS 的 IPv6**
- TTL 提前几天设 60s，切流会快

#### 5.2 监控
- 看 NAS Docker 容器日志：`docker logs -f blog`
- 看 DSM 反代日志
- 跨 IPv4/IPv6 客户端都访问一下（验证效果）

#### 5.3 保留 Railway 7 天（应急回滚）
- Railway 暂时不停，让老链接还能 fallback
- 7 天后确认 NAS 稳定，再删 Railway 项目

### 阶段 6: 备份策略

#### 6.1 用 Synology Hyper Backup
- DSM → Hyper Backup
- 备份任务 1：本地 NAS 另一块硬盘（防止单盘故障）
- 备份任务 2（可选）：到云端（Backblaze B2、阿里云 OSS 都支持）

#### 6.2 备份内容
- `/volume1/docker/blog/data/`（SQLite 文件）— 关键
- `/volume1/docker/blog/uploads/`（用户图片）— 重要
- 频率：每天 1 次，保留 30 天
- 关键：SQLite 备份前先 `VACUUM INTO '/tmp/backup.db'`（保证一致性）

#### 6.3 应用代码
- 代码在本地 `D:/Claude_Project`（git 管理）+ D:/Blog 备份，**NAS 上不需要再备份代码**

## 涉及的文件

### 代码（阶段 0）
| 文件 | 改动 | 估计行数 |
|------|------|---------|
| `package.json` | 依赖替换 | -2 +2 |
| `src/database.js` | 全面重写 | -499 +400（行数减少 100，因 SQLite 无 PG 那些样板） |
| `src/app.js` | 加 SQLite session store | +5 |
| ~~`scripts/migrate-pg-to-sqlite.js`~~ | ~~取消~~ | 0 |
| `Dockerfile` | 新文件 | +20 |
| `docker-compose.yml` | 新文件 | +15 |
| `.env.example` | 新增 SESSION_SECRET + SQLITE_PATH 模板 | +5 |
| `README.md` | 增加部署说明 | +30 |
| **`Blog部署到NAS的计划方案.md`** | **本次更新** | 已合并新约束 |

**总代码改动：~220 行**（从原 300 行精简），**全部是结构性的**（不是 bug 修复，是技术栈切换）。

### NAS 上（阶段 1-6）
不是代码文件，是 DSM 图形界面操作 + SSH 命令。**预计 30-50 个手把手指令**。

## 验证步骤

每阶段都给出**自检命令**：

### 阶段 0
- `node -e "require('./src/database')"` 不报错
- `node -e "require('./src/app')"` 能启动
- Railway 部署后：博客能访问，能登录后台，能写一篇文章

### 阶段 1
- `ping6 blog.oywz.top` 能 ping 通（IPv6 解析 + 可达）
- SSH 进 NAS 能 `ls /volume1/docker/blog/`

### 阶段 2
- 容器内：`docker exec blog node -e "const db = require('./src/database'); console.log(db)"` 不报错
- 容器日志：看到 "博客已启动: http://localhost:3000"
- 局域网 `curl http://NAS-LAN-IP:3000/` → 200

### 阶段 3
- 外网 `curl -6 -I https://blog.oywz.top/` → HTTP/2 200，证书有效，HSTS 头存在
- 浏览器（IPv6 网络）：能看博客首页，绿色锁
- 浏览器（IPv4 网络）：连接超时（已知）

### 阶段 5
- 国内 IPv6 用户能访问
- 海外 IPv4 用户大概率访问不到（已知）
- 海外 IPv6 用户能访问

### 阶段 6
- 模拟数据丢失：从备份恢复 → 验证数据一致

## 风险（2026-06-04 校准）

| 风险 | 等级 | 缓解 |
|------|------|------|
| 代码切换有 bug | 🟡 中 | 阶段 0 在 Railway 先验证，失败立即 revert |
| ~~数据迁移丢失~~ | ~~🟡 中~~ | ~~阶段 4 迁错可重做~~ — **已取消** |
| NAS 突然宕机 | 🟡 中 | 阶段 6 备份策略兜底 |
| ~~域名 ICP 备案~~ | ~~🔴 高~~ | ~~必须先确认~~ — **先生未备案，个人用不面向公众，自己访问不受影响** |
| **ISP 封 80/443 端口** | 🟡 中 | 走 IPv6 路径 + DDNS；HTTP-01 证书验证走不通，必须用 DNS-01 |
| IPv6 海外不通 | 🟢 低 | 接受 ~30% 不可达；如要补可加 Cloudflare Workers（不是 Cloudflare 本身） |
| 证书续期失败 | 🟢 低 | DNS-01 验证（不依赖 80 端口）；阿里云快到期前会邮件/短信提醒，5-10 分钟手动续 |
| NAS 性能跑 `npm install` 慢 | 🟡 中 | 首次 10-20 分钟，可接受；后续增量部署只装新包，几秒到几十秒 |
| SMB 传输大文件慢 | 🟢 低 | 代码不传 `node_modules`，单次 SMB 同步 < 5MB |

## 不在范围内

以下**这次不做**，留作以后：

- HTTPS 强制 / HSTS preload
- 自动更新依赖（Dependabot / Renovate）
- CI/CD（GitHub Actions 自动 deploy 到 NAS）
- Docker 镜像推到 Docker Hub
- 性能监控 / 日志聚合
- 多用户 / 评论审核
- 邮件通知
- 海外 IPv4 访问（frp/Tailscale 中转）

## Agent team 决策（2026-06-04 新增）

**阶段 0 不用 Agent team**。理由：
- 改动量 ~220 行
- 强依赖关系（database.js 是基础，app.js 依赖它，Dockerfile 依赖它俩）
- 单 agent 顺序推进比并行更快（避免协调成本）

**NAS 部署阶段（阶段 1-6）考虑用 Agent team**。理由：
- 多个真正独立轨道：
  - 轨道 A：DSM 系统准备（Container Manager、SMB 启用、目录建、防火墙）
  - 轨道 B：SSL 证书（acme.sh 部署、阿里云 API 集成、DSM 导入）
  - 轨道 C：代码部署（SMB 传文件、docker-compose up）
  - 轨道 D：反代配置 + DSM 证书绑定
  - 轨道 E：备份策略（Hyper Backup 配置、定时任务）
- 轨道 A-D **真正可并行**（互不依赖）
- 错误容忍度低（一个配错就访问不到），**有 verifier 价值**
- 阶段 5 切流是高风险操作，独立验证很值得

**结论**：**阶段 0 单 agent 顺序推**；**NAS 部署阶段再开 team**。

## 实施进度（2026-06-04 实时更新）

| 阶段 | 状态 | 备注 |
|------|------|------|
| 方案更新 | ✅ 已完成 | 本文档 |
| 原项目备份到 D:/Blog | ⏳ 待开始 | 先生拍板后执行 |
| 阶段 0 代码改造 | ⏳ 待开始 | 7 个子步骤，~220 行改动 |
| 阶段 1-6 NAS 部署 | ⏳ 待阶段 0 完成 | 预计 4-6 小时 |

## 预计总耗时（2026-06-04 校准）

- 阶段 0（代码）：**1.5-2 小时**（数据迁移取消，省 1 小时）
- 阶段 1-2（NAS 准备 + 部署）：1-2 小时（含手把手指导）
- 阶段 3（反代 + SSL）：**30 分钟**（手动流程，简单直接）
- ~~阶段 4-5（数据迁移 + 切流）~~ → **只有切流**：30 分钟
- 阶段 6（备份）：15-30 分钟
- 文章重新发布：1-2 天（先生手动，不计入实施时间）

**总计：4-5 小时**（实施层面），分几次会话做最稳。

## 启动前的先决条件（2026-06-04 校准）

1. ✅ **域名未备案确认** —— 先生已知，未备案不面向公众，自己访问不受影响
2. ✅ **公网 IPv6 可达** —— DSM 启用 DDNS，外网 `ping6 blog.oywz.top` 能通
3. ⏳ **NAS 上 Container Manager 套件能装** —— Synology DSM 6.0+ 都支持，少数老机型不支持
4. ⏳ **SSH 访问 NAS 的能力** —— 部署和运维都需要
5. ⏳ **DSM 上 SMB 启用** —— 代码部署通道
6. ⏳ **阿里云账号**（已有即可，免费证书申请用）

确认后按 **阶段 0 → 1 → 2 → ... 逐步推**。每阶段完成先生确认再走下一阶段。

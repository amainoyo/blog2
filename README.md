# Personal Blog

馃敆 **鍦ㄧ嚎鍦板潃**锛歨ttps://blog-production-6776.up.railway.app

涓€涓畝娲佺殑涓汉鍗氬绯荤粺锛屽熀浜� Node.js + Express 鏋勫缓锛屾敮鎸� Markdown 鏂囩珷鎾板啓銆佺敤鎴锋敞鍐岀櫥褰曘€佽瘎璁轰簰鍔ㄣ€佹壒閲忓鍏ャ€�

## 鎶€鏈爤

| 绫诲埆 | 鎶€鏈� |
|------|------|
| 鍚庣 | Node.js + Express 5 |
| 妯℃澘寮曟搸 | Handlebars |
| 鏁版嵁搴� | PostgreSQL锛圧ailway锛� |
| 璁よ瘉 | bcryptjs + express-session |
| Markdown | marked + highlight.js |
| Frontmatter 瑙ｆ瀽 | gray-matter |

## 鍔熻兘

- 鉁� 鏂囩珷绠＄悊锛圡arkdown 鎾板啓 / 缂栬緫 / 鍒犻櫎锛�
- 鉁� **鎵归噺瀵煎叆 Markdown**锛圷AML frontmatter锛屸墹20 涓枃浠�/娆★級
- 鉁� 鐢ㄦ埛绯荤粺锛堟敞鍐� / 鐧诲綍 / 鏉冮檺绠＄悊 / 淇敼瀵嗙爜锛�
- 鉁� 璇勮绯荤粺
- 鉁� 鎼滅储鍔熻兘
- 鉁� 鍒嗙被涓庢爣绛撅紙4 纭紪鐮佸垎绫� + 鑷敱鏍囩锛�
- 鉁� 鍝嶅簲寮忚璁★紙涓滄柟缂栬緫鏉傚織椋庯級
- 鉁� 浠ｇ爜楂樹寒
- 鉁� 鍥剧墖涓婁紶

## 蹇€熷紑濮�

### 鏈湴杩愯

```bash
# 闇€瑕佸厛瀹夎 PostgreSQL锛屽苟閰嶇疆 DATABASE_URL 鐜鍙橀噺
npm install
npm run dev    # 寮€鍙戞ā寮忥紙鐑噸杞斤級
npm start      # 鐢熶骇妯″紡
```

璁块棶 http://localhost:3000

**鏈湴 PostgreSQL 閰嶇疆**锛�
```bash
export DATABASE_URL="postgresql://鐢ㄦ埛鍚�:瀵嗙爜@localhost:5432/鏁版嵁搴撳悕"
```

### 鍒濆鍖�

棣栨杩愯浼氳嚜鍔ㄥ垱寤烘暟鎹簱琛ㄥ拰绠＄悊鍛樿处鎴凤細

- **绠＄悊鍛樿处鍙�**锛歚admin` / `admin123`
- **鏅€氳处鍙�**锛氭敞鍐屽悗鑷姩鍒涘缓

> 棣栨鐧诲綍鍚庤鍓嶅線銆岃缃€嶄慨鏀圭鐞嗗憳瀵嗙爜銆�

## 鎵归噺瀵煎叆 Markdown

鍚庡彴 鈫� 銆屾壒閲忓鍏ャ€嶅彲涓€娆″彂甯冨绡� `.md` 鏂囦欢銆�

**frontmatter 瀛楁**锛�
```yaml
---
title: 鏂囩珷鏍囬锛堢己鐪佺敤鏂囦欢鍚嶏級
category: tech        # tech / life / thoughts / essays锛岀暀绌哄綊鍒般€屾湭鍒嗙被銆�
tags: Node.js, Railway, 閮ㄧ讲
status: published     # published / draft
---
```

**闄愬埗**锛氬崟鏂囦欢 鈮� 5MB锛屾瘡娆� 鈮� 20 涓€�

**绀轰緥**锛�
```markdown
---
title: 鎴戠殑绗竴绡囧崥瀹�
category: tech
tags: Node.js, Railway
---

# 姝ｆ枃

杩欓噷鏄枃绔犲唴瀹�...
```

## 鐩綍缁撴瀯

```
blog/
鈹溾攢鈹€ src/
鈹�   鈹溾攢鈹€ app.js           # 涓诲叆鍙�
鈹�   鈹溾攢鈹€ database.js      # 鏁版嵁搴撴搷浣滐紙PostgreSQL锛�
鈹�   鈹溾攢鈹€ middleware/      # 涓棿浠讹紙璁よ瘉銆佹潈闄愶級
鈹�   鈹溾攢鈹€ routes/         # 璺敱锛坅uth/posts/comments/admin锛�
鈹�   鈹斺攢鈹€ utils/          # 宸ュ叿鍑芥暟锛圡arkdown 娓叉煋绛夛級
鈹溾攢鈹€ views/              # Handlebars 妯℃澘
鈹溾攢鈹€ public/             # 闈欐€佽祫婧愶紙CSS/JS/鍥剧墖涓婁紶锛�
鈹斺攢鈹€ package.json
```

## 閮ㄧ讲

### Railway锛堟帹鑽愶級

1. 娉ㄥ唽 [Railway](https://railway.app)锛圙itHub 鐧诲綍锛屾棤闇€鐢佃瘽楠岃瘉锛�
2. 鍒涘缓 Project 鈫� **Provision PostgreSQL**锛堣嚜鍔ㄥ垱寤烘暟鎹簱锛�
3. 鍐嶅垱寤� Project 鈫� **Deploy from GitHub** 鈫� 閫夋嫨 `amainoyo/blog`
4. Railway 浼氳嚜鍔ㄤ粠 GitHub 閮ㄧ讲锛屾棤闇€鎵嬪姩閰嶇疆

> PostgreSQL 鐨� `DATABASE_URL` 浼氱敱 Railway 鑷姩娉ㄥ叆銆�

### 鍏朵粬骞冲彴

闇€瑕佹敮鎸� **Node.js 鏈嶅姟绔�** 鐨勫钩鍙帮細
- Render锛堥渶閰嶇疆鍚姩鍛戒护 `node src/app.js`锛�
- Fly.io
- 浠绘剰鏀寔 Docker 鐨勫钩鍙�

> **娉ㄦ剰**锛歂etlify銆乂ercel锛堥潤鎬侊級涓嶉€傚悎姝ら」鐩紝鍥犱负瀹冮渶瑕佽繍琛� Express 鏈嶅姟绔€�

## 鎺ュ彛璺敱

| 鏂规硶 | 璺緞 | 璇存槑 |
|------|------|------|
| GET | `/` | 棣栭〉锛堟枃绔犲垪琛級 |
| GET | `/post/:slug` | 鏂囩珷璇︽儏 |
| GET | `/search` | 鎼滅储 |
| GET | `/login` | 鐧诲綍椤� |
| POST | `/login` | 鐧诲綍 |
| GET | `/register` | 娉ㄥ唽椤� |
| POST | `/register` | 娉ㄥ唽 |
| POST | `/logout` | 鐧诲嚭 |
| GET | `/settings` | 淇敼瀵嗙爜 |
| POST | `/settings/password` | 鎻愪氦鏂板瘑鐮� |
| GET | `/editor` | 鍐欐枃绔� |
| GET | `/editor/:id` | 缂栬緫鏂囩珷 |
| POST | `/posts` | 鍙戝竷鏂囩珷 |
| POST | `/posts/:id` | 鏇存柊鏂囩珷 |
| POST | `/posts/:id/delete` | 鍒犻櫎鏂囩珷 |
| GET | `/admin` | 绠＄悊鍚庡彴 |
| GET | `/admin/users` | 鐢ㄦ埛绠＄悊 |
| GET | `/admin/posts` | 鏂囩珷绠＄悊 |
| GET | `/admin/comments` | 璇勮绠＄悊 |
| GET | `/admin/import` | 鎵归噺瀵煎叆 |
| POST | `/admin/import` | 鎻愪氦鎵归噺瀵煎叆 |

## License

MIT

## Environment Variables

| Name | Required | Description |
|------|----------|-------------|
| DATABASE_URL | yes | PostgreSQL connection string |
| SESSION_SECRET | yes | Long random string. App exits on startup if missing. |
| NODE_ENV | prod | Set to production to enable HTTPS-only cookies and HSTS |
| PORT | no | Default 3000 |
| ADMIN_USERNAME | no | If set together with ADMIN_PASSWORD, a one-time admin is created on first boot |
| ADMIN_PASSWORD | no | Paired with ADMIN_USERNAME. Change it after first login. |

Note: This project no longer ships with a default admin / admin123 account.

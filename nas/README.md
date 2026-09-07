# 大明职官图：NAS 与独立服务器部署

> 当前默认发布目标已由用户改为虚拟主机 `dmwc1566`，迁移状态见 [`../DEPLOYMENT.md`](../DEPLOYMENT.md)。本文仅保留旧 NAS 副本的维护方法。

这是一个纯静态 React 站点。数据与图片随包部署，无数据库、登录服务或 Sites 运行时依赖。

## 构建与启动

需要 Node.js 22.13 或更高版本构建；服务器仅需 Docker Compose。

```sh
npm ci
npm run build:nas
docker compose --project-directory . -f nas/compose.yaml up -d
```

浏览器访问 `http://服务器地址:8092`。修改 `nas/compose.yaml` 的宿主端口即可更换端口。应用使用站点根路径，反向代理请转发整个站点，不要放到子路径。

迁移服务器时复制 `dist-nas/`、`nas/nginx.conf`、`nas/compose.yaml` 即可；不需要复制 `node_modules` 或 `.openai`。原始源代码留在项目中，可继续编辑构建。域名与 HTTPS 可由目标服务器现有反向代理配置。

## 本次 NAS 发布结构

- 项目目录：`/volume1/docker/ming-official-atlas`
- 每次发布位于 `releases/<版本>/`，不覆盖上一版。
- 容器：`ming-official-atlas`，端口 `8092`。
- 项目根目录 `current-release.txt` 记录当前发布路径。
- 发布后校验文件 SHA-256、容器状态、HTTP 内容和关键交互。

本机发布工具：`python scripts/deploy-nas.py` 只预检；`python scripts/deploy-nas.py --apply` 构建包并部署。它复用已有 SSH 密钥与严格主机校验，不读取或保存密码。

## 官品考证资料

`research/rank-audit/` 保留逐条审校输入及朝仪研究文稿。运行 `python scripts/assemble-rank-audit.py` 可重新生成 `public/data/` 中的全部官品检索表、审校 JSON、州县补录及朝仪研究页面；原始 `ming-officials.json` 不被改写。随后运行 `npm run build:nas` 构建发布文件。一般构建无需 Python，已生成的公开研究文件随站点一起部署。

首版发布不影响其他容器。后续更新将原容器停止并改名为时间戳备份，再启动新版本；失败时恢复原容器。人工回滚可停止并移除当前的 `ming-official-atlas` 容器，再把相应 `ming-official-atlas-backup-*` 容器改回原名并启动；旧发布文件保留在 `releases/`。

## 地图精度

山川舆图是原创风格化插画，省域按自然地理外形及明代两京十三省关系作概略表达，并非1582年精确行政边界测绘。依据见 `public/data/map-geography-sources.md`。

# Notion 图片反代加速

Notion 里的图片默认会先走 `www.notion.so`，再跳到 Notion 临时签名后的图片地址。这个过程能用，但速度和缓存都不太稳定。

最省事的做法是：给图片单独准备一个 Cloudflare 域名，例如：

```text
https://cdn.example.com
```

然后让 NotionNext 把所有 Notion 图片都改成这个域名：

```text
NEXT_PUBLIC_NOTION_HOST=https://cdn.example.com
```

改完以后，文章里的图片会从：

```text
https://www.notion.so/image/...
```

变成：

```text
https://cdn.example.com/image/...
```

这样图片就会先经过你的 Cloudflare Worker，再由 Worker 去 Notion 拿图，并缓存到 Cloudflare。

## 适合谁

适合：

- 博客图片主要上传在 Notion。
- 不想压缩图片。
- 不想手动搬图片到 R2、OSS、七牛云。
- 想尽快让图片走自己的 Cloudflare 缓存。
- 同时使用 `yarn start` 和 `yarn export`。

不适合：

- 完全不使用 Cloudflare。
- 想把所有图片永久保存到自己的对象存储。
- 想做复杂的图片处理、缩略图、鉴权、防盗链。

这篇教程只做一件事：把 Notion 图片改成 Cloudflare Worker 反代，并尽量命中 Cloudflare 缓存。

## 小白最快流程

如果你不想先理解原理，只照着做即可。

### 1. 准备一个图片域名

假设你的主域名是：

```text
example.com
```

建议使用：

```text
cdn.example.com
```

也可以用：

```text
img.example.com
assets.example.com
```

建议用 `cdn`，因为一看就知道这是放网站素材的域名。

注意：

- 你的主域名必须已经接入 Cloudflare。
- 不要提前在 DNS 里手动添加 `cdn.example.com`。
- 这个域名只给图片用，不要再拿来放博客首页。

### 2. 创建 Cloudflare API Token

进入 Cloudflare 后，按这个路径操作：

```text
右上角头像 -> My Profile -> API Tokens -> Create Token
```

优先选择模板：

```text
Edit Cloudflare Workers
```

如果需要手动加权限，至少加这些：

```text
User -> Memberships -> Read
User -> User Details -> Read
Account -> Workers Scripts -> Edit
Zone -> Workers Routes -> Edit
Zone -> DNS -> Edit
```

资源范围这样选：

| 类型 | 选择 |
| --- | --- |
| Account | 你的 Cloudflare 账号 |
| Zone | 你的主域名，例如 `example.com` |

创建后复制 token。它只显示一次。

在 Windows PowerShell 里临时使用：

```powershell
$env:CLOUDFLARE_API_TOKEN='这里粘贴你的 token'
```

如果你把 token 保存成了一个本地文件，可以这样读取：

```powershell
$env:CLOUDFLARE_API_TOKEN = (Get-Content -Raw -LiteralPath 'C:\path\to\cloudflare-token.txt').Trim()
```

不要把 token 提交到 GitHub。

### 3. 配置 Worker 域名

打开 NotionNext 项目里的这个目录：

```text
cloudflare/notion-image-proxy
```

复制配置文件：

```powershell
Copy-Item wrangler.toml.example wrangler.toml
```

打开 `wrangler.toml`，把里面的域名改成你的图片域名：

```toml
name = "notion-image-proxy"
main = "worker.mjs"
compatibility_date = "2026-07-22"

routes = [
  { pattern = "cdn.example.com", custom_domain = true }
]
```

这里最容易写错。

正确：

```text
cdn.example.com
```

错误：

```text
cdn.example.com/image/*
```

错误：

```text
*.example.com
```

Cloudflare Worker 的 Custom Domain 只能填完整域名，不能填路径，也不能填通配符。

### 4. 部署 Worker

在 `cloudflare/notion-image-proxy` 目录运行：

```powershell
npx wrangler deploy
```

看到类似下面的结果，就说明部署成功：

```text
Uploaded notion-image-proxy
Deployed notion-image-proxy triggers
  cdn.example.com (custom domain)
```

部署成功后，访问：

```text
https://cdn.example.com/
```

返回 `404` 是正常的。这个 Worker 只处理图片路径：

```text
/image/...
/images/...
```

### 5. 配置 NotionNext

只需要加一个环境变量：

```text
NEXT_PUBLIC_NOTION_HOST=https://cdn.example.com
```

不同平台的位置如下：

| 平台 | 在哪里配置 |
| --- | --- |
| Vercel | Project Settings -> Environment Variables |
| Cloudflare Pages | Settings -> Variables and Secrets |
| Docker / VPS | `.env` 或容器环境变量 |
| 本地预览 | PowerShell 或 `.env.local` |

本地 PowerShell 示例：

```powershell
$env:NEXT_PUBLIC_NOTION_HOST='https://cdn.example.com'
$env:ENABLE_CACHE='false'
yarn dev -p 3002
```

`ENABLE_CACHE=false` 只建议本地测试时使用。它可以避免 NotionNext 继续使用旧缓存。

### 6. 重新部署博客

配置环境变量后，一定要重新部署博客。

动态部署：

```text
yarn start
```

需要重启服务。

静态部署：

```text
yarn export
```

需要重新导出并上传静态文件。

只改环境变量但不重新构建，页面里的图片地址不会变。

## 怎么判断成功

打开博客文章页，随便找一张 Notion 图片。

成功时，图片地址应该长这样：

```text
https://cdn.example.com/image/...
```

不应该还是：

```text
https://www.notion.so/image/...
```

如果还是 `www.notion.so`，通常是这几个原因：

| 现象 | 处理 |
| --- | --- |
| 变量名写错 | 必须是 `NEXT_PUBLIC_NOTION_HOST` |
| 少了 `https://` | 值必须是 `https://cdn.example.com` |
| 改完没重启 | 重启 `yarn start` |
| 静态站没重新导出 | 重新执行 `yarn export` |
| 本地缓存影响 | 临时设置 `ENABLE_CACHE=false` |

## 怎么判断缓存命中

第一次打开一张新图片，Cloudflare 常见结果是：

```text
CF-Cache-Status: MISS
```

这不是失败。`MISS` 的意思是：Cloudflare 第一次还没有缓存，所以先去 Notion 拿图。

同一张图第二次请求，理想结果是：

```text
CF-Cache-Status: HIT
```

也可以看 Worker 自己加的响应头：

```text
X-Notion-Image-Proxy: 1
X-Notion-Image-Proxy-Cache: HIT
```

最准确的测试方式是连续请求同一个完整图片地址两次：

```powershell
curl.exe -I "你的完整图片URL"
curl.exe -I "你的完整图片URL"
```

第二次看到 `HIT` 就正常。

## 为什么浏览器里可能一直看到 MISS

Chrome DevTools 里如果显示：

```text
200 OK（来自内存缓存）
```

说明这次图片没有重新请求 Cloudflare，而是浏览器直接用了本地缓存。此时你看到的 `CF-Cache-Status: MISS` 可能只是第一次请求留下来的旧响应头。

建议这样测：

1. 打开 Chrome DevTools。
2. 进入 Network。
3. 勾选 `Disable cache`。
4. 刷新页面两次。
5. 或者直接用 `curl.exe -I` 测同一个图片地址。

## 常见报错

### Write all resources 还是不够

如果部署时报：

```text
missing User->Memberships->Read
Authentication error [code: 10000]
```

说明 token 看起来权限很大，但缺少 Wrangler 需要读取的用户成员权限。

解决办法：重新创建 token，并加上：

```text
User -> Memberships -> Read
```

### Custom Domain 报错

如果看到：

```text
Wildcard operators (*) are not allowed in Custom Domains
Paths are not allowed in Custom Domains
```

说明 `wrangler.toml` 写成了路径或通配符。

把：

```text
cdn.example.com/image/*
```

改成：

```text
cdn.example.com
```

### 部署成功但图片还是 notion.so

先检查环境变量：

```text
NEXT_PUBLIC_NOTION_HOST=https://cdn.example.com
```

然后重新部署博客。

静态站尤其容易漏这一步。静态 HTML 是构建时生成的，所以必须重新 `yarn export`。

### 访问 cdn 域名首页是 404

这是正常的。

这个 Worker 只处理：

```text
/image/...
/images/...
```

直接打开：

```text
https://cdn.example.com/
```

没有图片路径，所以会返回 `404`。

## 为什么不直接缓存 Notion 签名后的地址

Notion 图片大致是这个流程：

```text
www.notion.so/image/...
-> Notion 生成临时签名地址
-> prod-files-secure.s3... 带 exp 和 sig 的地址
-> 图片内容
```

`exp` 和 `sig` 是临时签名，会变化。它们适合临时访问，不适合当作博客长期缓存地址。

这个 Worker 缓存的是你自己的稳定入口：

```text
https://cdn.example.com/image/...
```

所以同一篇文章里的同一张图，可以更稳定地命中 Cloudflare 缓存。

## yarn start 和 yarn export 都支持吗

支持。

`yarn start` 是动态部署。只要运行环境里有：

```text
NEXT_PUBLIC_NOTION_HOST=https://cdn.example.com
```

页面生成时就会输出 CDN 图片地址。

`yarn export` 是静态导出。只要导出时已经配置这个变量，生成出来的 HTML 里也会是 CDN 图片地址。

区别只有一个：

| 部署方式 | 改完变量后要做什么 |
| --- | --- |
| `yarn start` | 重启服务 |
| `yarn export` | 重新导出并上传 |

## 访问量很大够用吗

每次图片请求都会先经过 Worker。

粗略估算：

```text
每天图片请求数 = 每天 PV x 每页平均图片数
```

例如：

```text
10,000 PV/day x 20 张图 = 200,000 requests/day
```

如果你的站点访问量很大，建议直接使用 Workers Paid。先用 Worker 反代是门槛最低、见效最快的方案；等图片请求量持续很高，再考虑把热门图片迁移到 R2 或其他对象存储。

## 最小维护建议

- CDN 域名只用于 Notion 图片。
- 不要把 Cloudflare API Token 放到前端代码。
- 不要把 token 提交到 GitHub。
- 改 Worker 代码后，重新执行 `npx wrangler deploy`。
- 改 CDN 域名后，同步修改 `NEXT_PUBLIC_NOTION_HOST`，并重新部署博客。

# 在线生成服务部署

网页的「添加一集，学会 50 个表达」通过此服务查字幕、调用 AI，再导入牌组。GitHub Pages 继续托管网页；AI 密钥放在独立的服务端。`gbro-series-vocab` 已下载至 `vendor/gbro-series-vocab/`，原许可证保留。这里按其筛选原则实现了可运行的网页服务，并扩展电影和精读讲解；原 Skill 本身只支持剧集。

## 需要准备

- 一个 Cloudflare 账号，用 Workers 托管本目录的服务。
- 一个支持 `POST /chat/completions` 的 AI 接口、API 密钥和可用模型名称，例如 OpenAI 或 DeepSeek 的兼容接口。Codex / ChatGPT 登录不能代替此 API 密钥；费用和额度取决于所选服务。
- 本机安装 Node.js。网页学习不需要安装；部署服务时才需要。

## 一次性配置

在此项目根目录终端运行：

```powershell
cd generator
npx wrangler login
```

编辑 `wrangler.toml` 中的公开配置：

```toml
[vars]
ALLOWED_ORIGINS = "https://3280053419w-cloud.github.io"
AI_BASE_URL = "https://api.openai.com/v1"
AI_MODEL = "填入你账号支持的模型名"
AI_MAX_TOKENS = "8192"
```

`AI_BASE_URL` 是 API 基础地址，不是聊天网页，也不要以 `/chat/completions` 结尾。OpenAI 的基础地址为 `https://api.openai.com/v1`；DeepSeek 可使用其官方兼容基础地址 `https://api.deepseek.com`。第三方兼容服务填写供应商给出的地址和精确模型名。默认开启 JSON 输出；仅当供应商不支持 `response_format` 参数时设 `AI_JSON_MODE = "false"`。模型需要有足够的上下文和至少 8K 输出能力；容量不足会停止导入并提示，不会凑数。

OpenAI 官方接口默认使用 `max_completion_tokens`，其他兼容服务默认使用 `max_tokens`。第三方网关若要求不同参数，可设置 `AI_TOKEN_PARAMETER = "max_completion_tokens"` 或 `"max_tokens"`。`AI_MAX_TOKENS` 支持 2048—32768，实际值还需在模型允许范围内；推理模型需为推理与最终 JSON 一起预留输出空间。

在终端逐项设置秘密，按提示输入，不要写进网页、Git 仓库或聊天：

```powershell
npx wrangler secret put AI_API_KEY
npx wrangler secret put APP_TOKEN
npx wrangler deploy
```

`APP_TOKEN` 请自行生成至少 16 个字符的随机访问口令，与 AI 的 API Key 不同。生成服务要求每次请求携带口令，避免公开网页任意调用你的额度。可启用 `wrangler.toml` 末尾的速率限制绑定；有多个使用者时建议启用。将服务只授权给实际使用的网页域名，不使用 `*`。

部署成功后会得到 `https://series-vocab-generator.<你的子域>.workers.dev` 类似地址。打开网页「连接生成服务」：填入该地址和 `APP_TOKEN`，点击「连接并检查」。**不要将 AI_API_KEY 填在网页里。** 在其他手机或电脑上也各连接一次；访问口令只存在当前标签页会话中，关闭会话后可能需要重新填写。

如网页托管域名改变，修改 `ALLOWED_ORIGINS`，多个来源用英文逗号分隔。它只填写域名来源（协议、域名、端口），不含 `/series-vocab-cards/` 路径。本地调试可额外授权具体的 `http://127.0.0.1:端口`；正式配置不必开放本地来源。

## 日常使用

1. 选择剧集或电影，填写片名。剧集输入季和集，电影按整部提取 50 句；同名作品填写年份，建议使用英文片名。
2. 点击「生成并添加 50 句」，等待实际步骤提示。通常会进行一次筛选和五批用法讲解请求；中文片名会多一次名称确认。不要连续重复提交。
3. 完成后点「开始精读」。新牌组支持原有精读、精听、四档记忆复习和原声字幕定位。
4. 找不到公开字幕时，展开「找不到字幕时」，选择同版本完整英文 SRT / VTT / TXT，确认季集相符后再生成。字幕会发送给配置的生成服务与 AI 服务；服务不把整集字幕写入词汇包。
5. 新牌组和进度保存在当前设备的浏览器，并非云同步。用「导出词汇包」跨设备分享 50 句；用设置中的 JSON 备份连同学习记录一起迁移。支持 Anki CSV 导出。

每个浏览器最多保存 30 集自建牌组，实际容量还受浏览器限制。在设置中删除仅隐藏牌组；已隐藏的自建牌组还可点「彻底删除」释放空间，先备份再操作。

## 校验与失败处理

- 所选 50 句逐条匹配来源字幕，检查原句重复、填空目标、句中单词和完整讲解。模型生成的解释仍需结合原声理解，生活例句为 AI 原创，不冒充剧集台词。
- 不会从任意网页搜索后猜造台词。自动查找使用 Springfield 和 subslikescript；字幕来源限制、同名版本不明确或短片素材不足时会要求提供字幕。
- 取消、超时、AI 输出截断、数量不足或校验失败时，不导入半成品。已发送的 AI 请求可能已计入供应商额度。
- 服务不会保存账号密钥到浏览器备份，也不会持久化整集字幕。主机与 AI 供应商各自的数据政策仍适用。
- 401：检查网页访问口令；503：检查服务端的三个 AI 变量；额度不足或限流：稍后重试；跨域失败：核对 `ALLOWED_ORIGINS` 和 HTTPS 服务地址。

## 开发验证

从项目根目录运行（无额外测试依赖）：

```powershell
node tests/integrity.test.cjs
node tests/generator.test.mjs
```

生成链路单测使用合成字幕和模拟 AI 响应，不消耗额度。真实模型生成需要自己的服务密钥；未配置时不能声称已验证生成质量。原项目还做了浏览器中的生成、取消、导入导出、备份恢复和手机布局检查。

参考：[原 Skill](https://github.com/pyang5166/gbro-series-vocab)、[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[DeepSeek API](https://api-docs.deepseek.com/)、[Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

# Third-party notices

This repository redistributes or derives from the following third-party works.
All original project code in this repository (`index.js`, `client.js`, the
bundle patch, locale files, icon) is licensed under the MIT license in
[LICENSE](LICENSE).

## DeepSeek chat-demo

- Source: <https://github.com/deepseek-ai/chat-demo>
- Version: **v0.1.4** (commit `cdf9617c5f265d58e0e1805635b2c10a3d41284d`)
- License: **MIT**
- Copyright: DeepSeek
- How it is included here:
  - `patches/chat-demo-dsh.patch` — the source modifications this plugin
    applies to the upstream chat-demo checkout (model selection, shared-config
    bootstrap, per-model capability gating, theme/locale bootstrap).
  - `dist/` — a prebuilt static site produced from that patched source
    (`CHAT_DEMO_API_ORIGIN=/chat-demo/api`). The upstream MIT license text is
    preserved in [`dist/LICENSE`](dist/LICENSE) and
    [`third_party/chat-demo/LICENSE`](third_party/chat-demo/LICENSE).
- The patch does not relicense the upstream work; the upstream MIT notice and
  permission notice apply to all derived portions.

## Front-end dependencies bundled into `dist/`

`dist/` is the upstream chat-demo production build, so it also contains that
project's bundled front-end dependencies. Their versions and complete license
declarations live in the upstream repository's `package.json` /
`pnpm-lock.yaml` at the version above. The principal licenses are:

| Dependency family | License |
| --- | --- |
| React, React DOM | MIT |
| KaTeX (+ fonts) | MIT |
| Mermaid | MIT |
| Prism.js | MIT |
| zustand | MIT |
| fflate | MIT |
| clsx | MIT |
| micromark / mdast utilities | MIT |
| idb | ISC |

If you redistribute a build, keep the upstream notices and obtain the verbatim
license texts from the upstream repository or the corresponding npm packages
if your distribution policy requires them.

## DeepSeek Harness (DSH)

This plugin runs inside the DeepSeek Harness Web UI and integrates with its
published plugin/runtime interfaces. It does **not** bundle, copy, or
redistribute DeepSeek Harness code. DSH is a separate product distributed
under its own license (the published `@deepseek-ai/dsh` package declares MIT).

## Trademarks

“DeepSeek”, “DeepSeek Harness”, and related names and logos are used only to
identify the software being integrated. This repository is an unofficial,
community-built integration and is **not affiliated with or endorsed by
DeepSeek**.

## Credentials and personal data

This repository contains **no API keys, account tokens, cookies, passwords, or
personal data**. The plugin resolves credentials at runtime from the user's
local DSH installation and proxies the user's own chat requests to the API
endpoint already configured there. Nothing is collected or transmitted by this
repository's code beyond those user-initiated requests.

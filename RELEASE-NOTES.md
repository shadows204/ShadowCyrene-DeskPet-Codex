# ShadowCyrene 0.5.1

修复 macOS 打开时提示“已损坏”的签名问题。

- 0.5.0 在修改 Electron 名称与资源后未重新签名，原始签名失效。0.5.1 对 macOS arm64/x64 重新进行本地签名并封装完整资源。
- 构建后和最终 ZIP 解压后都必须通过 `codesign --verify --deep --strict`，否则停止发布。
- 保留 0.5.0 的文件/图片附件、五种语言、托盘、目光跟随与跑步动画功能。

**签名范围：**这是有效的 ad-hoc 本地完整性签名，不是 Developer ID 签名，也没有 Apple 公证。通过互联网下载后，仍可能需要在「系统设置 → 隐私与安全性 → 仍要打开」中单独允许本应用。无需关闭全局安全保护。详见 [Apple 官方说明](https://support.apple.com/en-us/102445)。

| 文件 | 平台 |
| --- | --- |
| `ShadowCyrene-0.5.1-macOS-arm64.zip` | Apple Silicon Mac |
| `ShadowCyrene-0.5.1-macOS-x64.zip` | Intel Mac |
| `ShadowCyrene-0.5.1-Windows-x64.zip` | Windows 10/11 x64，完整解压后运行 |
| `ShadowCyrene-0.5.1-source.zip` | 完整源码与素材 |
| `ShadowCyrene-0.5.1-plugin-installer.zip` | 配套插件安装包，macOS / Windows |
| `SHA256SUMS.txt` | 文件校验 |

macOS Apple Silicon 本机验证；Intel Mac 和 Windows x64 完成构建及包内容检查，未做目标机器实测。个人非官方同人作品，与 OpenAI、HoYoverse 无隶属或赞助关系。

**配套插件：**应用内已自带插件与安装入口，右键人物 → 安装／更新配套检测插件。独立 ZIP 方便分发，复用已安装桌宠的运行环境，无须额外安装 Node。详见 [插件安装说明](https://github.com/shadows204/ShadowCyrene-DeskPet-Codex/tree/main/plugin-installer-kit)。

# ShadowCyrene 配套检测插件安装包

需要已安装的 **ShadowCyrene 0.5.1 或更新版本**。此包复用桌宠自带运行环境与插件实现，无须另外安装 Node。不会包含或复制你的登录凭据。

## 推荐：在桌宠里安装

右键人物 → **安装／更新配套检测插件…**。应用已内置安装功能，不需手动选择或下载这个 ZIP。安装后，在官方客户端刷新插件或启动新会话，让 **ShadowCyrene** 检测插件实际加载。

## 单独安装

1. 解压本安装包；先打开一次桌宠并在“连接设置”中确认官方 Codex CLI 可用。
2. macOS：双击 `Install-ShadowCyrene-Plugin.command`，自动寻找应用程序目录中的桌宠。自定义位置可在终端运行 `bash Install-ShadowCyrene-Plugin.command /完整路径/ShadowCyrene.app`。
3. Windows：运行 `Install-ShadowCyrene-Plugin.cmd`。未自动发现时，输入 `ShadowCyrene.exe` 的完整路径；也可将该 EXE 拖到 CMD 安装脚本上。
4. 安装成功后刷新官方客户端的插件，或启动新会话加载。

安装器会使用桌宠内的 `plugin-installer.cjs`，按本机应用位置生成完整 MCP 配置，注册 `shadowcyrene-local` 来源和 `shadowcyrene-bridge`。**不是把本 ZIP 直接作为插件导入。** 程序移动后请重新安装／更新，以修正路径。

插件只检测桌宠是否在线，不读取聊天，也不自动发消息。直发还需官方客户端运行以及本机账户连接就绪。Windows 脚本尚未真机验证。

## English

Install ShadowCyrene 0.5.1+ first. The recommended path is the pet's context menu → **Install / update detection plugin…**. This ZIP is an optional installer kit; it uses the desktop app's bundled runtime and requires no separate Node installation.

Run the `.command` file on macOS or `.cmd` on Windows. Refresh plugins in the official client, or open a new session, to load the installed plugin. It provides presence detection only and does not read conversations or send messages. Windows has not been device-tested.

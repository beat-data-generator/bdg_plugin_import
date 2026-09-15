# Beat Data Generator 插件系统

插件用于扩展踩点编辑器:导入/导出新格式、数据生成与批量编辑、侧栏浮动静默面板、
自定义快捷键、独立预览窗口,以及针对特定游戏新增“类型化轨道”(如翻转事件),
它们与内置踩点共用同一条节拍时间轴。

## 插件形态

插件是一个文件夹,内含:

```
my-plugin/
├─ manifest.json    # 元信息(必需)
├─ main.js          # 可选:主进程入口(全 Node + Electron 权限)
├─ renderer.js      # 可选:编辑器页面内执行的脚本(注册 UI 贡献)
└─ …                # 插件自带的 HTML/静态资源
```

扫描目录:

- 用户目录 `<userData>/plugins`(设置页可一键打开);
- 开发模式下同时扫描项目根目录的 `plugins/`(示例插件放这里)。
- manifest 解析失败的插件会列在设置中并显示错误,不影响其余插件。

### manifest.json

```json
{
  "id": "dev.bdg.example-basic",
  "version": "0.1.0",
  "name": { "zh": "示例插件", "en": "Example Plugin" },
  "description": { "zh": "…", "en": "…" },
  "main": "main.js",
  "renderer": "renderer.js"
}
```

`name`/`description` 可为字符串或 `{ zh, en }`。`id` 建议反向域名风格且**不得含冒号 `:`**。

## renderer.js(UI 侧)

`renderer.js` 是普通脚本,通过全局注册函数声明入口。类型提示:

```js
/// <reference path="plugin-api.d.ts" />
window.__bdgPluginRegister(function activate(api) {
  // 在此注册所有贡献(见 PluginApi 类型)
  return function dispose() {
    // 卸载清理(取消订阅等)
  };
});
```

可以注册的贡献:

- `api.ui.registerAction({ label, run })` → 出现在顶部「插件」菜单;
- `api.ui.registerPanel({ id, title, mount })` → 浮动静默窗口(可拖动、右下角可缩放),`mount(hostEl)` 里用 DOM 自由渲染,返回可选清理函数;返回 `PanelHandle` 可 `open()/toggle()` 等;
- `api.ui.registerShortcut({ id, label, combo, run })` → `combo` 形如 `Alt+1`、`Ctrl+Shift+F`;
- `api.ui.registerImporter({ label, run })` → 出现在「文件 → 导入…」;
- `api.ui.registerExporter({ label, run })` → 出现在「导出」菜单的“插件导出”分组;
- `api.trackTypes.register({ id, trackName, pointName, color?, fields })` → 新增类型化轨道,侧栏 `＋` 可创建,点在属性卡里编辑字段。

## main.js(主进程侧)

在主进程加载,拥有完整 Node / Electron:

```js
module.exports = function activate(ctx) {
  ctx.log("loaded", ctx.dir);
  ctx.registerHandler("ping", () => "pong");
  ctx.onDispose(() => {});
};
```

渲染进程用 `api.callMain(method, ...args)` 调本插件注册的处理器。`activate` 需保持同步。

## 数据与工程文件

- 快照:`api.project.snapshot()` 一次给出节拍视角与 `timeMs` 时间视角(见字段)。
- 编辑一律走 `api.project.edit.*`,自动计入撤销栈;多步编辑用 `edit.batch(fn)` 合并为一次撤销。
- 类型化轨道:轨道带 `type: "<pluginId>:<localId>"`;点带 `attrs`,字段默认值在放置/粘贴时自动补齐,或由插件用 `setMarkerAttrs` 修改。
- 内置导出(.txt / EDL / 踩点指示灯)**不**包含类型化轨道;插件导出自行读取。
- `.bdg` 直接存 `type` + `attrs`,字段全可选、向后兼容。若保存的工程含某插件类型而该插件未安装:轨道与数据照常显示(点属性只读),属性卡提示需要安装对应插件。

## 渲染↔系统能力

编辑器渲染层是沙箱(`sandbox:true` + `contextIsolation`)。插件拿到的是受限桥接:

- 数据/编辑/播放/选区/事件、`api.system.pickFile/saveFile/readText/writeText`、`openWindow(加载任意页面)`、`api.system.audioPath()`(当前加载音频的绝对路径，便于 main.js 用 Node 读取并打包)、`callMain`;
- 需要任意 Node 能力时让插件自带 `main.js` 处理。本系统**不弹权限确认**,安装插件即视为信任。

## 示例

`plugins/example-basic` 覆盖:面板、动作、快捷键、导入/导出、main 往返调用、类型化轨道注册。
开发时把工程目录当扫描根即可(见上),发布则把插件放入 `<userData>/plugins`。

## 常用命令

```bash
npm run typecheck   # 改动编辑器代码后跑类型检查
npm run build
```

## 许可与发布

- 你编写的插件属于你自己的作品(版权归你),可自行选择开源协议。
- 宿主编辑器 **Beat Data Generator** 以 **GNU GPL v3** 发布(作者 BUGJI)。插件由宿主加载器装载运行,分发插件时建议注明与宿主的关联。
- 官方插件模板/脚手架见 <https://github.com/BUGJI/bdg_plugin_template>。

# Wayline World

Wayline World 是一个 world-first 的 Hugo 主题。首页本身就是不可退出的 3D 世界，文章、长期时间线、影像与履历都在这套空间界面中展开；其他页面才使用普通 HTML 布局。

## 特性

- 连续弯道、山体、树木、路桩和白天 HDR 环境；
- 车辆贴地、道路边界约束、加速、转向和触屏驾驶；
- 文章、影像和关于三种空间时间线；
- 节点标题提示、点击直接阅读、`Q` 退出正文；
- 标签徽章结算和本地收藏；
- 首页就是全屏 3D 世界，没有退出按钮，也不能通过 `Esc` 或点击背景关闭；
- 普通 Hugo 页面继续作为内容页和二次入口；
- 独立打包 Three.js 场景、模型和 HDR，不依赖外部 CDN。

## 安装

```bash
git clone <this-repository> themes/wayline-world
npm install three
```

在站点配置中启用：

```yaml
theme: wayline-world

params:
    world:
        enabled: true
```

主题需要三类内容来源：

```text
content/
├── posts/          # 归档时间线
├── gallery/        # 可选影像时间线
├── page/about/     # 结构化履历
└── world/index.md  # JSON 输出入口
```

`content/world/index.md`：

```yaml
---
title: World data
layout: world
outputs: [json]
build:
  render: always
  list: never
---
```

## 本地示例

```bash
cd exampleSite
npm install
hugo server --themesDir ../..
```

## 配置

```yaml
params:
    world:
        enabled: true
        brand: WAYLINE WORLD
        codename: FIELD NOTE / 01
        introTitle: 沿着道路，<br>读取散落在世界里的故事。
        intro: 驾驶、靠近节点，然后进入阅读。
    gallery:
        enabled: true
        source: gallery
```

首页始终是全屏 3D 世界。普通页面的 `3D WORLD` 按钮仍然是入口。

## 操作

- `WASD` / 方向键：驾驶和转向；
- `Shift`：加速；
- `E` / `Enter`：阅读当前节点；
- `Q` / `Escape`：退出正文；
- 拖拽：旋转镜头；
- 滚轮：缩放；
- 移动端：使用左下角触屏按钮。

更完整的功能拆解见 [docs/FEATURES.md](docs/FEATURES.md)。

主题内部职责和扩展点见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 许可

主题代码采用 MIT。第三方 3D 模型与 HDR 环境许可见 [THIRD_PARTY.md](THIRD_PARTY.md)。

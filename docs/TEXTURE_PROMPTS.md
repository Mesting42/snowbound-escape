# 材质生成记录

2026-10-24，使用内置 `image_gen.imagegen` 工具生成，未使用 CLI 或外部 API 密钥。三张输出均已复制到项目内 `public/textures/`，正式游玩只读取本地文件。原图保留在 Codex 生成目录中，未删除。

## snow.png

```text
A seamless square game albedo texture of pristine wind-packed alpine snow, overhead orthographic macro surface only. Ivory white with extremely subtle icy blue fine crystalline grain and small soft wind ripples. Low contrast, no cast shadows, no objects, no scenery, no border, no text. Bright stylized natural hand-painted material for an elegant 3D skiing game, visually quiet, perfectly tileable.
```

## wood.png

```text
A seamless square game albedo texture of warm weathered alpine cabin larch timber. Overhead orthographic flat material only, softly painted detailed organic lengthwise grain and occasional tiny knots, honey tan and muted walnut, medium-low contrast, no boards separation, no nails, no perspective, no shadows, no objects, no text, no border. Beautiful natural stylized material for a bright 3D snow adventure, perfectly tileable.
```

## stone.png

```text
A seamless square game albedo texture of alpine granite rock, cool desaturated blue gray and sage gray, softly painted small mineral flecks and restrained mottling, low contrast. Orthographic top-down flat surface only, no objects, no rock silhouettes, no scenery, no perspective, no cast shadows, no text or border. Natural yet stylized 3D game material, perfectly tileable.
```

## 实际使用

`render/models.ts` 缓存 TextureLoader 结果，根据雪、木、岩石材质类型分配本地图和低强度凹凸；`render/world.ts` 为地面和侧壁按米制坐标展开 UV，避免拉伸。纹理共用、开启 mipmap 与受限各向异性过滤；不在每帧重新创建位图。

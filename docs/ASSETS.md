# 原创素材说明

本项目没有外部下载的游戏模型、完整游戏模板或商业游戏素材。

| 资源                                 | 制作方式                                                   | 源文件                                        |
| ------------------------------------ | ---------------------------------------------------------- | --------------------------------------------- |
| 滑雪者、关节动画、四套服装、三种双板 | 原创 Three.js 连续衣身网格、分组几何与关节驱动 | src/render/models.ts、skier-rig.ts、skier-appearance.ts |
| 雪獭、牦牛、雪鸮、机车、风帆雪橇     | 原创三维几何、配色和动作                                   | src/render/models.ts                          |
| 山体、积雪、松林、冰壁、建筑与设施   | 连续网格、曲面、实例化与原创组合                           | src/render/world.ts                           |
| 路线、障碍、雪晶、路牌               | 原创模型，与物理数据一一关联                               | src/render/world.ts、systems/terrain.ts       |
| 实心功能图标与应用图标               | 原创 SVG 路径                                              | src/ui/icons.ts、public/favicon.svg           |
| 音乐与音效                           | 本地 WebAudio 振荡器、滤波噪声和原创旋律组合               | src/systems/audio.ts                          |
| 中文字体                             | Noto Sans SC 字符子集，SIL Open Font License 1.1           | public/fonts/OFL.txt                          |
| 雪 / 木 / 岩石材质                   | 内置 imagegen 制作的原创可平铺 PNG，实际用于材质贴图与凹凸 | public/textures/snow.png、wood.png、stone.png |

程序化模型是正式游戏素材，可离线重建与修改；不属于等待替换的占位素材。场景最终绘制、碰撞和动画都由这些素材实际承担。三张材质由内置 imagegen 工具生成，复制到项目后本地加载；运行时不使用生成服务。提示词见 [材质生成记录](TEXTURE_PROMPTS.md)。

字体制作脚本只在开发阶段联网，交付产物自带四种字重。`public/fonts/snow-sans.woff2` 为早期生成的字体子集，目前 CSS 使用 snow-400 / 600 / 800 / 900；可保留作为源素材，不在运行时请求。

静态产物同时保留 `THREE-LICENSE.txt`（Three.js MIT 许可）及 `fonts/OFL.txt`（字体许可），随部署文件一起分发。

四套人物装备的帽子、衣身、行囊和配件均为独立几何造型，共享原旅行者骨架。素材仍由本项目原创代码生成，本轮未引入外部角色资产；具体见 [人物外观升级](OUTFIT_MODELS.md)。

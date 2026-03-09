# 命理页面接口文档

## 1. 文档范围

本文档整理当前小程序命理模块实际使用到的后端接口，基于以下代码梳理：

- `pages/matches/index.js`
- `pages/soul-analysis/index.js`
- `pages/soul-match-detail/index.js`
- `pages/dayun-analysis/index.js`
- `utils/userProfile.js`
- `xiaochengxu_backendserver/dating-app-backend/src/routes/index.ts`
- `xiaochengxu_backendserver/dating-app-backend/src/controllers/baziController.ts`
- `xiaochengxu_backendserver/dating-app-backend/src/controllers/murronProxyController.ts`
- `xiaochengxu_backendserver/dating-app-backend/src/controllers/userController.ts`

说明：当前 `pages/soul-match/index.js` 只是选择对象页面，暂时没有直接请求后端接口；真正发起合盘请求的是 `pages/soul-match-detail/index.js`。

## 2. 基础信息

- 接口基础前缀：`https://api.halfdestiny.com/api`
- 鉴权方式：`Authorization: Bearer <token>`
- 返回格式：大部分接口统一为：

```json
{
  "success": true,
  "data": {},
  "message": ""
}
```

- 失败时通常为：

```json
{
  "success": false,
  "message": "错误信息"
}
```

## 3. 页面与接口对应关系

| 页面 | 接口 |
| --- | --- |
| 命理首页 `pages/matches` | `GET /user/profile` |
| 命理首页 `pages/matches` | `POST /bazi/calculate` |
| 命理首页 `pages/matches` | `GET /bazi/review-status` |
| 命理首页 `pages/matches` | `POST /bazi/murron-analysis` |
| 高阶灵魂共振结果页 `pages/soul-analysis` | `POST /bazi/murron-analysis` |
| 灵魂合盘详情页 `pages/soul-match-detail` | `POST /bazi/murron-compatibility` |
| 十年大运页 `pages/dayun-analysis` | `POST /bazi/murron-dayun` |

## 4. 接口明细

### 4.1 获取当前用户资料

- 路径：`GET /user/profile`
- 是否鉴权：是
- 页面用途：命理首页初始化时恢复生日、出生地等资料缓存；如果本地缓存丢失，会重新从服务端恢复。
- 对应后端：`src/controllers/userController.ts` -> `getProfile`

#### 请求头

```http
Authorization: Bearer <token>
Content-Type: application/json
```

#### 请求参数

无。

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "id": "6",
    "username": "test_user",
    "nickname": "半缘",
    "gender": "female",
    "birth_date": "1995-01-01T00:00:00.000Z",
    "hometown": "广东 深圳",
    "intro": "你好",
    "avatar_url": "https://api.halfdestiny.com/uploads/a.jpg",
    "photos": [
      {
        "id": "p1",
        "url": "https://api.halfdestiny.com/uploads/a.jpg",
        "is_primary": true
      }
    ]
  }
}
```

#### 页面实际关注字段

- `data.id`
- `data.username`
- `data.nickname`
- `data.gender`
- `data.birth_date`
- `data.hometown`
- `data.avatar_url`
- `data.photos`

#### 备注

- 命理页是否要求重新填写生日，已经不应只依赖本地缓存，而是会回源此接口恢复。
- 若该接口返回的 `birth_date` 为空，命理页会判定为还未填写生日信息。

---

### 4.2 计算八字

- 路径：`POST /bazi/calculate`
- 是否鉴权：是
- 页面用途：命理首页根据生日、时辰、性别计算八字基础信息。
- 对应后端：`src/controllers/baziController.ts` -> `calculate`

#### 请求体

```json
{
  "year": 1995,
  "month": 1,
  "day": 1,
  "hour": 0,
  "gender": "female"
}
```

#### 字段说明

- `year`: 出生年，必填
- `month`: 出生月，必填
- `day`: 出生日，必填
- `hour`: 出生小时，选填，范围 `0-23`，非法时后端会回退为 `12`
- `gender`: `male` 或 `female`

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "id": "bazi-id",
    "user_id": "6",
    "year_pillar": "甲戌",
    "month_pillar": "丙子",
    "day_pillar": "壬辰",
    "hour_pillar": "庚子",
    "element": "水",
    "report": "...完整八字报告文本...",
    "created_at": "2026-03-09T08:00:00.000Z"
  }
}
```

#### 页面实际关注字段

- `data.year_pillar`
- `data.month_pillar`
- `data.day_pillar`
- `data.hour_pillar`
- `data.element`
- `data.report`

#### 业务说明

- 该接口除了返回八字结果，还会尝试向 `admin-backend` 提交一条 `bazi_review` 审核任务。
- 即使提交审核任务失败，八字计算本身仍可能返回成功，但日志会出现：
  - `[Bazi Controller] Failed to submit to admin-backend: ...`

#### 常见错误

- `400 Please provide valid birth date`
  - 年月日缺失或非法。
- `401 Unauthorized`
  - token 无效或未登录。
- `500 <message>`
  - 八字计算内部异常。

---

### 4.3 获取八字审核状态

- 路径：`GET /bazi/review-status`
- 是否鉴权：是
- 页面用途：命理首页判断用户八字是否审核通过；未通过时限制进入高阶分析、灵魂合盘、大运分析等能力。
- 对应后端：`src/controllers/murronProxyController.ts` -> `getReviewStatus`
- 实现方式：`dating-app-backend` 作为代理，再请求 `admin-backend` 内部接口。

#### 请求参数

无。

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "bazi_review": {
      "status": "approved",
      "reviewed_data": {
        "day_pillar": "壬辰",
        "hour_pillar": "庚子",
        "current_luck_pillar": "乙亥"
      },
      "day_pillar": "壬辰",
      "hour_pillar": "庚子",
      "current_luck_pillar": "乙亥"
    },
    "education": null,
    "company": null,
    "real_name": null
  }
}
```

#### 页面实际关注字段

- `data.bazi_review.status`

#### 状态含义

- `approved`: 审核通过
- `pending`: 审核中
- `rejected`: 审核拒绝
- `null` 或缺失：前端通常按未通过或待审核处理

#### 常见错误

- `500 审核服务暂不可用`
  - 一般表示 `admin-backend` 没起来，或内部查询函数报错。

---

### 4.4 获取高阶灵魂共振分析

- 路径：`POST /bazi/murron-analysis`
- 是否鉴权：是
- 页面用途：
  - 命理首页加载“灵魂共振”摘要
  - 高阶灵魂共振结果页展示完整分段内容
- 对应后端：`src/controllers/murronProxyController.ts` -> `getPersonalAnalysis`
- 实现方式：代理 `admin-backend` 的命理分析服务，并按用户解锁状态裁剪返回字段。

#### 请求体

无。

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "bazi": "女嘉宾：年柱：甲戌，月柱：丙子，日柱：壬辰，时柱：庚子。",
    "cached": true,
    "sections": {
      "basicInfo": "...基础信息...",
      "characterAnalysis": "...人物分析...",
      "partnerProfile": "...伴侣画像...",
      "fortune2026": "...2026 运势..."
    },
    "unlocked": {
      "partner_profile": true,
      "compatibility": false,
      "fortune_2026": false
    },
    "locked": {
      "partner_profile": false,
      "fortune_2026": true
    }
  }
}
```

#### 页面实际关注字段

- `data.sections.basicInfo`
- `data.sections.characterAnalysis`
- `data.sections.partnerProfile`
- `data.sections.fortune2026`
- `data.unlocked`
- `data.locked`

#### 业务说明

- 后端会根据用户权益表 `entitlements` 判断是否返回付费内容。
- 当前接口始终会返回：
  - `sections.basicInfo`
  - `sections.characterAnalysis`
- 只有解锁后才会返回：
  - `sections.partnerProfile`
  - `sections.fortune2026`

#### 常见错误

- `500 命理分析服务暂不可用，请稍后再试`
- 也可能透传 `admin-backend` 的具体报错信息。

---

### 4.5 获取灵魂合盘分析

- 路径：`POST /bazi/murron-compatibility`
- 是否鉴权：是
- 页面用途：灵魂合盘详情页展示两人合盘报告。
- 对应后端：`src/controllers/murronProxyController.ts` -> `getCompatibilityAnalysis`

#### 请求体

```json
{
  "target_user_id": "18"
}
```

#### 字段说明

- `target_user_id`: 目标用户 ID，必填

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "cached": false,
    "sections": {
      "compatibility": "### 合盘总评\n...完整合盘文本..."
    },
    "unlocked": {
      "partner_profile": true,
      "compatibility": true,
      "fortune_2026": false
    }
  }
}
```

#### 页面实际关注字段

- `data.sections.compatibility`

#### 常见错误

- `400 请指定合盘对象`
  - 没传 `target_user_id`
- `402 需要解锁灵魂合盘报告`
  - 用户未购买/未解锁 `compatibility`
- `500 合盘分析服务暂不可用，请稍后再试`

#### 备注

- 当前 `pages/soul-match/index.js` 还没有对接真实候选用户接口，选择对象页仍是静态数据。
- 真正调用合盘接口的是 `pages/soul-match-detail/index.js`。

---

### 4.6 获取十年大运分析

- 路径：`POST /bazi/murron-dayun`
- 是否鉴权：是
- 页面用途：十年大运页面展示完整的大运分析文本和当前大运柱。
- 对应后端：`src/controllers/murronProxyController.ts` -> `getDayunAnalysis`

#### 请求体

无。

#### 成功返回示例

```json
{
  "success": true,
  "data": {
    "fullText": "### 十年大运总览\n...完整文本...",
    "bazi": "女嘉宾：年柱：甲戌，月柱：丙子，日柱：壬辰，时柱：庚子。",
    "current_luck_pillar": "乙亥",
    "gender": "female",
    "cached": true
  }
}
```

#### 页面实际关注字段

- `data.fullText`
- `data.bazi`
- `data.current_luck_pillar`
- `data.gender`
- `data.cached`

#### 常见错误

- `500 十年大运分析服务暂不可用，请稍后再试`

## 5. 命理模块关键业务链路

### 5.1 命理首页初始化链路

1. 前端先尝试从本地缓存恢复生日和出生地。
2. 如本地缓存不足，则请求 `GET /user/profile` 回源恢复。
3. 有生日后，请求 `POST /bazi/calculate` 计算当前用户八字。
4. 然后请求 `GET /bazi/review-status` 获取审核状态。
5. 若 `bazi_review.status === approved`，再请求 `POST /bazi/murron-analysis` 获取高阶命理内容。

### 5.2 审核与展示关系

- 审核未通过时：
  - 命理首页可看到基础八字信息
  - 高阶灵魂共振、灵魂合盘、大运分析入口会被限制
- 审核通过时：
  - 可进入高阶命理分析能力
  - 再结合权益控制，决定是否展示付费段落

### 5.3 权益控制关系

`/bazi/murron-analysis` 和 `/bazi/murron-compatibility` 会结合 `entitlements` 表控制内容开放范围：

- `partner_profile`: 伴侣画像
- `compatibility`: 灵魂合盘
- `fortune_2026`: 2026 流年/运势内容

## 6. 当前代码现状备注

- `pages/matches/index.js` 实际依赖 `/user/profile` 来修复本地缓存丢失时重复要求填写生日的问题。
- `pages/soul-match/index.js` 当前仍是静态候选人数据，不是动态后端接口驱动。
- 命理相关 AI/审核能力实际由 `dating-app-backend` 代理到 `admin-backend`，所以很多 500 报错本质上是 `admin-backend` 或其下游服务异常。

## 7. 建议排查顺序

当命理页面报错时，建议按这个顺序排查：

1. 先看 `GET /user/profile` 是否返回了正确的 `birth_date`。
2. 再看 `POST /bazi/calculate` 是否成功。
3. 再看 `GET /bazi/review-status` 是否能正常返回审核状态。
4. 若高阶分析失败，再分别检查：
   - `POST /bazi/murron-analysis`
   - `POST /bazi/murron-compatibility`
   - `POST /bazi/murron-dayun`
5. 如果代理接口 500，再去看 `admin-backend` 服务和日志。


"res": "### 待分析原始数据\n- **主用户八字**：壬申年, 戊申月, 己巳日, 丙寅时\n- **性别**：女（根据“坤造”逻辑及八字排盘推算，壬申年女命逆行大运）\n- **观测年份**：2026年（丙午年）\n- **当前大运**：乙巳 
  大运（2019起运，目前处于该大运中后段）\n\n---\n\n# 



一、人物分析报告：【废墟之上的烈火玫瑰】\n\n## 1. 🔑 命局密码：寅巳申“三刑”的核反应堆\n你这组八字，是命理师看到都要深吸一口气的“高能预警”局。\n**能量底色： 
  ** 日主是**己土**（田园之土），生在初秋申月，金气极旺，泄气严重。好在你自坐“巳火”（羊刃/帝旺），时柱又有“丙火”高透。这叫“身弱用印”，你是典型的**必须靠火（资源、长辈、学历、思想）来续命**的格局。\n**核心结   
  构：** 你的地支集齐了**【寅、巳、申】三刑**。\n这在心理学上意味着你的内心世界是一个永不停歇的“核反应堆”。\n*   

**喜用神：** 【火】（绝对救命稻草）、【燥土】。\n*  

 **忌神：** 【金】（想太多、内耗）、【水】  
  （欲望过剩、迷失）。\n\n## 

2. 🎭 核心人设：高压锅里的“暴躁萝莉”\n* 

  **社交保护色（外在）：** 己土混杂着壬水，给人的第一印象是温润、包容、甚至有点“好欺负”的邻家姐姐。你表面上看起来很懂事，总是在倾听，总是在 
  妥协。\n* 

  **深层内核（内在）：** 你的地支全是“长生”位（寅申巳），且构成了极其激烈的“三刑”。你骨子里不仅不温顺，反而是个**极度叛逆、焦躁、甚至带有破坏欲**的狠角色。\n    *   **情绪过山车：** 你很难享受平   
  静。一旦生活太安逸，你的潜意识就会制造麻烦（Drama）。你极其聪明（伤官佩印），但这种聪明往往伴随着对他人的挑剔和对自己无能的愤怒。\n*  

 **专属判词：** 一个试图在在龙卷风中心搭建花园的勇士，一生都在与“不甘    
  心”三个字肉搏。\n\n## 

3. ⚔️ 核心矛盾：恩将仇报的“无恩之刑”\n你的命局最大的Bug就在于**【寅巳申三刑】**。\n*   **矛盾点：** 寅（官星/事业/男人）生巳（印星/自我），巳又去合克申（伤官/才华）。这三者本来可以循环，                                                                                                                                                                                                               
  但它们凑在一起打架。\n*   **现实表现：** 你容易遭遇“无恩之刑”。你对别人掏心掏肺（己土的包容），对方却觉得理所应当甚至反咬一口（申金的回克）。\n*   **精神内耗：** 你经常陷入“我想冲（寅）”、“我想稳（巳）”、“我
  想变（申）”的三角拉扯中。这让你在做决定时极度纠结，但一旦爆发又是不计后果的毁灭式决裂。\n\n##

 4. 💖 感情剧本：在“受虐”与“虐人”中寻找存在感\n*   **致命吸引力：** 你的夫星是“寅木”（正官），藏在时支。你喜欢的男
  人必须有才华、有冲劲、甚至有点大男子主义。\n*   **剧本走向：** 但因为“寅巳相刑”，你对伴侣的态度极其矛盾。\n    *   你渴望他强大（寅木生巳火），但他一强大，你又觉得他压制了你，于是你用“申金”（伤官）去攻击    
  他。\n    *   **相爱相杀：** 你的感情绝不是平淡如水的。你容易爱上那种让你“痛”的人，或者把一段好好的关系“作”到天翻地覆才觉得那是爱。\n    *   **结局：** 晚婚保平安。早婚极其容易因为性格不合、长辈干涉或两地分 
  居（驿马动）而崩盘。\n\n## 

5. 💰 财富变现：动中求财，靠“危机处理”暴富\n*   **财富源头：** 你的财星（壬水）虚浮，根气受损。说明你守不住死工资，也守不住现金。\n*   **最佳路径：**\n    *   **驿马催财：** 寅申巳
  全是大驿马。你必须“动”起来。出差、外派、旅游博主、贸易、物流，或者思想上的“动”（咨询、策划）。\n    *   **乱世佳人：** 三刑代表“纠纷”和“麻烦”。律师、外科医生、心理咨询师、危机公关——这些专门帮人解决“麻烦”的行
  业，不仅能让你发财，还能应验掉你命里的“刑伤”，让你在生活中少受罪。\n\n---\n\n# 



二、伴侣画像分析：【带刺的避风港】\n\n## 1. 心理底层逻辑\n*   **她想要的（寅木）：** 一个能引领她、甚至有点霸道、能替她做决定   
  的“精神领袖”。她慕强，且有轻微的受虐倾向（喜欢被管束的感觉）。\n*   **她表现出的（巳火）：** 极度的依赖，紧迫盯人，敏感多疑。因为日支坐羊刃，她对伴侣的控制欲极强，一旦对方脱离掌控，她会瞬间歇斯底里。\n\n##  
  2. 地支密码：在“刑冲”中寻找平衡\n日支【巳】是你的夫妻宫。\n*   **伴侣特征：** 对方长相不错（火主亮丽），性格热情、急躁，可能是家里的老二或老幺。他很聪明，但脾气和你一样大。\n*   **互动模式：** “寅巳相刑”意味
  着你们的沟通往往是从“讲道理”开始，以“互相指责不懂感恩”结束。他给你提供了情绪价值（火），但也给了你巨大的精神压力（刑）。\n\n## 3. 终极锁定\n*   **最佳适配：** **属鸡（酉）** 或 **属牛（丑）** 的男性。\n    *
  **原理：** 你的八字太乱了（寅巳申），急需一个强有力的合局来“镇”住。巳酉丑三合金局，能把你的夫妻宫（巳）合住，化解掉刑冲的戾气。\n    *   **避雷：** 绝对不能找 **属猪（亥）** 的人。亥水一冲巳火，直接把你命局 
  唯一的暖气冲散，那是灾难级的“水火不容”。\n\n---\n\n# 
三、灵魂合盘报告\n\n未提供合盘对象，本章节自动跳过。\n\n---\n\n# 


四、大运深度分析：【乙巳大运】（2019-2028）\n\n> **核心定义：** 这十年是你人生中**“自我重
  组”与“烈火炼金”**的十年。大运地支“巳”与你日支“巳”重叠（伏吟），且再次引动原局的“三刑”。\n\n## 💼 1. 事业剧本：在动荡中掌权\n*   **七杀透干（乙木）：** 乙木是你的七杀（压力/权柄/挑战）。这十年你野心勃勃，职场
  上会面临巨大的压力，但也伴随着权力的下放。你不再甘心做执行层，而是想做操盘手。\n*   **地支伏吟（双巳）：** 两个“巳火”引动了命局的“寅巳申三刑”。\n    *   **现实表现：** 工作变动极其频繁，或者长期处于出差、奔 
  波的状态。公司内部斗争激烈（三刑），你容易卷入是非口舌。但因为火旺助身，你往往能在混乱中胜出，甚至“踩着别人的失败上位”。\n    *   **建议：** 既然是大驿马运，就主动去跑动。不要试图在一个工位上坐稳，动起来才有
  财。\n\n## 💘 2. 感情剧本：伏吟之痛与修罗场\n*   **伏吟夫妻宫：** 大运“巳”是你夫妻宫的字，这叫“夫妻宫伏吟”。\n    *   **单身者：** 容易遇到那种“让你很上头，但过程极其虐心”的桃花。对方可能有家室，或者性格极不
  稳定。\n    *   **有伴者：** 这是感情的高危期。“三刑”加“伏吟”，意味着你们之间的问题会反复发作，痛感加倍。\n*   **七杀攻身：** 乙木七杀克身，你会遇到给你带来巨大压力的异性。这段时间的感情，与其说是甜蜜，不如 
  说是“渡劫”。\n\n## 📝 3. 总结\n这十年你就像在走钢丝。火旺让你能量爆棚，但“三刑”让你时刻处于精神紧绷状态。**你的成就感来源于解决高难度的麻烦。**\n\n---\n\n# 



五、2026 丙午流年：高光资料片预测\n\n> 
**流年气场：  ** 天干【丙火】（正印），地支【午火】（禄神）。\n> 
**核心关键词：** 能量满格、贵人降临、强势回归。\n\n## 🔥 
1. 事业与财富：超级充电站\n*   **正印高透（丙火）：** 你的八字最喜火！2026年，天干丙火像太阳一样照 亮了你的命局，温暖了原本寒冷的金水。\n    *   **现实表现：** 这一年你会遇到极其给力的**大贵人**（大概率是女性长辈或上司）。之前卡住的项目、理不清的纠纷（三刑），在这一年会被高层力量强行化解。\n    *   **禄神帮身（午火）：** 己土见午为“禄”（俸禄/根基）。你的自信心会达到巅峰，不再纠结内耗。这是你**升职、拿大订单、或者建立行业名声**的最佳年份。\n    *   **避雷：** 虽然火旺，但不要太狂。禄神年最怕“乐极生悲”，注意不
  要因为太自信而忽视了细节合同。\n\n## 
💖 2. 感情剧本：桃花朵朵开，但需防“争夺”\n*   **红鸾星动？** 虽然午火不是你的红鸾，但它是你的桃花死地（午火生己土，但也克金）。\n*   **强力支撑：** 这一年遇到的异性，不再
  是那种让你受虐的“渣男”，而是像大哥哥一样能包容你、给你提供实际资源和情绪价值的**暖男**。因为“印”代表保护。\n*   **潜在雷区：** 别忘了大运还在“乙巳”。流年“午”与大运“巳”构成了“巳午未”南方火局的半壁江山。火太  
  旺，你的脾气会变大。你可能会因为太强势，把对方吓跑。\n\n#
# 💡 3. 2026 建议：\n*   **搞钱第一：** 这一年你的能量场是满的。去做那些你以前不敢做的事（创业、买房、跳槽）。运气站在你这边。\n* 
  **调理身体：** 火土太燥，流年火旺。注意**心血管、眼睛、以及皮肤炎症**。三刑之年叠加火旺，容易有烫伤或发炎，少吃辛辣。\n*   
**利用印星：** 多考证、多学习、多去抱大腿。2026年的核心红利来自于“平台”和“长辈”，而不是你单打独斗."  

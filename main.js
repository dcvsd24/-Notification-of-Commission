/**
 * BGI 原神 每日奖励&砺行修远进度&原石&原粹树脂&幻想真境剧诗&深境螺旋检查脚本
 * ✅ 集成：完整日志统计 + 系统通知推送 + 错误重试机制
 * ✅ 新增：幻想真境剧诗剩余时间、深境螺旋剩余时间、原粹树脂剩余数量&恢复时间检查
 * ✅ 新增：当前账号UID识别与展示
 * ✅ 新增：历练点奖励领取、每日委托处理、探索派遣处理逻辑
 */
(async function automatedGenshinRewardCheck() {
    // ===== 初始化全局统计变量 =====
    const startTime = Date.now();
    let checkResult = {
        dailyRewardClaimed: false, // 今日奖励是否领取
        dailyProgressCompleted: false, // 砺行修远今日是否完成（匹配Completed.png）
        weeklyProgressText: "", // 砺行修远本周进度文字（1/5、2/5等，OCR识别）
        checkSuccess: true, // 本次检查是否成功执行
        // 新增：幻想真境剧诗相关
        unrealRealmRemainTime: "未识别", // 幻想真境剧诗剩余时间
        // 新增：深境螺旋相关
        spiralAbyssRemainTime: "未识别", // 深境螺旋剩余时间
        // 新增：原粹树脂相关
        resinCount: "未识别", // 原粹树脂剩余数量（x/200）
        resinRecoverTime: "未识别", // 原粹树脂全部恢复需要的时间
        // 新增：当前账号UID
        accountUid: "未识别", // 当前登录账号的UID
        // 新增：原石剩余数量
        primogemCount: "未识别" // 剩余原石数量
    };
    const TASK_NAME = "原神每日奖励&本周进度检查";

    try {
        // ===== 新增：先执行历练点奖励领取、委托、派遣流程 =====
        log.info('=================================================');
        log.info(`=== 🚀 开始执行（历练点/委托/派遣） ===`);
        log.info('=================================================');
        await executeNewProcesses();

        // ===== 原有逻辑：任务开始 + 通知 =====
        log.info('=================================================');
        log.info(`=== ✔️ ${TASK_NAME} 开始执行 ===`);
        log.info('=================================================');
        //notification.send(`✨ 开始执行【${TASK_NAME}】`);

        // ===== 2. 返回游戏主界面 + 强制锁定分辨率 =====
        log.info("📌 正在返回游戏主界面并校准...");
        await genshin.returnMainUi();
        setGameMetrics(1920, 1080, 1.25);
        await sleep(1500);
        log.info("✅ 游戏主界面");

        // ===== 新增：识别当前账号UID =====
        await executeCheckWithRetry(async () => {
            log.info("🔍 正在识别当前账号UID");
            // 按下ESC打开派蒙菜单
            log.info("📌 按下ESC打开派蒙菜单");
            keyPress("VK_ESCAPE");
            await sleep(2000); // 等待派蒙菜单加载完成

            // OCR识别UID（区域：x168,y195,w120,h27）
            log.info("🔍 OCR识别UID（区域：x168,y195,w120,h27）");
            const uidRegion = RecognitionObject.ocr(168, 195, 120, 27);
            let capture = captureGameRegion();
            let ocrRes = capture.find(uidRegion);
            let rawUidText = ocrRes.text?.trim() || "";
            capture.dispose();

            // 过滤特殊符号，仅保留纯数字
            checkResult.accountUid = rawUidText.replace(/[^0-9]/g, '');
            if (!checkResult.accountUid) {
                checkResult.accountUid = "未识别";
            }

            log.info(`✅ 当前账号UID：${checkResult.accountUid}`);

            // 按下ESC关闭派蒙菜单，回到游戏主界面
            log.info("📌 按下ESC关闭派蒙菜单，返回主界面");
            keyPress("VK_ESCAPE");
            await sleep(1500);
        }, "当前账号UID识别");

        // ===== 3. 打开冒险之证面板 =====
        log.info("📌 按下F1快捷键，打开冒险之证面板...");
        keyPress("F1");
        await sleep(2000);

        // ===== 4. 点击每日奖励入口 =====
        log.info("📌 点击每日奖励入口...");
        click(295, 340);
        await sleep(2000); // 加长等待，确保面板加载完成

        // ===== 5. 获取游戏画面 + 防截图失败 =====
        const gameImage = captureGameRegion();
        if (!gameImage) {
            throw new Error("游戏画面截图失败，无法进行图片模板匹配");
        }
        log.info("✅ 游戏画面截图成功，开始执行图片识别");

        // ===== 6. 今日委托奖励状态检查 - 图片匹配【Reward Has been claimed.png】+ 重试 =====
        await executeCheckWithRetry(async () => {
            log.info("🔍 正在识别【今日奖励】状态 → 匹配 Reward Has been claimed.png");
            const rewardClaimedTemplate = RecognitionObject.TemplateMatch(file.readImageMatSync("RecognitionObject/Reward Has been claimed.png"));
            const rewardClaimedRes = gameImage.find(rewardClaimedTemplate);
            checkResult.dailyRewardClaimed = rewardClaimedRes.isExist();
            
            if (checkResult.dailyRewardClaimed) {
                log.info("✅ 今日委托奖励状态：已领取 ✔️");
            } else {
                log.warn("⚠️ 今日委托奖励状态：未领取 ❗ ");
            }
        }, "今日奖励状态识别");

        // ===== 6.1 今日奖励未领取时重试前往凯瑟琳领取 =====
        if (!checkResult.dailyRewardClaimed) {
            const maxRetryCount = settings.dailyRewardRetryCount || 2;
            for (let retryAttempt = 1; retryAttempt <= maxRetryCount; retryAttempt++) {
                log.warn(`⚠️ 检测到今日奖励未领取，开始第 ${retryAttempt} 次重试前往凯瑟琳领取...`);
                
                try {
                    await retryClaimDailyReward();
                    
                    await sleep(2000);
                    log.info("📌 按下F1快捷键，打开冒险之证面板...");
                    keyPress("F1");
                    await sleep(2000);
                    log.info("📌 点击每日奖励入口...");
                    click(295, 340);
                    await sleep(2000);
                    
                    const retryGameImage = captureGameRegion();
                    if (!retryGameImage) {
                        log.error("重试时游戏画面截图失败");
                        continue;
                    }
                    
                    const retryRewardTemplate = RecognitionObject.TemplateMatch(file.readImageMatSync("RecognitionObject/Reward Has been claimed.png"));
                    const retryRewardRes = retryGameImage.find(retryRewardTemplate);
                    checkResult.dailyRewardClaimed = retryRewardRes.isExist();
                    
                    if (checkResult.dailyRewardClaimed) {
                        log.info(`✅ 第 ${retryAttempt} 次重试成功！今日委托奖励已领取 ✔️`);
                        break;
                    } else {
                        log.warn(`⚠️ 第 ${retryAttempt} 次重试后仍未领取，${retryAttempt < maxRetryCount ? '准备下一次重试...' : '已达到最大重试次数'}`);
                    }
                } catch (retryError) {
                    log.error(`❌ 第 ${retryAttempt} 次重试过程中发生错误: ${retryError.message}`);
                }
            }
        }

        await sleep(300); // 短延时提升稳定性

        // ===== 7. 砺行修远进度检查 - 今日完成状态+本周进度文字 + 重试 =====
        await executeCheckWithRetry(async () => {
            log.info("🔍 正在识别【砺行修远进度】状态");
            // 第一步：识别今日是否完成（匹配Completed.png，指定区域x377,y260,w355,h62）
            const completedMat = file.readImageMatSync("RecognitionObject/Completed.png");
            const dailyCompletedTemplate = RecognitionObject.TemplateMatch(completedMat, 391, 254, 331, 52);
            dailyCompletedTemplate.threshold = 0.96; // 匹配精度
            const dailyCompletedRes = gameImage.find(dailyCompletedTemplate);
            checkResult.dailyProgressCompleted = dailyCompletedRes.isExist();

            // 第二步：识别本周进度文字（OCR）
            log.info("🔍 正在OCR识别砺行修远进度文字（区域：x532,y230,w65,h40）");
            const progressRegion = RecognitionObject.ocr(532, 230, 65, 40); 
            let capture = captureGameRegion(); 
            let ocrRes = capture.find(progressRegion);
            checkResult.weeklyProgressText = ocrRes.text?.trim() || "未识别"; 
            capture.dispose(); 

            // 日志输出（同时展示今日状态+本周进度）
            if (checkResult.dailyProgressCompleted) {
                log.info(`✅ 砺行修远今日状态：已完成 ✔️ | 本周进度：${checkResult.weeklyProgressText}`);
            } else {
                log.warn(`⚠️ 砺行修远今日状态：未完成 ❌ | 本周进度：${checkResult.weeklyProgressText}`);
            }
        }, "砺行修远进度状态识别");

        await sleep(500); // 短延时提升稳定性

        // ===== 8. 幻想真境剧诗剩余时间检查（仅非新号模式）=====
        if (!settings.newAccountMode) {
            await executeCheckWithRetry(async () => {
                log.info("🔍 正在检查【幻想真境剧诗】剩余时间");
                // 点击坐标进入详情页
                log.info("📌 点击坐标290,445进入秘境面板");
                click(290, 445);
                await sleep(1500);
                
                // 幻想真境剧诗入口OCR识别（带重试）
                let unrealFound = false;
                for (let retry = 1; retry <= 3 && !unrealFound; retry++) {
                    log.info(`📌 OCR识别区域寻找幻想真境剧诗入口（第${retry}次）`);
                    const unrealEntranceRegion = RecognitionObject.ocr(432, 496, 297, 409);
                    let captureUnreal = captureGameRegion();
                    let ocrUnrealResult = captureUnreal.findMulti(unrealEntranceRegion);
                    
                    for (let i = 0; i < ocrUnrealResult.Count; i++) {
                        let res = ocrUnrealResult[i];
                        if (res.text && (/幻想/.test(res.text) || /真境/.test(res.text) || /剧诗/.test(res.text))) {
                            let unrealTargetX = Math.round(res.x + res.width / 2);
                            let unrealTargetY = Math.round(res.y + res.height / 2);
                            log.info(`✅ 识别到幻想真境剧诗入口：${res.text}，点击中心(${unrealTargetX}, ${unrealTargetY})`);
                            click(unrealTargetX, unrealTargetY);
                            res.Dispose();
                            unrealFound = true;
                            break;
                        }
                        res.Dispose();
                    }
                    captureUnreal.dispose();
                    
                    if (!unrealFound && retry < 3) {
                        log.warn(`⚠️ 第${retry}次未识别到幻想真境剧诗入口，1秒后重试`);
                        await sleep(1000);
                    }
                }
                
                if (!unrealFound) {
                    log.warn("⚠️ 3次未识别到幻想真境剧诗入口文字");
                }
                await sleep(1500);
                log.info("📌 点击坐标1230,845进入剩余时间详情页");
                click(1230, 845);
                await sleep(2000);

            // OCR识别幻想真境剧诗剩余时间（区域为x1444,y497,w330,h270）
            log.info("🔍 OCR识别幻想真境剧诗剩余时间");
            const unrealRealmRegion = RecognitionObject.ocr(1444, 497, 330, 270);
            let capture = captureGameRegion();
            let ocrRes = capture.find(unrealRealmRegion);
            let rawText = ocrRes.text?.trim() || "";
            capture.dispose();

            // 过滤无关字符并提取剩余时间
            // 第一步：移除所有横杠（-、——）和无关空白字符
            let filteredText = rawText.replace(/[-—\s]+/g, '');
            // 第二步：匹配剩余时间格式（剩余时间：xx天xx小时 或 剩余时间：xx小时）
            const timeMatch = filteredText.match(/剩余时间：(\d+天)?(\d+小时)/);
            if (timeMatch) {
                const days = timeMatch[1] || "";
                const hours = timeMatch[2];
                checkResult.unrealRealmRemainTime = `${days}${hours}`;
            } else {
                // 兜底：若未匹配到则用原文本（过滤后）或显示未识别
                checkResult.unrealRealmRemainTime = filteredText || "未识别";
            }

            // 日志输出+刷新提示
            log.info(`✅ 幻想真境剧诗剩余时间：${checkResult.unrealRealmRemainTime}`);
            const unrealDays = checkResult.unrealRealmRemainTime.match(/(\d+)天/)?.[1] || 99;
            if (parseInt(unrealDays) <= 3) {
                log.warn(`⚠️ 幻想真境剧诗剩余时间≤3天，即将刷新！`);
            }

            // 按ESC退出详情页
            log.info("📌 按下ESC退出幻想真境剧诗详情页");
            keyPress("VK_ESCAPE");
            await sleep(1500);
        }, "幻想真境剧诗剩余时间识别");
        }

        await sleep(500); // 短延时提升稳定性

        // ===== 9. 深境螺旋剩余时间检查 =====
        // 新号模式使用不同的入口坐标
        if (settings.newAccountMode) {
            // 新号模式：点击秘境291,446 -> 深境螺旋入口489,651 -> 1223,841
            await executeCheckWithRetry(async () => {
                log.info("🔍 正在检查【深境螺旋】剩余时间（新号模式）");
                log.info("📌 点击坐标291,446进入秘境面板");
                click(291, 446);
                await sleep(1500);
                
                // 深境螺旋入口OCR识别（带重试）
                let abyssFound = false;
                for (let retry = 1; retry <= 3 && !abyssFound; retry++) {
                    log.info(`📌 OCR识别区域寻找深境螺旋入口（第${retry}次）`);
                    const abyssEntranceRegion = RecognitionObject.ocr(432, 496, 297, 409);
                    let captureAbyss = captureGameRegion();
                    let ocrAbyssResult = captureAbyss.findMulti(abyssEntranceRegion);
                    
                    for (let i = 0; i < ocrAbyssResult.Count; i++) {
                        let res = ocrAbyssResult[i];
                        if (res.text && (/深境/.test(res.text) || /螺旋/.test(res.text))) {
                            let targetX = Math.round(res.x + res.width / 2);
                            let targetY = Math.round(res.y + res.height / 2);
                            log.info(`✅ 识别到深境螺旋入口：${res.text}，点击中心(${targetX}, ${targetY})`);
                            click(targetX, targetY);
                            res.Dispose();
                            abyssFound = true;
                            break;
                        }
                        res.Dispose();
                    }
                    captureAbyss.dispose();
                    
                    if (!abyssFound && retry < 3) {
                        log.warn(`⚠️ 第${retry}次未识别到深境螺旋入口，1秒后重试`);
                        await sleep(1000);
                    }
                }
                
                if (!abyssFound) {
                    log.warn("⚠️ 3次未识别到深境螺旋入口文字");
                }
                await sleep(1500);
                log.info("📌 点击坐标1223,841进入深境螺旋详情页");
                click(1223, 841);
                await sleep(2000);

            // OCR识别深境螺旋剩余时间（x1440,y587,w315,h36）
            log.info("🔍 OCR识别深境螺旋剩余时间（区域：x1440,y587,w315,h36）");
            const spiralAbyssRegion = RecognitionObject.ocr(1440, 587, 315, 36);
            let capture = captureGameRegion();
            let ocrRes = capture.find(spiralAbyssRegion);
            checkResult.spiralAbyssRemainTime = ocrRes.text?.trim() || "未识别";
            capture.dispose();

            // 日志输出+刷新提示
            log.info(`✅ 深境螺旋剩余时间：${checkResult.spiralAbyssRemainTime}`);
            const abyssDays = checkResult.spiralAbyssRemainTime.match(/(\d+)天/)?.[1] || 
                              (checkResult.spiralAbyssRemainTime.includes("小时") ? 0 : 99);
            if (parseInt(abyssDays) <= 3) {
                log.warn(`⚠️ 深境螺旋剩余时间≤3天（或不足1天），即将刷新！`);
            }

            // 按ESC退出详情页
            log.info("📌 按下ESC退出深境螺旋详情页");
            keyPress("VK_ESCAPE");
            await sleep(1500);
        }, "深境螺旋剩余时间识别");
        } else {
            // 原有模式深境螺旋入口
            await executeCheckWithRetry(async () => {
                log.info("🔍 正在检查【深境螺旋】剩余时间");
                // 点击坐标进入详情页
                log.info("📌 点击坐标1491,47进入深境螺旋详情页");
                click(1491, 47);
                await sleep(2000);

            // OCR识别深境螺旋剩余时间（x1440,y587,w315,h36）
            log.info("🔍 OCR识别深境螺旋剩余时间（区域：x1440,y587,w315,h36）");
            const spiralAbyssRegion = RecognitionObject.ocr(1440, 587, 315, 36);
            let capture = captureGameRegion();
            let ocrRes = capture.find(spiralAbyssRegion);
            checkResult.spiralAbyssRemainTime = ocrRes.text?.trim() || "未识别";
            capture.dispose();

            // 日志输出+刷新提示
            log.info(`✅ 深境螺旋剩余时间：${checkResult.spiralAbyssRemainTime}`);
            const abyssDays = checkResult.spiralAbyssRemainTime.match(/(\d+)天/)?.[1] || 
                              (checkResult.spiralAbyssRemainTime.includes("小时") ? 0 : 99);
            if (parseInt(abyssDays) <= 3) {
                log.warn(`⚠️ 深境螺旋剩余时间≤3天（或不足1天），即将刷新！`);
            }

            // 按ESC退出详情页
            log.info("📌 按下ESC退出深境螺旋详情页");
            keyPress("VK_ESCAPE");
            await sleep(1500);
        }, "深境螺旋剩余时间识别");
        }

        await sleep(500); // 短延时提升稳定性

        // ===== 10. 原粹树脂恢复时间检查（匹配树脂.png点击查看） =====
        await executeCheckWithRetry(async () => {
            log.info("🔍 正在检查【原粹树脂】恢复时间");
            // 第一步：匹配树脂.png并点击，查看树脂恢复时间
            log.info("🔍 匹配树脂.png并点击查看树脂恢复时间");
            const resinIconRo = RecognitionObject.TemplateMatch(file.readImageMatSync("RecognitionObject/树脂.png"), 1067, 24, 328, 52);
            let resinCapture = captureGameRegion();
            let resinIconRes = resinCapture.find(resinIconRo);
            if (resinIconRes.isExist() && resinIconRes.X !== 0 && resinIconRes.Y !== 0) {
                // 点击坐标取整：click 参数为 int，小数会触发参数转换异常
                click(Math.round(resinIconRes.X + resinIconRes.Width / 2), Math.round(resinIconRes.Y + resinIconRes.Height / 2));
            } else {
                log.warn("⚠️ 未匹配到树脂.png，使用兜底坐标1387,49");
                click(1387, 49);
            }
            resinCapture.dispose();
            await sleep(1500);

            // 第二步：识别恢复时间（x1055,y75,w370,h180）
            log.info("🔍 OCR识别原粹树脂全部恢复时间（区域：x1055,y75,w370,h180）");
            const resinRecoverRegion = RecognitionObject.ocr(1055, 75, 370, 180);
            let capture2 = captureGameRegion();
            let ocrRes2 = capture2.find(resinRecoverRegion);
            let recoverTimeText = ocrRes2.text?.trim() || "";
            log.info(`🔍 树脂恢复时间OCR原文：${recoverTimeText ? `"${recoverTimeText.replace(/\n/g, " | ")}"` : "（空）"}`);

            if (recoverTimeText) {
                // 提示框含"下次恢复 xx:xx:xx"与"全部恢复 xx:xx:xx"两行时间，只需"全部恢复"之后的那个
                let targetTime = null;
                const allRecoverIdx = recoverTimeText.lastIndexOf("全部恢复");
                if (allRecoverIdx >= 0) {
                    // 取"全部恢复"之后的第一个时间
                    const m = recoverTimeText.substring(allRecoverIdx).match(/\d{1,2}:\d{1,2}(?::\d{1,2})?/);
                    if (m) targetTime = m[0];
                } else {
                    // 未识别到"全部恢复"字样，取最后一个时间兜底（更可能是全部恢复时间）
                    const allTimes = recoverTimeText.match(/\d{1,2}:\d{1,2}(?::\d{1,2})?/g) || [];
                    targetTime = allTimes.length > 0 ? allTimes[allTimes.length - 1] : null;
                }
                if (targetTime) {
                    const parts = targetTime.split(':');
                    let hours = Number(parts[0]).toString();
                    let minutes = Number(parts[1]).toString();
                    checkResult.resinRecoverTime = `${hours}h-${minutes}min`;
                } else {
                    checkResult.resinRecoverTime = recoverTimeText;
                }
            } else {
                checkResult.resinRecoverTime = "⚠️原粹树脂已完全恢复";
            }
            capture2.dispose();

            log.info(`✅ 原粹树脂全部恢复时间：${checkResult.resinRecoverTime}`);
        }, "原粹树脂状态识别");
        
        await sleep(500); // 短延时提升稳定性

        // ===== 11. 原石剩余数量检查（匹配打开按钮.png打开详情） =====
        await executeCheckWithRetry(async () => {
            log.info("🔍 正在检查【原石】剩余数量");
            // 第一步：匹配打开按钮.png并点击，打开原石详情弹窗
            log.info("🔍 匹配打开按钮.png并点击打开原石详情弹窗");
            const openBtnRo = RecognitionObject.TemplateMatch(file.readImageMatSync("RecognitionObject/打开按钮.png"), 1067, 24, 485, 52);
            let openCapture = captureGameRegion();
            let openBtnRes = openCapture.find(openBtnRo);
            if (openBtnRes.isExist() && openBtnRes.X !== 0 && openBtnRes.Y !== 0) {
                // 点击坐标取整：click 参数为 int，小数会触发参数转换异常
                click(Math.round(openBtnRes.X + openBtnRes.Width / 2), Math.round(openBtnRes.Y + openBtnRes.Height / 2));
            } else {
                log.warn("⚠️ 未匹配到打开按钮.png，使用兜底坐标1530,46");
                click(1530, 46);
            }
            openCapture.dispose();
            await sleep(1500);

            // 第二步：识别剩余树脂数量（x1590,y30,w238,h33）
            log.info("🔍 OCR识别原粹树脂剩余数量（区域：x1590,y30,w238,h33）");
            const resinCountRegion = RecognitionObject.ocr(1590, 30, 238, 33);
            let resinCapture = captureGameRegion();
            let ocrRes1 = resinCapture.find(resinCountRegion);
            let resinRawText = ocrRes1.text?.trim() || "未识别";
            let resinNum = resinRawText.split('/')[0]?.trim() || resinRawText;
            checkResult.resinCount = resinNum;
            resinCapture.dispose();

            // 第三步：区域匹配原石.png，识别其下方（y偏移120、宽130）的数字为原石数量
            log.info("🔍 区域匹配原石.png并识别其下方数字");
            const primogemRo = RecognitionObject.TemplateMatch(file.readImageMatSync("RecognitionObject/原石.png"), 730, 368, 560, 256);
            let capture = captureGameRegion();
            let primogemIconRes = capture.find(primogemRo);
            if (primogemIconRes.isExist() && primogemIconRes.X !== 0 && primogemIconRes.Y !== 0) {
                log.info(`✅ 原石.png匹配成功，匹配坐标：x${primogemIconRes.X}, y${primogemIconRes.Y}, w${primogemIconRes.Width}, h${primogemIconRes.Height}`);
                const primogemNumRegion = RecognitionObject.ocr(primogemIconRes.X, primogemIconRes.Y + 120, 130, 36);
                log.info(`🔍 原石数量识别区域：x${primogemIconRes.X}, y${primogemIconRes.Y + 120}, w130, h36`);
                let ocrRes = capture.find(primogemNumRegion);
                let rawPrimogemText = ocrRes.text?.trim() || "";
                log.info(`🔍 原石数量OCR识别结果：${rawPrimogemText ? `"${rawPrimogemText}"` : "（未识别到文字）"}`);
                checkResult.primogemCount = rawPrimogemText.replace(/[^0-9]/g, '');
                if (!checkResult.primogemCount) {
                    checkResult.primogemCount = "未识别";
                }
            } else {
                log.warn("⚠️ 未匹配到原石.png（匹配区域：x730,y368,w560,h256），跳过原石数量识别");
                checkResult.primogemCount = "未识别";
            }
            capture.dispose();

            // 日志输出
            log.info(`✅ 原石剩余数量：${checkResult.primogemCount}`);
            log.info(`✅ 原粹树脂剩余数量：${checkResult.resinCount}`);

            // 按ESC退出详情页
            log.info("📌 按下ESC退出原石详情弹窗");
            keyPress("VK_ESCAPE");
            await sleep(1500);
        }, "原石剩余数量识别");

        await sleep(500); // 短延时提升稳定性

        // ===== 12. 检查完成：发送成功通知（整合所有状态） =====
        let rewardStatusMsg = checkResult.dailyRewardClaimed ? "✅已领取" : "❌未领取";
        // 今日砺行修远状态文案
        let dailyProgressMsg = checkResult.dailyProgressCompleted ? "✅已完成" : "❌未完成";
        
        // ✅ ✅ ✅ 砺行修远本周进度判定逻辑【加入周日(0)】✅ ✅ ✅
        let weeklyProgressMsg = "";
        const now = new Date(); 
        const dayOfWeek = now.getDay(); // 0=周日, 1=周一, 2=周二, 3=周三,4=周四,5=周五,6=周六
        
        // 1. 进度5/5 → 任何星期都显示✅本周已完成
        if (checkResult.weeklyProgressText === "5/5" || checkResult.weeklyProgressText.includes("完成")) {
            weeklyProgressMsg = `✅已完成
当前进度✅（${checkResult.weeklyProgressText}）`;
        } 
        // 2. 周日(0)+周五(5)+周六(6) + 进度不是5/5 → 强制显示❌本周未完成+进度
        else if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
            weeklyProgressMsg = `❌未完成
当前进度⚠️[${checkResult.weeklyProgressText}]`;
        } 
        // 3. 周一到周四+未完成 → 显示🟡当前进度+进度
        else {
            weeklyProgressMsg =`🟡当前进度[${checkResult.weeklyProgressText}]`;
        }

        // 幻想真境剧诗提示文案（新号模式下不显示）
        let unrealRealmMsg = "";
        if (!settings.newAccountMode) {
            unrealRealmMsg = `幻想真境剧诗剩余：${checkResult.unrealRealmRemainTime}`;
            const unrealDays = checkResult.unrealRealmRemainTime.match(/(\d+)天/)?.[1] || 99;
            if (parseInt(unrealDays) <= 3) {
                unrealRealmMsg += " ⚠️即将刷新";
            }
            // 剩余时间≥28天+已刷新描述
            if (parseInt(unrealDays) >= 28) {
                unrealRealmMsg += " 🔄  [已刷新]新的幻想真境剧诗";
            }
        }

        // 深境螺旋提示文案
        let spiralAbyssMsg = `${checkResult.spiralAbyssRemainTime}`;
        const abyssDays = checkResult.spiralAbyssRemainTime.match(/(\d+)天/)?.[1] || 
                          (checkResult.spiralAbyssRemainTime.includes("小时") ? 0 : 99);
        if (parseInt(abyssDays) <= 3) {
            spiralAbyssMsg += " ⚠️即将刷新";
        }
        // 剩余时间≥28天添加绿色圆圈+已刷新描述
        if (parseInt(abyssDays) >= 28) {
            spiralAbyssMsg += " 🔄  [已刷新]新的深渊";
        }

        // 原石和树脂一行展示的逻辑处理
        let primogemAndResinMsg = `✨ ${checkResult.primogemCount}`;
        const resinNumValue = parseInt(checkResult.resinCount);
        // 树脂已满200的情况
        if (!isNaN(resinNumValue) && resinNumValue >= 200) {
            primogemAndResinMsg += "  🌙 树脂已完全恢复⚠️";
        } 
        // 树脂≥180但未满200的情况
        else if (!isNaN(resinNumValue) && resinNumValue >= 180) {
            primogemAndResinMsg += `  🌙 ${checkResult.resinCount} 即将溢出⚠️`;
        } 
        // 其他情况（正常显示数量和恢复时间）
        else {
            primogemAndResinMsg += `  🌙 ${checkResult.resinCount}  ⏰${checkResult.resinRecoverTime}`;
        }

        // 最终通知文案
        const successNotifyMsg = `🎯 【奖励领取+检查完成】
          📊统计结果
当前UID：${checkResult.accountUid}
${primogemAndResinMsg}
今日委托奖励：${rewardStatusMsg}
今日砺行修远：${dailyProgressMsg}
本周砺行修远：${weeklyProgressMsg}
${unrealRealmMsg}
${spiralAbyssMsg}`;
        notification.send(successNotifyMsg);

    } catch (error) {
        // ===== 全局异常捕获：日志+通知 =====
        checkResult.checkSuccess = false;
        log.error('=================================================');
        log.error(`❌ ${TASK_NAME} 执行异常终止 ❌`);
        log.error(`❌ 异常原因: ${error.message}`);
        log.error('=================================================');
        notification.error(`❌ 【原神奖励检查失败】
执行异常终止：${error.message}`);

    } finally {
        // ===== 最终收尾：完整日志统计 + 总耗时计算 =====
        const duration = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const timeConsuming = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;

        // 打印完整执行统计日志
        log.info('=================================================');
        log.info(`=== 📊 ${TASK_NAME} 执行完成 统计 ===`);
        log.info(`📌 执行状态：${checkResult.checkSuccess ? '✅ 成功完成' : '❌ 执行失败'}`);
        log.info(`📌 当前账号UID：${checkResult.accountUid}`); // 新增UID日志输出
        log.info(`📌 今日奖励：${checkResult.dailyRewardClaimed ? '已领取' : '未领取'}`);
        log.info(`📌 砺行修远今日状态：${checkResult.dailyProgressCompleted ? '已完成' : '未完成'}`);
        log.info(`📌 砺行修远本周进度：${checkResult.weeklyProgressText}`);
        if (!settings.newAccountMode) {
            log.info(`📌 幻想真境剧诗剩余时间：${checkResult.unrealRealmRemainTime}`);
        }
        log.info(`📌 深境螺旋剩余时间：${checkResult.spiralAbyssRemainTime}`);
        log.info(`📌 原粹树脂剩余数量：${checkResult.resinCount}`);
        log.info(`📌 原粹树脂全部恢复时间：${checkResult.resinRecoverTime}`);
        log.info(`📌 原石剩余数量：${checkResult.primogemCount}`); // 新增原石日志输出
        log.info(`📌 总耗时：${timeConsuming}`);
        log.info('=================================================');
        log.info("按下ESC返回主界面");
        keyPress("VK_ESCAPE");
        await sleep(1000);
        keyPress("VK_ESCAPE");
        await sleep(1000);
    }
})();

/**
 * ✅ 带重试机制的检查执行函数
 * @param {Function} checkFunc 要执行的检查逻辑
 * @param {String} taskName 任务名称
 * @param {Number} maxRetries 最大重试次数，默认3次
 */
async function executeCheckWithRetry(checkFunc, taskName, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            log.debug(`🔄 【${taskName}】第 ${attempt} 次执行尝试`);
            await checkFunc(); // 执行实际检查逻辑
            return; // 成功执行则直接返回，终止重试
        } catch (error) {
            log.warn(`⚠️ 【${taskName}】第 ${attempt} 次尝试失败: ${error.message}`);
            if (attempt === maxRetries) {
                log.error(`❌ 【${taskName}】重试${maxRetries}次后仍失败，终止该检查`);
                log.info("按下ESC返回主界面");
                keyPress("VK_ESCAPE");
                await sleep(1500);
                throw new Error(`【${taskName}】执行失败: ${error.message}`); // 最后一次失败则抛出异常
            }
            await sleep(1000 * attempt); // 重试等待，指数级延时
        }
    }
}

// ===== 新增：整合的历练点/委托/派遣流程函数 =====
async function executeNewProcesses() {
    // 加载region.js
    eval(file.readTextSync("lib/region.js"));

    // 加载图片资源并转换为识别对象（Ro）
    const F_DialogueRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync("RecognitionObject/F_Dialogue.png"));
    const CommissionsRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync("RecognitionObject/Commissions.png"));
    const ExpeditionRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync("RecognitionObject/Expedition.png"));
    const ExitRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync("RecognitionObject/Exit.png"));
    // 新增：历练点奖励识别对象（限定识别区域x1488,y699,w120,h130，避免全屏干扰）
    const RewardRo = RecognitionObject.TemplateMatch(file.readImageMatSync("RecognitionObject/reward.png"), 1488, 699, 120, 130);
    RewardRo.threshold = 0.75;

    // 新增：检查并领取历练点奖励
    async function checkAndReceiveTrainingPoints() {
        log.info("📌 正在校准并返回游戏主界面...");
        await genshin.returnMainUi();
        setGameMetrics(1920, 1080, 1);
        await sleep(1500);
        log.info("开始检查历练点奖励");
        try {
            // 按F1进入冒险之证
            keyPress("F1");
            await sleep(1500);
            
            // 点击坐标303，347进入委托详情
            click(303, 347);
            await sleep(1500);

            // 识别历练点奖励（识别区域已在RewardRo中限定）
            const rewardResult = await recognizeImage(
                RewardRo, 
                null, 
                2000, 
                500, 
                true, 
                "Reward"
            );

            if (rewardResult.isDetected) {
                log.info("识别到历练点奖励，开始领取");
                // 点击坐标1551，754领取奖励
                click(1551, 754);
                await sleep(1000);
                // 再次点击确认领取
                click(1551, 754);
                await sleep(2000);
                log.info("使用历练点领取奖励完成");
            } else {
                log.info("未识别到可领取历练点（历练点不足或树脂消耗不足），跳过领取");
            }
        } catch (error) {
            log.error("检查历练点奖励过程中发生错误: " + error.message);
        } finally {
            // 按esc退出委托界面
            keyPress("Escape");
            await sleep(1000);
            log.info("已退出委托界面");
        }
    }

    // 通过识别F_Dialogue打开界面
    async function openByFDialogue() {
        keyPress("F");
        await sleep(1000);
        click(960, 540); // 点击地图中心
        await sleep(1500);
        let ra = null;

        // 使用F_DialogueRo进行识别
        const fResult = await recognizeImage(F_DialogueRo, ra, 2000, 500, true, "F_Dialogue");
        if (fResult.isDetected) {
            await drawAndClearRedBox(fResult, fResult.ra);
            await sleep(500);
            return fResult.ra;
        } else {
            log.error("未识别到F_Dialogue，无法打开界面");
            return null;
        }
    }

    // 每日委托流程
    async function handleCommissions() {
        const ra = await openByFDialogue();
        if (!ra) return;

        // 使用CommissionsRo进行识别
        const commResult = await recognizeImage(CommissionsRo, ra, 2000, 500, "Commissions");
        if (commResult.isDetected) {
            await drawAndClearRedBox(commResult, ra);
            click(commResult.x, commResult.y); // 直接点击图片坐标
            await sleep(1000);
            click(960, 540); // 点击领取奖励
            await sleep(3000);
            click(960, 960); // 点击关闭奖励界面
            log.info("每日委托流程完成");
        } else {
            log.error("未识别到Commissions，跳过委托流程");
        }
    }

    // 探索派遣流程
    async function handleExpedition() {
        const ra = await openByFDialogue(); // 重新通过F_Dialogue打开界面
        if (!ra) return;

        // 使用ExpeditionRo进行识别
        const expResult = await recognizeImage(ExpeditionRo, ra, 2000, 500, "Expedition");
        if (expResult.isDetected) {
            await drawAndClearRedBox(expResult, ra);
            click(expResult.x, expResult.y); // 直接点击图片坐标

            await sleep(1000);
            click(160, 1010); // 点击派遣任务
            await sleep(1000);
            click(1160, 1020); // 点击重新派遣
            await sleep(500);
            log.info("已重新探索派遣");
            keyPress("Escape");
            await sleep(3000);
            log.info("探索派遣流程完成");
        } else {
            log.error("未识别到Expedition，跳过派遣流程");


        }
    }

    // 执行新增流程逻辑
    // 第一步：检查并领取历练点奖励
    await checkAndReceiveTrainingPoints();

    // 第二步：优先执行 AutoPath（前往凯瑟琳）
    async function AutoPath(locationName) {
        log.info(`前往 ${locationName}`);
        try {
            let filePath = `assets/${locationName}.json`;
            await pathingScript.runFile(filePath);
        } catch (error) {
            log.error(`执行 ${locationName} 路径时发生错误`);
        }
        await sleep(2000);
        if (locationName == "纳塔凯瑟琳") {
            keyDown("w");
            await sleep(4500);
            keyUp("w");
            keyDown("d");
            await sleep(2000);
            keyUp("d");
        }
    }
    let locationName;
    
    // 适配settings配置：未指定时默认蒙德，拼接"凯瑟琳"后缀
    if (settings.adventurePath === undefined || settings.adventurePath === "") {
        locationName = "蒙德凯瑟琳";
    } else {
        locationName = `${settings.adventurePath}凯瑟琳`;
    }

    log.info("开始执行路径脚本（前往凯瑟琳）");
    await AutoPath(locationName); // 等待AutoPath完全执行完毕

    // 第三步：执行派遣委托流程（AutoPath完成后才会运行这里）
    log.info("路径脚本执行完毕，开始处理派遣和委托");
    setGameMetrics(1920, 1080, 1);

    await genshin.returnMainUi();
    try {
        await handleExpedition(); // 处理派遣
        await handleCommissions(); // 处理委托
        // 自动领取纪行奖励
        await sleep(3000);
        await genshin.claimBattlePassRewards();
        await genshin.returnMainUi();
        await genshin.returnMainUi();
        await genshin.returnMainUi();
    } catch (error) {
        log.error("主流程错误: " + error.message);
    }
}

// ===== 新增：重试领取每日委托奖励函数 =====
async function retryClaimDailyReward() {
    log.info("📌 开始重试领取每日委托奖励...");
    
    // 加载region.js
    eval(file.readTextSync("lib/region.js"));
    
    // 加载图片资源
    const F_DialogueRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync("RecognitionObject/F_Dialogue.png"));
    const CommissionsRo = RecognitionObject.TemplateMatch(file.ReadImageMatSync("RecognitionObject/Commissions.png"));
    
    // 返回游戏主界面
    log.info("📌 正在返回游戏主界面...");
    await genshin.returnMainUi();
    setGameMetrics(1920, 1080, 1);
    await sleep(1500);
    
    // 前往凯瑟琳
    let locationName;
    if (settings.adventurePath === undefined || settings.adventurePath === "") {
        locationName = "蒙德凯瑟琳";
    } else {
        locationName = `${settings.adventurePath}凯瑟琳`;
    }
    
    log.info(`📌 重试：前往 ${locationName}`);
    try {
        let filePath = `assets/${locationName}.json`;
        await pathingScript.runFile(filePath);
    } catch (error) {
        log.error(`执行 ${locationName} 路径时发生错误: ${error.message}`);
    }
    await sleep(2000);
    
    if (locationName == "纳塔凯瑟琳") {
        keyDown("w");
        await sleep(4500);
        keyUp("w");
        keyDown("d");
        await sleep(2000);
        keyUp("d");
    }
    
    setGameMetrics(1920, 1080, 1);
    await genshin.returnMainUi();
    
    // 通过识别F_Dialogue打开界面
    async function openByFDialogue() {
        keyPress("F");
        await sleep(1000);
        click(960, 540);
        await sleep(1500);
        let ra = null;
        
        const fResult = await recognizeImage(F_DialogueRo, ra, 2000, 500, true, "F_Dialogue");
        if (fResult.isDetected) {
            await drawAndClearRedBox(fResult, fResult.ra);
            await sleep(500);
            return fResult.ra;
        } else {
            log.error("未识别到F_Dialogue，无法打开界面");
            return null;
        }
    }
    
    // 执行委托领取
    const ra = await openByFDialogue();
    if (ra) {
        const commResult = await recognizeImage(CommissionsRo, ra, 2000, 500, "Commissions");
        if (commResult.isDetected) {
            await drawAndClearRedBox(commResult, ra);
            click(commResult.x, commResult.y);
            await sleep(1000);
            click(960, 540);
            await sleep(3000);
            click(960, 960);
            log.info("✅ 重试领取每日委托奖励完成");
        } else {
            log.error("未识别到Commissions，跳过委托领取");
        }
    }
    
    // 返回主界面
    await genshin.returnMainUi();
    log.info("📌 重试流程结束，已返回主界面");
}
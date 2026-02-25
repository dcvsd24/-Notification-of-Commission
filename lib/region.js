
// ###########################################################################
// 【核心工具函数】
// ###########################################################################

var globalLatestRa = null;
async function recognizeImage(
    recognitionObject, 
    ra, 
    timeout = 1000, 
    interval = 500, 
    useNewScreenshot = false, 
    iconType 
) {
    let startTime = Date.now();
    globalLatestRa = ra; 
    const originalRa = ra; 

    while (Date.now() - startTime < timeout) {
        try {
            let currentRa = ra;
            if (useNewScreenshot) {
                currentRa = captureGameRegion(); 
                globalLatestRa = currentRa; 
            } else {
                currentRa = originalRa; 
            }

            const result = currentRa.find(recognitionObject);
            if (result.isExist() && result.x !== 0 && result.y !== 0) {
                return {
                    isDetected: true,
                    iconType: iconType,
                    x: result.x,
                    y: result.y,
                    width: result.width,
                    height: result.height,
                    ra: currentRa,
                    usedNewScreenshot: useNewScreenshot
                };
            }

        } catch (error) {
            log.error(`【${iconType}识别异常】: ${error.message}`);
        }
        await sleep(interval);
    }

    return {
        isDetected: false,
        iconType: iconType,
        x: null,
        y: null,
        width: null,
        height: null,
        ra: originalRa,
        usedNewScreenshot: useNewScreenshot
    };
}

// 定义一个异步函数来绘制红框并延时清除
async function drawAndClearRedBox(searchRegion, ra, delay = 500) {
    let drawRegion = null;
    try {
        // 创建绘制区域
        drawRegion = ra.DeriveCrop(
            searchRegion.x, searchRegion.y,
            searchRegion.width, searchRegion.height
        );
        drawRegion.DrawSelf("icon"); // 绘制红框
        
        // 等待指定时间
        await sleep(delay);
        
        // 清除红框 - 使用更可靠的方式
        if (drawRegion && typeof drawRegion.DrawSelf === 'function') {
            // 可能需要使用透明绘制来清除，或者绘制一个0大小的区域
            ra.DeriveCrop(0, 0, 0, 0).DrawSelf("icon");
        }
    } catch (e) {
        log.error("红框绘制异常：" + e.message);
    } finally {
        // 正确释放资源，如果dispose方法存在的话
        if (drawRegion && typeof drawRegion.dispose === 'function') {
            drawRegion.dispose();
        }
    }
}

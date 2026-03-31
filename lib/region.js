
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
            if (result.isExist() && result.x !== 0 && result.y !== 0 && result.width > 0 && result.height > 0) {
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
        if (!searchRegion || !ra) {
            log.warn("drawAndClearRedBox: 参数无效，跳过绘制");
            return;
        }

        if (searchRegion.x < 0 || searchRegion.y < 0 || searchRegion.width <= 0 || searchRegion.height <= 0) {
            log.warn(`drawAndClearRedBox: 裁剪区域无效 (${searchRegion.x},${searchRegion.y},${searchRegion.width},${searchRegion.height})，跳过绘制`);
            return;
        }

        drawRegion = ra.DeriveCrop(
            searchRegion.x, searchRegion.y,
            searchRegion.width, searchRegion.height
        );
        drawRegion.DrawSelf("icon");

        await sleep(delay);

    } catch (e) {
        log.error("红框绘制异常：" + e.message);
    } finally {
        if (drawRegion && typeof drawRegion.dispose === 'function') {
            drawRegion.dispose();
        }
    }
}

// 使用 localStorage 保存 API Key
const API_KEY_STORAGE_KEY = "nb_exam_api_key_v20";

window.addEventListener("DOMContentLoaded", () => {
    const savedKey = window.localStorage.getItem(API_KEY_STORAGE_KEY);
    if (savedKey) {
        document.getElementById("apiKeyInput").value = savedKey;
    }
});

// --- 核心逻辑：处理图片预览和粘贴 ---

const imageInput = document.getElementById("imageInput");
const previewBox = document.getElementById("previewBox");
const imagePreview = document.getElementById("imagePreview");
const clearImgBtn = document.getElementById("clearImgBtn");

// 显示预览图
function showPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        previewBox.style.display = "block";
    };
    reader.readAsDataURL(file);
}

// 清除图片
clearImgBtn.addEventListener("click", () => {
    imageInput.value = ""; // 清空 input
    previewBox.style.display = "none";
    imagePreview.src = "";
});

// 监听文件选择（点击上传）
imageInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
        showPreview(e.target.files[0]);
    }
});

// 监听全局粘贴事件 (Ctrl+V)
document.addEventListener('paste', (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    
    for (let index in items) {
        const item = items[index];
        // 如果粘贴的是图片
        if (item.kind === 'file' && item.type.includes('image/')) {
            const blob = item.getAsFile();
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(blob);
            imageInput.files = dataTransfer.files;
            showPreview(blob);
            return; 
        }
    }
});

// 辅助函数：将图片文件转换为 Base64
const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
};

// 通用 API 调用函数
async function callAiApi(apiKey, model, messages) {
    const response = await fetch("https://api.videocaptioner.cn/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            max_tokens: 4096
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`接口错误 (${response.status}): ${text}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content;
}

// --- 功能 1: 识别图片文字 ---
document.getElementById("recognizeBtn").addEventListener("click", async () => {
    const questionInput = document.getElementById("questionInput");
    const apiKey = document.getElementById("apiKeyInput").value.trim();
    const modelSelect = document.getElementById("modelSelect");
    const loadingMask = document.getElementById("loadingMask");
    const loadingText = document.querySelector(".loading-text");

    if (imageInput.files.length === 0) {
        alert("请先上传或粘贴一张图片！");
        return;
    }
    if (!apiKey) {
        alert("请输入 API Key！");
        return;
    }
    
    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);

    try {
        loadingMask.classList.remove("hidden");
        loadingText.innerText = "正在识别图片中的文字...";

        const base64Image = await convertToBase64(imageInput.files[0]);
        const ocrPrompt = "请作为一个高精度的OCR工具。请准确识别这张图片中的所有文字内容。如果是数学公式，请尽量用标准文本或LaTeX表示。直接输出识别内容，不需要任何开场白或结束语。";
        let model = modelSelect.value === 'custom' ? document.getElementById("customModelInput").value : modelSelect.value;

        const content = await callAiApi(apiKey, model, [
            {
                role: "user",
                content: [
                    { type: "text", text: ocrPrompt },
                    { type: "image_url", image_url: { url: base64Image } }
                ]
            }
        ]);

        if (content) {
            questionInput.value = content.trim();
        }
    } catch (e) {
        console.error(e);
        alert("识别失败：" + e.message);
    } finally {
        loadingMask.classList.add("hidden");
    }
});


// --- 功能 2: 生成解析报告 ---
document.getElementById("generateBtn").addEventListener("click", async () => {
    const questionText = document.getElementById("questionInput").value.trim();
    const apiKey = document.getElementById("apiKeyInput").value.trim();
    const modelSelect = document.getElementById("modelSelect");
    const customModelInput = document.getElementById("customModelInput");
    const loadingMask = document.getElementById("loadingMask");
    const loadingText = document.querySelector(".loading-text");

    if (!questionText) {
        alert("题目文字不能为空！请先上传图片识别，或者手动输入文字。");
        return;
    }
    if (!apiKey) {
        alert("请输入 API Key！");
        return;
    }

    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);

    let model = modelSelect.value;
    if (model === "custom") {
        model = customModelInput.value.trim();
        if (!model) {
            alert("请选择一个模型，或填写自定义模型名称。");
            return;
        }
    }

    try {
        loadingMask.classList.remove("hidden");
        loadingText.innerText = "正在生成解析报告...";

        const hasImage = imageInput.files.length > 0;
        
        // ==========================================
        // 核心 Prompt：根据您的要求深度定制
        // ==========================================
        const basePrompt = `
假设听众是刚接触这个知识、基础一般、容易紧张的六年级学生。
请对下面的【原题】做“审题 + 解题”完整拆解，并基于同一知识点自动生成配套练习。

【重要提示】
我已将题目图片中的文字识别出来，并在下面提供给你。
请以**识别出的文字内容为准**，同时参考图片（如果有）来理解几何图形或布局。

【原题文字内容】
${questionText}

【结构与风格要求】
- 针对紧张的孩子，请在口语说明中加入如“别担心”、“咱们先来理清”、“这个小任务很简单”等**鼓励性、去焦虑**的语句。
- 所有内容，尤其是审题和解题，必须做到**从零开始讲解**。

【一、原题速读】
1. 请先用口语化的方式复述一遍题目。
2. 然后告诉孩子：“这其实是在考我们 XX（数学/英语）的哪个知识点”。
3. **重要指令：** 请务必将本题考察的**知识点名称**用 <span class="key-word">知识点名称</span> 包裹，使其在网页上显示为紫色高亮。
   示例：这其实是在考我们小学数学里一个非常重要的知识点——<span class="key-word">百分数的理解和比较</span>。

【审题结构】
请按下面四个小标题输出：
一、圈关键词
二、整理已知信息
三、隐藏条件
四、问题拆解

每一部分中：
- 先用一小段话说明这一部分的目的（给孩子听）。
- 再用条目形式列出内容。

【重点要求 - 信息提取与概念溯源】
二、整理已知信息
请以 **“因为圈了 [关键词]，所以我们知道 [具体信息/数值/语法关系]”** 的句式，列出信息提取的推理过程。

三、隐藏条件
请将本题涉及的**核心概念/基础公式**作为一个独立的小节，用口语化语言，向孩子讲解这个概念的 **概念全貌** 和 **为什么是基础**。
**请务必将核心考察点用 <span class="key-word">...</span> 标签高亮出来。**

【解题过程】
解题部分请用标题“五、解题过程”，并按步骤写：
每一步必须使用这样的格式（注意三行）：
①（这一小步要做什么，用口语说给孩子听，加入鼓励语句）
②（写出算式或画图说明）
③（**必须用括号包裹**：用 1 句话解释“为什么要这样做，这一步对应了我们在隐藏条件中讲的哪个**基础概念**”）
   示例格式：③（这一步是用到了“路程=速度x时间”这个公式）

【重点标注规则（英+数统一风格）】
在“圈关键词”和后面的讲解中，请有意识地给孩子“看见结构”，用统一的高亮规则：
1. 英语句子时：
   - 对主语，用 <span class="kw-subject">主语部分</span> 包起来。
   - 对谓语动词，用 <span class="kw-verb">动词部分</span> 包起来。
   - 对时间/频率词，用 <span class="kw-time">时间词</span> 包起来。
2. 数学应用题时：
   - 对“总数量/已知数量/重要数字”，用 <span class="kw-number">数字或数量词</span> 包起来。
   - 对“关系词”（如“是……的”“比……多/少”“平均”“剩下”），用 <span class="kw-relation">关系词</span> 包起来。
   - 对“问题中的目标”（问什么）、“各有多少/还剩多少”等，用 <span class="kw-question">问题关键词</span> 标出。
3. 对于你认为特别重要的“公式、结论、整步总结”（包括**知识点、基础概念、核心考察点**），继续使用：
   - <span class="key-word">…</span> 标关键公式片段/知识点/概念；
   - <span class="key-step">…</span> 标整句关键结论。

【易错点与家长建议（必须单独成块）】
请在后面安排一个 <section class="block block-extra">，内部按下面结构输出两部分内容：
一）<h2>六年级常见易错点</h2>
- 至少列出 3～5 条，并明确指出该错误是属于 **“审题错误”**、**“概念混淆”** 还是 **“运算错误”**。
- 用“如果孩子这样想/这样写，就会出什么错”的形式写清楚。

二）<h2>家长陪练建议（针对本知识点）</h2>
- 明确写出：这个知识点，孩子接下来 1～2 周应该重点练什么。
- 至少给出 3 条可直接执行的练习方案。

【六、配套练习（基于同一知识点自动出题）】
请在最后增加一个 <section class="block block-practice">，里面按下面结构输出：
1）<h2>学生版配套练习</h2>
- 标明“3 道基础 + 3 道拔高”，只写题目，不给答案。题号 1～6。
2）<h2>家长版参考答案</h2>
- 再列出 1～6 题的“简明答案 + 一句解释”。

【版式与类名要求】
你只需要生成 <main> 内部的 HTML 片段，不要写 <!DOCTYPE html>、<html>、<head> 或 <body> 标签。
请使用上面的结构和类名。
        `;

        let messages = [];
        
        if (hasImage) {
            const base64Image = await convertToBase64(imageInput.files[0]);
            messages = [
                {
                    role: "user",
                    content: [
                        { type: "text", text: basePrompt },
                        { type: "image_url", image_url: { url: base64Image } }
                    ]
                }
            ];
        } else {
            messages = [{ role: "user", content: basePrompt }];
        }

        const innerHtml = await callAiApi(apiKey, model, messages);

        if (!innerHtml) {
            throw new Error("生成内容为空");
        }

        const now = new Date();
        const dateStr = now.getFullYear() + "-" +
            String(now.getMonth() + 1).padStart(2, "0") + "-" +
            String(now.getDate()).padStart(2, "0") + " " +
            String(now.getHours()).padStart(2, "0") + ":" +
            String(now.getMinutes()).padStart(2, "0");
        
        let filenameKeyword = "题目解析";
        if (questionText.length > 0) {
            filenameKeyword = questionText.substring(0, 6).replace(/\s/g, '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g,"");
        }
        
        const dateDownloadStr = now.getFullYear() + "-" +
            String(now.getMonth() + 1).padStart(2, "0") + "-" +
            String(now.getDate()).padStart(2, "0");
        const newFileName = `${filenameKeyword}_${dateDownloadStr}.html`;

        // ==========================================
        // HTML 模板：CSS 已同步为您提供的白底极简风格
        // ==========================================
        const fullHtml = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8" />
<title>牛爸小课堂 · 审题讲解</title>
<style>
@page {
    size: A4;
    margin: 20mm;
}
html, body {
    margin: 0;
    padding: 0;
}
body {
    font-family: "Microsoft YaHei", sans-serif;
    background: #ffffff;
    font-size: 14px;
    color: #333;
}
.wrapper {
    width: 210mm;
    max-width: 100%;
    margin: 0 auto;
    padding: 20px;
    box-sizing: border-box;
}
.header {
    text-align: center;
    padding-bottom: 15px;
    border-bottom: 3px double #e0e0e0;
    margin-bottom: 25px; /* 增加头部留白 */
}
.header-title {
    font-size: 24px;
    color: #1e88e5;
    margin: 0 0 5px 0;
    font-weight: bold;
}
.header-sub {
    font-size: 13px;
    color: #666;
}

/* 内容块样式 - 极简白底 */
.block {
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 30px; 
    background: #ffffff; 
    box-shadow: none;
    border: 1px solid #f0f0f0; 
}
/* 左侧边条 */
.block-reading { border-left: 5px solid #42a5f5; border-radius: 0 8px 8px 0; }
.block-solution { border-left: 5px solid #66bb6a; border-radius: 0 8px 8px 0; }
.block-extra { border-left: 5px solid #ffa726; border-radius: 0 8px 8px 0; }
.block-practice { border-left: 5px solid #8e24aa; border-radius: 0 8px 8px 0; }

.highlight {
    margin-top: 15px;
    padding: 12px;
    border-radius: 6px;
    background: #fff9c4;
    border: 1px dashed #fbc02d;
}

/* 关键词“贴纸”样式 */
.kw-subject, .kw-verb, .kw-time, .kw-number, .kw-relation, .kw-question {
    display: inline-block;
    padding: 2px 6px;
    margin: 1px 2px;
    border-radius: 4px;
    font-weight: bold;
    line-height: 1.2;
    white-space: nowrap;
    border: 1px solid;
}

/* 颜色定义 */
.kw-subject { background: #bbdefb; color: #1565c0; border-color: #64b5f6; }
.kw-verb    { background: #c8e6c9; color: #2e7d32; border-color: #81c784; }
.kw-time    { background: #e1bee7; color: #6a1b9a; border-color: #ce93d8; }
.kw-number  { background: #ffcdd2; color: #d32f2f; border-color: #ef9a9a; }
.kw-relation{ background: #ffe0b2; color: #ef6c00; border-color: #ffb74d; }
.kw-question{ background: #b2dfdb; color: #00897b; border-color: #4db6ac; }

/* 关键字/知识点/基础概念高亮（紫色高亮） */
.key-word {
    font-weight: bold;
    color: #9c27b0; 
    background: #f3e5f5; 
    border: 1px solid #ce93d8; 
    padding: 2px 4px;
    border-radius: 4px;
}
/* 关键步骤/结论高亮 */
.key-step {
    font-weight: bold;
    color: #2e7d32;
    border-bottom: 2px solid #2e7d32;
    padding-bottom: 1px;
}

/* 排版留白 */
h1, h2, h3, h4 { margin: 6px 0; }
h2 { font-size: 18px; color: #1e88e5; border-bottom: 2px solid #1e88e5; padding-bottom: 5px; margin: 0 0 18px 0; }
h3 { font-size: 16px; color: #444; margin: 20px 0 10px 0; font-weight: bold; }
p { margin: 8px 0; line-height: 1.7; }
ul { margin: 10px 0 10px 25px; padding: 0; list-style-type: disc; }
li { margin-bottom: 8px; line-height: 1.6; }

@media print {
    body { background: #ffffff; }
    .wrapper { box-shadow: none; padding: 0; width: auto; }
    .block, .highlight, .key-word, 
    .kw-subject, .kw-verb, .kw-time, 
    .kw-number, .kw-relation, .kw-question {
        -webkit-print-color-adjust: exact; 
        print-color-adjust: exact;
    }
}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-title">牛爸小课堂 · 审题讲解</div>
    <div class="header-sub">自动生成时间：${dateStr}</div>
  </div>
  <main>
  ${innerHtml}
  </main>
</div>
</body>
</html>`;

        const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = newFileName;
        a.click();
        URL.revokeObjectURL(url);

    } catch (e) {
        console.error("调用出错：", e);
        alert("发生错误：" + e.message + "\\n请检查 API Key 或模型是否支持图片输入。");
    } finally {
        loadingMask.classList.add("hidden");
    }
});
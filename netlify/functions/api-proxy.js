// netlify/functions/api-proxy.js

exports.handler = async function(event, context) {
    // 1. 从 Netlify 的环境变量中获取 API Key
    // 我们稍后会在 Netlify 后台设置这个变量，名字叫 OPENAI_API_KEY
    const API_KEY = process.env.OPENAI_API_KEY;

    // 2. 检查请求方法
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        // 3. 获取前端发来的数据（包含 model, messages 等）
        const requestBody = JSON.parse(event.body);

        // 4. 这里的地址换成您原本使用的中转地址
        const targetUrl = "https://api.videocaptioner.cn/v1/chat/completions";

        // 5. 由服务器发起真正的请求（这一步用户是看不见的）
        const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}` // Key 在这里安全地加上
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // 6. 把结果返回给前端
        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "服务器内部错误", details: error.message })
        };
    }
};
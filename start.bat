@echo off
REM —— 切到脚本所在目录 ——
cd /d "%~dp0"

REM —— 切到 UTF-8（如果你用的是 ANSI/GBK，就改成 chcp 936 并保存为 ANSI） ——
chcp 65001 >nul

REM 定义首选端口，方便后续修改
set "PREFERRED_PORT=9457"

REM ===== 检查 Ollama 是否可用 =====
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] 未找到 Ollama，已自动跳过 Ollama 相关步骤。
    goto SKIP_OLLAMA
)

REM 检查 Ollama 服务是否已运行
netstat -ano | findstr ":11434" | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo [Ollama] 未检测到服务，正在后台启动...
    ollama serve >nul 2>&1
    echo [Ollama] 等待服务初始化...
    timeout /t 3 >nul
) else (
    echo [Ollama] 服务已在运行。
)

:SKIP_OLLAMA

REM ===== 检查 ChatHYM 首选端口是否已被占用 =====
echo.
echo [INFO] 检查首选端口 %PREFERRED_PORT% 是否被占用...
netstat -ano | findstr ":%PREFERRED_PORT%" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [WARNING] 首选端口 %PREFERRED_PORT% 已被占用，Netlify Dev 会自动寻找下一个可用端口。
)

REM === 检查 Node.js ===
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] 未检测到 Node.js，尝试使用 winget 自动安装...
    winget install OpenJS.NodeJS.LTS -h --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo [ERROR] winget 自动安装 Node.js 失败，请手动访问 https://nodejs.org/ 下载并安装！
        start "" "https://nodejs.org/"
        pause
        exit /b
    )
    echo [INFO] Node.js 安装完成，请关闭此窗口并重新运行 start.bat。
    pause
    exit /b
)

REM === 检查 npm ===
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 npm，说明 Node.js 环境异常。请重新安装 Node.js。
    start "" "https://nodejs.org/"
    pause
    exit /b
)

REM === 检查 Netlify CLI ===
where netlify >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] 未检测到 Netlify CLI，正在全局安装...
    npm install -g netlify-cli
    if %errorlevel% neq 0 (
        echo [ERROR] Netlify CLI 安装失败，请检查 npm 设置或网络！
        pause
        exit /b
    )
    echo [INFO] Netlify CLI 安装完成。
) else (
    echo [INFO] Netlify CLI 已安装。
)

echo.
echo [INFO] 启动 Netlify 本地开发服务器...
echo [INFO] (它将使用 netlify.toml 中的端口 %PREFERRED_PORT%，或在被占用时自动寻找下一个)
echo.

REM —— 直接在当前窗口运行 Netlify Dev —— 
netlify dev

REM —— netlify dev 退出后，按任意键关闭脚本 —— 
pause

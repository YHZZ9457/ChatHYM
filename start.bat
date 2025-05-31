@echo off
chcp 65001

REM ===== 检查 Ollama 是否可用 =====
where ollama >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] 未找到 Ollama，已自动跳过 Ollama 相关步骤。
    goto SKIP_OLLAMA
)

REM 检查 Ollama 服务是否已运行（找 11434 端口的进程）
netstat -ano | findstr 11434 >nul
if %errorlevel% neq 0 (
    echo [Ollama] 未检测到服务，正在启动...
    start /b ollama serve
    timeout /t 3 >nul
) else (
    echo [Ollama] 服务已在运行。
)

:SKIP_OLLAMA

REM ===== 新增：检查 ChatHYM 是否已在运行（端口8888） =====
netstat -ano | findstr :8888 >nul
if %errorlevel% equ 0 (
    echo.
    echo [ERROR] ============================================
    echo [ERROR] 检测到端口 8888 已被占用！
    echo [ERROR] ChatHYM 可能已在运行，一次只能启动一个实例。
    echo [ERROR] ============================================
    echo.
    pause
    exit /b
)

REM === 检查 Node.js ===
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] 未检测到 Node.js，尝试使用 winget 自动安装 Node.js LTS...
    winget install OpenJS.NodeJS.LTS -h
    if %errorlevel% neq 0 (
        echo [ERROR] winget 自动安装 Node.js 失败，请手动访问 https://nodejs.org/ 下载并安装 Node.js！
        start https://nodejs.org/
        pause
        exit /b
    )
    echo [INFO] Node.js 安装完成，请重新运行此脚本。
    pause
    exit /b
)

REM === 检查 npm ===
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 npm，说明 Node.js 环境异常。请重新安装 Node.js。
    start https://nodejs.org/
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

REM === 启动 Netlify 本地服务，端口8888 ===
echo.
echo [INFO] 启动 Netlify 本地开发服务器，端口8888...
netlify dev --port 8888

pause
@echo off
chcp 65001
cls
echo ======================================
echo   伴合 Dating App 后端服务启动脚本
echo ======================================
echo.

REM 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo [INFO] 正在安装依赖...
    npm install
    if errorlevel 1 (
        echo [ERROR] 依赖安装失败
        pause
        exit /b 1
    )
)

REM 编译 TypeScript
echo [INFO] 正在编译代码...
call npm run build
if errorlevel 1 (
    echo [ERROR] 编译失败
    pause
    exit /b 1
)

echo.
echo [INFO] 启动服务器...
echo [INFO] 本地地址: http://localhost:3002
echo [INFO] 局域网地址: http://<你的电脑局域网IP>:3002
echo [INFO] 按 Ctrl+C 停止服务
echo.

REM 启动服务
node dist/app.js

pause

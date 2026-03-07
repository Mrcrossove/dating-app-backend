@echo off
chcp 65001
echo ======================================
echo   添加防火墙规则 - 开放 3002 端口
echo ======================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 请以管理员身份运行此脚本
    echo 右键点击脚本，选择"以管理员身份运行"
    pause
    exit /b 1
)

echo [INFO] 正在添加防火墙规则...

REM 添加入站规则
netsh advfirewall firewall add rule name="Dating App Backend - 3002" dir=in action=allow protocol=TCP localport=3002
if %errorlevel% equ 0 (
    echo [SUCCESS] 入站规则添加成功
) else (
    echo [WARN] 入站规则可能已存在或添加失败
)

REM 添加出站规则
netsh advfirewall firewall add rule name="Dating App Backend - 3002 Out" dir=out action=allow protocol=TCP localport=3002
if %errorlevel% equ 0 (
    echo [SUCCESS] 出站规则添加成功
) else (
    echo [WARN] 出站规则可能已存在或添加失败
)

echo.
echo [INFO] 当前防火墙规则:
netsh advfirewall firewall show rule name="Dating App Backend"

echo.
echo [SUCCESS] 防火墙配置完成！
echo.
pause
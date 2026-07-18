@echo off
title Gulati Store POS - Thermal Print Agent
color 0A
echo =======================================================
echo   GULATI STORE POS - THERMAL PRINT AGENT
echo   Cloud Server: https://gulati-store-pos.onrender.com
echo   Listening for mobile checkouts & receipts...
echo.  
echo   Keep this window open while your shop is open.
echo =======================================================
echo.

cd /d "C:\Users\Puneet Gulati\.gemini\antigravity\scratch\grocery-store-tool"
node laptop_print_agent.js

pause

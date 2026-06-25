@echo off
cd /d "C:\Users\Arjun\Downloads\salty-pumpkin-delhivery-razorpay-hostinger-ready\project"
echo Starting Salty Pumpkin backend on http://127.0.0.1:5000
echo For the frontend, run run-frontend.bat in another window and open http://127.0.0.1:5173
echo Keep this window open while using the site.
npm run dev:backend
echo.
echo Server stopped. Press any key to close this window.
pause >nul

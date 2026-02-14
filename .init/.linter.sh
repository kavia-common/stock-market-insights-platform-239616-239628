#!/bin/bash
cd /home/kavia/workspace/code-generation/stock-market-insights-platform-239616-239628/frontend_react_js
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi


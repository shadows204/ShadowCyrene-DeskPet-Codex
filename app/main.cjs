'use strict';
if(process.argv.includes('--bridge-mcp'))require('./bridge-mcp.cjs').run();
else require('./desktop.cjs');

import {spawn} from 'node:child_process';
const children=[spawn('bun',['--watch','apps/api/server.ts'],{stdio:'inherit',env:process.env}),spawn('bun',['run','dev'],{stdio:'inherit',env:process.env})];
function stop(){for(const child of children)child.kill('SIGTERM')}
process.on('SIGINT',stop);process.on('SIGTERM',stop);for(const child of children)child.on('exit',stop);

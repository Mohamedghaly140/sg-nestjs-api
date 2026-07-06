const { execFileSync } = require('node:child_process');

let prismaCli;

try {
  prismaCli = require.resolve('prisma/build/index.js');
} catch (error) {
  if (error && error.code === 'MODULE_NOT_FOUND') {
    console.log('Skipping Prisma Client generation: Prisma CLI is not installed.');
    process.exit(0);
  }

  throw error;
}

execFileSync(process.execPath, [prismaCli, 'generate'], {
  stdio: 'inherit',
});

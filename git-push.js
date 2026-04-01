const { execSync } = require('child_process');

try {
  console.log('Staging...');
  execSync('git add "src/app/(protected)/input/page.tsx"', { stdio: 'inherit' });

  console.log('Committing...');
  execSync('git commit -m "fix: water meter recalc bug - wrong row assignment + missing day-1 baseline from prev month"', { stdio: 'inherit' });

  console.log('Pushing...');
  execSync('git push', { stdio: 'inherit' });

  console.log('Done!');
} catch (err) {
  console.error('Error:', err.message);
}

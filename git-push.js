const { execSync } = require('child_process');

try {
  console.log('Adding files...');
  execSync('git add src/app/(protected)/dashboard/page.tsx', { stdio: 'inherit' });
  
  console.log('Committing changes...');
  execSync('git commit -m "style: optimize mobile dashboard text sizes"', { stdio: 'inherit' });
  
  console.log('Pushing to GitHub...');
  execSync('git push', { stdio: 'inherit' });
  
  console.log('Done! Deploy to Vercel triggered.');
} catch (err) {
  console.error('Error during git push:', err.message);
}

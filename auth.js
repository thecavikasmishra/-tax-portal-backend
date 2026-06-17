// scripts/hashPassword.js
// Run: node scripts/hashPassword.js
// Then paste the output into your .env as ADMIN_PASSWORD_HASH
// Or just use the seed.js which handles this automatically.

const bcrypt = require('bcryptjs');
const password = process.argv[2] || 'ChangeMe@123';
bcrypt.hash(password, 12).then(hash => {
  console.log('\nPassword hash for:', password);
  console.log(hash);
  console.log('\nPaste this into your .env as ADMIN_PASSWORD_HASH\n');
  process.exit(0);
});

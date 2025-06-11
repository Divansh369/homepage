// backend/scripts/hash-password.js
const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('--- Admin Password Hash Generator ---');
rl.question('Please enter the password you want to use for the admin panel: ', (password) => {
  if (!password) {
    console.error('Password cannot be empty.');
    rl.close();
    return;
  }
  
  const saltRounds = 10;
  bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
      console.error('Error generating hash:', err);
      rl.close();
      return;
    }
    console.log('\n✅ Password hashed successfully!');
    console.log('Copy this entire line into your .env file:\n');
    console.log(`ADMIN_PASSWORD_HASH='${hash}'`);
    rl.close();
  });
});

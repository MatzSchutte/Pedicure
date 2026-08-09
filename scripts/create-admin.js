// Gebruik: node scripts/create-admin.js "jouw-wachtwoord"
// Plak de output in .env als ADMIN_PASSWORD_HASH
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Gebruik: node scripts/create-admin.js "jouw-wachtwoord"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log('\nPlak deze regel in je .env bestand:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);

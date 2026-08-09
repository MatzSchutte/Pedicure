const bcrypt = require('bcryptjs');

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Niet ingelogd. Log opnieuw in.' });
}

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
  }

  const envUsername = process.env.ADMIN_USERNAME;
  const envHash = process.env.ADMIN_PASSWORD_HASH;

  if (!envUsername || !envHash) {
    return res.status(500).json({ error: 'Adminaccount is niet geconfigureerd. Controleer de .env instellingen.' });
  }

  if (username !== envUsername) {
    return res.status(401).json({ error: 'Onjuiste gebruikersnaam of wachtwoord.' });
  }

  const match = await bcrypt.compare(password, envHash);
  if (!match) {
    return res.status(401).json({ error: 'Onjuiste gebruikersnaam of wachtwoord.' });
  }

  req.session.isAdmin = true;
  req.session.username = username;
  res.json({ success: true });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
}

module.exports = { requireAdmin, login, logout };

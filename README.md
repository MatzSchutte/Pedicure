# Pedicure Bianca Passmann — Booking website

Self-hosted website met online afsprakenplanner voor Pedicure Bianca Passmann
(Hazelaarstraat 3, Lutten). Alle gegevens (afspraken, beschikbaarheid,
behandelingen) worden lokaal opgeslagen in een SQLite-database op je eigen
server — er wordt geen externe boekingsdienst of externe database gebruikt.

## Inhoud

- `public/` — de website (klantgedeelte `index.html`, beheer `admin.html`)
- `server/` — Node.js/Express backend + REST API
- `data/` — SQLite-database (`pedicure.sqlite`), wordt automatisch aangemaakt
- `backups/` — dagelijkse database-backups
- `nginx/` — reverse-proxy configuratie met HTTPS
- `scripts/` — hulpscripts (admin-wachtwoord aanmaken, backups)

## 1. Vereisten

- Docker + Docker Compose (aanbevolen), **of**
- Node.js 20+ als je zonder Docker wilt draaien

## 2. Configuratie (.env)

Kopieer `.env.example` naar `.env` en vul de waarden in:

```bash
cp .env.example .env
```

Genereer daarna een wachtwoord-hash voor het adminaccount van Bianca:

```bash
node scripts/create-admin.js "kies-hier-een-sterk-wachtwoord"
```

Plak de uitkomst (`ADMIN_PASSWORD_HASH=...`) in `.env`, samen met de gewenste
`ADMIN_USERNAME`. Vul ook `SESSION_SECRET` in met een lange willekeurige
tekenreeks (bijvoorbeeld via `openssl rand -hex 32`).

Vul optioneel de SMTP-gegevens in als je automatische e-mailbevestigingen
wilt versturen. Zonder SMTP-configuratie werkt de website gewoon, alleen
worden er dan geen bevestigingsmails verstuurd.

## 3a. Installatie op een Proxmox LXC via GitHub (aanbevolen voor deze setup)

Dit is de snelste weg als je de code op GitHub zet en op een verse Proxmox
container (Debian/Ubuntu) draait. Er is geen Docker nodig; het script zet
de app op als een systemd-service achter Nginx.

**Op je eigen machine, eenmalig:**

```bash
cd pedicure-bianca
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<jouw-gebruikersnaam>/pedicure-bianca.git
git push -u origin main
```

Let op: `.env`, `data/` en `backups/` staan in `.gitignore` en worden dus
terecht *niet* meegepusht — die bevatten wachtwoorden en persoonsgegevens.

**Op de Proxmox LXC (als root):**

```bash
apt update && apt install -y git
git clone https://github.com/<jouw-gebruikersnaam>/pedicure-bianca.git
cd pedicure-bianca
bash install.sh
```

Het script `install.sh` doet automatisch:

- Node.js 20 en alle benodigde systeempakketten installeren
- Een aparte, onbevoorrechte systeemgebruiker (`pedicure`) aanmaken
- `npm install` uitvoeren
- Je interactief vragen om admin-gebruikersnaam/wachtwoord en (optioneel)
  domein en SMTP-gegevens, en `.env` daarmee invullen
- Een systemd-service (`pedicure-bianca`) aanmaken die automatisch start
  en herstart bij een crash of reboot
- Nginx als reverse proxy instellen (als je een domein opgeeft), inclusief
  optioneel automatisch HTTPS via Let's Encrypt/certbot
- De firewall (ufw) openzetten voor SSH en Nginx
- Een dagelijkse backup-cronjob instellen (03:00, laatste 30 backups)

Na afloop:

```bash
systemctl status pedicure-bianca      # status bekijken
journalctl -u pedicure-bianca -f      # live logs
```

**Updaten na wijzigingen op GitHub:**

```bash
cd /pad/naar/pedicure-bianca
git pull
npm install --omit=dev
systemctl restart pedicure-bianca
```

## 3b. Starten met Docker (alternatief)

```bash
docker compose up -d --build
```

- De website draait dan achter Nginx.
- Pas `nginx/nginx.conf` aan met het echte domeinnaam en zorg voor een
  geldig SSL-certificaat in `nginx/certs/` (bijvoorbeeld via Let's Encrypt /
  certbot) voordat je live gaat. Tot die tijd kun je de site testen via
  `http://localhost` op de server zelf.

## 4. Starten zonder Docker (handmatig, zonder install.sh)

```bash
npm install
npm start
```

De site is dan bereikbaar op `http://localhost:3000`. Zet in dat geval zelf
een webserver (Nginx/Apache) als reverse proxy ervoor met HTTPS.

## 5. Gebruik

- **Klanten**: gaan naar de website, kiezen een behandeling, kiezen
  praktijk of aan huis, kiezen een vrije datum/tijd en vullen hun gegevens
  in. Dubbele boekingen zijn technisch onmogelijk, omdat elke boeking in
  een databasetransactie nogmaals wordt gecontroleerd voordat deze wordt
  opgeslagen.
- **Bianca**: logt in op `/admin` met de gebruikersnaam/wachtwoord uit de
  `.env`. Daar kan ze:
  - haar weekschema instellen (welke dagen/tijden ze werkt),
  - eenmalige aanpassingen en vakanties/feestdagen toevoegen,
  - losse tijdsblokken blokkeren,
  - afspraken bekijken, bewerken, annuleren of handmatig toevoegen,
  - behandelingen (prijs, duur, praktijk/aan huis) beheren,
  - de teksten op de website (hero, "Over Bianca", contactgegevens)
    aanpassen.

## 6. Backups

De database staat in `data/pedicure.sqlite`. Voor dagelijkse backups:

```bash
chmod +x scripts/backup.sh
```

Voeg een cronjob toe op de server (buiten Docker, of via een aparte
cron-container) die dit script dagelijks uitvoert, bijvoorbeeld om 03:00:

```
0 3 * * * /volledig/pad/naar/scripts/backup.sh
```

Het script bewaart automatisch de laatste 30 backups in `backups/` en
verwijdert oudere bestanden. Backups worden nooit in de `public/` map
gezet, zodat ze niet via de website bereikbaar zijn.

## 7. Beveiliging

- Wachtwoorden worden nooit in platte tekst opgeslagen (bcrypt-hash).
- Sessies verlopen automatisch na 8 uur.
- Alle schrijf-acties (boekingen, adminwijzigingen) zijn beschermd tegen
  CSRF.
- Rate limiting voorkomt misbruik van het inlogformulier en de API.
- De SQLite-database staat buiten de `public/` map en is via Nginx
  expliciet geblokkeerd voor rechtstreekse toegang.
- Zet in productie altijd HTTPS aan (zie `nginx/nginx.conf`).

## 8. Problemen oplossen

- **Kan niet inloggen**: controleer of `ADMIN_USERNAME` en
  `ADMIN_PASSWORD_HASH` correct in `.env` staan en herstart de container
  (`docker compose restart web`).
- **Geen bevestigingsmails**: controleer de SMTP-instellingen in `.env`.
  Zonder geldige SMTP-configuratie worden er geen mails verstuurd, maar
  blijft de rest van de website gewoon werken.
- **Tijden worden niet getoond**: controleer in het adminpanel onder
  "Beschikbaarheid" of er voor die dag een weekschema of eenmalige
  beschikbaarheid is ingesteld.

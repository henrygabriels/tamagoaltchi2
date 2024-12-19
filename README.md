# Tamagoaltchi

A retro-style Tamagotchi-inspired Fantasy Premier League companion that notifies you about your team's events in real-time.

## Features

- 🎮 Retro Tamagotchi-style interface
- ⚽ Real-time FPL updates for your team
- 📱 Push notifications for:
  - Goals and assists
  - Clean sheets
  - Bonus points
  - Cards (yellow/red)
  - Minutes played milestones
  - Saves and penalties
- 🎯 Live team score tracking
- 👔 Customizable manager appearance
- 🌐 WebSocket-based live updates
- 📊 Detailed player statistics

## Tech Stack

- **Frontend**: Next.js, TypeScript, TailwindCSS
- **Backend**: Node.js, Express, WebSocket
- **APIs**: Fantasy Premier League API
- **Notifications**: Web Push API

## Project Structure

```
/
├── src/                # Frontend source code
│   ├── components/     # React components
│   ├── pages/         # Next.js pages
│   ├── services/      # API and service integrations
│   └── styles/        # CSS and styling
└── server/            # Backend server code
    └── src/           # Server source code
```

## Setup

1. Install dependencies:
```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install
```

2. Set up environment variables:
```bash
# Frontend (.env.local)
NEXT_PUBLIC_SERVER_URL=http://localhost:3001

# Backend (server/.env)
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_EMAIL=your_email
```

3. Run the development servers:
```bash
# Run frontend (in root directory)
npm run dev

# Run backend (in server directory)
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. Enter your FPL Team ID (found in your FPL team URL)
2. Customize your manager's appearance
3. Keep the app open to receive notifications about your team's performance

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)
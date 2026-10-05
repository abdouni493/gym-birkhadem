# Gym Management App

A modern gym management system built with React, TypeScript, Vite, and Supabase.

## Quick Start

### Prerequisites
- Node.js 18+ or Bun
- A Supabase account and project

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/abdouni493/gym-douira.git
   cd gym-douira
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Open `.env` and update with your Supabase credentials:
     ```env
     VITE_SUPABASE_URL=https://your-project.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-key
     ```
   - Get these values from [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API

4. **Start the development server**
   ```bash
   npm run dev
   # or
   bun run dev
   ```

5. **Build for production**
   ```bash
   npm run build
   # or
   bun run build
   ```

## Environment Variables

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous/public key (safe to expose)

**⚠️ IMPORTANT:** Never commit the `.env` file or put the `service_role` key in client-side code.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Forms:** React Hook Form

## Project Structure

```
├── src/
│   ├── components/       # Reusable React components
│   ├── pages/           # Page components
│   ├── lib/             # Utility functions and API calls
│   ├── contexts/        # React contexts
│   ├── hooks/           # Custom React hooks
│   ├── types/           # TypeScript type definitions
│   └── App.tsx          # Main app component
├── public/              # Static assets
├── supabase/            # Supabase configuration and functions
└── index.html           # HTML entry point
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build locally

## Troubleshooting

### Error: "Supabase is not configured"
1. Ensure `.env` file exists in the project root
2. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly
3. Restart the development server: `npm run dev`

### Database schema issues
Run the migration from `supabase_schema.sql` in your Supabase SQL editor.

## License

This project is private and proprietary.

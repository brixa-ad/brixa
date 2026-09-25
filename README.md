# BRIXA

A CRM for real estate agencies, built with Next.js 16, Supabase and Tailwind CSS. The interface is in Bulgarian and English.

## What's inside

- **Accounts**: sign up / sign in. Each new user automatically gets their own agency. The owner can invite brokers by email.
- **Properties**: a list with search, filters and stats; a New Property form; a detail page; an edit page.
- **Form**: categories → property types → extras for that type. Searchable town/village picker (typing Latin like "sofia" also works). Neighborhoods for Sofia, Varna, Plovdiv and Burgas. Dropdowns for condition, construction, exposure, furnishing and heating. Validation in the browser and again on the server. A live preview with price per m².
- **Photos**: drag & drop upload. Photos are resized before upload, the first one is the cover, and they're stored in a private Supabase Storage bucket.
- **Price history**: recorded automatically by the database whenever the price changes.
- **Security**: every table has Row Level Security. Agencies can never see each other's data.

## Setup (about 10 minutes)

### 1. Create a Supabase project
1. Go to <https://supabase.com/dashboard> → **New project**. Pick a region close to Bulgaria, e.g. *Frankfurt*.
2. Wait until it finishes provisioning.

### 2. Create the database
1. In the project, open **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. New query → paste [`supabase/seed.sql`](supabase/seed.sql) → **Run**.

### 3. Connect the app
1. Copy `.env.local.example` to `.env.local`.
2. In Supabase → **Project Settings → API Keys**, copy the **Project URL** and the **Publishable key** into `.env.local`.

### 4. Auth settings
Go to Supabase → **Authentication → URL Configuration**:
- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: add `http://localhost:3000/auth/callback`

**Optional:** for quick local testing, turn off **Authentication → Sign In / Providers → Email → Confirm email**. Users can then sign in right after signing up without clicking an email link.

### 5. Run it
```bash
npm install
npm run dev
```
Open <http://localhost:3000>, sign up, and add your first property.

## Inviting a colleague
The owner opens **Team** and enters the colleague's email. The colleague then signs up with that same email and joins the agency automatically. No invitation email is sent, so tell them yourself.

## Project layout
```
app/
  login/                 sign in / sign up
  auth/callback/         email-confirmation landing
  (app)/properties/      list, new, [id], [id]/edit + server actions
  (app)/team/            members & invitations
components/property/     PropertyForm, LocationPicker, photos, status…
lib/
  i18n/dictionaries.ts   all BG/EN text
  options.ts             fixed dropdown values (stored as codes)
  validation.ts          shared validation rules (browser + server)
supabase/
  schema.sql             tables, triggers, RLS, storage bucket
  seed.sql               categories, features, regions, towns, neighborhoods
```

## Adding more towns
`seed.sql` has all 28 regions and about 220 towns and villages. To load the full national list, import the official EKATTE register into `geo_settlements` (`region_id`, `name`, `settlement_type` = `гр.` / `с.`). The app loads more than 1000 rows automatically.

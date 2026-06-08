# JEXXXUS CLI 💖

The native command-line agent tool for the **BLXCKBOOK** ecosystem's **JEXXXUS Vault** and **MAMAbase**.

Featuring a glistening pink terminal interface, the JEXXXUS CLI allows secure ingestion, profile management, and duplicate checking for vessel records.

---

## 🚀 Features

- **Sexy Pink Glistening Aesthetics**: Premium, styled CLI experience on startup.
- **CSV Ingestion**: Easily parse and bulk-import contact/vessel entries.
- **Smart Duplicate Prevention**: Automatic detection of duplicate entries before database inserts, aligned with database trigger rules (`check_vessel_duplicate`).
- **Flexible Overrides**: Use force commands to bypass checks where permitted.

---

## 🛠️ Getting Started

### 1. Prerequisites

Ensure you have **Node.js** (v18 or higher) and **npm** installed on your system.

### 2. Installation & Build

Clone the repository and install dependencies:

```bash
# Clone the repository (if not already local)
git clone git@github.com:blxckbooklabs/jexxx.us-cli.git
cd jexxx.us-cli

# Install dependencies
npm install

# Compile the TypeScript code
npm run build
```

### 3. Setup Environment Variables

The CLI reads the Supabase configuration from a `.env` file located in the root directory of the CLI project.

Create a `.env` file:

```bash
touch .env
```

Populate the `.env` with your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-jwt-key
```

> [!WARNING]
> **Never commit your `.env` file to git.** It contains sensitive service-role keys that bypass Row-Level Security (RLS). Ensure it is listed in your `.gitignore`.

### 4. Link the CLI Globally

To make the `jexxxus` command available globally across your shell:

```bash
npm link
```

Now you can invoke the CLI from any directory using the command:
```bash
jexxxus
```

---

## 📖 Usage Guide

### Import Vessels / Contacts from CSV

You can import profiles directly from a CSV file. The CSV should contain headers like `Name`, `Bio`/`Notes`, and `Tags` (comma-separated list).

```bash
jexxxus import path/to/vessels.csv
```

#### CSV Headers Supported:
- **Name** (or `name`): The name of the vessel profile.
- **Bio** (or `bio`, `Notes`, `notes`): A description or summary.
- **Tags** (or `tags`): A comma-separated list of tags (e.g., `"model, pink, verified"`).

#### Options:
- `-f, --force`: Bypasses default check flags and forces execution (if database triggers permit).

```bash
jexxxus import path/to/vessels.csv --force
```

---

## 📄 License

This project is licensed under the ISC License.

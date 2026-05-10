# SkillsHub

SkillsHub is a modern, TypeScript-based desktop application designed to manage the full lifecycle of skills, from discovery to distribution. Built with **React**, **Vite**, and **Tauri**.

## 🚀 Key Features

- **Global Search**: Instantly find skills across multiple registries and repositories.
- **My Skills**: Manage your local collection of developed or acquired skills.
- **Bookmarks & Collections**: Save and organize skills from GitHub, Gerrit, or internal warehouses.
- **Distribution Management**:
  - **Distributed**: Track skills already submitted to remote repositories.
  - **Pending**: Identify local skills ready for submission.
- **Skill Store**: Browse and discover new skills from curated catalogs.

## 🛠 Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install) (Required for Tauri desktop builds)

## 💻 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Development

#### Web Environment (Browser)
```bash
npm run dev
```

#### Desktop Environment (Tauri)
```bash
npm run tauri:dev
```

### 3. Build

#### Web Build
```bash
npm run build
```

#### Desktop Build (Native Executable)
```bash
npm run tauri:build
```

## 🏗 Technology Stack

- **Frontend**: React 19, TypeScript, Vite
- **Desktop Bridge**: Tauri 2.0
- **Styling**: Vanilla CSS (Modern CSS features)
- **Icons**: Lucide React

## 📄 License

MIT

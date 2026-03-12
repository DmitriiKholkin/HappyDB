<div align="center">

# 🗄️ HappyDB

**Full-featured database manager right inside VS Code**

[![Version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)](https://github.com/DmitriiKholkin/HappyDB)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC?style=flat-square&logo=visualstudiocode)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-Elastic%20v2-orange?style=flat-square)](LICENSE)

<br/>

Manage your databases without leaving the editor — browse tables, run queries, inspect schemas and edit data, all from a comfortable webview panel.

</div>

---

## ✨ Features

- 🔌 **Multi-database support** — PostgreSQL, MySQL, MSSQL, SQLite
- 🌳 **Connection tree** — sidebar panel with all your connections and their schemas (tables, views, functions)
- 📝 **SQL editor** — write and execute queries with results shown inline
- 📊 **Data grid** — paginated table viewer with sorting and filtering
- 🏗️ **Schema inspector** — view columns, types, constraints, indexes and foreign keys
- 🕓 **Query history** — keeps the last N queries (configurable)
- ⚡ **Fast builds** — extension bundled with esbuild, webview built with Vite

---

## 🗃️ Supported Databases

| Database       | Driver              |
|----------------|---------------------|
| PostgreSQL     | `pg`                |
| MySQL / MariaDB| `mysql2`            |
| Microsoft SQL  | `mssql`             |
| SQLite         | `better-sqlite3`    |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [VS Code](https://code.visualstudio.com/) ≥ 1.85

### Installation (from source)

```bash
# Clone the repository
git clone https://github.com/DmitriiKholkin/HappyDB.git
cd HappyDB

# Install extension dependencies
npm install

# Install webview dependencies
cd webview && npm install && cd ..

# Build everything
npm run build
```

## 🔧 Usage

1. Open the **HappyDB** panel from the VS Code Activity Bar (database icon).
2. Click **＋ Add Connection** and fill in the connection details.
3. Click the **plug icon** next to a connection to connect.
4. Browse databases, schemas, tables and views in the tree.
5. Click a table to open the **Data Grid** — scroll, sort and filter rows.
6. Click **New SQL Query** to open the query editor for that connection.
7. Click the **layout icon** on a table to open the **Schema Inspector**.

---

## ⚙️ Configuration

Settings are available under `HappyDB` in VS Code preferences:

| Setting | Type | Default | Description |
|---|---|---|---|
| `happydb.connections` | `array` | `[]` | Saved connection list |
| `happydb.pageSize` | `number` | `100` | Rows per page in the data grid |
| `happydb.queryHistoryLimit` | `number` | `50` | Max queries kept in history |
| `happydb.autoRefresh` | `boolean` | `false` | Auto-refresh tree after changes |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Extension runtime | TypeScript + esbuild |
| Webview UI | React 18 + Vite |
| State management | Zustand |
| DB drivers | pg · mysql2 · mssql · better-sqlite3 |

---

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **[Elastic License 2.0 (ELv2)](LICENSE)**.

You are free to use, modify and distribute the source code for **non-commercial purposes**. Commercial use — including offering the software as a hosted/managed service — is not permitted without explicit written permission from the author.

> See the full license text in the [`LICENSE`](LICENSE) file or at [elastic.co/licensing/elastic-license](https://www.elastic.co/licensing/elastic-license).

---

<div align="center">
Made with ❤️ by <a href="https://github.com/DmitriiKholkin">Dmitrii Kholkin</a>
</div>
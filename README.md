<div align="center">

# HappyDB

**Full-featured database manager right inside VS Code**

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/DmitriiKholkin.happy-db?style=flat-square&label=VS%20Marketplace&logo=visualstudiocode&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=DmitriiKholkin.happy-db)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC?style=flat-square&logo=visualstudiocode)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Issues](https://img.shields.io/github/issues/DmitriiKholkin/HappyDB?style=flat-square)](https://github.com/DmitriiKholkin/HappyDB/issues)

<br/>

[![License](https://img.shields.io/badge/license-Elastic%20v2-orange?style=flat-square)](LICENSE.md)

<br/>

Manage your databases without leaving the editor — browse tables, run queries, inspect schemas and edit data, all from a comfortable webview panel.

<br/>
 
<a href="https://marketplace.visualstudio.com/items?itemName=DmitriiKholkin.happy-db">
  <img src="https://img.shields.io/badge/Install%20from%20Marketplace-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="Install from Marketplace"/>
</a>

</div>

---

# DEPRECATED.
# For better interaction, use my new core extension [RapiDB](https://marketplace.visualstudio.com/items?itemName=DmitriiKholkin.rapidb)

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

| Database        | Driver           | Required fields                                      |
|-----------------|------------------|------------------------------------------------------|
| PostgreSQL      | `pg`             | `host`, `port`, `database`, `username`, `ssl`        |
| MySQL / MariaDB | `mysql2`         | `host`, `port`, `database`, `username`, `ssl`        |
| Microsoft SQL   | `mssql`          | `host`, `port`, `database`, `username`, `ssl`, `trustServerCertificate` |
| SQLite          | `better-sqlite3` | `filePath`                                           |

All connections share `name`, `type` and optional `password`.

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

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Extension runtime | TypeScript + esbuild |
| Webview UI | React 18 + Vite |
| State management | Zustand |
| DB drivers | pg · mysql2 · mssql · better-sqlite3 |

---

## 🤝 Contributing & Feedback

Bug reports, feature requests and pull requests are all welcome!

- 🐛 **Found a bug?** — [open an issue](https://github.com/DmitriiKholkin/HappyDB/issues/new?template=bug_report.md)
- 💡 **Have an idea?** — [suggest a feature](https://github.com/DmitriiKholkin/HappyDB/issues/new?template=feature_request.md)
- ⭐ **Enjoying HappyDB?** — [leave a review](https://marketplace.visualstudio.com/items?itemName=DmitriiKholkin.happy-db&ssr=false#review-details)

To contribute code: fork the repo → create a branch → commit → open a PR.

---

## 📄 License

This project is licensed under the **[Elastic License 2.0 (ELv2)](LICENSE.md)**.

You are free to use, modify and distribute the source code for **non-commercial purposes**. Commercial use — including offering the software as a hosted/managed service — is not permitted without explicit written permission from the author.

> See the full license text in the [`LICENSE`](LICENSE.md) file or at [elastic.co/licensing/elastic-license](https://www.elastic.co/licensing/elastic-license).

---

<div align="center">
Made with ❤️ by <a href="https://github.com/DmitriiKholkin">Dmitrii Kholkin</a>
</div>
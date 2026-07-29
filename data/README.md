# 运行数据目录

这里保存 CareerPilot 的本机运行数据。用户界面不提供完整 JSON 导入或导出入口；数据由服务端自动持久化，需要时由开发者直接备份或查询。

## 可读文件

- `catalog.md`：各数据表用途和当前行数，不包含原始正文。
- `schema.sql`：由当前数据库生成的可读 Schema 快照。
- `metrics-snapshot.json`：脱敏的运行、漏斗、评测和数据量指标。
- 运行 `npm run data:summary` 可重新生成以上三个文件。

## 私有运行文件

- `careerpilot.sqlite`：主数据库，包含 JD、简历版本、面试、Run、Artifact、Eval 和指标。
- `careerpilot.sqlite-wal` / `careerpilot.sqlite-shm`：SQLite WAL 运行文件。
- `files/`：简历、JD 图片和面试音频等原文件。
- `backups/`：数据库一致性快照。

私有运行文件均被 `.gitignore` 排除，避免将求职隐私和模型输入提交到 Git。不要在服务运行时手工移动数据库；备份或恢复前应先停止服务。

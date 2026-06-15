# Inspect — Figma Plugin

Плагин для инспекта слоёв в Figma: размеры, layout, цвета, variables, экспорт ассетов и генерация кода (CSS, iOS, Android, Flutter).

## Требования

- [Figma Desktop](https://www.figma.com/downloads/) (macOS или Windows) — в браузере плагин не запускается
- [Node.js](https://nodejs.org/) 18+

## Быстрый старт

### 1. Клонировать репозиторий

```bash
git clone https://github.com/AventusDesign/figmaplugin.git
cd figmaplugin
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Собрать плагин

```bash
npm run build
```

После сборки появятся файлы в `dist/`:
- `dist/code.js` — основная логика (Figma sandbox)
- `dist/ui.html` — UI плагина

> `dist/` не хранится в git. Перед каждым импортом или запуском нужна сборка.

### 4. Импортировать в Figma

1. Открой **Figma Desktop**
2. Создай или открой любой design-файл
3. Меню: **Plugins → Development → Import plugin from manifest…**
4. Выбери файл `manifest.json` из корня проекта

### 5. Запустить плагин

**Plugins → Development → Inspect**

Выбери один слой на канвасе — в панели появятся данные.

## Разработка

### Watch-режим

Автопересборка при изменениях:

```bash
npm run watch
```

После изменений перезапусти плагин в Figma (закрой и открой снова).

### Проверка типов

```bash
npm run typecheck
```

### Структура проекта

```
├── manifest.json          # конфигурация плагина для Figma
├── src/
│   ├── code.ts            # логика в sandbox (Plugin API)
│   ├── ui.ts              # UI и рендер панели
│   ├── ui.html / ui.css   # разметка и стили
│   ├── types.ts
│   └── utils/             # генерация кода, цвета, экспорт и т.д.
├── scripts/build.js       # сборка esbuild
└── dist/                  # артефакты сборки (генерируется)
```

### Горячая перезагрузка в Figma

В Figma Desktop можно включить hot reload для development-плагинов — плагин будет перезапускаться после пересборки без повторного импорта manifest.

## Обновление после изменений кода

1. `npm run build` (или `npm run watch`)
2. В Figma перезапусти плагин

Если менялся `manifest.json` или плагин ведёт себя странно:

1. **Plugins → Development → Manage plugins in development**
2. Удали плагин → **Import plugin from manifest…** заново

## Возможности

- **Inspect** — размеры, позиция, auto-layout, типографика, эффекты
- **Code** — CSS, iOS (SwiftUI), Android (Compose), Flutter
- **Export** — PNG, SVG, PDF, batch export
- **Show Spacing** — overlay отступов на канвасе

## Публикация

Публикация возможна только из **Figma Desktop**. Нужна включённая **2FA** на аккаунте Figma.

1. `npm run build`
2. Импортируй и протестируй плагин
3. **Plugins → Development → Manage plugins in development → … → Publish**
4. Заполни описание, иконку, скриншоты
5. **Publish to → Community** (публично) или **Organization** (только на Organization/Enterprise плане)

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Плагин не появляется в Development | Убедись, что используешь Figma Desktop, не браузер |
| Ошибка при импорте manifest | Выполни `npm run build` — без `dist/` плагин не соберётся |
| Пустая панель | Выбери **один** слой (не несколько) |
| Старый код после правок | Пересобери (`npm run build`) и перезапусти плагин |

## Лицензия

Private — AventusDesign

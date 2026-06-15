# Inspect — Figma Plugin

Плагин для инспекта слоёв в Figma: размеры, layout, цвета, variables, экспорт ассетов и генерация кода (CSS, iOS, Android, Flutter).

## Требования

- [Figma Desktop](https://www.figma.com/downloads/) (macOS или Windows) — в браузере плагин не запускается

## Быстрый старт

Скачай папку проекта и открой в Figma — **npm не нужен**.

### 1. Скачать репозиторий

```bash
git clone https://github.com/AventusDesign/figmaplugin.git
```

Или на GitHub: **Code → Download ZIP**, распакуй.

### 2. Импортировать в Figma

1. Открой **Figma Desktop**
2. Создай или открой любой design-файл
3. **Plugins → Development → Import plugin from manifest…**
4. Выбери `manifest.json` из корня папки проекта

### 3. Запустить

**Plugins → Development → Inspect**

Выбери один слой на канвасе — в панели появятся данные.

## Обновление плагина

Если вышла новая версия — скачай свежую папку (или `git pull`), затем в Figma:

**Plugins → Development → Manage plugins in development → … → Remove**

И снова **Import plugin from manifest…**

## Разработка (если меняешь код)

Нужны [Node.js](https://nodejs.org/) 18+:

```bash
npm install
npm run build    # пересборка после изменений
npm run watch    # автопересборка
npm run typecheck
```

После `npm run build` не забудь закоммитить `dist/`, чтобы остальные могли запускать без сборки.

### Структура проекта

```
├── manifest.json          # конфигурация плагина для Figma
├── dist/                  # собранный плагин (готов к импорту)
│   ├── code.js
│   └── ui.html
├── src/                   # исходники TypeScript
└── scripts/build.js       # сборка
```

## Возможности

- **Inspect** — размеры, позиция, auto-layout, типографика, эффекты
- **Code** — CSS, iOS (SwiftUI), Android (Compose), Flutter
- **Export** — PNG, SVG, PDF, batch export
- **Show Spacing** — overlay отступов на канвасе

## Публикация в Figma Community

Только из **Figma Desktop**, нужна **2FA** на аккаунте.

1. Импортируй и протестируй плагин
2. **Plugins → Development → Manage plugins in development → … → Publish**
3. Заполни описание, иконку, скриншоты
4. **Publish to → Community**

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Плагин не появляется | Используй Figma Desktop, не браузер |
| Ошибка при импорте manifest | Убедись, что в папке есть `dist/code.js` и `dist/ui.html` |
| Пустая панель | Выбери **один** слой (не несколько) |
| Старая версия после обновления | Удали плагин из Development и импортируй manifest заново |

## Лицензия

Private — AventusDesign

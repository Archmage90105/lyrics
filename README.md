# Lyrics (Tauri 2 + Vite)

Текст песни в стиле Яндекс Музыки: своё окно управления, отдельное окно текста, фон-картинка или видео, таймер, поиск в LRCLIB.

## Что нужно поставить один раз
- Node.js 20+
- Rust: https://rustup.rs
- Windows: Microsoft C++ Build Tools (выбрать «Разработка классических приложений на C++»). WebView2 в Windows 10/11 уже есть.
- Linux: `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev` (и GStreamer-плагины для видео: `gstreamer1.0-plugins-good gstreamer1.0-libav`)

## Запуск
    npm install
    npm run tauri dev       # разработка
    npm run tauri build     # установщик: src-tauri/target/release/bundle/

## Как устроено
- `index.html` + `src/main.js`: главное окно (плеер, поиск, настройки, превью).
- `lyrics-view.html` + `src/view.js`: окно текста. Состояние приходит событиями Tauri, имена в `src/bus.js`.
- `src/display.js`: общий код отрисовки для превью и окна текста.
- Аудио и фон выбираются через системный диалог и играют по `convertFileSrc` (asset-протокол), поэтому оба окна видят один и тот же файл.
- Тексты, найденные в LRCLIB, кэшируются в localStorage: повторно работают без интернета.
- F11 в окне текста: полный экран, Esc: выйти.
- Иконка: `app-icon.png` → `npx tauri icon app-icon.png` пересоздаёт все размеры.

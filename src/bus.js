/* Имена событий между главным окном и окном текста */
export const EV = {
  lines: 'lyr:lines',     // main -> view: массив строк [{time,text}]
  bg: 'lyr:bg',           // main -> view: {path,vid} или null
  set: 'lyr:set',         // main -> view: {S,off} настройки и сдвиг текста
  tick: 'lyr:tick',       // main -> view: время аудио и таймер, ~10 раз в секунду
  seek: 'lyr:seek',       // main -> view: перемотка (видео-фон пойдёт с того же места)
  ready: 'lyr:ready',     // view -> main: окно загрузилось, пришли всё состояние
  hb: 'lyr:hb',           // view -> main: «я открыто» + статистика видео
  seekreq: 'lyr:seekreq', // view -> main: клик по строке в окне текста
  status: 'lyr:status',   // view -> main: сообщение для строки состояния (ошибки видео)
};

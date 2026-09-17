# Нагрузочный и soak-прогон — задача 33

Дата: 2026-09-17. Локальный стенд: Node.js server и Socket.io clients на одном Windows-host; `127.0.0.1`, без внешней сети и без реальных media-устройств.

## Socket-only профиль

Команда: `npm.cmd run test:soak`.

| Параметр | Результат |
| --- | --- |
| Независимые комнаты | 50 |
| Участников на комнату | 4 |
| Циклов join/leave | 3 |
| Всего join | 600 |
| Длительность | 987 мс |
| Registry после завершения | 0 комнат, 0 участников |
| Оставшиеся sockets | 0 |
| Heap до / пик / после принудительного GC | 16 040 144 / 62 965 376 / 20 076 592 B |

Профиль является тестовым, а не SLA. Скрипт завершает процесс только после очистки всех sockets, Socket.io и HTTP server. Параметры можно изменить переменными `SOAK_ROOMS`, `SOAK_PARTICIPANTS`, `SOAK_CYCLES`; для длительного прогона доступен `SOAK_DURATION_MS`.

## Browser-soak с fake media

Команда: `npx.cmd playwright test tests/browser/media-soak.spec.js --reporter=line`.

Две вкладки выполнили по пять последовательных звонков. Для каждой вкладки создано 5 peer connections и 10 локальных tracks; после последнего выхода: 0 открытых peer connections, 0 live tracks. Сценарий не измеряет физическую камеру и не подменяет результат реальной device-приёмки.

## LAN media latency

Не измерена. RTT не используется как замена сквозной media latency. Для завершения ручной части нужен HTTPS-стенд с двумя--четырьмя реальными устройствами в LAN, видео/аудио-маркер для измерения и запись `getStats()` (candidate pair, jitter, frames) только для диагностики. Цель PRD: максимальная измеренная media latency ≤500 мс. Strict NAT без TURN требуется проверить отдельной сетью.

## Итог

Автоматические socket и browser-soak профили не выявили накопления комнат, socket-сессий, peer connections или local tracks. Задача №33 остаётся открытой до LAN-измерения реальной media latency и проверки strict NAT.

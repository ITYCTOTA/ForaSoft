# Render: развёртывание одного Web Service

## Состав Blueprint

Корневой [render.yaml](../../render.yaml) описывает единственный Render Web Service. В нём нет БД, Redis, persistent disk, worker, cron или второго frontend-сервиса.

- `buildCommand`: `npm ci --include=dev && npm run build`; параметр `--include=dev` нужен, потому что `NODE_ENV=production` задан в сервисе, а Vite требуется на этапе сборки;
- `startCommand`: `npm start` — Express, SPA и Socket.io работают в одном Node.js процессе и на одном порту;
- `healthCheckPath`: `/healthz`;
- `numInstances: 1` — `RoomRegistry` остаётся консистентным in-memory источником истины;
- `autoDeployTrigger: off` — deploy запускается вручную из Render Dashboard;
- `PORT` не задаётся в Blueprint: его выдаёт Render, а сервер слушает `0.0.0.0:$PORT`;
- `NODE_ENV`, `PUBLIC_ORIGIN`, `STUN_URL` и `LOG_LEVEL` определены явно. Секретов в проекте нет.

`PUBLIC_ORIGIN` при первом Blueprint sync получает HTTPS `onrender.com` URL через системную переменную Render `RENDER_EXTERNAL_URL`. Это значение используется в production Origin allowlist и CSP.

## Первое развёртывание

1. В Render создать Blueprint из репозитория и подтвердить один Web Service `video-chat-room`.
2. Выбрать region и compute plan в Render Dashboard. Compute plan — свойство сервиса и его стоимость; он не связан с планом workspace и сроком хранения логов.
3. Проверить, что `Auto-Deploy` выключен, `Instances` равен 1, а health check — `/healthz`.
4. Выполнить ручной deploy. После успешного health check проверить:

   ```text
   https://<render-subdomain>.onrender.com/healthz
   https://<render-subdomain>.onrender.com/
   https://<render-subdomain>.onrender.com/room/<room-id>
   ```

   Первый URL должен вернуть `{"status":"ok"}`; второй и третий — SPA. Создание комнаты и вход из двух вкладок подтверждают работу Socket.io/WSS на том же домене.

## Домен и TLS

Render выдаёт TLS для `onrender.com` subdomain. Если подключается собственный домен, сначала дождаться статуса TLS active в Render, затем заменить `PUBLIC_ORIGIN` на точный `https://<ваш-домен>` в настройках сервиса. Чтобы следующая Blueprint sync не вернула значение к `RENDER_EXTERNAL_URL`, одновременно заменить соответствующую `fromService`-ссылку в `render.yaml` на это же значение. Не использовать HTTP, путь URL или завершающий `/`.

## Логи и перед релизом

Перед релизом в Render Workspace проверить фактический срок хранения Logs: он должен быть 7 дней согласно TDD. Это настройка workspace, а не environment variable и не параметр compute plan. Логи приложения содержат только безопасные агрегаты; переписка, SDP, ICE, имена и invite URL не должны появляться в них.

## Локальная production-проверка

```powershell
npm.cmd run test:production-smoke
```

Команда собирает SPA, запускает integration-проверку и подтверждает `/healthz`, SPA deep link `/room/:roomId` и Socket.io на одном HTTP-порту.

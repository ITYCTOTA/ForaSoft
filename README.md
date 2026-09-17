# Video Chat Room

Greenfield-приложение для группового видеозвонка до четырёх участников.

## Требования

- Node.js `>=22.12.0 <25`
- npm `>=10`

## Команды

```bash
npm install
npm run dev
npm run lint
npm run test:unit:coverage
npm run test:integration
npm run test:browser
npm run build
npm start
```

GitHub Actions запускает те же обязательные проверки из чистого checkout и сохраняет coverage, Playwright-артефакты и production build. Pipeline не выполняет deploy.

`npm run dev` запускает Vite-клиент на `http://localhost:5173` и сервер на `http://localhost:3000`. В корне нет production-кода видеочата: базовая Socket.io-конфигурация подготовлена для следующих задач implementation plan.

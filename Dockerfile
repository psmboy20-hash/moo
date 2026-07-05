# Railway/Render 배포용 이미지.
# 서버리스(Vercel)와 달리 Playwright(Chromium)를 함께 설치해
# Mercari/Yahoo 판매중 등 렌더링이 필요한 소스까지 전부 동작한다.
FROM node:22-slim

WORKDIR /app

# 브라우저를 고정 경로에 설치 (레이어 캐시 + 런타임 공유)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
# --with-deps: Chromium 실행에 필요한 시스템 라이브러리까지 설치
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
# next start는 PORT 환경변수를 따른다 (Render/Railway가 자동 주입)
CMD ["npm", "start"]

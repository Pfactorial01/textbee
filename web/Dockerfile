FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm i -g pnpm

RUN pnpm install

COPY . .
RUN npx prisma generate
RUN pnpm run build

EXPOSE 3000
ENV NEXT_PUBLIC_API_BASE_URL=http://100.77.145.14:3005/api/v1
ENV NEXTAUTH_URL=http://100.77.145.14:3000
ENV AUTH_SECRET=jwehfweh392hjfe834ffh

ENV DATABASE_URL="mongodb://172.17.0.2:27017/"

CMD [ "pnpm", "run", "start" ]
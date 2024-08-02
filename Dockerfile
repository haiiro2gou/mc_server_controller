FROM node:20.16-alpine3.19
ENV NODE_ENV production

WORKDIR /app

RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

COPY --chown=node:node package.json /app/
RUN npm install

COPY --chown=node:node src/ /app/

USER node
CMD ["node", "src/index.js"]

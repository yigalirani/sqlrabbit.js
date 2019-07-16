from node:alpine
COPY package.json .
COPY sqlrabbit.js .
COPY templates templates
COPY media media
RUN npm install --production
CMD node sqlrabbit.js

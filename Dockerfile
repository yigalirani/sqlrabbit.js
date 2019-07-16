from node:alpine
COPY package.json .
COPY sqlrabbit.js .
COPY templates templates
RUN npm install --production
CMD node sqlrabbit.js

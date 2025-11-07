# Use imagem oficial Playwright que já contém browsers e dependências
FROM mcr.microsoft.com/playwright:v1.56.1-noble

# Cria diretório da app
WORKDIR /app

# Copia package.json e instala deps
COPY package.json package-lock.json* ./
RUN npm ci

# Copia o restante do código
COPY . .

# Expõe a porta (Render detecta $PORT em runtime)
ENV PORT=10000
EXPOSE 10000

# Comando de start (Render usará Dockerfile)
CMD ["node", "index.js"]
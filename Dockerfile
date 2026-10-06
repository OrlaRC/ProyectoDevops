FROM node:20-slim

WORKDIR /app

# sqlite3 requiere Node >=20.17 y, por defecto, npm descarga un binario
# precompilado (prebuild-install) que está enlazado contra una glibc más
# nueva que la de esta imagen -> falla con GLIBC_x.xx not found al cargarlo.
# Instalamos las herramientas de compilación y forzamos --build-from-source
# para que node-gyp compile el binario nativo dentro del propio contenedor.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --build-from-source

COPY . .

EXPOSE 80
EXPOSE 6061

CMD ["node", "index.js"]
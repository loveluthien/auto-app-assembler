#!/bin/bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

FRONTEND_TAG=$1
BACKEND_TAG=$2
VERSION="${1}-${2}"
IMAGE="centos:7.9.2009"

echo $1 $2

DATE=$(date +%Y-%m-%d)

### Build carta-backend on the Intel Mac
ssh acdc@172.19.32.31 "/Users/acdc/electron-express/build-backend.sh $1 $2"

### Transfer it to M1 Mac (the one that does the signing and notarization)
### Copy to here first
rm -rf carta-backend
mkdir -p carta-backend/build
scp acdc@172.19.32.31:/Users/acdc/electron-express/carta-backend/build/carta_backend carta-backend/build/carta_backend
scp -r acdc@172.19.32.31:/Users/acdc/electron-express/carta-backend/build/libs/ carta-backend/build/

### Copy to M1 Mac
ssh acdc@172.17.22.43 "rm -rf /Users/acdc/electron-express/carta-backend"
ssh acdc@172.17.22.43 "mkdir -p /Users/acdc/electron-express/carta-backend"
scp -r carta-backend/build acdc@172.17.22.43:/Users/acdc/electron-express/carta-backend/

### Build carta-frontend on this server
echo 'Building a production frontend from Github using Docker.'
rm -rf $1
mkdir $1
cd $1
source /home/acdc/emsdk/emsdk_env.sh
which emcc
git clone https://github.com/CARTAvis/carta-frontend.git
cd carta-frontend
git checkout $FRONTEND_TAG
git submodule update --init --recursive

sed -i '30s/WASM=1/& -flto/' wasm_libs/build_zstd.sh

nvm use 18
node --version

npm install
npm run build-libs
npm run build
pwd
scp -r build acdc@172.17.22.43:/Users/acdc/electron-express/

ssh acdc@172.17.22.43 "/Users/acdc/electron-express/package-electron-x64.sh $1 $2" > /tmp/auto-app-assembler-x64-$1-$2.log 2>&1

scp acdc@172.17.22.43:/Users/acdc/electron-express/pack/dist/CARTA-$1-$2-$DATE.dmg /scratch/app-assembler-downloads/CARTA-$1-$2-$DATE.dmg

kill -s SIGUSR1 $$

rm -rf $1

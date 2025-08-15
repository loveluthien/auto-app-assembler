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

### Build carta-backend on the Mac

ssh acdc@172.17.22.43 "/Users/acdc/electron-express/build-backend.sh $1 $2"

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

sed -i '30s/WASM=1/& -flto/' wasm_libs/build_zstd.sh

git submodule update --init --recursive

nvm use 18
node --version

npm install
npm run build-libs
npm run build
pwd
# Send it to the M1 server to sign & notarize
scp -r build acdc@172.17.22.43:/Users/acdc/electron-express/

ssh acdc@172.17.22.43 "/Users/acdc/electron-express/package-electron-arm64.sh $1 $2" > /tmp/auto-app-assembler-arm64-$1-$2.log 2>&1

scp acdc@172.17.22.43:/Users/acdc/electron-express/pack/dist/CARTA-$1-$2-$DATE-arm64.dmg /scratch/app-assembler-downloads

kill -s SIGUSR1 $$

rm -rf $1

#!/bin/bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

FRONTEND_TAG=$1
# BACKEND_TAG=$2
# CARTA_CASACORE_TAG=master
# FRONTEND_FROM_NPM=False
# VERSION="${1}-${2}"
# IMAGE="centos:7.9.2009"

datetime=$(date +%Y-%m-%d)

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
cd ..
cd ..
pwd

### Send frontend and build carta-backend on a remote x86-64 server (almat9)
ssh acdc@172.19.32.9 "mkdir -p /home/acdc/auto-app-assembler/$1/carta-frontend"
scp -r $1/carta-frontend/build acdc@172.19.32.9:/home/acdc/auto-app-assembler/$1/carta-frontend/
## ssh acdc@172.19.32.9 "/home/acdc/auto-app-assembler/build-appimage.sh $1 $2"
ssh acdc@172.19.32.9 "/home/acdc/auto-app-assembler/create-carta-appimage.sh $1 $2"

### Grab the built Appimage from almat9
scp acdc@172.19.32.9:/home/acdc/auto-app-assembler/carta-${1}-${2}-${datetime}-x86_64.AppImage /scratch/app-assembler-downloads/carta-${1}-${2}-${datetime}-x86_64.AppImage

kill -s SIGUSR1 $$

rm -rf ${1}
ssh acdc@172.19.32.9 "rm /home/acdc/auto-app-assembler/carta-${1}-${2}-${datetime}-x86_64.AppImage"

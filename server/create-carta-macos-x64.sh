#!/bin/bash

FRONTEND_TAG=$1
BACKEND_TAG=$2
VERSION="${1}-${2}"
IMAGE="centos:7.9.2009"

echo $1 $2

DATE=$(date +%Y-%m-%d)

### Build carta-backend on the Intel Mac
ssh <user>@<ip> "/Users/acdc/electron-express/build-backend.sh $1 $2"

### Transfer it to M1 Mac (the one that does the signing and notarization)
### Copy to here first
rm -rf carta-backend
mkdir -p carta-backend/build
scp <user>@<ip>:/Users/acdc/electron-express/carta-backend/build/carta_backend carta-backend/build/carta_backend
scp -r <user>@<ip>:/Users/acdc/electron-express/carta-backend/build/libs/ carta-backend/build/

### Copy to M1 Mac
ssh <user>@<ip> "rm -rf /Users/acdc/electron-express/carta-backend"
ssh <user>@<ip> "mkdir -p /Users/acdc/electron-express/carta-backend"
scp -r carta-backend/build <user>@<ip>:/Users/acdc/electron-express/carta-backend/

### Build carta-frontend on this server
echo 'Building a production frontend from Github using Docker.'
rm -rf $1
mkdir $1
cd $1
git clone https://github.com/CARTAvis/carta-frontend.git
cd carta-frontend
git checkout $FRONTEND_TAG
git submodule update --init --recursive
npm install
npm run build-libs-docker
npm run build-docker
pwd
scp -r build <user>@<ip>:/Users/acdc/electron-express/

ssh <user>@<ip> "/Users/acdc/electron-express/package-electron.sh $1 $2"
ssh <user>@<ip> "/Users/acdc/electron-express/package-electron-x64.sh $1 $2"

scp <user>@<ip>:/Users/acdc/electron-express/pack/dist/CARTA-$1-$2-$DATE-4.0.0-test.dmg /scratch/app-assembler-downloads/CARTA-$1-$2-$DATE-4.0.0-test-x64.dmg

kill -s SIGUSR1 $$

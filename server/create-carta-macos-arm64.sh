#!/bin/bash

FRONTEND_TAG=$1
BACKEND_TAG=$2
VERSION="${1}-${2}"
IMAGE="centos:7.9.2009"

echo $1 $2

DATE=$(date +%Y-%m-%d)

### Build carta-backend on the Mac

ssh <user>@<ip> "/Users/acdc/electron-express/build-backend.sh $1 $2"

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

ssh <user>@<ip> "/Users/acdc/electron-express/package-electron-arm64.sh $1 $2"

scp <user>@<ip>:/Users/acdc/electron-express/pack/dist/CARTA-$1-$2-$DATE-4.0.0-test-arm64.dmg /scratch/app-assembler-downloads

kill -s SIGUSR1 $$

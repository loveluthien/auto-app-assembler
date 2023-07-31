#!/bin/bash

FRONTEND_TAG=$1
BACKEND_TAG=$2
CARTA_CASACORE_TAG=master
FRONTEND_FROM_NPM=False
VERSION="${1}-${2}"
IMAGE="centos:7.9.2009"

datetime=$(date +%Y-%m-%d)

echo 'Building a production frontend from Github using Docker.'
mkdir $1
cd $1
git clone https://github.com/CARTAvis/carta-frontend.git
cd carta-frontend
git checkout $FRONTEND_TAG
git submodule update --init --recursive
npm install
npm run build-libs-docker
npm run build-docker
cd ..
cd ..

docker build --no-cache -f Dockerfile-carta-appimage-create \
             --build-arg ARCH_TYPE=$ARCH \
             --build-arg BASE_IMAGE=$IMAGE \
             --build-arg CASACORE=$CARTA_CASACORE_TAG \
             --build-arg FRONTEND=$FRONTEND_TAG \
             --build-arg NPM=$FRONTEND_FROM_NPM \
             --build-arg BACKEND=$BACKEND_TAG \
             --build-arg RELEASE_TAG=$VERSION \
             -t carta-appimage-create .
docker run -d --name grabappimage carta-appimage-create
docker cp grabappimage:/root/appimage/carta-${1}-${2}-x86_64.AppImage /scratch/app-assembler-downloads/carta-${1}-${2}-${datetime}-x86_64.AppImage
docker rm grabappimage
rm -rf $1

kill -s SIGUSR1 $$

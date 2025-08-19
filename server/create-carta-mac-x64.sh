#!/bin/bash

PLATFORM=$1
ARCH=$2
FRONTEND=$3
BACKEND=$4

# Check platform
if [ "$PLATFORM" != "mac" ]; then
    echo "Invalid platform: $PLATFORM"
    exit 1
fi

WORKING_PATH="/Users/acdc/aaa_package"

## Prepare backend
# Grep IP from machine_config. Notice that $2 in awk '{print $2}' is nothing to do with $ARCH
BACKEND_BUILD_IP=$(grep ${PLATFORM}_${ARCH} ./machine_config | awk '{print $2}')

# if BACKEND_BUILD_IP is empty then stop program
if [ -z "$BACKEND_BUILD_IP" ]; then
    echo "Machine (IP) for packaging ${PLATFORM}_${ARCH} is not set."
    echo "Please check your machine_config file."
    exit 1
fi

CONFIG_EDITOR=edit_${PLATFORM}_config.sh
ssh acdc@$BACKEND_BUILD_IP "cd ${WORKING_PATH} && ./$CONFIG_EDITOR --frontend $FRONTEND --backend $BACKEND" > log

# If log contains "Error" then stop program
if grep -q "Error" log; then
    echo "Error found in log"
    exit 1
fi

ssh acdc@$BACKEND_BUILD_IP "cd ${WORKING_PATH} && ./build_backend.sh" >> log


## Prepare frontend and do the packaging
IP=$(grep ${PLATFORM}_notarize ./machine_config | awk '{print $2}')

# if IP is empty then stop program
if [ -z "$IP" ]; then
    echo "Machine (IP) for packaging ${PLATFORM}_notarize is not set."
    echo "Please check your machine_config file."
    exit 1
fi

# copy built backend to packaging machine
ssh acdc@$IP "cd ${WORKING_PATH} && rm -rf carta-backend && mkdir -p carta-backend"
scp -r acdc@$BACKEND_BUILD_IP:${WORKING_PATH}/carta-backend acdc@$IP:${WORKING_PATH}

ssh acdc@$IP "cd ${WORKING_PATH} && ./$CONFIG_EDITOR --frontend $FRONTEND --backend $BACKEND --no_backend_build" >> log

# If log contains "Error" then stop program
if grep -q "Error" log; then
    echo "Error found in log"
    exit 1
fi

# Run packaging script
ssh acdc@$IP "cd ${WORKING_PATH} && ./run_pack.sh" >> log

# Extract Output file name in log and copy it to carta server
OUTPUT_FILE=$(grep "Output file:" log | awk '{print $NF}')
OUTPUT_PATH="${WORKING_PATH}/pack/dist"

scp acdc@$IP:$OUTPUT_PATH/${OUTPUT_FILE} /scratch/app-assembler-downloads

kill -s SIGUSR1 $$
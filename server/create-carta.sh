#!/bin/bash

PLATFORM=$1
ARCH=$2
FRONTEND=$3
BACKEND=$4

# Check platform
if [ "$PLATFORM" != "mac" ] && [ "$PLATFORM" != "linux" ]; then
    echo "Invalid platform: $PLATFORM"
    exit 1
fi

if [ "$PLATFORM" == "mac" ]; then
    HOME_PATH="/Users/acdc"
elif [ "$PLATFORM" == "linux" ]; then
    HOME_PATH="/home/acdc"
fi

# Grep IP from machine_config. Notice that $2 in awk '{print $2}' is nothing to do with $ARCH
IP=$(grep $PLATFORM-$ARCH ./machine_config | awk '{print $2}')

CONFIG_EDITOR=edit_${PLATFORM}_config.sh
ssh acdc@$IP "${HOME_PATH}/aaa_package/$CONFIG_EDITOR --frontend $FRONTEND --backend $BACKEND" > log

# If log contains "Error" then stop program
if grep -q "Error" log; then
    echo "Error found in log"
    exit 1
fi

# Run packaging script
ssh acdc@$IP "${HOME_PATH}/aaa_package/run_pack.sh" >> log

# Extract Output file name in log and copy it to carta server
OUTPUT_FILE=$(grep "Output file:" log | awk '{print $NF}')
if [ "$PLATFORM" == "mac" ]; then
    OUTPUT_PATH="${HOME_PATH}/aaa_package/pack/dist"
elif [ "$PLATFORM" == "linux" ]; then
    OUTPUT_PATH="${HOME_PATH}/aaa_package"
fi
# scp acdc@$IP:$OUTPUT_PATH/${OUTPUT_FILE} /scratch/app-assembler-downloads

kill -s SIGUSR1 $$
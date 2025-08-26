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
    PACK_SCRIPT="run_pack.sh"
elif [ "$PLATFORM" == "linux" ]; then
    PACK_SCRIPT="run_docker_package.sh"
fi

# Grep IP from machine_config. Notice that $2 in awk '{print $2}' is nothing to do with $ARCH
IP=$(grep ${PLATFORM}_${ARCH} ./machine_config | awk '{print $2}')
WORKING_PATH=`ssh acdc@$IP 'echo $HOME/aaa_package'`

# if IP is empty then stop program
if [ -z "$IP" ]; then
    echo "Machine (IP) for packaging $PLATFORM_$ARCH is not set."
    echo "Please check your machine_config file."
    kill -s SIGUSR1 $$
fi

CONFIG_EDITOR=edit_${PLATFORM}_config.sh
ssh acdc@$IP "cd ${WORKING_PATH} && ./$CONFIG_EDITOR --frontend $FRONTEND --backend $BACKEND" > log

# If log contains "Error" then stop program
if grep -q "Error" log; then
    echo "Error found in log"
    kill -s SIGUSR1 $$
fi

# Run packaging script
ssh acdc@$IP "cd ${WORKING_PATH} && ./$PACK_SCRIPT" >> log

# Make config default
ssh acdc@$IP "cd ${WORKING_PATH} && ./$CONFIG_EDITOR --default" >> log

# Extract Output file name in log and copy it to carta server
# use grep -a to treat binary as text, fallback to strings if necessary
OUTPUT_FILE=$(grep -a "Output file:" log | awk '{print $NF}' | head -n1)
if [ -z "$OUTPUT_FILE" ]; then
    OUTPUT_FILE=$(strings log | grep "Output file:" | awk '{print $NF}' | head -n1)
fi

if [ -z "$OUTPUT_FILE" ]; then
    echo "Failed to find Output file in log"
    kill -s SIGUSR1 $$
fi

if [ "$PLATFORM" == "mac" ]; then
    OUTPUT_PATH="${WORKING_PATH}/pack/dist"
elif [ "$PLATFORM" == "linux" ]; then
    OUTPUT_PATH="${WORKING_PATH}"
fi

# Copy the output file to the server downloads directory and log the operation
scp acdc@$IP:"${OUTPUT_PATH}/${OUTPUT_FILE}" /scratch/app-assembler-downloads >> log 2>&1

# Signal completion (or use this signal as your success indicator)
kill -s SIGUSR1 $$
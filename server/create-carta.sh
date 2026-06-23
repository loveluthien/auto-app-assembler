#!/bin/bash

PLATFORM=$1
ARCH=$2
FRONTEND=$3
BACKEND=$4

DOWNLOADS_DIR=/scratch/app-assembler-downloads
CONFIG_EDITOR=edit_${PLATFORM}_config.sh

die() {
    echo "$1"
    exit 1
}

lookup_ip() {
    local label=$1
    local ip
    ip=$(grep "$label" ./machine_config | awk '{print $2}')
    [ -z "$ip" ] && die "Machine (IP) for $label is not set. Please check your machine_config file."
    echo "$ip"
}

check_log_errors() {
    grep -q "Error" log && die "Error found in log"
}

extract_output_file() {
    local output_file
    output_file=$(grep -a "Output file:" log | awk '{print $NF}' | head -n1)
    if [ -z "$output_file" ]; then
        output_file=$(strings log | grep "Output file:" | awk '{print $NF}' | head -n1)
    fi
    [ -z "$output_file" ] && die "Failed to find Output file in log"
    echo "$output_file"
}

if [ "$PLATFORM" != "mac" ] && [ "$PLATFORM" != "linux" ]; then
    die "Invalid platform: $PLATFORM"
fi

if [ "$PLATFORM" == "mac" ]; then
    WORKING_PATH="/Users/acdc/aaa_package"
    BUILD_IP=$(lookup_ip "mac_${ARCH}")
    NOTARIZE_IP=$(lookup_ip "mac_notarize")

    ssh acdc@$BUILD_IP "cd ${WORKING_PATH} && ./$CONFIG_EDITOR --frontend $FRONTEND --backend $BACKEND" > log
    check_log_errors
    ssh acdc@$BUILD_IP "cd ${WORKING_PATH} && ./build_backend.sh" >> log

    ssh acdc@$NOTARIZE_IP "rm -rf ${WORKING_PATH}/carta-backend/build && mkdir -p ${WORKING_PATH}/carta-backend/build"
    scp -rq acdc@$BUILD_IP:${WORKING_PATH}/carta-backend/build acdc@$NOTARIZE_IP:${WORKING_PATH}/carta-backend

    ssh acdc@$NOTARIZE_IP "cd ${WORKING_PATH} && ./$CONFIG_EDITOR --frontend $FRONTEND --backend $BACKEND --arch $ARCH --no_backend_build" >> log
    check_log_errors
    ssh acdc@$NOTARIZE_IP "cd ${WORKING_PATH} && ./run_pack.sh" >> log
    ssh acdc@$NOTARIZE_IP "cd ${WORKING_PATH} && ./$CONFIG_EDITOR --default" >> log

    OUTPUT_FILE=$(extract_output_file)
    scp acdc@$NOTARIZE_IP:${WORKING_PATH}/pack/dist/${OUTPUT_FILE} $DOWNLOADS_DIR

elif [ "$PLATFORM" == "linux" ]; then
    PACK_IP=$(lookup_ip "${PLATFORM}_${ARCH}")
    WORKING_PATH=$(ssh acdc@$PACK_IP 'echo $HOME/aaa_package')

    ssh acdc@$PACK_IP "cd ${WORKING_PATH} && ./$CONFIG_EDITOR --frontend $FRONTEND --backend $BACKEND" > log
    check_log_errors
    ssh acdc@$PACK_IP "cd ${WORKING_PATH} && ./run_docker_package.sh" >> log
    ssh acdc@$PACK_IP "cd ${WORKING_PATH} && ./$CONFIG_EDITOR --default" >> log

    OUTPUT_FILE=$(extract_output_file)
    scp acdc@$PACK_IP:"${WORKING_PATH}/${OUTPUT_FILE}" $DOWNLOADS_DIR >> log 2>&1
fi

kill -s SIGUSR1 $$

#!/bin/bash

ssh acdc@172.17.22.43 "/Users/acdc/package_electron/edit_dmg_config.sh --frontend $1 --backend $2" > log

# if log contains "Error" then stop program
if grep -q "Error" log; then
    echo "Error found in log"
    exit 1
fi

ssh acdc@172.17.22.43 "/Users/acdc/package_electron/run_pack.sh" >> log

# extract Output file name in log and copy it to carta server
OUTPUT_FILE=$(grep "Output file:" log | awk '{print $NF}')
scp acdc@172.17.22.43:/Users/acdc/package_electron/pack/dist/${OUTPUT_FILE} /scratch/app-assembler-downloads

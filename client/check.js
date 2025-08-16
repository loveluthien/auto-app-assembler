import fetch from 'node-fetch';

fetch('https://api.github.com/repos/CARTAvis/carta-backend')
    .then(response => {
        console.log('Limit:', response.headers.get('X-RateLimit-Limit'));
        console.log('Remaining:', response.headers.get('X-RateLimit-Remaining'));
        console.log('Reset:', new Date(response.headers.get('X-RateLimit-Reset') * 1000).toLocaleString());
    })
    .catch(console.error);


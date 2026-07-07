const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
var cookieParser = require('cookie-parser')
const morgan = require('morgan');
const { exec, spawn } = require('child_process');
const app = express();
const port = 5699;

app.use(cookieParser())

app.get('/', function(req, res) {
    console.log('Cookies: ', req.cookies)
});

const logStream = fs.createWriteStream('/tmp/app-assembler.log', {flags: 'a'});

const session = require('express-session');

app.use(session({
    secret: 'aaa-secret-key',
    resave: false,
    saveUninitialized: true,
    store: new session.MemoryStore()
}));

app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Expose-Headers', 'Link');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use('/aaa', express.static('/var/www/aaa'))
app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: true }));

app.use('/downloads', express.static('/scratch/app-assembler-downloads'));

app.set('trust proxy', true);

app.use(morgan('dev'));




app.get('/commits/:repo', (req, res) => {
    let fileName = `${req.params.repo}-commits.json`;

    fs.readFile(path.join(__dirname, fileName), (err, data) => {
        if(err) {
            console.error(err);
            res.sendStatus(500);
            return;
        }

        let lines = data.toString().split('\n').filter(Boolean);
        let commits = lines.length ? lines.map(line => {
            let commit = JSON.parse(line);
            if (commit.timestamp) {
                commit.timestamp = new Date(commit.timestamp);
            }
            return commit;
        }) : [];

        res.json(commits);
    });
});

app.get('/branches/:repo', (req, res) => {
    const repo = req.params.repo;
    if (repo !== 'carta-frontend' && repo !== 'carta-backend') {
        return res.status(400).send('Invalid repository');
    }
    fs.readFile(path.join(__dirname, `${repo}-branches.json`), 'utf8', (err, data) => {
        if (err) {
            return res.json([]);
        }
        try {
            res.json(JSON.parse(data));
        } catch(e) {
            res.json([]);
        }
    });
});

app.post('/refresh-commits/:repo', (req, res) => {
    const repo = req.params.repo;
    const branch = req.query.branch || 'dev';
    if (repo !== 'carta-frontend' && repo !== 'carta-backend') {
        return res.status(400).send('Invalid repository');
    }
    const fetchAndSave = (repo, fileName) => {
        return new Promise((resolve, reject) => {
            const url = `https://api.github.com/repos/CARTAvis/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=30`;
            exec(`curl -s "${url}"`, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error fetching commits for ${repo}:`, error);
                    return reject(error);
                }
                try {
                    const commits = JSON.parse(stdout);
                    if (!Array.isArray(commits)) {
                        return reject(new Error('Invalid response from GitHub API'));
                    }
                    const fileContent = commits.map(c => {
                        return JSON.stringify({
                            branch: branch,
                            shortId: c.sha.substring(0, 8),
                            timestamp: c.commit.author.date,
                            message: c.commit.message.split('\n')[0]
                        });
                    }).join('\n') + '\n';
                    fs.writeFile(path.join(__dirname, fileName), fileContent, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                } catch (e) {
                    reject(e);
                }
            });
        });
    };

    fetchAndSave(repo, `${repo}-commits.json`)
    .then(() => {
        res.sendStatus(200);
    })
    .catch(err => {
        console.error('Failed to refresh commits:', err);
        res.status(500).send(err.message);
    });
});

app.post('/refresh-branches/:repo', (req, res) => {
    const repo = req.params.repo;
    if (repo !== 'carta-frontend' && repo !== 'carta-backend') {
        return res.status(400).send('Invalid repository');
    }
    
    function fetchAllBranches(repo) {
        return new Promise((resolve, reject) => {
            let allBranches = [];
            function fetchPage(url) {
                exec(`curl -s -i "${url}"`, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
                    if (error) return reject(error);
                    const splitIndex = stdout.indexOf('\r\n\r\n');
                    if (splitIndex === -1) return reject(new Error('Invalid response'));
                    const headers = stdout.substring(0, splitIndex);
                    const body = stdout.substring(splitIndex + 4);
                    let data;
                    try { data = JSON.parse(body); } catch (e) { return reject(e); }
                    if (!Array.isArray(data)) return reject(new Error('Invalid JSON response'));
                    
                    allBranches = allBranches.concat(data);
                    
                    const linkMatch = headers.match(/^link:\s*(.*)$/im);
                    if (linkMatch) {
                        const nextPageLink = linkMatch[1].split(',').find(link => link.includes('rel="next"'));
                        if (nextPageLink) {
                            const nextPageUrl = nextPageLink.split(';')[0].slice(1, -1);
                            return fetchPage(nextPageUrl);
                        }
                    }
                    resolve(allBranches);
                });
            }
            fetchPage(`https://api.github.com/repos/CARTAvis/${repo}/branches?per_page=100`);
        });
    }

    fetchAllBranches(repo).then(branches => {
        fs.writeFile(path.join(__dirname, `${repo}-branches.json`), JSON.stringify(branches, null, 2), (err) => {
            if (err) return res.status(500).send(err.message);
            res.sendStatus(200);
        });
    }).catch(err => res.status(500).send(err.message));
});

let clients = [];

let activeJob = null;
let buildQueue = [];

function broadcastQueue() {
    const payload = JSON.stringify({ activeJob, buildQueue });
    clients.forEach(c => {
        try { c.write(`data: queueUpdate:${payload}\n\n`); } catch(e){}
    });
}

function runJobScript(job) {
    console.log(`Starting job ${job.id} for ${job.platform} ${job.arch}`);
    const scriptPath = path.join(__dirname, 'create-carta.sh');
    const child = spawn('bash', [scriptPath, job.platform, job.arch, job.frontendCommit, job.backendCommit]);

    clients.forEach((clientRes) => {
        if (clientRes.sessionId !== job.sessionId) {
            try { clientRes.write(`data: bashScriptStarted\n\n`); } catch(e){}
        }
    });

    child.stdout.on('data', (data) => logStream.write(`STDOUT: ${data}`));
    child.stderr.on('data', (data) => {
        console.error(`STDERR: ${data}`);
        logStream.write(`STDERR: ${data}`);
    });

    function finishJob() {
        if (!activeJob || activeJob.id !== job.id) return;
        activeJob = null;
        clients.forEach((clientRes) => {
            try { clientRes.write(`data: bashScriptFinished\n\n`); } catch(e){}
        });
        if (buildQueue.length > 0) {
            activeJob = buildQueue.shift();
            activeJob.status = 'running';
            runJobScript(activeJob);
        }
        broadcastQueue();
    }

    child.on('error', (error) => {
        console.error('Failed to start script:', error);
        logStream.write(`ERROR: ${error}`);
        finishJob();
    });

    child.on('exit', (code, signal) => {
        logStream.write(`Process exited with code: ${code}, signal: ${signal}\n`);
        finishJob();
    });
}

app.post('/aaa/generate', (req, res) => {
    const sessionId = req.session.id;
    req.session.isProcessInitiator = true;
    const time = new Date();
    const userIP = req.headers['x-forwarded-for'] || req.ip;
    const { frontendCommit, backendCommit, frontendBranch, backendBranch } = req.body;
    const platform = req.body.platform || 'linux';
    const arch = req.body.arch || 'x64';

    logStream.write(`${time} ${userIP} create-carta.sh ${platform} ${arch} ${frontendCommit} ${backendCommit}\n`);

    const isDuplicate = [activeJob, ...buildQueue].filter(Boolean).some(j => j.platform === platform && j.arch === arch);
    if (isDuplicate) {
        return res.status(409).send('This target build is already in progress or queued.');
    }

    const job = {
        id: Date.now() + Math.random().toString(36).substr(2, 4),
        sessionId,
        platform,
        arch,
        frontendBranch: frontendBranch || 'dev',
        backendBranch: backendBranch || 'dev',
        frontendCommit,
        backendCommit,
        status: 'queued'
    };

    if (!activeJob) {
        activeJob = job;
        activeJob.status = 'running';
        runJobScript(activeJob);
        res.send('Script started');
    } else {
        buildQueue.push(job);
        res.send('Script queued');
    }
    broadcastQueue();
});

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.sessionId = req.session.id;
    console.log(`Received EventSource connection from session ${res.sessionId}`);
    clients.push(res);
    res.write(`data: queueUpdate:${JSON.stringify({ activeJob, buildQueue })}\n\n`);
});

app.listen(port, () => console.log('Server started on port 5699'));

app.get('/aaa/getInitiatorState', (req, res) => {
    res.send(req.session.isProcessInitiator || false);
});

app.get('/downloads', (req, res) => {
    fs.readdir('/scratch/app-assembler-downloads', (err, files) => {
        if (err) {
            res.status(500).send('Error reading files');
        } else {
            res.json(files);
        }
    });
});

app.get('/github-proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || !targetUrl.startsWith('https://api.github.com/')) {
        return res.status(400).send('Invalid URL');
    }
    exec(`curl -s -i "${targetUrl}"`, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) return res.status(500).send(error.message);
        
        const splitIndex = stdout.indexOf('\r\n\r\n');
        if (splitIndex === -1) {
            res.setHeader('Content-Type', 'application/json');
            return res.send(stdout);
        }
        
        const headersPart = stdout.substring(0, splitIndex);
        const bodyPart = stdout.substring(splitIndex + 4);
        
        const linkMatch = headersPart.match(/^link:\s*(.*)$/im);
        if (linkMatch) {
            res.setHeader('Link', linkMatch[1]);
        }
        
        res.setHeader('Content-Type', 'application/json');
        res.send(bodyPart);
    });
});

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});



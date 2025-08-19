const fs = require('fs');
const path = require('path');
const express = require('express');
var cookieParser = require('cookie-parser')
const morgan = require('morgan');
// const { exec } = require('child_process');
const app = express();
const port = 5699;

app.use(cookieParser())

app.get('/', function(req, res) {
    console.log('Cookies: ', req.cookies)
});

const { spawn } = require('child_process');

const logStream = fs.createWriteStream('/tmp/app-assembler.log', {flags: 'a'});

const session = require('express-session');

app.use(session({
    secret: '<token>',
    resave: false,
    saveUninitialized: true,
    store: new session.MemoryStore(),
    cookie: {
        sameSite: 'none',
        secure: true, 
    }
}));

app.use('/aaa', express.static('/var/www/aaa'))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/downloads', express.static('/scratch/app-assembler-downloads'));

app.set('trust proxy', true);

app.use(morgan('dev'));

// use webhooks to detect commits to github and save to files
app.post('/github-webhook-auto-app', (req, res) => {
    console.log('Webhook received!', req.body);

if(req.body.commits && req.body.repository) {
    let repoName = req.body.repository.name;
    let fileName = `${repoName}-commits.json`;

    let latestCommit = req.body.commits[req.body.commits.length - 1];
    let commitData = {
        branch: req.body.ref.replace('refs/heads/', ''),
        shortId: latestCommit.id.substring(0, 8),
        timestamp: latestCommit.timestamp,
    };

    let newData = JSON.stringify(commitData) + '\n';
    fs.appendFile(fileName, newData, err => {
        if(err) {
            console.error(err);
            res.sendStatus(500);
            return;
        }
        console.log(`Appended new commit to ${fileName}`); 
        res.sendStatus(200);
    });
} else {
    res.sendStatus(200);
}

});

app.get('/commits/:repo', (req, res) => {
    let fileName = `${req.params.repo}-commits.json`;

    fs.readFile(fileName, (err, data) => {
        if(err) {
            console.error(err);
            res.sendStatus(500);
            return;
        }

        let lines = data.toString().split('\n').filter(Boolean);
//        let commits = lines.length ? lines.map(JSON.parse) : [];
        let commits = lines.length ? lines.map(line => {
            let commit = JSON.parse(line);
            commit.timestamp = new Date(commit.timestamp);
            return commit;
        }) : [];

        res.json(commits);
    });
});


let clients = [];

let scriptRunnerSessionId = null;
app.post('/aaa/generate', (req, res) => {
    const sessionId = req.session.id;
    req.session.isProcessInitiator = true;
    console.log(`Received script generation request from session ${sessionId}`);
    const time = new Date();
    const userIP = req.headers['x-forwarded-for'] || req.ip;
    const frontendCommit = req.body.frontendCommit;
    const backendCommit = req.body.backendCommit;
    const platform = req.body.platform || 'linux'; // Default to linux if not provided
    const arch = req.body.arch || 'x64'; // Default to x64 if not provided

    logStream.write(`${time} ${userIP} create-carta.sh ${platform} ${arch} ${frontendCommit} ${backendCommit}\n`);

    if (!scriptRunnerSessionId) {
        scriptRunnerSessionId = sessionId;
        console.log(`Set scriptRunnerSessionId to ${sessionId}`);

        const scriptPath = path.join(__dirname, 'create-carta.sh');
        const child = spawn('bash', [scriptPath, platform, arch, frontendCommit, backendCommit]);

        // Notify clients that the bash script started
        clients.forEach((clientRes) => {
            if (clientRes.sessionId !== sessionId) {
                clientRes.write(`data: bashScriptStarted\n\n`);
            }
        });

        console.log(`Spawned child process with pid ${child.pid}`);

        child.stdout.on('data', (data) => {
            logStream.write(`STDOUT: ${data}`);
        });

        child.stderr.on('data', (data) => {
            console.error(`STDERR: ${data}`);
            logStream.write(`STDERR: ${data}`);
        });

        child.on('error', (error) => {
            console.error('Failed to start script:', error);
            logStream.write(`ERROR: ${error}`);
            // Only send a response if it hasn't been sent yet
            if (!res.headersSent) {
                res.status(500).send(error.message || 'Script error');
            }
        });

        child.on('exit', (code, signal) => {
            if (signal === 'SIGUSR1') {
                // Handle successful execution
                scriptRunnerSessionId = null;
                clients.forEach((clientRes) => {
                    clientRes.write(`data: bashScriptFinished\n\n`);
                });
            } else {
                // Handle errors or other signals
                logStream.write(`Process exited with code: ${code}`);
                // Do NOT send another response here!
            }
        });

        // Send a response indicating the script started successfully
        res.send('Script started');
    } else {
        res.status(429).send('A script is already running');
    }
});

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.sessionId = req.session.id;
    console.log(`Received EventSource connection from session ${res.sessionId}`);
    if (scriptRunnerSessionId && scriptRunnerSessionId !== req.session.id) {
        res.write('data: otherUserScriptRunning\n\n');
    }
    clients.push(res);
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

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});



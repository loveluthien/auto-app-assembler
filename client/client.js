

// Display the contents of "carta-frontend-commits.json" and "carta-backend-commits.json" by default
// These files are created by server.js and that uses webhooks to list every frontend and backend commit.
async function fetchCommits(repo) {
    const response = await fetch(`/commits/${repo}`);
    const data = await response.json();
    return data;
}

function displayCommits(data, selectId, commitType) {
    const select = document.getElementById(selectId);
    select.innerHTML = '';
    data.forEach((item, i) => {
        let datePart = '';
        let timePart = '';
        if (item.timestamp) {
            const dateStr = new Date(item.timestamp).toISOString();
            datePart = dateStr.split('T')[0];
            timePart = dateStr.split('T')[1].split('.')[0];
        }
        const option = document.createElement('option');
        option.value = item.shortId;
        const msg = item.message ? ` - ${item.message}` : '';
        option.text = `${datePart} (${item.shortId})${msg}`;
        if (i === 0) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}


async function fetchBranchesFromDisk(repo) {
    const response = await fetch(`/branches/${repo}`);
    const data = await response.json();
    return data;
}

function displayBranches(data, selectId, branchType) {
    const select = document.getElementById(selectId);
    select.innerHTML = '';
    data.forEach((item, i) => {
        const option = document.createElement('option');
        option.value = item.commit.sha.substring(0, 8);
        option.text = item.name;
        if (item.name === 'dev') {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

async function sortBranches(data, branchContainerId, branchType) {
    // Get commit dates
    const commits = await Promise.all(data.map(branch => fetch(branch.commit.url)));
    const commitData = await Promise.all(commits.map(commit => commit.json()));
    for (let i = 0; i < data.length; i++) {
        data[i].commit.date = new Date(commitData[i].commit.committer.date);
    }

    // Sort by commit date
    data.sort((a, b) => b.commit.date - a.commit.date);

    // Display the sorted data
    displayBranches(data, branchContainerId, branchType);
}

// Show the latest commits from the local .json files by default
function loadCommits() {
    fetchCommits('carta-frontend').then(data => displayCommits(data, 'frontend-branch', 'frontend-branch'));
    fetchCommits('carta-backend').then(data => displayCommits(data, 'backend-branch', 'backend-branch'));
}

function loadBranches() {
    fetchBranchesFromDisk('carta-frontend').then(data => displayBranches(data, 'frontend-branch-select', 'frontend'));
    fetchBranchesFromDisk('carta-backend').then(data => displayBranches(data, 'backend-branch-select', 'backend'));
}

loadCommits();
loadBranches();

$(document).ready(function() {

    $('.refresh-commit-btn').click(function() {
        const btn = $(this);
        const repo = btn.data('repo');
        const prefix = repo.replace('carta-', '');
        
        const branchSelect = $(`#${prefix}-branch-select`);
        const selectedBranch = branchSelect.find('option:selected').text() || 'dev';
        
        btn.prop('disabled', true).text('Refreshing...');
        $.post(`/refresh-commits/${repo}?branch=${encodeURIComponent(selectedBranch)}`, function() {
            fetchCommits(repo).then(data => displayCommits(data, `${prefix}-branch`, `${prefix}-branch`));
            btn.prop('disabled', false).text('Refresh Commits');
        }).fail(function() {
            alert(`Failed to refresh commits for ${repo}`);
            btn.prop('disabled', false).text('Refresh Commits');
        });
    });

    const branchRefreshCooldowns = {};
    const isBranchRefreshingMap = {};

    $('.refresh-branch-btn').click(function() {
        const btn = $(this);
        const repoKey = btn.data('repo'); // 'frontend' or 'backend'
        const repo = `carta-${repoKey}`;
        
        if (isBranchRefreshingMap[repoKey] || branchRefreshCooldowns[repoKey]) return;
        
        btn.prop('disabled', true).text('Refreshing...');
        isBranchRefreshingMap[repoKey] = true;

        $.post(`/refresh-branches/${repo}`, function() {
            fetchBranchesFromDisk(repo).then(data => displayBranches(data, `${repoKey}-branch-select`, repoKey));
            
            isBranchRefreshingMap[repoKey] = false;
            branchRefreshCooldowns[repoKey] = true;
            
            let timeLeft = 60;
            btn.text(`Cooldown (${timeLeft}s)`);
            const interval = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(interval);
                    btn.prop('disabled', false).text('Refresh Branches');
                    branchRefreshCooldowns[repoKey] = false;
                } else {
                    btn.text(`Cooldown (${timeLeft}s)`);
                }
            }, 1000);
        }).fail(function() {
            alert(`Failed to refresh branches for ${repo}`);
            isBranchRefreshingMap[repoKey] = false;
            btn.prop('disabled', false).text('Refresh Branches');
        });
    });

    $('#frontend-branch-select').change(function() {
        const branchName = $(this).find('option:selected').text().split(' ')[0];
        const commitHash = $(this).val();
        const commitSelect = $('#frontend-branch');
        
        if (commitSelect.find(`option[value="${commitHash}"]`).length === 0) {
            const datePart = new Date().toISOString().split('T')[0];
            commitSelect.prepend(`<option value="${commitHash}">${datePart} (${commitHash})</option>`);
        }
        commitSelect.val(commitHash);
    });

    $('#backend-branch-select').change(function() {
        const branchName = $(this).find('option:selected').text().split(' ')[0];
        const commitHash = $(this).val();
        const commitSelect = $('#backend-branch');
        
        if (commitSelect.find(`option[value="${commitHash}"]`).length === 0) {
            const datePart = new Date().toISOString().split('T')[0];
            commitSelect.prepend(`<option value="${commitHash}">${datePart} (${commitHash})</option>`);
        }
        commitSelect.val(commitHash);
    });

function updateQueueUI(activeJob, buildQueue) {
    const allJobs = [activeJob, ...buildQueue].filter(Boolean);
    
    const queueList = document.getElementById('build-queue-list');
    if (queueList) {
        if (allJobs.length === 0) {
            queueList.innerHTML = '<li style="color: #888;">No builds in progress or queued.</li>';
        } else {
            queueList.innerHTML = allJobs.map(job => {
                const statusText = job.status === 'running' ? '<span style="color: #e0a800; font-weight: bold;">[Running]</span>' : '<span style="color: #17a2b8;">[Queued]</span>';
                return `<li style="margin-bottom: 8px;">Assemble ${job.platform === 'mac' ? 'macOS' : 'Linux'} ${job.arch} ${statusText} <br><small style="color: #666;">fe: ${job.frontendBranch}, be: ${job.backendBranch}</small></li>`;
            }).join('');
        }
    }

    const buttons = [
        { id: 'generate-button-linux-arm64', platform: 'linux', arch: 'arm64' },
        { id: 'generate-button-linux-x64', platform: 'linux', arch: 'x64' },
        { id: 'generate-button-macos-arm64', platform: 'mac', arch: 'arm64' },
        { id: 'generate-button-macos-x64', platform: 'mac', arch: 'x64' }
    ];

    buttons.forEach(b => {
        const btnElem = document.getElementById(b.id);
        if (!btnElem) return;
        const matchingJob = allJobs.find(j => j.platform === b.platform && j.arch === b.arch);
        const baseText = `Assemble ${b.platform === 'mac' ? 'macOS' : 'Linux'} ${b.arch}`;
        if (matchingJob) {
            btnElem.disabled = true;
            btnElem.style.opacity = '0.5';
            btnElem.style.cursor = 'not-allowed';
            btnElem.textContent = `${baseText} (${matchingJob.status === 'running' ? 'Build...' : 'Queued'})`;
        } else {
            btnElem.disabled = false;
            btnElem.style.opacity = '1';
            btnElem.style.cursor = 'pointer';
            btnElem.textContent = baseText;
        }
    });
}

function generateScript(platform, arch) {
    const frontendBranchElem = document.getElementById('frontend-branch-select');
    const backendBranchElem = document.getElementById('backend-branch-select');
    const frontendCommitElem = document.getElementById('frontend-branch');
    const backendCommitElem = document.getElementById('backend-branch');

    const frontendBranch = frontendBranchElem?.options[frontendBranchElem.selectedIndex]?.text || 'dev';
    const backendBranch = backendBranchElem?.options[backendBranchElem.selectedIndex]?.text || 'dev';
    const frontendCommit = frontendCommitElem?.value;
    const backendCommit = backendCommitElem?.value;

    if (!frontendCommit || !backendCommit) {
        alert('Please wait for commits to load or select a commit first.');
        return;
    }

    const btnId = `generate-button-${platform === 'mac' ? 'macos' : 'linux'}-${arch}`;
    const btnElem = document.getElementById(btnId);
    if (btnElem) {
        btnElem.disabled = true;
        btnElem.style.opacity = '0.5';
        btnElem.style.cursor = 'not-allowed';
        const baseText = `Assemble ${platform === 'mac' ? 'macOS' : 'Linux'} ${arch}`;
        btnElem.textContent = `${baseText} (Build...)`;
    }

    $.post(`/aaa/generate`, {
        platform,
        arch,
        frontendBranch,
        backendBranch,
        frontendCommit,
        backendCommit
    }, (res) => {
        console.log('Response:', res);
    }).fail(function(jqXHR, textStatus, errorThrown) {
        alert(jqXHR.responseText || 'Error requesting build.');
    });
}

$('#generate-button-linux-arm64').click(() => generateScript("linux", "arm64"));
$('#generate-button-linux-x64').click(() => generateScript("linux", "x64"));
$('#generate-button-macos-arm64').click(() => generateScript("mac", "arm64"));
$('#generate-button-macos-x64').click(() => generateScript("mac", "x64"));

const eventSource = new EventSource(`/events`);

eventSource.onmessage = (event) => {
    if (event.data.startsWith('queueUpdate:')) {
        try {
            const data = JSON.parse(event.data.substring('queueUpdate:'.length));
            updateQueueUI(data.activeJob, data.buildQueue);
        } catch(e) {}
        return;
    }
    if (event.data === 'bashScriptFinished') {
        updateFileList();
    }
};

// Sort by date
function updateFileList() {
    $.get(`/downloads`, (files) => {
        const fileList = $('#file-list');
        fileList.empty();

            files.sort((a, b) => {
                const matchA = a.match(/\d{4}-\d{2}-\d{2}/);
                const matchB = b.match(/\d{4}-\d{2}-\d{2}/);
                if (!matchA && !matchB) return 0;
                if (!matchA) return 1;
                if (!matchB) return -1;
                const dateA = matchA[0];
                const dateB = matchB[0];
                return new Date(dateB) - new Date(dateA);
            });

        files.forEach((file) => {
            fileList.append(`<li><a href="/downloads/${encodeURIComponent(file)}">${file}</a></li>`);
        });
    });
}


updateFileList();  // Update the download list when the page loads

});

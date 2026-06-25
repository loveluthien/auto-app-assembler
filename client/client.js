

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

// Button that will send the branch names to be built
    $.get(`/aaa/getInitiatorState`, (res) => {
        isProcessInitiator = res;
    });

  let isProcessInitiator = false;

function generateScript(platform, arch) {
    console.log('Button clicked');
    const frontendSelect = document.getElementById('frontend-branch');
    const backendSelect = document.getElementById('backend-branch');
    const frontendBranch = frontendSelect.options[frontendSelect.selectedIndex]?.text.split(' ')[0];
    const backendBranch = backendSelect.options[backendSelect.selectedIndex]?.text.split(' ')[0];
    const frontendCommit = frontendSelect.value;
    const backendCommit = backendSelect.value;
    // Make sure both branches are selected before clicking a button
    if (!frontendBranch || !backendBranch) {
        console.log('Both branches need to be selected first.');
        return;
    }
    isProcessInitiator = true;
    console.log('Frontend branch:', frontendBranch, 'commit:', frontendCommit);
    console.log('Backend branch:', backendBranch, 'commit:', backendCommit);
    $('#buildOverlay').show();
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
        if (jqXHR.status === 429) {
            $('#buildOverlay').hide();
            $('#busyOverlay').show();
        } else {
            console.log('Error in POST request:', textStatus, errorThrown);
        }
    });
}

$('#generate-button-linux-arm64').click(() => generateScript("linux", "arm64"));
$('#generate-button-linux-x64').click(() => generateScript("linux", "x64"));
$('#generate-button-macos-arm64').click(() => generateScript("mac", "arm64"));
$('#generate-button-macos-x64').click(() => generateScript("mac", "x64"));

const eventSource = new EventSource(`/events`);

   eventSource.onmessage = (event) => {
        console.log(`Received event: ${event.data}`); // debugging
        switch(event.data) {
            case 'bashScriptStarted':
                if (!isProcessInitiator) { // Show the busyOverlay to clients that did not initiate the build process
                    $('#busyOverlay').show();
                }
                break;
            case 'bashScriptFinished':
                console.log('Hiding overlays');
                $('#buildOverlay').hide();
                $('#busyOverlay').hide();
                updateFileList();  // Update the download list
                isProcessInitiator = false;  // Reset the variable
                break;
            case 'otherUserScriptRunning':
                if (!isProcessInitiator) {         // Show busyOverlay if client did not initiate the process
                    $('#buildOverlay').hide();
                    $('#busyOverlay').show();
                }
                break;
            default:
                console.log(`Unknown event: ${event.data}`);
                break;
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

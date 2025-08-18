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
        option.text = `${item.branch}  ${datePart} ${timePart} (${item.shortId})`;
        select.appendChild(option);
    });
}


// Function to recursively fetch all pages of github branches
async function getAllBranches(url) {
    const response = await fetch(url);
    const data = await response.json();

    // Check if there are more pages of branches
    const linkHeader = response.headers.get('Link');
    if (linkHeader) {
        const nextPageLink = linkHeader.split(',').find(link => link.includes('rel="next"'));
        if (nextPageLink) {
            const nextPageUrl = nextPageLink.split(';')[0].slice(1, -1);
            const nextPageData = await getAllBranches(nextPageUrl);
            return data.concat(nextPageData);
        }
    }
    return data;
}

async function fetchBranches(url) {
    let data = await getAllBranches(url);
    // remove 'archived' branches
    data = data.filter(branch => !branch.name.startsWith('archived'));
    return data;
}

function displayBranches(data, selectId, branchType) {
    const select = document.getElementById(selectId);
    select.innerHTML = '';
    data.forEach((item, i) => {
        let datePart = '';
        if (item.commit.date) {
            const dateStr = item.commit.date.toISOString();
            datePart = dateStr.split('T')[0];
        }
        const option = document.createElement('option');
        option.value = item.commit.sha.substring(0, 8);
        option.text = `${item.name}  ${datePart}  (${item.commit.sha.substring(0, 8)})`;
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

// Show the latest commits from the local .json files by default, plus reverse the order
fetchCommits('carta-frontend').then(data => displayCommits(data.reverse(), 'frontend-branch', 'frontend-branch'));
fetchCommits('carta-backend').then(data => displayCommits(data.reverse(), 'backend-branch', 'backend-branch'));

// Button that will send the branch names to be built
$(document).ready(function() {

    $.get('/aaa/getInitiatorState', (res) => {
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
    $.post('/aaa/generate', {
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

// $('#generate-button-linux-arm64').click(() => generateScript("linux", "arm64"));
$('#generate-button-linux-x64').click(() => generateScript("linux", "x64"));
$('#generate-button-macos-arm64').click(() => generateScript("mac", "arm64"));
$('#generate-button-macos-x64').click(() => generateScript("mac", "x64"));

const eventSource = new EventSource('/events');

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
    $.get('/downloads', (files) => {
        const fileList = $('#file-list');
        fileList.empty();

        files.sort((a, b) => {
            // Extract the date string from the file names
            const dateA = a.match(/\d{4}-\d{2}-\d{2}/)[0];
            const dateB = b.match(/\d{4}-\d{2}-\d{2}/)[0];

            // Return the comparison result
            return new Date(dateB) - new Date(dateA);
        });

        files.forEach((file) => {
            fileList.append(`<li><a href="/downloads/${encodeURIComponent(file)}">${file}</a></li>`);
        });
    });
}


updateFileList();  // Update the download list when the page loads

});
